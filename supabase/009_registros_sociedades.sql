-- Copia local de dos registros públicos, para saber quién está detrás de un CUIT antes de
-- aceptarle un cheque:
--
--   sociedades         Registro Nacional de Sociedades (datos.jus.gob.ar) — todo el país.
--   sociedad_personas  Inspección General de Justicia — SOLO CABA.
--
-- No hay API que devuelva esto por CUIT: son CSV de ~1,3 GB por semestre, así que se copian
-- acá y se refrescan con scripts/importar-registros.mjs (necesita una service_role key: con
-- la anon key, RLS bloquea la escritura).
--
-- Ojo con la cobertura de personas: la IGJ es el registro de CABA. Medido sobre los archivos
-- de 202606, de las 279.309 sociedades con personas identificadas, 224.652 son de CABA y
-- 44.831 de Buenos Aires; Córdoba tiene 1.934 y Santa Fe 1.137. Que una sociedad no tenga
-- personas acá NO significa que no tenga socios, sino que su registro es provincial. La
-- pantalla tiene que decirlo así (R3.1 del SPEC).

create table if not exists public.sociedades (
  cuit char(11) primary key,
  razon_social text not null,
  tipo_societario text,
  -- Fecha del contrato social: sirve para la antigüedad, que es el dato que importa.
  fecha_contrato date,
  provincia text,
  localidad text,
  actividad text,
  -- Período del archivo del que salió la fila (AAAAMM), para poder decir de cuándo es el dato.
  periodo_fuente char(6),
  actualizado_el timestamptz not null default now()
);

comment on table public.sociedades is
  'Registro Nacional de Sociedades (datos.jus.gob.ar). Cobertura nacional, 1,25M de CUIT. Solo lectura: lo escribe el importador.';

create index if not exists sociedades_razon_social_idx
  on public.sociedades using gin (to_tsvector('spanish', razon_social));

create table if not exists public.sociedad_personas (
  id bigint generated always as identity primary key,
  cuit char(11) not null references public.sociedades (cuit) on delete cascade,
  nombre text not null,
  -- S socio, A autoridad (directorio o gerencia), R representante.
  rol char(1) not null check (rol in ('S', 'A', 'R')),
  tipo_documento text,
  numero_documento text,
  -- Una misma persona aparece varias veces con el nombre escrito distinto ("FEROLETO MARIO
  -- FRANCISCO" y "MARIO FRANCISCO FEROLETO"): el documento es lo que la identifica.
  unique (cuit, rol, numero_documento)
);

comment on table public.sociedad_personas is
  'Personas registradas en la IGJ (CABA únicamente). Son las registradas, no los accionistas de una S.A., que no son información pública.';

create index if not exists sociedad_personas_cuit_idx on public.sociedad_personas (cuit);

-- Ambas son copias de registros públicos y de solo lectura para la app: cualquier usuario
-- activo puede consultarlas, nadie puede escribirlas (el importador usa la service_role key,
-- que no pasa por RLS).
alter table public.sociedades enable row level security;
alter table public.sociedad_personas enable row level security;

drop policy if exists "sociedades: leer" on public.sociedades;
create policy "sociedades: leer"
  on public.sociedades for select
  using (public.is_usuario_activo());

drop policy if exists "sociedad_personas: leer" on public.sociedad_personas;
create policy "sociedad_personas: leer"
  on public.sociedad_personas for select
  using (public.is_usuario_activo());

-- Deja ver cuánto ocupan las tablas sin entrar al panel de Supabase, para decidir si hace
-- falta acotar la carga por provincia (DR5 del SPEC).
create or replace function public.tamano_registros()
returns table (tabla text, filas bigint, tamano text)
language sql
security definer
stable
as $$
  select 'sociedades', (select count(*) from public.sociedades),
         pg_size_pretty(pg_total_relation_size('public.sociedades'))
  union all
  select 'sociedad_personas', (select count(*) from public.sociedad_personas),
         pg_size_pretty(pg_total_relation_size('public.sociedad_personas'));
$$;
