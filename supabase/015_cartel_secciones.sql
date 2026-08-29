-- Sección de cada placa, para que cada televisor muestre lo suyo.
--
-- En el panel que maneja las pantallas (badie.cdenet.com.ar) los televisores ya
-- están agrupados por sector: Carnicería 1-3, Embutidos 1-5, Pasillo y Acceso.
-- Hasta ahora todos mostraban lo mismo, así que el TV de la carnicería llegaba a
-- mostrar la oferta de yerba. Con esto, `npm run cartel:video -- --seccion X`
-- arma un archivo por grupo.
--
-- Es texto libre a propósito: las secciones de un super cambian (hoy hay
-- embutidos, mañana rotisería) y no vale la pena migrar la base por eso. Los
-- colores conocidos están en src/lib/cartel/placas.ts; una sección nueva sin
-- color cae al color propio de la placa.

alter table public.cartel_placas
  add column if not exists seccion text;

-- El cartel filtra por sección y ordena; sin índice esto recorre toda la tabla
-- en cada refresco de cada televisor.
create index if not exists cartel_placas_seccion_idx
  on public.cartel_placas (seccion, activa, orden);
