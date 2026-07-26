-- El usuario decidió que "encargado" también puede ver sueldos/recibos en
-- Empleados (deja de ser admin-only). parametros_empleados pasa a tener el
-- mismo criterio que el resto del módulo: cualquier usuario activo.
drop policy if exists "parametros_empleados: solo admin" on public.parametros_empleados;
drop policy if exists "parametros_empleados: todo activo" on public.parametros_empleados;
create policy "parametros_empleados: todo activo"
  on public.parametros_empleados for all
  using (public.is_usuario_activo())
  with check (public.is_usuario_activo());
