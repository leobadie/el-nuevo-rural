-- Ofertas: el cartel de los televisores y el flyer pasan a ser un solo módulo con una sola lista
-- de ofertas (las placas de cartel_placas). Ver SPEC-ofertas.md.
--
-- Nada de lo cargado cambia: las placas existentes quedan fuera del flyer (en_flyer = false)
-- y los televisores las siguen mostrando igual.


-- ============================================================================
-- Cada placa puede ir, además, al flyer, con su propio orden (distinto del de rotación del TV).
-- ============================================================================

alter table public.cartel_placas
  add column if not exists en_flyer boolean not null default false;

alter table public.cartel_placas
  add column if not exists orden_flyer int not null default 0;


-- ============================================================================
-- Lo que no es de ninguna oferta: el encabezado y el pie del flyer. Antes vivía sólo en el
-- navegador donde se armó; en la base se ve igual desde la compu y el celular.
-- Una sola fila (id = 1).
-- ============================================================================

create table if not exists public.flyer_config (
  id int primary key default 1 check (id = 1),
  titulo text not null default 'Ofertas de la semana',
  seccion text not null default '',
  vigencia text not null default '',
  direccion text not null default '',
  telefono text not null default '',
  horarios text not null default '',
  instagram text not null default '',
  actualizado_el timestamptz not null default now()
);

-- Los mismos permisos que las placas: cualquier usuario activo. A diferencia de las placas, no
-- hay lectura pública: el flyer no lo lee el televisor.
alter table public.flyer_config enable row level security;

drop policy if exists "flyer_config: usuarios activos" on public.flyer_config;
create policy "flyer_config: usuarios activos"
  on public.flyer_config for all
  using (public.is_usuario_activo())
  with check (public.is_usuario_activo());
