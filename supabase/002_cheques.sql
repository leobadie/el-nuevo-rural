-- Funciones helper para las políticas de RLS de abajo. security definer para
-- poder consultar `usuarios` sin recursión (la policy de `usuarios` solo
-- permite ver la fila propia).
create or replace function public.is_usuario_activo()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.usuarios where id = auth.uid() and activo
  );
$$;

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
as $$
  select exists (
    select 1 from public.usuarios where id = auth.uid() and rol = 'admin' and activo
  );
$$;

-- Cheques propios
create table if not exists public.cheques (
  id uuid primary key default gen_random_uuid(),
  n_cheque text,
  proveedor text not null,
  fecha_emision date,
  fecha_cobro date,
  importe numeric(14, 2) not null,
  debito_banco numeric(14, 2),
  rechazado boolean not null default false,
  tipo text not null default 'Físico' check (tipo in ('Físico', 'E-cheque')),
  entregado boolean not null default false,
  observaciones text,
  creado_el timestamptz not null default now(),
  modificado_el timestamptz not null default now(),
  creado_por uuid references public.usuarios (id)
);

alter table public.cheques enable row level security;

drop policy if exists "cheques: ver" on public.cheques;
create policy "cheques: ver"
  on public.cheques for select
  using (public.is_usuario_activo());

drop policy if exists "cheques: crear" on public.cheques;
create policy "cheques: crear"
  on public.cheques for insert
  with check (public.is_usuario_activo());

drop policy if exists "cheques: editar" on public.cheques;
create policy "cheques: editar"
  on public.cheques for update
  using (public.is_usuario_activo())
  with check (public.is_usuario_activo());

drop policy if exists "cheques: eliminar (solo admin)" on public.cheques;
create policy "cheques: eliminar (solo admin)"
  on public.cheques for delete
  using (public.is_admin());

-- Cheques de terceros
create table if not exists public.cheques_terceros (
  id uuid primary key default gen_random_uuid(),
  n_cheque text,
  librador text not null,
  banco text,
  fecha_emision date,
  fecha_cobro date,
  importe numeric(14, 2) not null,
  estado text not null default 'En cartera'
    check (estado in ('En cartera', 'Entregado', 'Rechazado', 'Depositado')),
  entregado_a text,
  fecha_entrega date,
  observaciones text,
  creado_el timestamptz not null default now(),
  modificado_el timestamptz not null default now()
);

alter table public.cheques_terceros enable row level security;

drop policy if exists "cheques_terceros: todo activo" on public.cheques_terceros;
create policy "cheques_terceros: todo activo"
  on public.cheques_terceros for all
  using (public.is_usuario_activo())
  with check (public.is_usuario_activo());

-- Límites de exposición por proveedor
create table if not exists public.limites_proveedores_cheques (
  proveedor text primary key,
  limite numeric(14, 2) not null
);

alter table public.limites_proveedores_cheques enable row level security;

drop policy if exists "limites: todo activo" on public.limites_proveedores_cheques;
create policy "limites: todo activo"
  on public.limites_proveedores_cheques for all
  using (public.is_usuario_activo())
  with check (public.is_usuario_activo());
