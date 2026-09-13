-- Cobranzas de la Municipalidad (PAICOR): las facturas que se le entregan (lo que debe) y
-- los cobros con que las va pagando. Ver SPEC-municipalidad.md.
--
-- Es la cuenta corriente de proveedores (012) dada vuelta, con el mismo esquema de
-- imputaciones: un cobro puede cancelar varias facturas y una factura cobrarse en varias
-- veces. A diferencia de los pagos a proveedor, los cobros NO son movimientos de caja: viven
-- en su propia tabla y no tocan Ingresos y Egresos.
--
-- Reutiliza is_usuario_activo() / is_admin() creadas en 002_cheques.sql.


-- ============================================================================
-- Facturas: cada boleta entregada a la Municipalidad.
-- ============================================================================

create table if not exists public.facturas_municipalidad (
  id uuid primary key default gen_random_uuid(),
  fecha_entrega date not null,
  -- Opcional: se puede cargar la entrega antes de tener el número de factura.
  numero_factura text,
  fecha_factura date,
  monto numeric(14, 2) not null check (monto > 0),
  orden_compra text,
  lugar_entrega text,
  detalle text,
  creado_el timestamptz not null default now(),
  creado_por uuid references public.usuarios (id)
);

-- Mismo número dos veces es la misma boleta cargada dos veces: duplicaría la deuda.
create unique index if not exists facturas_municipalidad_numero_uq
  on public.facturas_municipalidad (numero_factura)
  where numero_factura is not null;

create index if not exists facturas_municipalidad_fecha_idx
  on public.facturas_municipalidad (fecha_entrega);

alter table public.facturas_municipalidad enable row level security;

drop policy if exists "facturas_municipalidad: ver" on public.facturas_municipalidad;
create policy "facturas_municipalidad: ver"
  on public.facturas_municipalidad for select
  using (public.is_usuario_activo());

drop policy if exists "facturas_municipalidad: crear" on public.facturas_municipalidad;
create policy "facturas_municipalidad: crear"
  on public.facturas_municipalidad for insert
  with check (public.is_usuario_activo());

drop policy if exists "facturas_municipalidad: editar" on public.facturas_municipalidad;
create policy "facturas_municipalidad: editar"
  on public.facturas_municipalidad for update
  using (public.is_usuario_activo())
  with check (public.is_usuario_activo());

-- Borrar una factura borra deuda registrada: solo admin, como las entregas de proveedor.
drop policy if exists "facturas_municipalidad: eliminar (solo admin)" on public.facturas_municipalidad;
create policy "facturas_municipalidad: eliminar (solo admin)"
  on public.facturas_municipalidad for delete
  using (public.is_admin());


-- ============================================================================
-- Cobros: lo que pagó la Municipalidad. El total que cancela facturas es
-- monto_cobrado (lo que entró) + retenciones (lo que retuvo por impuestos).
-- ============================================================================

create table if not exists public.cobros_municipalidad (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  monto_cobrado numeric(14, 2) not null default 0 check (monto_cobrado >= 0),
  retenciones numeric(14, 2) not null default 0 check (retenciones >= 0),
  medio_pago text check (medio_pago in ('Transferencia', 'Cheque', 'Efectivo')),
  comprobante text,
  detalle text,
  creado_el timestamptz not null default now(),
  creado_por uuid references public.usuarios (id),
  check (monto_cobrado + retenciones > 0)
);

create index if not exists cobros_municipalidad_fecha_idx
  on public.cobros_municipalidad (fecha);

alter table public.cobros_municipalidad enable row level security;

drop policy if exists "cobros_municipalidad: ver" on public.cobros_municipalidad;
create policy "cobros_municipalidad: ver"
  on public.cobros_municipalidad for select
  using (public.is_usuario_activo());

drop policy if exists "cobros_municipalidad: crear" on public.cobros_municipalidad;
create policy "cobros_municipalidad: crear"
  on public.cobros_municipalidad for insert
  with check (public.is_usuario_activo());

drop policy if exists "cobros_municipalidad: editar" on public.cobros_municipalidad;
create policy "cobros_municipalidad: editar"
  on public.cobros_municipalidad for update
  using (public.is_usuario_activo())
  with check (public.is_usuario_activo());

drop policy if exists "cobros_municipalidad: eliminar (solo admin)" on public.cobros_municipalidad;
create policy "cobros_municipalidad: eliminar (solo admin)"
  on public.cobros_municipalidad for delete
  using (public.is_admin());


-- ============================================================================
-- Imputaciones: qué parte de qué cobro cancela qué factura.
--
-- Sin unique (cobro_id, factura_id) a propósito: un cobro aplicado a medias a una factura
-- se puede volver a aplicar a la misma factura más tarde ("Aplicar" sobre lo que quedó
-- libre), y eso es una fila nueva. La pantalla las suma por factura.
-- ============================================================================

create table if not exists public.imputaciones_cobro_municipalidad (
  id uuid primary key default gen_random_uuid(),
  cobro_id uuid not null references public.cobros_municipalidad (id) on delete cascade,
  factura_id uuid not null references public.facturas_municipalidad (id) on delete cascade,
  monto numeric(14, 2) not null check (monto > 0),
  creado_el timestamptz not null default now()
);

create index if not exists imputaciones_cobro_muni_factura_idx
  on public.imputaciones_cobro_municipalidad (factura_id);
create index if not exists imputaciones_cobro_muni_cobro_idx
  on public.imputaciones_cobro_municipalidad (cobro_id);

alter table public.imputaciones_cobro_municipalidad enable row level security;

-- Deshacer una imputación no borra ni el cobro ni la factura: cualquier usuario activo.
drop policy if exists "imputaciones_cobro_municipalidad: todo activo" on public.imputaciones_cobro_municipalidad;
create policy "imputaciones_cobro_municipalidad: todo activo"
  on public.imputaciones_cobro_municipalidad for all
  using (public.is_usuario_activo())
  with check (public.is_usuario_activo());


-- ============================================================================
-- Topes validados en el servidor (la app puede tener dos pestañas abiertas y el
-- chequeo del navegador corre sobre datos viejos). Triggers y no CHECK porque la
-- regla mira otras filas.
--
-- El `for update` sobre la factura y el cobro serializa dos imputaciones simultáneas
-- contra la misma fila: sin eso, ambas leerían el mismo "ya imputado" y pasarían las dos.
-- ============================================================================

create or replace function public.validar_imputacion_cobro_municipalidad()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  monto_factura numeric(14, 2);
  ya_factura numeric(14, 2);
  total_cobro numeric(14, 2);
  ya_cobro numeric(14, 2);
  sin_id constant uuid := '00000000-0000-0000-0000-000000000000';
begin
  select monto into monto_factura
    from public.facturas_municipalidad where id = new.factura_id for update;

  select coalesce(sum(monto), 0) into ya_factura
    from public.imputaciones_cobro_municipalidad
    where factura_id = new.factura_id and id <> coalesce(new.id, sin_id);

  if ya_factura + new.monto > monto_factura + 0.005 then
    raise exception 'La imputación supera el saldo de la factura (factura %, ya cobrado %, se intenta %)',
      monto_factura, ya_factura, new.monto;
  end if;

  select monto_cobrado + retenciones into total_cobro
    from public.cobros_municipalidad where id = new.cobro_id for update;

  select coalesce(sum(monto), 0) into ya_cobro
    from public.imputaciones_cobro_municipalidad
    where cobro_id = new.cobro_id and id <> coalesce(new.id, sin_id);

  if ya_cobro + new.monto > total_cobro + 0.005 then
    raise exception 'La imputación supera el disponible del cobro (cobro %, ya aplicado %, se intenta %)',
      total_cobro, ya_cobro, new.monto;
  end if;

  return new;
end;
$$;

drop trigger if exists imputaciones_cobro_municipalidad_validar on public.imputaciones_cobro_municipalidad;
create trigger imputaciones_cobro_municipalidad_validar
  before insert or update on public.imputaciones_cobro_municipalidad
  for each row execute function public.validar_imputacion_cobro_municipalidad();


-- Editar una factura no puede dejarla con un monto menor a lo que ya se cobró de ella.
create or replace function public.validar_monto_factura_municipalidad()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ya numeric(14, 2);
begin
  select coalesce(sum(monto), 0) into ya
    from public.imputaciones_cobro_municipalidad where factura_id = new.id;
  if new.monto + 0.005 < ya then
    raise exception 'El monto de la factura no puede quedar debajo de lo ya cobrado (%)', ya;
  end if;
  return new;
end;
$$;

drop trigger if exists facturas_municipalidad_validar_monto on public.facturas_municipalidad;
create trigger facturas_municipalidad_validar_monto
  before update of monto on public.facturas_municipalidad
  for each row execute function public.validar_monto_factura_municipalidad();


-- Lo mismo para el total de un cobro.
create or replace function public.validar_total_cobro_municipalidad()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ya numeric(14, 2);
begin
  select coalesce(sum(monto), 0) into ya
    from public.imputaciones_cobro_municipalidad where cobro_id = new.id;
  if new.monto_cobrado + new.retenciones + 0.005 < ya then
    raise exception 'El total del cobro no puede quedar debajo de lo ya aplicado (%)', ya;
  end if;
  return new;
end;
$$;

drop trigger if exists cobros_municipalidad_validar_total on public.cobros_municipalidad;
create trigger cobros_municipalidad_validar_total
  before update of monto_cobrado, retenciones on public.cobros_municipalidad
  for each row execute function public.validar_total_cobro_municipalidad();
