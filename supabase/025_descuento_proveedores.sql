-- Descuento por boleta en la cuenta corriente de proveedores. Ver SPEC-descuento-proveedores.md.
--
-- Hay proveedores (Santa Rita Soto, 5%) que descuentan un porcentaje en algunas boletas. El %
-- se configura por proveedor y en cada entrega se elige si se aplica.
--
-- `entregas_proveedor.monto` sigue siendo LO QUE SE DEBE (ya con el descuento): así los topes del
-- trigger validar_imputacion (012) y todas las cuentas siguen igual. Lo nuevo guarda de dónde
-- salió ese monto, para mostrarlo.
--
-- Lo ya cargado no cambia: las columnas nuevas quedan en null (sin descuento).

alter table public.proveedores
  add column if not exists descuento_pct numeric(5, 2);

alter table public.proveedores
  drop constraint if exists proveedores_descuento_pct_check;
alter table public.proveedores
  add constraint proveedores_descuento_pct_check
  check (descuento_pct is null or (descuento_pct > 0 and descuento_pct < 100));


alter table public.entregas_proveedor
  add column if not exists monto_boleta numeric(14, 2);

alter table public.entregas_proveedor
  add column if not exists descuento_pct numeric(5, 2);

-- Las dos van juntas: o la entrega no tiene descuento, o tiene la boleta y el %, y lo que se
-- debe es menos que la boleta.
--
-- Los "is not null" explícitos no sobran: con una de las dos en null, "descuento_pct > 0" da
-- NULL en vez de false, y un CHECK que da NULL deja pasar la fila (corregido en 026).
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
