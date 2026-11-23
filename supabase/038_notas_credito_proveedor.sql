-- Notas de crédito en la cuenta corriente de proveedores. Ver SPEC-notas-credito.md.
--
-- Una nota de crédito (NC) baja lo que se le debe a un proveedor sin que salga plata de la caja:
-- por eso NO es un movimiento. Se aplica a una o varias boletas (entregas) igual que un pago, o
-- queda a favor hasta que se aplique.
--
-- Se modela en tablas propias y no reutilizando imputaciones_pago, que exige un movimiento: así
-- los pagos y todo lo que ya los usa (Movimientos, cheques, corte) no cambian. Lo único que se toca
-- de lo existente es el trigger de los pagos, para que el tope de cada boleta sume pagos y NC.
--
-- No borra ni cambia ningún dato existente. Reutiliza is_usuario_activo() / is_admin() (002).


-- ============================================================================
-- Notas de crédito
-- ============================================================================

create table if not exists public.notas_credito_proveedor (
  id uuid primary key default gen_random_uuid(),
  proveedor text not null,
  fecha date not null,
  monto numeric(14, 2) not null check (monto > 0),
  comprobante text,
  detalle text,
  creado_el timestamptz not null default now(),
  creado_por uuid references public.usuarios (id)
);

create index if not exists notas_credito_proveedor_proveedor_idx
  on public.notas_credito_proveedor (proveedor, fecha);

alter table public.notas_credito_proveedor enable row level security;

drop policy if exists "notas_credito_proveedor: ver" on public.notas_credito_proveedor;
create policy "notas_credito_proveedor: ver"
  on public.notas_credito_proveedor for select
  using (public.is_usuario_activo());

drop policy if exists "notas_credito_proveedor: crear" on public.notas_credito_proveedor;
create policy "notas_credito_proveedor: crear"
  on public.notas_credito_proveedor for insert
  with check (public.is_usuario_activo());

drop policy if exists "notas_credito_proveedor: editar" on public.notas_credito_proveedor;
create policy "notas_credito_proveedor: editar"
  on public.notas_credito_proveedor for update
  using (public.is_usuario_activo())
  with check (public.is_usuario_activo());

-- Borrar una NC sube la deuda registrada: mismo criterio que las entregas, sólo admin.
drop policy if exists "notas_credito_proveedor: eliminar (solo admin)" on public.notas_credito_proveedor;
create policy "notas_credito_proveedor: eliminar (solo admin)"
  on public.notas_credito_proveedor for delete
  using (public.is_admin());


-- ============================================================================
-- Aplicaciones: qué parte de qué NC cubre qué boleta.
-- ============================================================================

create table if not exists public.aplicaciones_nota_credito (
  id uuid primary key default gen_random_uuid(),
  nota_id uuid not null references public.notas_credito_proveedor (id) on delete cascade,
  entrega_id uuid not null references public.entregas_proveedor (id) on delete cascade,
  monto numeric(14, 2) not null check (monto > 0),
  creado_el timestamptz not null default now()
);

create index if not exists aplicaciones_nota_credito_nota_idx
  on public.aplicaciones_nota_credito (nota_id);
create index if not exists aplicaciones_nota_credito_entrega_idx
  on public.aplicaciones_nota_credito (entrega_id);

alter table public.aplicaciones_nota_credito enable row level security;

-- Deshacer una aplicación es reversible y no borra ni la NC ni la boleta.
drop policy if exists "aplicaciones_nota_credito: todo activo" on public.aplicaciones_nota_credito;
create policy "aplicaciones_nota_credito: todo activo"
  on public.aplicaciones_nota_credito for all
  using (public.is_usuario_activo())
  with check (public.is_usuario_activo());


-- ============================================================================
-- Topes. Una boleta no puede quedar cubierta por más de su monto, sumando pagos (imputaciones_pago)
-- y NC (aplicaciones_nota_credito). Cada trigger bloquea la fila de la boleta antes de sumar, así
-- dos aplicaciones simultáneas (dos pestañas, un pago y una NC) no pasan las dos el tope.
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
  ya_acreditado_entrega numeric(14, 2);
  monto_pago numeric(14, 2);
  ya_imputado_pago numeric(14, 2);
begin
  select monto into monto_entrega
    from public.entregas_proveedor where id = new.entrega_id
    for update;

  select coalesce(sum(monto), 0) into ya_imputado_entrega
    from public.imputaciones_pago
    where entrega_id = new.entrega_id and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  select coalesce(sum(monto), 0) into ya_acreditado_entrega
    from public.aplicaciones_nota_credito
    where entrega_id = new.entrega_id;

  if ya_imputado_entrega + ya_acreditado_entrega + new.monto > monto_entrega + 0.005 then
    raise exception 'La imputación supera el saldo pendiente de la entrega (entrega %, ya imputado %, notas de crédito %, se intenta %)',
      monto_entrega, ya_imputado_entrega, ya_acreditado_entrega, new.monto;
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

create or replace function public.validar_aplicacion_nota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  monto_entrega numeric(14, 2);
  ya_imputado_entrega numeric(14, 2);
  ya_acreditado_entrega numeric(14, 2);
  monto_nota numeric(14, 2);
  ya_aplicado_nota numeric(14, 2);
begin
  select monto into monto_entrega
    from public.entregas_proveedor where id = new.entrega_id
    for update;

  select coalesce(sum(monto), 0) into ya_imputado_entrega
    from public.imputaciones_pago
    where entrega_id = new.entrega_id;

  select coalesce(sum(monto), 0) into ya_acreditado_entrega
    from public.aplicaciones_nota_credito
    where entrega_id = new.entrega_id and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if ya_imputado_entrega + ya_acreditado_entrega + new.monto > monto_entrega + 0.005 then
    raise exception 'La nota de crédito supera el saldo pendiente de la entrega (entrega %, pagos %, ya acreditado %, se intenta %)',
      monto_entrega, ya_imputado_entrega, ya_acreditado_entrega, new.monto;
  end if;

  select monto into monto_nota
    from public.notas_credito_proveedor where id = new.nota_id
    for update;

  select coalesce(sum(monto), 0) into ya_aplicado_nota
    from public.aplicaciones_nota_credito
    where nota_id = new.nota_id and id <> coalesce(new.id, '00000000-0000-0000-0000-000000000000'::uuid);

  if ya_aplicado_nota + new.monto > monto_nota + 0.005 then
    raise exception 'La aplicación supera el saldo disponible de la nota de crédito (nota %, ya aplicado %, se intenta %)',
      monto_nota, ya_aplicado_nota, new.monto;
  end if;

  return new;
end;
$$;

drop trigger if exists aplicaciones_nota_credito_validar on public.aplicaciones_nota_credito;
create trigger aplicaciones_nota_credito_validar
  before insert or update on public.aplicaciones_nota_credito
  for each row execute function public.validar_aplicacion_nota();
