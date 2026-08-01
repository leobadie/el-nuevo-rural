-- Sacar la columna `id` de sociedad_personas, que ocupa espacio y no la usa nadie.
--
-- Medido el 01/08/2026, después de la 010:
--
--   sociedad_personas                                datos    127 MB
--   sociedad_personas_cuit_rol_numero_documento_key  índice    60 MB
--   sociedad_personas_pkey (el id)                   índice    25 MB
--
-- La app llega siempre por CUIT (src/lib/registros/consulta.ts) y selecciona nombre, rol,
-- tipo_documento y numero_documento: el `id` no aparece en ninguna consulta ni en el
-- importador, que resuelve los duplicados con onConflict "cuit,rol,numero_documento".
--
-- Lo que identifica de verdad a una fila es esa tripleta, así que pasa a ser la clave primaria.
--
-- VA EN TRES PASOS, ejecutados de a uno. No es capricho:
--
--   * VACUUM FULL no puede correr dentro de una transacción, y el editor de SQL de Supabase
--     envuelve en una todo lo que se le pega de una vez.
--   * El índice único hay que borrarlo ANTES de construir la clave primaria, en una ejecución
--     aparte. Dentro de la misma transacción, el espacio del índice viejo no se libera hasta el
--     commit, así que convivirían los 60 MB viejos con los 60 nuevos: 533 MB de pico, más que
--     los 500 del plan, justo lo que estamos tratando de evitar.
--
-- (Un intento anterior usaba ADD PRIMARY KEY USING INDEX para reusar el índice que ya existía y
-- no reconstruirlo. No se puede: ese índice respalda una constraint UNIQUE, y Postgres rechaza
-- reusarlo con "is already associated with a constraint". Hay que rehacerlo.)


-- ============================================================================
-- PASO 1 — Soltar lo que sobra. Libera 85 MB: 473 → ~388 MB.
-- ============================================================================

-- Al borrar la columna se va con ella su clave primaria, que es el índice de 25 MB.
alter table public.sociedad_personas drop column if exists id;

-- Una clave primaria no admite nulos. Ninguna fila los tiene: el importador descarta las
-- personas sin documento porque sin él no se puede deduplicar ni identificar a nadie.
alter table public.sociedad_personas alter column numero_documento set not null;

alter table public.sociedad_personas
  drop constraint if exists sociedad_personas_cuit_rol_numero_documento_key;


-- ============================================================================
-- PASO 2 — Ejecutar esta línea SOLA, sin nada más seleccionado.
--
-- Borrar una columna no devuelve el espacio de las filas ya escritas: solo la marca como
-- muerta. Esto reescribe la tabla y lo recupera (~9 MB). La bloquea mientras dura, que sobre
-- 118 MB son unos segundos.
-- ============================================================================

vacuum full public.sociedad_personas;


-- ============================================================================
-- PASO 3 — La clave primaria nueva, ya sobre la tabla compacta. Suma 60 MB: total ~439 MB.
--
-- Entre el paso 1 y este, la tabla queda sin garantía de unicidad. Nadie escribe en ella salvo
-- el importador, que no corre ahora, así que no hay riesgo de que entren duplicados en el medio.
-- ============================================================================

alter table public.sociedad_personas
  add constraint sociedad_personas_pkey primary key (cuit, rol, numero_documento);
