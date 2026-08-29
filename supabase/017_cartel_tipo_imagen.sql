-- Tipo de placa "imagen": un cartel ya diseñado, que se muestra a pantalla
-- completa y sin nada encima.
--
-- Por qué: los carteles que llegan del proveedor (o los que ya se hicieron en
-- Canva) traen el producto, el precio y el diseño adentro de la imagen. Si esa
-- imagen se mete en el diseño de oferta, la pantalla termina con DOS precios
-- distintos —el de la imagen y el cargado en el sistema— y el "% OFF" tapando
-- parte del cartel. Pasó con la placa de costilla: la foto decía $17.000 y la
-- placa $16.999.
--
-- Con este tipo, la imagen manda y el sistema no le dibuja nada arriba.

alter table public.cartel_placas
  drop constraint if exists cartel_placas_tipo_check;

alter table public.cartel_placas
  add constraint cartel_placas_tipo_check
  check (tipo in ('oferta', 'institucional', 'aviso', 'imagen'));

-- Una placa de tipo imagen sin imagen sería una pantalla en negro en el salón.
alter table public.cartel_placas
  drop constraint if exists cartel_placas_imagen_presente;

alter table public.cartel_placas
  add constraint cartel_placas_imagen_presente
  check (tipo <> 'imagen' or imagen_url is not null);
