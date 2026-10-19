-- Opciones de la placa de video (SPEC-cartel-videos.md, paso 3).
--
--   video_encuadre  'entero' = se ve todo, con bordes si la forma no coincide
--                   'llenar' = ocupa toda la pantalla y recorta lo que sobra
--   video_foco      con 'llenar', qué parte queda a la vista:
--                   'inicio' (arriba / izquierda), 'centro', 'fin' (abajo / derecha)
--   video_texto     el precio de la oferta encima del video:
--                   'ninguno', 'arriba' o 'abajo'
--
-- Van en todas las placas con un valor por defecto que no cambia nada, así el
-- resto de los tipos no se entera. not null + default: los CHECK nunca reciben
-- NULL (un CHECK que da NULL deja pasar la fila).

alter table public.cartel_placas
  add column if not exists video_encuadre text not null default 'entero',
  add column if not exists video_foco text not null default 'centro',
  add column if not exists video_texto text not null default 'ninguno';

alter table public.cartel_placas drop constraint if exists cartel_placas_video_encuadre_check;
alter table public.cartel_placas
  add constraint cartel_placas_video_encuadre_check check (video_encuadre in ('entero', 'llenar'));

alter table public.cartel_placas drop constraint if exists cartel_placas_video_foco_check;
alter table public.cartel_placas
  add constraint cartel_placas_video_foco_check check (video_foco in ('inicio', 'centro', 'fin'));

alter table public.cartel_placas drop constraint if exists cartel_placas_video_texto_check;
alter table public.cartel_placas
  add constraint cartel_placas_video_texto_check check (video_texto in ('ninguno', 'arriba', 'abajo'));
