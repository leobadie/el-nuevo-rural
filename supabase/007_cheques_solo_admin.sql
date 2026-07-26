-- El usuario decidió que Cheques pasa a ser un módulo admin-only (como
-- Rentabilidad), no solo "eliminar" restringido a admin. Se reemplazan las
-- políticas de cheques, cheques_terceros y limites_proveedores_cheques.

drop policy if exists "cheques: ver" on public.cheques;
drop policy if exists "cheques: crear" on public.cheques;
drop policy if exists "cheques: editar" on public.cheques;
drop policy if exists "cheques: eliminar (solo admin)" on public.cheques;
drop policy if exists "cheques: solo admin" on public.cheques;
create policy "cheques: solo admin"
  on public.cheques for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "cheques_terceros: todo activo" on public.cheques_terceros;
drop policy if exists "cheques_terceros: solo admin" on public.cheques_terceros;
create policy "cheques_terceros: solo admin"
  on public.cheques_terceros for all
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists "limites: todo activo" on public.limites_proveedores_cheques;
drop policy if exists "limites_proveedores_cheques: solo admin" on public.limites_proveedores_cheques;
create policy "limites_proveedores_cheques: solo admin"
  on public.limites_proveedores_cheques for all
  using (public.is_admin())
  with check (public.is_admin());
