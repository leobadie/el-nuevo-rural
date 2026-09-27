# SPEC — Descuento por boleta en la cuenta corriente de proveedores

Pedido del usuario (27/09/2026): el proveedor **SANTA RITA SOTO (MAYORISTA)** le aplica un **5%**
en algunas boletas, y al cargar la boleta en Proveedores (cuenta corriente) no hay forma de
reflejarlo.

Decisiones del usuario:
- El descuento **se conoce al cargar la boleta**: la deuda nace con el descuento aplicado (no es
  un pronto pago que dependa de cuándo se paga).
- **% fijo por proveedor**: se configura una vez (Santa Rita Soto: 5%) y al cargar una boleta de
  ese proveedor aparece una casilla para aplicarlo en las que corresponda.

## Requisitos

1. Cada proveedor puede tener un **% de descuento por boleta** (vacío = no tiene). Se configura
   desde la ficha del proveedor en la cuenta corriente.
2. Al cargar una entrega de un proveedor con descuento aparece la casilla
   **«Aplicar 5% de descuento»**, destildada: el descuento va sólo en algunas boletas.
3. El campo pasa a llamarse **«Importe de la boleta»**. Con la casilla tildada se ve, antes de
   guardar, cuánto queda: «Boleta $ 100.000 − 5% = debés $ 95.000».
4. Lo que se le debe al proveedor (saldo, pendientes, pagos aplicados, «Pagar» y el tope de la
   base) es el **importe con el descuento**. La base guarda también el importe de la boleta y el %
   para que se vea qué se descontó.
5. En la lista de entregas, una con descuento muestra el importe de la boleta y el % además de lo
   que se debe.
6. Redondeo a centavos: 5% de $ 33.333,33 da $ 31.666,66 a deber (se descuentan $ 1.666,67).
7. El descuento va de más de 0% a menos de 100%. Lo ya cargado no cambia.

## Datos (migración `supabase/025_descuento_proveedores.sql`, la aplica el usuario a mano)

- `proveedores.descuento_pct` (numeric, nulo = sin descuento).
- `entregas_proveedor.monto_boleta` y `entregas_proveedor.descuento_pct` (nulos = sin descuento).
  `monto` sigue siendo lo que se debe, así los topes de la base (012) no cambian.

## Verificación

8. Test de cálculos: importe con descuento, redondeo, límites.
9. Navegador (banco de proveedores): configurar el 5%, cargar una boleta con y sin la casilla,
   saldo y pago. Capturas en escritorio y celular.
10. Base: columnas nuevas y que la base rechace un % fuera de rango.
11. `npm run build` sin errores y la verificación de proveedores que ya existe sigue pasando.
