-- ============================================================================
-- 033 · Tienda online (SPEC-tienda.md)
--
-- Catálogo importado del Excel de XRP + pedidos por WhatsApp.
-- Se puede volver a correr entera sin romper nada (if not exists / drop if exists).
--
-- Plata en centavos (enteros): el Excel trae precios como 159.9. Una sola moneda (ARS).
-- Acceso: anon sólo lee lo publicado; los pedidos entran únicamente por
-- tienda_crear_pedido, que toma los precios de la base. Los usuarios activos del
-- sistema administran todo.
-- ============================================================================

-- ---------------------------------------------------------------- categorías
create table if not exists public.tienda_categorias (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  orden int not null default 0,
  visible boolean not null default true,
  creado_el timestamptz not null default now(),
  actualizado_el timestamptz not null default now()
);

-- ---------------------------------------------------------------- importaciones
create table if not exists public.tienda_importaciones (
  id uuid primary key default gen_random_uuid(),
  archivo text not null,
  filas int not null check (filas >= 0),
  nuevos int not null default 0,
  cambios_de_precio int not null default 0,
  retirados int not null default 0,
  vuelven int not null default 0,
  usuario_id uuid references public.usuarios(id) on delete set null,
  creado_el timestamptz not null default now()
);

-- ---------------------------------------------------------------- productos
create table if not exists public.tienda_productos (
  id uuid primary key default gen_random_uuid(),

  -- De XRP: se pisa en cada importación
  codigo_xrp text not null unique check (length(codigo_xrp) between 1 and 40),
  codigo_barras text,
  nombre_xrp text not null check (length(trim(nombre_xrp)) > 0),
  marca text,
  presentacion text,
  categoria_xrp text,
  precio_centavos int not null check (precio_centavos > 0),
  se_vende_por text not null check (se_vende_por in ('unidad', 'kg')),
  fraccionable boolean not null default false,
  contenido_cantidad numeric check (contenido_cantidad is null or contenido_cantidad > 0),
  contenido_unidad text check (contenido_unidad is null or contenido_unidad in ('g', 'ml', 'un')),
  busqueda text not null default '',

  -- De la web: la importación NO lo pisa
  nombre_web text,
  categoria_id uuid references public.tienda_categorias(id) on delete set null,
  categoria_manual boolean not null default false,
  precio_anterior_centavos int,
  foto_url text,
  descripcion text,
  visible boolean not null default true,

  -- Respecto del último Excel: lo que no vino se oculta, no se borra
  en_ultima_importacion boolean not null default true,
  importacion_id uuid references public.tienda_importaciones(id) on delete set null,

  creado_el timestamptz not null default now(),
  actualizado_el timestamptz not null default now(),

  -- "is not null" explícito: un CHECK que da NULL deja pasar la fila.
  constraint tienda_precio_anterior_mayor check (
    precio_anterior_centavos is null
    or (precio_anterior_centavos is not null and precio_anterior_centavos > precio_centavos)
  ),
  constraint tienda_fraccionable_solo_kg check (fraccionable = false or se_vende_por = 'kg')
);

create index if not exists tienda_productos_categoria_idx on public.tienda_productos (categoria_id);
create index if not exists tienda_productos_publicos_idx
  on public.tienda_productos (categoria_id, nombre_xrp) where visible and en_ultima_importacion;
create index if not exists tienda_productos_barras_idx on public.tienda_productos (codigo_barras);
create index if not exists tienda_productos_importacion_idx on public.tienda_productos (importacion_id);

-- ---------------------------------------------------------------- configuración (una fila)
create table if not exists public.tienda_config (
  id boolean primary key default true check (id),
  abierta boolean not null default false,
  whatsapp text check (whatsapp is null or whatsapp ~ '^[0-9]{10,15}$'),
  direccion_retiro text,
  horarios text,
  aviso text,
  envio_activo boolean not null default true,
  retiro_activo boolean not null default true,
  minimo_compra_centavos int not null default 0 check (minimo_compra_centavos >= 0),
  actualizado_el timestamptz not null default now()
);
insert into public.tienda_config (id) values (true) on conflict (id) do nothing;

-- ---------------------------------------------------------------- zonas de envío (etapa 2)
create table if not exists public.tienda_zonas_envio (
  id uuid primary key default gen_random_uuid(),
  nombre text not null unique,
  costo_centavos int not null default 0 check (costo_centavos >= 0),
  minimo_centavos int not null default 0 check (minimo_centavos >= 0),
  activa boolean not null default true,
  orden int not null default 0,
  creado_el timestamptz not null default now(),
  actualizado_el timestamptz not null default now()
);

-- ---------------------------------------------------------------- pedidos
create table if not exists public.tienda_pedidos (
  id uuid primary key default gen_random_uuid(),
  numero bigint generated always as identity unique,
  token uuid not null default gen_random_uuid(),
  nombre text not null check (length(trim(nombre)) between 2 and 80),
  telefono text not null check (telefono ~ '^[0-9]{8,15}$'),
  entrega text not null check (entrega in ('retiro', 'envio')),
  direccion text check (direccion is null or length(direccion) <= 200),
  zona_id uuid references public.tienda_zonas_envio(id) on delete set null,
  zona_nombre text,
  costo_envio_centavos int not null default 0 check (costo_envio_centavos >= 0),
  forma_pago text not null check (forma_pago in ('efectivo', 'transferencia', 'tarjeta')),
  nota text check (nota is null or length(nota) <= 500),
  subtotal_centavos int not null check (subtotal_centavos > 0),
  total_centavos int not null check (total_centavos > 0),
  total_aproximado boolean not null default false,
  estado text not null default 'nuevo'
    check (estado in ('nuevo', 'preparando', 'listo', 'entregado', 'cancelado')),
  creado_el timestamptz not null default now(),
  actualizado_el timestamptz not null default now(),
  constraint tienda_envio_con_direccion check (
    entrega = 'retiro'
    or (entrega = 'envio' and direccion is not null and length(trim(direccion)) >= 5)
  )
);
create index if not exists tienda_pedidos_estado_idx on public.tienda_pedidos (estado, creado_el desc);
create index if not exists tienda_pedidos_telefono_idx on public.tienda_pedidos (telefono, creado_el desc);
create index if not exists tienda_pedidos_zona_idx on public.tienda_pedidos (zona_id);

create table if not exists public.tienda_pedido_lineas (
  id uuid primary key default gen_random_uuid(),
  pedido_id uuid not null references public.tienda_pedidos(id) on delete cascade,
  producto_id uuid references public.tienda_productos(id) on delete set null,
  codigo_xrp text not null,
  nombre text not null,
  presentacion text,
  precio_unitario_centavos int not null check (precio_unitario_centavos > 0),
  se_vende_por text not null check (se_vende_por in ('unidad', 'kg')),
  fraccionable boolean not null default false,
  cantidad numeric not null check (cantidad > 0),
  subtotal_centavos int not null check (subtotal_centavos > 0),
  orden int not null default 0
);
create index if not exists tienda_pedido_lineas_pedido_idx on public.tienda_pedido_lineas (pedido_id);
create index if not exists tienda_pedido_lineas_producto_idx on public.tienda_pedido_lineas (producto_id);

-- ---------------------------------------------------------------- actualizado_el
create or replace function public.tienda_touch()
returns trigger language plpgsql as $$
begin
  new.actualizado_el := now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['tienda_categorias','tienda_productos','tienda_config',
                           'tienda_zonas_envio','tienda_pedidos']
  loop
    execute format('drop trigger if exists %I on public.%I', t || '_touch', t);
    execute format('create trigger %I before update on public.%I
                    for each row execute function public.tienda_touch()', t || '_touch', t);
  end loop;
end $$;

-- ============================================================================
-- RLS
-- ============================================================================
alter table public.tienda_categorias     enable row level security;
alter table public.tienda_productos      enable row level security;
alter table public.tienda_importaciones  enable row level security;
alter table public.tienda_config         enable row level security;
alter table public.tienda_zonas_envio    enable row level security;
alter table public.tienda_pedidos        enable row level security;
alter table public.tienda_pedido_lineas  enable row level security;

drop policy if exists "tienda_categorias: ver (público)" on public.tienda_categorias;
create policy "tienda_categorias: ver (público)" on public.tienda_categorias
  for select to anon using (visible);

-- Productos: sólo con la tienda abierta, visibles, del último Excel y de categoría visible.
drop policy if exists "tienda_productos: ver (público)" on public.tienda_productos;
create policy "tienda_productos: ver (público)" on public.tienda_productos
  for select to anon using (
    visible
    and en_ultima_importacion
    and coalesce((select c.abierta from public.tienda_config c where c.id), false)
    and (categoria_id is null or exists (
      select 1 from public.tienda_categorias k where k.id = categoria_id and k.visible))
  );

-- La config no tiene nada secreto (WhatsApp, dirección, horarios): se lee pública.
drop policy if exists "tienda_config: ver (público)" on public.tienda_config;
create policy "tienda_config: ver (público)" on public.tienda_config
  for select to anon using (true);

drop policy if exists "tienda_zonas_envio: ver (público)" on public.tienda_zonas_envio;
create policy "tienda_zonas_envio: ver (público)" on public.tienda_zonas_envio
  for select to anon using (activa);

do $$
declare t text;
begin
  foreach t in array array['tienda_categorias','tienda_productos','tienda_importaciones',
                           'tienda_config','tienda_zonas_envio','tienda_pedidos',
                           'tienda_pedido_lineas']
  loop
    execute format('drop policy if exists %I on public.%I', t || ': todo (usuarios)', t);
    execute format('create policy %I on public.%I for all to authenticated
                    using (public.is_usuario_activo())
                    with check (public.is_usuario_activo())', t || ': todo (usuarios)', t);
  end loop;
end $$;

-- ============================================================================
-- tienda_importar: compara el Excel con lo cargado y, si aplicar = true, lo guarda.
-- Todo en una transacción (la de la llamada). Lo prepara el navegador
-- (src/lib/tienda/importar.ts): acá llega validado, sin repetidos y con lo inferido.
-- Corre con los permisos de quien llama (security invoker) y además exige usuario activo.
-- ============================================================================
create or replace function public.tienda_importar(filas jsonb, archivo text, aplicar boolean default false)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_total int;
  v_distintos int;
  v_nuevos int;
  v_cambios int;
  v_retirados int;
  v_vuelven int;
  v_ejemplos jsonb;
  v_import uuid;
  v_ofertas_caidas int;
begin
  if not public.is_usuario_activo() then
    raise exception 'tienda: sólo un usuario activo del sistema puede importar';
  end if;
  if jsonb_typeof(filas) <> 'array' or jsonb_array_length(filas) = 0 then
    raise exception 'tienda: el Excel no tiene filas para importar';
  end if;

  create temporary table if not exists _tienda_filas (
    codigo_xrp text, codigo_barras text, nombre_xrp text, marca text, presentacion text,
    categoria_xrp text, categoria_slug text, precio_centavos int, se_vende_por text,
    fraccionable boolean, contenido_cantidad numeric, contenido_unidad text, busqueda text
  ) on commit drop;
  truncate _tienda_filas;

  insert into _tienda_filas
  select * from jsonb_to_recordset(filas) as x(
    codigo_xrp text, codigo_barras text, nombre_xrp text, marca text, presentacion text,
    categoria_xrp text, categoria_slug text, precio_centavos int, se_vende_por text,
    fraccionable boolean, contenido_cantidad numeric, contenido_unidad text, busqueda text);

  select count(*), count(distinct codigo_xrp) into v_total, v_distintos from _tienda_filas;
  if v_total <> v_distintos then
    raise exception 'tienda: hay códigos XRP repetidos en el Excel';
  end if;

  select count(*) into v_nuevos from _tienda_filas f
  where not exists (select 1 from tienda_productos p where p.codigo_xrp = f.codigo_xrp);

  select count(*) into v_cambios from _tienda_filas f
  join tienda_productos p using (codigo_xrp) where p.precio_centavos <> f.precio_centavos;

  select count(*) into v_retirados from tienda_productos p
  where p.en_ultima_importacion
    and not exists (select 1 from _tienda_filas f where f.codigo_xrp = p.codigo_xrp);

  select count(*) into v_vuelven from tienda_productos p
  where not p.en_ultima_importacion
    and exists (select 1 from _tienda_filas f where f.codigo_xrp = p.codigo_xrp);

  select count(*) into v_ofertas_caidas from _tienda_filas f
  join tienda_productos p using (codigo_xrp)
  where p.precio_anterior_centavos is not null and p.precio_anterior_centavos <= f.precio_centavos;

  -- Los 30 cambios de precio más grandes (en %), para revisar antes de aplicar.
  select coalesce(jsonb_agg(e order by (e->>'variacion')::numeric desc), '[]'::jsonb) into v_ejemplos from (
    select jsonb_build_object(
      'codigo_xrp', f.codigo_xrp, 'nombre', f.nombre_xrp,
      'antes', p.precio_centavos, 'ahora', f.precio_centavos,
      'variacion', round(abs(f.precio_centavos - p.precio_centavos)::numeric * 100 / p.precio_centavos, 1)
    ) as e
    from _tienda_filas f join tienda_productos p using (codigo_xrp)
    where p.precio_centavos <> f.precio_centavos
    order by abs(f.precio_centavos - p.precio_centavos)::numeric / p.precio_centavos desc
    limit 30
  ) s;

  if aplicar then
    insert into tienda_importaciones (archivo, filas, nuevos, cambios_de_precio, retirados, vuelven, usuario_id)
    values (archivo, v_total, v_nuevos, v_cambios, v_retirados, v_vuelven, auth.uid())
    returning id into v_import;

    insert into tienda_categorias (nombre, slug, visible, orden)
    select distinct on (f.categoria_xrp) f.categoria_xrp, f.categoria_slug,
           f.categoria_xrp <> 'Cigarrillos', 100
    from _tienda_filas f
    where f.categoria_xrp is not null and f.categoria_slug is not null
    on conflict (nombre) do nothing;

    insert into tienda_productos as p (
      codigo_xrp, codigo_barras, nombre_xrp, marca, presentacion, categoria_xrp,
      precio_centavos, se_vende_por, fraccionable, contenido_cantidad, contenido_unidad,
      busqueda, categoria_id, en_ultima_importacion, importacion_id)
    select f.codigo_xrp, f.codigo_barras, f.nombre_xrp, f.marca, f.presentacion, f.categoria_xrp,
           f.precio_centavos, f.se_vende_por, f.fraccionable, f.contenido_cantidad, f.contenido_unidad,
           f.busqueda, k.id, true, v_import
    from _tienda_filas f
    left join tienda_categorias k on k.nombre = f.categoria_xrp
    on conflict (codigo_xrp) do update set
      codigo_barras = excluded.codigo_barras,
      nombre_xrp = excluded.nombre_xrp,
      marca = excluded.marca,
      presentacion = excluded.presentacion,
      categoria_xrp = excluded.categoria_xrp,
      precio_centavos = excluded.precio_centavos,
      se_vende_por = excluded.se_vende_por,
      fraccionable = excluded.fraccionable,
      contenido_cantidad = excluded.contenido_cantidad,
      contenido_unidad = excluded.contenido_unidad,
      busqueda = excluded.busqueda,
      -- La categoría corregida a mano se respeta.
      categoria_id = case when p.categoria_manual then p.categoria_id else excluded.categoria_id end,
      -- Si el precio nuevo ya no es menor que el tachado, la oferta se termina sola.
      precio_anterior_centavos = case
        when p.precio_anterior_centavos is not null and p.precio_anterior_centavos > excluded.precio_centavos
        then p.precio_anterior_centavos else null end,
      en_ultima_importacion = true,
      importacion_id = v_import;

    update tienda_productos p set en_ultima_importacion = false
    where p.en_ultima_importacion
      and not exists (select 1 from _tienda_filas f where f.codigo_xrp = p.codigo_xrp);
  end if;

  return jsonb_build_object(
    'aplicado', aplicar,
    'importacion_id', v_import,
    'filas', v_total,
    'nuevos', v_nuevos,
    'cambios_de_precio', v_cambios,
    'iguales', v_total - v_nuevos - v_cambios,
    'retirados', v_retirados,
    'vuelven', v_vuelven,
    'ofertas_que_terminan', v_ofertas_caidas,
    'mayores_cambios', v_ejemplos
  );
end;
$$;

revoke all on function public.tienda_importar(jsonb, text, boolean) from public, anon;
grant execute on function public.tienda_importar(jsonb, text, boolean) to authenticated;

-- ============================================================================
-- tienda_crear_pedido: la única puerta pública de escritura.
-- Entrada: {nombre, telefono, entrega, direccion, forma_pago, nota,
--           lineas: [{codigo, cantidad}]}   (cantidad: unidades, o kilos si es pesable)
-- Los mensajes de error empiezan con "tienda:" y la app los traduce para el cliente.
-- ============================================================================
create or replace function public.tienda_crear_pedido(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cfg tienda_config%rowtype;
  v_nombre text := trim(coalesce(p->>'nombre', ''));
  v_tel text := regexp_replace(coalesce(p->>'telefono', ''), '[^0-9]', '', 'g');
  v_entrega text := p->>'entrega';
  v_dir text := nullif(trim(coalesce(p->>'direccion', '')), '');
  v_pago text := p->>'forma_pago';
  v_nota text := nullif(trim(coalesce(p->>'nota', '')), '');
  v_lineas jsonb := p->'lineas';
  v_linea jsonb;
  v_prod tienda_productos%rowtype;
  v_cant numeric;
  v_sub int;
  v_subtotal int := 0;
  v_aprox boolean := false;
  v_pedido tienda_pedidos%rowtype;
  v_orden int := 0;
  v_salida jsonb := '[]'::jsonb;
begin
  select * into v_cfg from tienda_config where id;
  if not found or not v_cfg.abierta then
    raise exception 'tienda: cerrada';
  end if;
  -- Sin número no hay adónde mandar el pedido: no se guarda uno que nadie va a ver.
  if v_cfg.whatsapp is null then
    raise exception 'tienda: sin whatsapp';
  end if;

  if length(v_nombre) < 2 or length(v_nombre) > 80 then
    raise exception 'tienda: nombre';
  end if;
  if v_tel !~ '^[0-9]{8,15}$' then
    raise exception 'tienda: telefono';
  end if;
  if v_entrega is null or v_entrega not in ('retiro', 'envio') then
    raise exception 'tienda: entrega';
  end if;
  if v_entrega = 'envio' and (v_dir is null or length(v_dir) < 5) then
    raise exception 'tienda: direccion';
  end if;
  if v_entrega = 'retiro' then v_dir := null; end if;
  if v_pago is null or v_pago not in ('efectivo', 'transferencia', 'tarjeta') then
    raise exception 'tienda: pago';
  end if;
  if v_nota is not null and length(v_nota) > 500 then
    raise exception 'tienda: nota';
  end if;
  if jsonb_typeof(v_lineas) <> 'array' or jsonb_array_length(v_lineas) = 0 then
    raise exception 'tienda: vacio';
  end if;
  if jsonb_array_length(v_lineas) > 100 then
    raise exception 'tienda: demasiadas lineas';
  end if;
  if (select count(distinct x->>'codigo') from jsonb_array_elements(v_lineas) x) <> jsonb_array_length(v_lineas) then
    raise exception 'tienda: linea repetida';
  end if;

  -- Freno a pedidos en ráfaga desde el mismo teléfono.
  if (select count(*) from tienda_pedidos
      where telefono = v_tel and creado_el > now() - interval '10 minutes') >= 5 then
    raise exception 'tienda: demasiados pedidos';
  end if;

  insert into tienda_pedidos (nombre, telefono, entrega, direccion, forma_pago, nota,
                              subtotal_centavos, total_centavos, total_aproximado)
  values (v_nombre, v_tel, v_entrega, v_dir, v_pago, v_nota, 1, 1, false)
  returning * into v_pedido;

  for v_linea in select * from jsonb_array_elements(v_lineas) loop
    select pr.* into v_prod from tienda_productos pr
    left join tienda_categorias k on k.id = pr.categoria_id
    where pr.codigo_xrp = v_linea->>'codigo'
      and pr.visible and pr.en_ultima_importacion
      and (pr.categoria_id is null or k.visible);
    if not found then
      raise exception 'tienda: no disponible %', v_linea->>'codigo';
    end if;

    begin
      v_cant := (v_linea->>'cantidad')::numeric;
    exception when others then
      raise exception 'tienda: cantidad %', v_linea->>'codigo';
    end;

    if v_prod.fraccionable then
      v_cant := round(v_cant, 3);
      if v_cant is null or v_cant < 0.1 or v_cant > 10 then
        raise exception 'tienda: cantidad %', v_prod.codigo_xrp;
      end if;
      v_sub := (round(v_prod.precio_centavos * v_cant / 100) * 100)::int;
      v_aprox := true;
    else
      if v_cant is null or v_cant <> trunc(v_cant) or v_cant < 1 or v_cant > 99 then
        raise exception 'tienda: cantidad %', v_prod.codigo_xrp;
      end if;
      v_sub := v_prod.precio_centavos * v_cant::int;
    end if;

    v_orden := v_orden + 1;
    insert into tienda_pedido_lineas (pedido_id, producto_id, codigo_xrp, nombre, presentacion,
      precio_unitario_centavos, se_vende_por, fraccionable, cantidad, subtotal_centavos, orden)
    values (v_pedido.id, v_prod.id, v_prod.codigo_xrp, coalesce(v_prod.nombre_web, v_prod.nombre_xrp),
      v_prod.presentacion, v_prod.precio_centavos, v_prod.se_vende_por, v_prod.fraccionable,
      v_cant, v_sub, v_orden);

    v_subtotal := v_subtotal + v_sub;
    v_salida := v_salida || jsonb_build_object(
      'codigo', v_prod.codigo_xrp, 'nombre', coalesce(v_prod.nombre_web, v_prod.nombre_xrp),
      'marca', v_prod.marca, 'presentacion', v_prod.presentacion,
      'precio_centavos', v_prod.precio_centavos, 'se_vende_por', v_prod.se_vende_por,
      'fraccionable', v_prod.fraccionable, 'cantidad', v_cant, 'subtotal_centavos', v_sub);
  end loop;

  update tienda_pedidos
  set subtotal_centavos = v_subtotal, total_centavos = v_subtotal, total_aproximado = v_aprox
  where id = v_pedido.id;

  return jsonb_build_object(
    'numero', v_pedido.numero, 'token', v_pedido.token,
    'total_centavos', v_subtotal, 'total_aproximado', v_aprox,
    'whatsapp', v_cfg.whatsapp, 'lineas', v_salida);
end;
$$;

revoke all on function public.tienda_crear_pedido(jsonb) from public;
grant execute on function public.tienda_crear_pedido(jsonb) to anon, authenticated;

-- ============================================================================
-- tienda_ver_pedido: el resumen del pedido, sólo con su token (sin login).
-- ============================================================================
create or replace function public.tienda_ver_pedido(p_numero bigint, p_token uuid)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'numero', pe.numero, 'nombre', pe.nombre, 'telefono', pe.telefono,
    'entrega', pe.entrega, 'direccion', pe.direccion, 'forma_pago', pe.forma_pago,
    'nota', pe.nota, 'total_centavos', pe.total_centavos,
    'total_aproximado', pe.total_aproximado, 'creado_el', pe.creado_el,
    'whatsapp', (select c.whatsapp from tienda_config c where c.id),
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'codigo', l.codigo_xrp, 'nombre', l.nombre, 'presentacion', l.presentacion,
        'precio_centavos', l.precio_unitario_centavos, 'se_vende_por', l.se_vende_por,
        'fraccionable', l.fraccionable, 'cantidad', l.cantidad,
        'subtotal_centavos', l.subtotal_centavos) order by l.orden)
      from tienda_pedido_lineas l where l.pedido_id = pe.id), '[]'::jsonb))
  from tienda_pedidos pe
  where pe.numero = p_numero and pe.token = p_token;
$$;

revoke all on function public.tienda_ver_pedido(bigint, uuid) from public;
grant execute on function public.tienda_ver_pedido(bigint, uuid) to anon, authenticated;

-- ============================================================================
-- Storage: fotos de productos (etapa 2). Bucket público, sube sólo un usuario activo.
-- ============================================================================
insert into storage.buckets (id, name, public)
values ('tienda', 'tienda', true)
on conflict (id) do update set public = true;

drop policy if exists "tienda: fotos visibles por todos" on storage.objects;
create policy "tienda: fotos visibles por todos" on storage.objects
  for select using (bucket_id = 'tienda');
drop policy if exists "tienda: subir fotos" on storage.objects;
create policy "tienda: subir fotos" on storage.objects
  for insert to authenticated with check (bucket_id = 'tienda' and public.is_usuario_activo());
drop policy if exists "tienda: reemplazar fotos" on storage.objects;
create policy "tienda: reemplazar fotos" on storage.objects
  for update to authenticated using (bucket_id = 'tienda' and public.is_usuario_activo());
drop policy if exists "tienda: borrar fotos" on storage.objects;
create policy "tienda: borrar fotos" on storage.objects
  for delete to authenticated using (bucket_id = 'tienda' and public.is_usuario_activo());
