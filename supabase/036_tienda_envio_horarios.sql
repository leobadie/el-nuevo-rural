-- 036 · Tienda online: costo de envío, envío gratis, mínimo para envío y horario de atención
-- (SPEC-tienda-envio-horarios.md).
--
--  * tienda_config: costo_envio_centavos, envio_gratis_desde_centavos, minimo_envio_centavos,
--    horario (jsonb {"0".."6": [["8:00","13:00"], …]}, 0 = domingo).
--  * tienda_pedidos.envio_a_confirmar: el envío se confirma por WhatsApp (sin costo cargado).
--  * tienda_crear_pedido: recalcula el envío y frena los envíos bajo el mínimo (la base manda;
--    lo que diga el navegador sobre el envío se ignora).
--  * tienda_ver_pedido: devuelve subtotal, envío y horario para el mensaje y la pantalla.
--
-- Se puede correr más de una vez.

alter table public.tienda_config
  add column if not exists costo_envio_centavos int check (costo_envio_centavos is null or costo_envio_centavos >= 0),
  add column if not exists envio_gratis_desde_centavos int check (envio_gratis_desde_centavos is null or envio_gratis_desde_centavos >= 0),
  add column if not exists minimo_envio_centavos int not null default 0 check (minimo_envio_centavos >= 0),
  add column if not exists horario jsonb check (horario is null or jsonb_typeof(horario) = 'object');

alter table public.tienda_pedidos
  add column if not exists envio_a_confirmar boolean not null default false;

-- Los envíos de la etapa 1 eran todos "costo a confirmar".
update public.tienda_pedidos set envio_a_confirmar = true
where entrega = 'envio' and costo_envio_centavos = 0 and not envio_a_confirmar;

-- ============================================================================
-- tienda_crear_pedido: igual que en 033, más el envío (ver el bloque "envío").
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
  v_envio int := 0;
  v_a_confirmar boolean := false;
begin
  select * into v_cfg from tienda_config where id;
  if not found or not v_cfg.abierta then
    raise exception 'tienda: cerrada';
  end if;
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

  -- ---------------------------------------------------------------- envío
  -- Misma regla que calcularEnvio() en src/lib/tienda/envio.ts.
  if v_entrega = 'envio' then
    if v_subtotal < coalesce(v_cfg.minimo_envio_centavos, 0) then
      raise exception 'tienda: minimo %', v_cfg.minimo_envio_centavos;
    end if;
    if coalesce(v_cfg.costo_envio_centavos, 0) <= 0 then
      v_a_confirmar := true;
    elsif coalesce(v_cfg.envio_gratis_desde_centavos, 0) > 0
          and v_subtotal >= v_cfg.envio_gratis_desde_centavos then
      v_envio := 0;
    else
      v_envio := v_cfg.costo_envio_centavos;
    end if;
  end if;

  update tienda_pedidos
  set subtotal_centavos = v_subtotal,
      costo_envio_centavos = v_envio,
      envio_a_confirmar = v_a_confirmar,
      total_centavos = v_subtotal + v_envio,
      total_aproximado = v_aprox
  where id = v_pedido.id;

  return jsonb_build_object(
    'numero', v_pedido.numero, 'token', v_pedido.token,
    'subtotal_centavos', v_subtotal, 'costo_envio_centavos', v_envio,
    'envio_a_confirmar', v_a_confirmar,
    'total_centavos', v_subtotal + v_envio, 'total_aproximado', v_aprox,
    'whatsapp', v_cfg.whatsapp, 'lineas', v_salida);
end;
$$;

revoke all on function public.tienda_crear_pedido(jsonb) from public;
grant execute on function public.tienda_crear_pedido(jsonb) to anon, authenticated;

-- ============================================================================
-- tienda_ver_pedido: como en 035, más subtotal, envío y horario.
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
    'nota', pe.nota, 'subtotal_centavos', pe.subtotal_centavos,
    'costo_envio_centavos', pe.costo_envio_centavos, 'envio_a_confirmar', pe.envio_a_confirmar,
    'total_centavos', pe.total_centavos,
    'total_aproximado', pe.total_aproximado, 'creado_el', pe.creado_el,
    'whatsapp', (select c.whatsapp from tienda_config c where c.id),
    'horario', (select c.horario from tienda_config c where c.id),
    'lineas', coalesce((
      select jsonb_agg(jsonb_build_object(
        'codigo', l.codigo_xrp, 'nombre', l.nombre, 'marca', pr.marca, 'presentacion', l.presentacion,
        'precio_centavos', l.precio_unitario_centavos, 'se_vende_por', l.se_vende_por,
        'fraccionable', l.fraccionable, 'cantidad', l.cantidad,
        'subtotal_centavos', l.subtotal_centavos) order by l.orden)
      from tienda_pedido_lineas l
      left join tienda_productos pr on pr.id = l.producto_id
      where l.pedido_id = pe.id), '[]'::jsonb))
  from tienda_pedidos pe
  where pe.numero = p_numero and pe.token = p_token;
$$;

revoke all on function public.tienda_ver_pedido(bigint, uuid) from public;
grant execute on function public.tienda_ver_pedido(bigint, uuid) to anon, authenticated;
