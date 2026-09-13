-- Permite aplicar el mismo pago al mismo remito en más de una vez.
--
-- 012 creó imputaciones_pago con unique (movimiento_id, entrega_id). Eso rompía un caso normal:
-- se aplica una parte de un pago a un remito ("Usar un pago ya cargado" por $20.000) y después
-- se aplica el resto con "Aplicar automático" o con la franja de saldo a cuenta. El reparto FIFO
-- vuelve a apuntar a ese mismo remito y la base rechazaba la segunda fila con 23505, aunque
-- estuviera dentro de los topes. En pantalla se veía "No se pudo aplicar el pago".
--
-- Sacar la restricción no borra ni cambia ningún dato. Los topes siguen en el trigger
-- validar_imputacion() de 012, que ya suma todas las filas de cada pago y de cada entrega, y la
-- ficha del proveedor ya muestra cada aplicación en su propia fila con su "Deshacer".
--
-- Se busca el nombre en el catálogo en vez de escribirlo a mano, por si Postgres lo generó distinto.

do $$
declare
  nombre text;
begin
  for nombre in
    select con.conname
      from pg_constraint con
      join pg_class rel on rel.oid = con.conrelid
      join pg_namespace nsp on nsp.oid = rel.relnamespace
     where nsp.nspname = 'public'
       and rel.relname = 'imputaciones_pago'
       and con.contype = 'u'
  loop
    execute format('alter table public.imputaciones_pago drop constraint %I', nombre);
  end loop;
end;
$$;
