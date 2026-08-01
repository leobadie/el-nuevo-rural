-- Bajar lo que ocupan los registros de sociedades, borrando dos índices que no aportan.
--
-- Medido el 01/08/2026, con la carga nacional ya hecha:
--
--   sociedades         1.251.568 filas · 296 MB
--   sociedad_personas  1.143.835 filas · 234 MB
--                                        -------
--                                        530 MB   y el plan gratuito son 500 MB.
--
-- La estimación del SPEC (~288 MB) subestimó los índices. Los datos en sí no sobran: lo que
-- sobra es cómo están indexados.
--
--   1) sociedades_razon_social_idx es un GIN de búsqueda de texto sobre 1,25M de razones
--      sociales. Nadie lo usa: la app llega siempre por CUIT (src/lib/registros/consulta.ts
--      hace .eq("cuit", ...)), y razon_social solo se muestra. Si algún día se quiere buscar
--      por nombre, se vuelve a crear con este mismo archivo.
--
--   2) sociedad_personas_cuit_idx es redundante: el unique (cuit, rol, numero_documento)
--      empieza por cuit, así que Postgres ya lo usa para filtrar por CUIT solo, que es la
--      única consulta que hace la app.
--
-- Ninguno de los dos cambia una fila de datos ni una consulta de la app.

drop index if exists public.sociedades_razon_social_idx;
drop index if exists public.sociedad_personas_cuit_idx;

-- Deja ver el desglose por índice, que es lo que faltó para estimar bien la primera vez:
-- tamano_registros() da el total y no alcanza para saber qué conviene borrar.
create or replace function public.detalle_registros()
returns table (objeto text, tipo text, tamano text, bytes bigint)
language sql
security definer
stable
as $$
  select c.relname::text,
         case c.relkind when 'r' then 'tabla (solo datos)' else 'índice' end,
         pg_size_pretty(pg_relation_size(c.oid)),
         pg_relation_size(c.oid)
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public'
     and (c.relname in ('sociedades', 'sociedad_personas')
          or c.relname like 'sociedad%_idx'
          or c.relname like 'sociedad%_pkey'
          or c.relname like 'sociedad%_key')
   order by pg_relation_size(c.oid) desc;
$$;
