-- Placas de video (SPEC-cartel-videos.md, paso 2).
--
-- Un video no se re-codifica nunca: se sube el archivo una vez y la placa
-- guarda "instrucciones" en `clips`, una lista de tramos
--   [{ "url": "...", "desde": 3.5, "hasta": 12, "duracion": 30, ... }]
-- que el televisor reproduce en orden. Recortar o unir clips es cambiar esta
-- lista, no el archivo.

alter table public.cartel_placas
  add column if not exists clips jsonb;

alter table public.cartel_placas
  drop constraint if exists cartel_placas_tipo_check;
alter table public.cartel_placas
  add constraint cartel_placas_tipo_check
  check (tipo in ('oferta', 'institucional', 'aviso', 'imagen', 'video'));

-- Una placa de video sin tramos sería una pantalla en negro en el salón.
-- Ningún término puede dar NULL (un CHECK que da NULL deja pasar la fila):
-- `tipo` es not null, y con `clips` NULL el case cae en el else false.
alter table public.cartel_placas
  drop constraint if exists cartel_placas_video_con_clips;
alter table public.cartel_placas
  add constraint cartel_placas_video_con_clips
  check (
    tipo <> 'video'
    -- case y no "and": Postgres no garantiza el orden de un and, y
    -- jsonb_array_length sobre algo que no es lista tira error.
    or case when jsonb_typeof(clips) = 'array' then jsonb_array_length(clips) > 0 else false end
  );
