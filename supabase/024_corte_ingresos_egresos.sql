-- Ingresos y Egresos desde cero: una fecha de corte para toda la sección.
-- Ver SPEC-corte-registros.md.
--
-- NO borra nada. Lo cargado antes del corte sigue en la base; la app sólo deja de contarlo en
-- Ingresos y Egresos, el inicio y Rentabilidad. Mover el corte para atrás (o ponerlo en null)
-- lo hace reaparecer.
--
-- Se compara contra cuándo se cargó cada registro (creado_el; en pedidos, enviado_el), como el
-- corte de la cuenta corriente de proveedores (013).
--
-- Fila única, como config_proveedores. Reutiliza is_usuario_activo() / is_admin() de 002.

create table if not exists public.config_ingresos_egresos (
  id boolean primary key default true check (id),
  -- null = sin corte: se ve todo.
  corte timestamptz
);

alter table public.config_ingresos_egresos enable row level security;

-- Leerlo lo necesita cualquier usuario activo: sin él la pantalla no sabe qué contar.
drop policy if exists "config_ingresos_egresos: ver" on public.config_ingresos_egresos;
create policy "config_ingresos_egresos: ver"
  on public.config_ingresos_egresos for select
  using (public.is_usuario_activo());

-- Moverlo cambia lo que ve todo el mundo: sólo admin.
drop policy if exists "config_ingresos_egresos: cambiar (solo admin)" on public.config_ingresos_egresos;
create policy "config_ingresos_egresos: cambiar (solo admin)"
  on public.config_ingresos_egresos for all
  using (public.is_admin())
  with check (public.is_admin());

-- Arranca hoy, 27/09/2026, a las 00:00 de Argentina: lo cargado hoy también cuenta.
-- on conflict do nothing: volver a correr el script no pisa un corte que ya se movió.
insert into public.config_ingresos_egresos (id, corte) values (true, '2026-09-27 00:00:00-03')
on conflict (id) do nothing;
