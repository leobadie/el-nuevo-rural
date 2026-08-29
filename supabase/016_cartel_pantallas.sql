-- Pantallas del cartel: cada televisor del local, con su dirección propia.
--
-- Hasta ahora los 10 televisores mostraban todos lo mismo. Con esto cada uno
-- abre /cartel/tv/<slug> y ve lo suyo: la carnicería sus cortes, la entrada lo
-- institucional.
--
-- Igual que cartel_placas, estas tablas tienen lectura pública (rol `anon`),
-- porque el televisor no tiene a nadie que inicie sesión. Escribir sigue siendo
-- cosa de usuarios logueados.
--
-- Reutiliza is_usuario_activo() creada en 002_cheques.sql.
-- Ver SPEC-cartel-pantallas.md.


-- ============================================================================
-- Pantallas
-- ============================================================================

create table if not exists public.cartel_pantallas (
  -- El slug ES la clave: va en la URL que se tipea en el televisor, así que
  -- tiene que ser legible y estable. Un uuid acá obligaría a copiar 36
  -- caracteres al azar con el control remoto.
  slug text primary key
    check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(slug) between 2 and 40),

  nombre text not null,

  -- Sección por defecto de la pantalla, en el mismo texto libre que
  -- cartel_placas.seccion. null = la pantalla muestra todo lo que no esté
  -- asignado a otra. Es el caso de los TVs de pasillo y acceso.
  seccion text,

  activa boolean not null default true,
  orden int not null default 0,

  creado_el timestamptz not null default now(),
  actualizado_el timestamptz not null default now(),
  creado_por uuid references public.usuarios (id)
);

create index if not exists cartel_pantallas_orden_idx
  on public.cartel_pantallas (activa, orden);

alter table public.cartel_pantallas enable row level security;

-- Lectura pública limitada a las activas: una pantalla dada de baja no tiene
-- por qué seguir respondiendo desde afuera.
drop policy if exists "cartel_pantallas: ver (público, solo activas)" on public.cartel_pantallas;
create policy "cartel_pantallas: ver (público, solo activas)"
  on public.cartel_pantallas for select
  to anon
  using (activa = true);

drop policy if exists "cartel_pantallas: ver (usuarios)" on public.cartel_pantallas;
create policy "cartel_pantallas: ver (usuarios)"
  on public.cartel_pantallas for select
  to authenticated
  using (public.is_usuario_activo());

drop policy if exists "cartel_pantallas: crear" on public.cartel_pantallas;
create policy "cartel_pantallas: crear"
  on public.cartel_pantallas for insert
  to authenticated
  with check (public.is_usuario_activo());

drop policy if exists "cartel_pantallas: editar" on public.cartel_pantallas;
create policy "cartel_pantallas: editar"
  on public.cartel_pantallas for update
  to authenticated
  using (public.is_usuario_activo())
  with check (public.is_usuario_activo());

drop policy if exists "cartel_pantallas: eliminar" on public.cartel_pantallas;
create policy "cartel_pantallas: eliminar"
  on public.cartel_pantallas for delete
  to authenticated
  using (public.is_usuario_activo());


create or replace function public.cartel_pantallas_touch()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_el := now();
  return new;
end;
$$;

drop trigger if exists cartel_pantallas_touch_trg on public.cartel_pantallas;
create trigger cartel_pantallas_touch_trg
  before update on public.cartel_pantallas
  for each row execute function public.cartel_pantallas_touch();


-- ============================================================================
-- Asignación explícita placa → pantalla
--
-- Una placa SIN ninguna fila acá va a todas las pantallas que coincidan por
-- sección. Es lo que hace que todo lo cargado hasta hoy siga viéndose sin
-- tocar nada: ninguna placa existente tiene asignación.
-- ============================================================================

create table if not exists public.cartel_placa_pantalla (
  placa_id uuid not null references public.cartel_placas (id) on delete cascade,
  pantalla_slug text not null references public.cartel_pantallas (slug) on delete cascade,
  primary key (placa_id, pantalla_slug)
);

-- La consulta del televisor entra por pantalla ("qué placas tiene ésta"); la del
-- admin entra por placa ("a qué pantallas va"). Hacen falta los dos lados: la
-- clave primaria solo cubre el primero.
create index if not exists cartel_placa_pantalla_pantalla_idx
  on public.cartel_placa_pantalla (pantalla_slug);

alter table public.cartel_placa_pantalla enable row level security;

-- Lectura pública acotada a las pantallas activas: sin esto, alguien sin sesión
-- podría enumerar la asignación de una pantalla dada de baja.
drop policy if exists "cartel_placa_pantalla: ver (público)" on public.cartel_placa_pantalla;
create policy "cartel_placa_pantalla: ver (público)"
  on public.cartel_placa_pantalla for select
  to anon
  using (
    exists (
      select 1 from public.cartel_pantallas p
      where p.slug = pantalla_slug and p.activa = true
    )
  );

drop policy if exists "cartel_placa_pantalla: ver (usuarios)" on public.cartel_placa_pantalla;
create policy "cartel_placa_pantalla: ver (usuarios)"
  on public.cartel_placa_pantalla for select
  to authenticated
  using (public.is_usuario_activo());

drop policy if exists "cartel_placa_pantalla: crear" on public.cartel_placa_pantalla;
create policy "cartel_placa_pantalla: crear"
  on public.cartel_placa_pantalla for insert
  to authenticated
  with check (public.is_usuario_activo());

drop policy if exists "cartel_placa_pantalla: eliminar" on public.cartel_placa_pantalla;
create policy "cartel_placa_pantalla: eliminar"
  on public.cartel_placa_pantalla for delete
  to authenticated
  using (public.is_usuario_activo());


-- ============================================================================
-- Las 10 pantallas que ya existen en el panel de Data Computación.
--
-- Se dan de alta con los mismos nombres para que no haya que traducir mentalmente
-- entre los dos sistemas mientras convivan. on conflict do nothing: correr la
-- migración de nuevo no pisa lo que se haya editado desde el admin.
-- ============================================================================

insert into public.cartel_pantallas (slug, nombre, seccion, orden) values
  ('carniceria-1', 'Carnicería 1', 'Carnicería', 10),
  ('carniceria-2', 'Carnicería 2', 'Carnicería', 20),
  ('carniceria-3', 'Carnicería 3', 'Carnicería', 30),
  ('embutidos-1',  'Embutidos 1',  'Embutidos',  40),
  ('embutidos-2',  'Embutidos 2',  'Embutidos',  50),
  ('embutidos-3',  'Embutidos 3',  'Embutidos',  60),
  ('embutidos-4',  'Embutidos 4',  'Embutidos',  70),
  ('embutidos-5',  'Embutidos 5',  'Embutidos',  80),
  ('pasillo',      'Pasillo',      null,         90),
  ('acceso',       'Acceso',       null,        100)
on conflict (slug) do nothing;
