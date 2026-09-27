-- Corrige la regla de la 025 que exige que el importe de la boleta y el % de descuento vayan
-- juntos. Ver SPEC-descuento-proveedores.md.
--
-- Con una sola de las dos columnas cargada, "descuento_pct > 0" da NULL en vez de false, y un
-- CHECK que da NULL deja pasar la fila: la base aceptaba una boleta con importe pero sin %. La
-- app nunca manda eso (se verificó que no hay ninguna fila así), pero la base tiene que
-- rechazarlo igual.
--
-- No cambia ningún dato.

alter table public.entregas_proveedor
  drop constraint if exists entregas_proveedor_descuento_check;
alter table public.entregas_proveedor
  add constraint entregas_proveedor_descuento_check
  check (
    (monto_boleta is null and descuento_pct is null)
    or (
      monto_boleta is not null and descuento_pct is not null
      and monto_boleta > 0 and descuento_pct > 0 and descuento_pct < 100 and monto < monto_boleta
    )
  );
