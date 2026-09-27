-- Carnicería: los cajones de pollo que entran, al lado de las medias reses de vaca y cerdo.
-- Alimentan el módulo 7 (pollo entero o trozado) con los kilos por cajón y el precio de compra.
-- Ver SPEC-carniceria.md (puntos 19 a 23).
--
-- Solo admin, como el resto de la carnicería. Reutiliza is_admin() de 002_cheques.sql.

create table if not exists public.carniceria_pollo (
  id uuid primary key default gen_random_uuid(),
  fecha date not null,
  proveedor text,
  cajones integer not null check (cajones > 0),
  -- Kilos totales de la factura, todos los cajones juntos.
  kg_total numeric(10, 3) not null check (kg_total > 0),
  precio_kg numeric(14, 2) not null check (precio_kg >= 0),
  notas text,
  creado_el timestamptz not null default now(),
  creado_por uuid references public.usuarios (id)
);

create index if not exists carniceria_pollo_fecha_idx
  on public.carniceria_pollo (fecha);

alter table public.carniceria_pollo enable row level security;

drop policy if exists "carniceria_pollo: solo admin" on public.carniceria_pollo;
create policy "carniceria_pollo: solo admin"
  on public.carniceria_pollo for all
  using (public.is_admin())
  with check (public.is_admin());
