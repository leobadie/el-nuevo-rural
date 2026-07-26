-- Reutiliza is_usuario_activo() / is_admin() creadas en 002_cheques.sql.

create table if not exists public.categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text unique not null
);

alter table public.categorias enable row level security;
drop policy if exists "categorias: todo activo" on public.categorias;
create policy "categorias: todo activo"
  on public.categorias for all
  using (public.is_usuario_activo())
  with check (public.is_usuario_activo());

-- Categorías de partida (las mismas que ya se usaban en el artifact viejo).
insert into public.categorias (nombre) values
  ('Venta / Caja'), ('Retiro de Caja'), ('Cobro a Cliente'), ('Otro Ingreso'),
  ('Pago a Proveedor'), ('Sueldos'), ('Alquiler'), ('Servicios (luz, agua, gas)'),
  ('Internet / Telefonía'), ('Contador / Honorarios'), ('Seguro'), ('Impuestos'),
  ('Panadería'), ('Bebidas'), ('Verdulería / Carnicería'),
  ('Mantenimiento'), ('Insumos / Librería'), ('Gastos Varios'), ('Otro Egreso')
on conflict (nombre) do nothing;

create table if not exists public.proveedores (
  id uuid primary key default gen_random_uuid(),
  nombre text unique not null,
  telefono text
);

alter table public.proveedores enable row level security;
drop policy if exists "proveedores: todo activo" on public.proveedores;
create policy "proveedores: todo activo"
  on public.proveedores for all
  using (public.is_usuario_activo())
  with check (public.is_usuario_activo());

-- Proveedores de partida (los mismos que ya se usaban en el artifact viejo).
-- El "Otro" sentinela del artifact no se guarda como fila: la app lo agrega
-- como opción fija al final de cualquier selector de proveedor.
insert into public.proveedores (nombre) values
  ('Italiana'), ('Miguel (panadería)'), ('San Cayetano'), ('Miga'), ('MyS Bebidas'),
  ('Pepsi'), ('Pritty'), ('Pizzeta'), ('Coca-Cola'), ('Norte Vinos'), ('Alvarez'),
  ('Pompeda (lácteos)'), ('Wamatinaj (frutos secos)'), ('Martín (alquiler)'),
  ('Jotape'), ('Katy (verdulería)'), ('Gaston Bazan')
on conflict (nombre) do nothing;

create table if not exists public.limites_categorias (
  categoria text primary key,
  limite numeric(14, 2) not null
);

alter table public.limites_categorias enable row level security;
drop policy if exists "limites_categorias: todo activo" on public.limites_categorias;
create policy "limites_categorias: todo activo"
  on public.limites_categorias for all
  using (public.is_usuario_activo())
  with check (public.is_usuario_activo());

create table if not exists public.gastos_fijos (
  id uuid primary key default gen_random_uuid(),
  descripcion text not null,
  categoria text not null,
  monto numeric(14, 2) not null,
  proveedor text,
  activo boolean not null default true
);

alter table public.gastos_fijos enable row level security;
drop policy if exists "gastos_fijos: todo activo" on public.gastos_fijos;
create policy "gastos_fijos: todo activo"
  on public.gastos_fijos for all
  using (public.is_usuario_activo())
  with check (public.is_usuario_activo());

create table if not exists public.movimientos (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  descripcion text,
  categoria text,
  ingreso numeric(14, 2),
  egreso numeric(14, 2),
  proveedor text,
  medio_pago text check (medio_pago in ('Efectivo', 'Transferencia', 'Cheque')),
  n_cheque_pago text,
  fecha_cobro_cheque_pago date,
  cheque_creado boolean not null default false,
  gasto_fijo_id uuid references public.gastos_fijos (id) on delete set null,
  creado_el timestamptz not null default now(),
  modificado_el timestamptz not null default now(),
  creado_por uuid references public.usuarios (id)
);

alter table public.movimientos enable row level security;

drop policy if exists "movimientos: ver" on public.movimientos;
create policy "movimientos: ver"
  on public.movimientos for select
  using (public.is_usuario_activo());

drop policy if exists "movimientos: crear" on public.movimientos;
create policy "movimientos: crear"
  on public.movimientos for insert
  with check (public.is_usuario_activo());

drop policy if exists "movimientos: editar" on public.movimientos;
create policy "movimientos: editar"
  on public.movimientos for update
  using (public.is_usuario_activo())
  with check (public.is_usuario_activo());

drop policy if exists "movimientos: eliminar (solo admin)" on public.movimientos;
create policy "movimientos: eliminar (solo admin)"
  on public.movimientos for delete
  using (public.is_admin());

create table if not exists public.ventas_xrp (
  id uuid primary key default gen_random_uuid(),
  fecha date unique not null,
  empresa text,
  venta_total numeric(14, 2),
  cobro_total numeric(14, 2),
  venta_por_medio jsonb not null default '{}',
  cobro_por_medio jsonb not null default '{}',
  creado_el timestamptz not null default now()
);

alter table public.ventas_xrp enable row level security;
drop policy if exists "ventas_xrp: todo activo" on public.ventas_xrp;
create policy "ventas_xrp: todo activo"
  on public.ventas_xrp for all
  using (public.is_usuario_activo())
  with check (public.is_usuario_activo());

create table if not exists public.pedidos (
  id uuid primary key default gen_random_uuid(),
  proveedor text not null,
  items jsonb not null default '[]',
  notas text,
  texto text not null,
  telefono text,
  confirmado boolean not null default false,
  enviado_el timestamptz not null default now()
);

alter table public.pedidos enable row level security;
drop policy if exists "pedidos: todo activo" on public.pedidos;
create policy "pedidos: todo activo"
  on public.pedidos for all
  using (public.is_usuario_activo())
  with check (public.is_usuario_activo());
