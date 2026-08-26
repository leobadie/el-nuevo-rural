-- Cuenta corriente de proveedores: qué te entregaron (deuda) y cómo se va descontando
-- con los pagos que ya se cargan en `movimientos`.
--
-- El vínculo con el proveedor es por NOMBRE, no por id, porque así funciona hoy
-- `movimientos.proveedor` y así lo renombra la app (ver renombrarProveedor en
-- IngresosEgresosShell.tsx, que ahora también actualiza estas entregas).
--
-- Reutiliza is_usuario_activo() / is_admin() creadas en 002_cheques.sql.


-- ============================================================================
-- Entregas: lo que el proveedor te dejó y todavía no está necesariamente pago.
-- ============================================================================

create table if not exists public.entregas_proveedor (
  id uuid primary key default gen_random_uuid(),
  proveedor text not null,
  fecha date not null,
  monto numeric(14, 2) not null check (monto > 0),
  comprobante text,
  detalle text,
  creado_el timestamptz not null default now(),
  creado_por uuid references public.usuarios (id)
);

create index if not exists entregas_proveedor_proveedor_idx
  on public.entregas_proveedor (proveedor, fecha);

alter table public.entregas_proveedor enable row level security;

drop policy if exists "entregas_proveedor: ver" on public.entregas_proveedor;
create policy "entregas_proveedor: ver"
  on public.entregas_proveedor for select
  using (public.is_usuario_activo());

drop policy if exists "entregas_proveedor: crear" on public.entregas_proveedor;
create policy "entregas_proveedor: crear"
  on public.entregas_proveedor for insert
  with check (public.is_usuario_activo());

drop policy if exists "entregas_proveedor: editar" on public.entregas_proveedor;
create policy "entregas_proveedor: editar"
  on public.entregas_proveedor for update
  using (public.is_usuario_activo())
  with check (public.is_usuario_activo());

-- Borrar una entrega borra deuda registrada: mismo criterio que `movimientos`, solo admin.
drop policy if exists "entregas_proveedor: eliminar (solo admin)" on public.entregas_proveedor;
create policy "entregas_proveedor: eliminar (solo admin)"
  on public.entregas_proveedor for delete
  using (public.is_admin());


-- ============================================================================
-- Imputaciones: qué parte de qué pago cubre qué entrega.
--
-- Un pago es un movimiento con egreso > 0 y proveedor cargado. Se modela aparte
-- (y no como una columna `entrega_id` en movimientos) porque un pago puede cubrir
-- varias entregas y una entrega puede pagarse en varias veces.
-- ============================================================================

create table if not exists public.imputaciones_pago (
  id uuid primary key default gen_random_uuid(),
  movimiento_id uuid not null references public.movimientos (id) on delete cascade,
  entrega_id uuid not null references public.entregas_proveedor (id) on delete cascade,
  monto numeric(14, 2) not null check (monto > 0),
  creado_el timestamptz not null default now(),
  unique (movimiento_id, entrega_id)
);

create index if not exists imputaciones_pago_entrega_idx
  on public.imputaciones_pago (entrega_id);
create index if not exists imputaciones_pago_movimiento_idx
  on public.imputaciones_pago (movimiento_id);

alter table public.imputaciones_pago enable row level security;

-- Deshacer una imputación es reversible y no borra ni el pago ni la entrega:
-- no hace falta reservarlo al admin.
drop policy if exists "imputaciones_pago: todo activo" on public.imputaciones_pago;
create policy "imputaciones_pago: todo activo"
  on public.imputaciones_pago for all
  using (public.is_usuario_activo())
  with check (public.is_usuario_activo());


-- ============================================================================
-- Los topes (no imputar más que el monto de la entrega, ni más que el del pago)
-- se validan en el servidor, no solo en el navegador: la app puede tener dos
-- pestañas abiertas y el chequeo del cliente se hace sobre datos viejos.
--
-- Es un trigger y no un CHECK porque la regla mira otras filas.
-- ============================================================================

create or replace function public.validar_imputacion()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  monto_entrega numeric(14, 2);
  ya_imputado_entrega numeric(14, 2);
  monto_pago numeric(14, 2);
  ya_imputado_pago numeric(14, 2);
begin
  select monto into monto_entrega
    from public.entregas_proveedor where id = new.entrega_id;

  select coalesce(sum(monto), 0) into ya_imputado_entrega
    from public.imputaciones_pago
    where entrega_id = new.entrega_id and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if ya_imputado_entrega + new.monto > monto_entrega + 0.005 then
    raise exception 'La imputación supera el saldo pendiente de la entrega (entrega %, ya imputado %, se intenta %)',
      monto_entrega, ya_imputado_entrega, new.monto;
  end if;

  select coalesce(egreso, 0) into monto_pago
    from public.movimientos where id = new.movimiento_id;

  select coalesce(sum(monto), 0) into ya_imputado_pago
    from public.imputaciones_pago
    where movimiento_id = new.movimiento_id and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if ya_imputado_pago + new.monto > monto_pago + 0.005 then
    raise exception 'La imputación supera el saldo disponible del pago (pago %, ya imputado %, se intenta %)',
      monto_pago, ya_imputado_pago, new.monto;
  end if;

  return new;
end;
$$;

drop trigger if exists imputaciones_pago_validar on public.imputaciones_pago;
create trigger imputaciones_pago_validar
  before insert or update on public.imputaciones_pago
  for each row execute function public.validar_imputacion();
