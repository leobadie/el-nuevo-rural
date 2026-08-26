-- Cartelería digital para los televisores del local.
--
-- La pantalla /cartel corre en un TV que no tiene a nadie que inicie sesión, así
-- que esta tabla es la única del sistema con lectura pública (rol `anon`), y solo
-- para las placas activas. Escribir sigue siendo cosa de usuarios logueados.
--
-- Reutiliza is_usuario_activo() / is_admin() creadas en 002_cheques.sql.


-- ============================================================================
-- Placas: cada pantalla que rota en el televisor.
-- ============================================================================

create table if not exists public.cartel_placas (
  id uuid primary key default gen_random_uuid(),

  -- 'oferta' | 'institucional' | 'aviso'
  tipo text not null default 'oferta' check (tipo in ('oferta', 'institucional', 'aviso')),

  titulo text not null,
  bajada text,

  -- Solo para tipo 'oferta'. precio_anterior alimenta el tachado y el % de ahorro.
  precio numeric(12, 2) check (precio is null or precio >= 0),
  precio_anterior numeric(12, 2) check (precio_anterior is null or precio_anterior >= 0),
  unidad text,

  imagen_url text,

  -- Color de fondo opcional (hex). Si es null la pantalla usa el de la marca.
  color text,

  -- Ventana de vigencia. null = sin límite por ese lado.
  vigencia_desde date,
  vigencia_hasta date,

  duracion_seg int not null default 8 check (duracion_seg between 3 and 60),
  orden int not null default 0,
  activa boolean not null default true,

  creado_el timestamptz not null default now(),
  actualizado_el timestamptz not null default now(),
  creado_por uuid references public.usuarios (id),

  -- Una vigencia al revés (hasta < desde) esconde la placa para siempre sin
  -- avisar. Mejor rechazarla al cargarla.
  constraint cartel_placas_vigencia_coherente
    check (vigencia_desde is null or vigencia_hasta is null or vigencia_hasta >= vigencia_desde)
);

create index if not exists cartel_placas_orden_idx
  on public.cartel_placas (activa, orden);

alter table public.cartel_placas enable row level security;

-- Lectura pública: es lo que permite que el televisor muestre el cartel sin
-- login. Se limita a las placas activas para que un borrador a medio cargar no
-- quede accesible desde afuera.
drop policy if exists "cartel_placas: ver (público, solo activas)" on public.cartel_placas;
create policy "cartel_placas: ver (público, solo activas)"
  on public.cartel_placas for select
  to anon
  using (activa = true);

-- Los usuarios del sistema ven todo, incluidas las placas apagadas.
drop policy if exists "cartel_placas: ver (usuarios)" on public.cartel_placas;
create policy "cartel_placas: ver (usuarios)"
  on public.cartel_placas for select
  to authenticated
  using (public.is_usuario_activo());

drop policy if exists "cartel_placas: crear" on public.cartel_placas;
create policy "cartel_placas: crear"
  on public.cartel_placas for insert
  to authenticated
  with check (public.is_usuario_activo());

drop policy if exists "cartel_placas: editar" on public.cartel_placas;
create policy "cartel_placas: editar"
  on public.cartel_placas for update
  to authenticated
  using (public.is_usuario_activo())
  with check (public.is_usuario_activo());

drop policy if exists "cartel_placas: eliminar" on public.cartel_placas;
create policy "cartel_placas: eliminar"
  on public.cartel_placas for delete
  to authenticated
  using (public.is_usuario_activo());


-- Mantener actualizado_el al día sin depender de que la app se acuerde.
create or replace function public.cartel_placas_touch()
returns trigger
language plpgsql
as $$
begin
  new.actualizado_el := now();
  return new;
end;
$$;

drop trigger if exists cartel_placas_touch_trg on public.cartel_placas;
create trigger cartel_placas_touch_trg
  before update on public.cartel_placas
  for each row execute function public.cartel_placas_touch();


-- ============================================================================
-- Storage: fotos de las placas.
--
-- Bucket público porque el televisor las pide sin sesión.
-- ============================================================================

insert into storage.buckets (id, name, public)
values ('cartel', 'cartel', true)
on conflict (id) do update set public = true;

drop policy if exists "cartel: fotos visibles por todos" on storage.objects;
create policy "cartel: fotos visibles por todos"
  on storage.objects for select
  using (bucket_id = 'cartel');

drop policy if exists "cartel: subir fotos" on storage.objects;
create policy "cartel: subir fotos"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'cartel' and public.is_usuario_activo());

drop policy if exists "cartel: reemplazar fotos" on storage.objects;
create policy "cartel: reemplazar fotos"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'cartel' and public.is_usuario_activo());

drop policy if exists "cartel: borrar fotos" on storage.objects;
create policy "cartel: borrar fotos"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'cartel' and public.is_usuario_activo());
