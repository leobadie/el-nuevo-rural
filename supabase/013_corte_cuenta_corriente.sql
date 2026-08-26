-- Fecha de corte de la cuenta corriente de proveedores.
--
-- Los pagos a proveedor vienen cargándose desde mucho antes que las entregas, así que al
-- estrenar la pestaña todos los proveedores arrancaban con saldo negativo y con toda la
-- plata "a cuenta": pagos viejos sin ninguna entrega contra la cual imputarlos. Ruido, no
-- información.
--
-- El corte hace que la cuenta corriente mire sólo lo cargado a partir de una fecha. NO
-- borra ni oculta nada: esos movimientos siguen enteros en Movimientos, en el saldo de
-- caja, en los resúmenes y en Rentabilidad. Es un filtro de esta pantalla y nada más, y
-- por eso es reversible: se corre la fecha para atrás y los pagos vuelven a contar.
--
-- Se compara contra `creado_el` (cuándo se cargó) y no contra `fecha` (a qué día
-- corresponde) para que un pago viejo que se carga tarde entre igual en la cuenta.
--
-- Sigue el patrón de fila única de parametros_empleados (005).
-- Reutiliza is_usuario_activo() / is_admin() creadas en 002_cheques.sql.

create table if not exists public.config_proveedores (
  id boolean primary key default true check (id),
  corte_cuenta_corriente timestamptz not null default now()
);

alter table public.config_proveedores enable row level security;

-- Leer el corte lo necesita cualquier usuario activo: sin él la pantalla no sabe qué contar.
drop policy if exists "config_proveedores: ver" on public.config_proveedores;
create policy "config_proveedores: ver"
  on public.config_proveedores for select
  using (public.is_usuario_activo());

-- Moverlo cambia lo que ve todo el mundo: solo admin.
drop policy if exists "config_proveedores: cambiar (solo admin)" on public.config_proveedores;
create policy "config_proveedores: cambiar (solo admin)"
  on public.config_proveedores for all
  using (public.is_admin())
  with check (public.is_admin());

-- La fila nace con el corte en el momento de aplicar esta migración: todo lo cargado
-- hasta acá queda afuera, todo lo que se cargue desde acá cuenta.
insert into public.config_proveedores (id) values (true)
on conflict (id) do nothing;
