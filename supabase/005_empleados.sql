-- Reutiliza is_usuario_activo() / is_admin() creadas en 002_cheques.sql.

create table if not exists public.colaboradores (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  nombre text not null,
  area text,
  cargo text,
  tipo_pago text not null default 'Mensual' check (tipo_pago in ('Jornal', 'Semanal', 'Mensual')),
  valor numeric(14, 2) not null default 0,
  tipo_jornada text not null default 'Jornada Completa' check (tipo_jornada in ('Jornada Completa', 'Media Jornada'))
);

alter table public.colaboradores enable row level security;
drop policy if exists "colaboradores: todo activo" on public.colaboradores;
create policy "colaboradores: todo activo"
  on public.colaboradores for all
  using (public.is_usuario_activo())
  with check (public.is_usuario_activo());

create table if not exists public.registros_asistencia (
  id uuid primary key default gen_random_uuid(),
  colaborador_id uuid not null references public.colaboradores (id) on delete cascade,
  mes text not null,
  dias jsonb not null default '{}',
  he_50 numeric(10, 2) not null default 0,
  he_100 numeric(10, 2) not null default 0,
  unique (colaborador_id, mes)
);

alter table public.registros_asistencia enable row level security;
drop policy if exists "registros_asistencia: todo activo" on public.registros_asistencia;
create policy "registros_asistencia: todo activo"
  on public.registros_asistencia for all
  using (public.is_usuario_activo())
  with check (public.is_usuario_activo());

-- Tabla singleton: un solo registro global de parámetros de horas extra.
-- Acceso restringido a admin (a diferencia del resto del módulo) porque
-- combinado con colaboradores.valor permite reconstruir el cálculo de
-- sueldo completo — es la pieza que le falta a un "encargado" para eso.
create table if not exists public.parametros_empleados (
  id boolean primary key default true check (id),
  horas_completa numeric(6, 2) not null default 10.75,
  horas_media numeric(6, 2) not null default 5.38,
  recargo_50 numeric(4, 2) not null default 0.5,
  recargo_100 numeric(4, 2) not null default 1.0
);

alter table public.parametros_empleados enable row level security;
drop policy if exists "parametros_empleados: solo admin" on public.parametros_empleados;
create policy "parametros_empleados: solo admin"
  on public.parametros_empleados for all
  using (public.is_admin())
  with check (public.is_admin());

insert into public.parametros_empleados (id) values (true)
on conflict (id) do nothing;
