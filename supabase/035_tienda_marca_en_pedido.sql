-- 035 · Tienda online: la marca de cada producto en el mensaje de WhatsApp.
--
-- tienda_ver_pedido no devolvía la marca, así que el mensaje decía "Aceite de girasol"
-- sin "Natura". Ahora la toma del producto (la línea del pedido guarda el producto_id).
-- Si el producto se borró, la línea sale sin marca, como antes.
--
-- Sólo reemplaza la función; no toca tablas ni datos. Se puede correr más de una vez.

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
