-- Carnicería: qué se compra, además de medias reses y cajones de pollo entero.
--   - Pollo: cada ingreso tiene un producto (pollo entero, pata y muslo, alitas, pechuga).
--   - Cerdo: además de la media res, piernas, combos y juegos (con desposte opcional, como la
--     media res).
-- Ver SPEC-carniceria.md (puntos 24 a 28).
--
-- Lo ya cargado no cambia: los ingresos de pollo quedan como pollo entero y las medias reses
-- como media res (es el default de las columnas nuevas).

alter table public.carniceria_pollo
  add column if not exists producto text not null default 'entero';

alter table public.carniceria_pollo
  drop constraint if exists carniceria_pollo_producto_check;
alter table public.carniceria_pollo
  add constraint carniceria_pollo_producto_check
  check (producto in ('entero', 'pata_muslo', 'alitas', 'pechuga'));


alter table public.carniceria_medias_reses
  add column if not exists corte text not null default 'media_res';

alter table public.carniceria_medias_reses
  drop constraint if exists carniceria_medias_reses_corte_check;
alter table public.carniceria_medias_reses
  add constraint carniceria_medias_reses_corte_check
  check (corte in ('media_res', 'pierna', 'combo', 'juego'));

-- De vaca sólo se compran medias reses; piernas, combos y juegos son de cerdo.
alter table public.carniceria_medias_reses
  drop constraint if exists carniceria_medias_reses_pierna_cerdo_check;
alter table public.carniceria_medias_reses
  add constraint carniceria_medias_reses_pierna_cerdo_check
  check (corte = 'media_res' or especie = 'cerdo');
