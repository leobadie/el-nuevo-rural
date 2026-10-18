-- Giro de cada televisor, elegido desde el admin.
--
-- Los TVs del local están montados parados y su navegador dibuja la página
-- acostada. Hasta ahora el giro iba en la dirección (?rotar=270), y cambiarlo
-- obligaba a ir hasta el televisor con el control remoto. Guardado acá, se
-- cambia desde la oficina y el TV lo toma en su próximo refresco.
--
-- ?rotar= en la dirección sigue funcionando y tiene prioridad sobre esto.
-- Ver SPEC-cartel-tv-en-vivo.md, punto 6.

alter table public.cartel_pantallas
  add column if not exists rotacion int not null default 0;

-- not null + default: el CHECK nunca recibe NULL, así que no hace falta
-- contemplarlo aparte.
alter table public.cartel_pantallas
  drop constraint if exists cartel_pantallas_rotacion_check;
alter table public.cartel_pantallas
  add constraint cartel_pantallas_rotacion_check check (rotacion in (0, 90, 270));
