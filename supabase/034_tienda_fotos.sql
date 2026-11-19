-- ============================================================================
-- 034 · Tienda online: fotos sugeridas desde Open Food Facts (SPEC-tienda-fotos.md)
--
-- El script `npm run tienda:fotos` (service_role, en la compu del usuario) consulta
-- Open Food Facts por código de barras, guarda la foto en el bucket `tienda` y deja
-- una sugerencia PENDIENTE. Nada se publica hasta que un usuario la acepta en /catalogo.
-- Se puede volver a correr entera.
-- ============================================================================

alter table public.tienda_productos add column if not exists foto_credito text;

-- ---------------------------------------------------------------- búsquedas hechas
create table if not exists public.tienda_fotos_busquedas (
  producto_id uuid primary key references public.tienda_productos(id) on delete cascade,
  fuente text not null default 'openfoodfacts' check (fuente in ('openfoodfacts')),
  resultado text not null check (resultado in ('con_foto', 'sin_foto', 'no_esta', 'error')),
  detalle text,
  buscado_el timestamptz not null default now()
);
create index if not exists tienda_fotos_busquedas_resultado_idx on public.tienda_fotos_busquedas (resultado);

-- ---------------------------------------------------------------- sugerencias
create table if not exists public.tienda_fotos_sugeridas (
  id uuid primary key default gen_random_uuid(),
  producto_id uuid not null references public.tienda_productos(id) on delete cascade,
  fuente text not null default 'openfoodfacts' check (fuente in ('openfoodfacts')),
  url text not null check (url ~ '^https://'),            -- nuestra copia en Storage
  url_origen text not null,                               -- de dónde se bajó
  nombre_origen text,                                     -- cómo se llama allá
  credito text not null default 'Open Food Facts (CC BY-SA)',
  estado text not null default 'pendiente' check (estado in ('pendiente', 'aceptada', 'descartada')),
  creado_el timestamptz not null default now(),
  decidido_el timestamptz,
  decidido_por uuid references public.usuarios(id) on delete set null,
  unique (producto_id, fuente),
  constraint tienda_fotos_decision_coherente check (
    (estado = 'pendiente' and decidido_el is null)
    or (estado <> 'pendiente' and decidido_el is not null)
  )
);
create index if not exists tienda_fotos_sugeridas_estado_idx on public.tienda_fotos_sugeridas (estado, creado_el);

-- ---------------------------------------------------------------- RLS
alter table public.tienda_fotos_busquedas enable row level security;
alter table public.tienda_fotos_sugeridas enable row level security;

-- Sin políticas para anon: sin login no se ve nada. Los usuarios activos leen todo;
-- las decisiones pasan por tienda_decidir_foto.
drop policy if exists "tienda_fotos_busquedas: ver (usuarios)" on public.tienda_fotos_busquedas;
create policy "tienda_fotos_busquedas: ver (usuarios)" on public.tienda_fotos_busquedas
  for select to authenticated using (public.is_usuario_activo());

drop policy if exists "tienda_fotos_sugeridas: ver (usuarios)" on public.tienda_fotos_sugeridas;
create policy "tienda_fotos_sugeridas: ver (usuarios)" on public.tienda_fotos_sugeridas
  for select to authenticated using (public.is_usuario_activo());

-- ============================================================================
-- tienda_decidir_foto: acepta o descarta una sugerencia, en una transacción.
-- Aceptar pone la foto y el crédito en el producto. Si el producto ya tiene una foto
-- de OTRO origen (p. ej. cargada a mano) no la pisa, salvo reemplazar = true.
-- Devuelve el estado final: 'aceptada', 'descartada' o 'ya_tenia_foto'.
-- ============================================================================
create or replace function public.tienda_decidir_foto(p_id uuid, p_aceptar boolean, p_reemplazar boolean default false)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sug tienda_fotos_sugeridas%rowtype;
  v_foto_actual text;
begin
  if not public.is_usuario_activo() then
    raise exception 'tienda: sólo un usuario activo del sistema puede decidir fotos';
  end if;

  select * into v_sug from tienda_fotos_sugeridas where id = p_id for update;
  if not found then
    raise exception 'tienda: sugerencia inexistente';
  end if;

  if not p_aceptar then
    update tienda_fotos_sugeridas
    set estado = 'descartada', decidido_el = now(), decidido_por = auth.uid()
    where id = p_id;
    -- Si esa foto era la publicada, se saca.
    update tienda_productos set foto_url = null, foto_credito = null
    where id = v_sug.producto_id and foto_url = v_sug.url;
    return 'descartada';
  end if;

  select foto_url into v_foto_actual from tienda_productos where id = v_sug.producto_id for update;
  if v_foto_actual is not null and v_foto_actual <> v_sug.url and not p_reemplazar then
    return 'ya_tenia_foto';
  end if;

  update tienda_productos set foto_url = v_sug.url, foto_credito = v_sug.credito
  where id = v_sug.producto_id;
  update tienda_fotos_sugeridas
  set estado = 'aceptada', decidido_el = now(), decidido_por = auth.uid()
  where id = p_id;
  return 'aceptada';
end;
$$;

revoke all on function public.tienda_decidir_foto(uuid, boolean, boolean) from public, anon;
grant execute on function public.tienda_decidir_foto(uuid, boolean, boolean) to authenticated;
