-- Tabla de perfiles de usuario, vinculada 1 a 1 con auth.users (que maneja
-- el email y la contraseña). Acá solo guardamos nombre y rol.
create table if not exists public.usuarios (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null,
  nombre text not null,
  rol text not null check (rol in ('admin', 'encargado')),
  activo boolean not null default true,
  creado_el timestamptz not null default now()
);

alter table public.usuarios enable row level security;

-- Cada usuario puede ver su propio perfil (necesario para saber su rol
-- al entrar a la app).
drop policy if exists "usuarios: ver el propio perfil" on public.usuarios;
create policy "usuarios: ver el propio perfil"
  on public.usuarios
  for select
  using (id = auth.uid());

-- No hay políticas de insert/update/delete para el rol "authenticated":
-- por ahora los perfiles se crean y editan a mano desde el SQL Editor
-- de Supabase (el administrador). Esto se puede abrir más adelante con
-- una policy que chequee rol = 'admin' cuando exista una pantalla de
-- gestión de usuarios en la app.
