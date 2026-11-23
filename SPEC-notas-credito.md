# SPEC — Notas de crédito en la cuenta corriente de proveedores

Pedido del usuario (23/11/2026): "habilitemos una opción para cargar notas de crédito en los
proveedores". Hasta ahora quedaba fuera de alcance (SPEC-proveedores.md, A3 y "Fuera de alcance").

Una nota de crédito (NC) es plata que el proveedor te reconoce sin que nadie pague nada: por una
devolución, mercadería vencida o rota, una bonificación o un error en la boleta. Baja lo que le
debés, pero **no es un pago**: no sale plata de la caja.

## Decisión del usuario (23/11/2026)

**La NC se aplica a una boleta o queda a favor.** Al cargarla se elige la boleta que corrige y le
baja el saldo. Si no se elige ninguna, queda como saldo a favor y después se aplica a una o varias
boletas, igual que un pago a cuenta.

## Requisitos

### Datos (migración `supabase/038_notas_credito_proveedor.sql`, la aplica el usuario a mano)

1. Tabla `notas_credito_proveedor`: `id`, `proveedor` (por nombre, como las entregas), `fecha`,
   `monto` (> 0), `comprobante` (N° de la NC, opcional), `detalle` (motivo, opcional),
   `creado_el`, `creado_por`.
2. Tabla `aplicaciones_nota_credito`: `id`, `nota_id` → NC, `entrega_id` → entrega, `monto` (> 0),
   `creado_el`. Borrar la NC o la entrega borra sus aplicaciones.
3. Topes validados en la base (trigger), no sólo en la pantalla:
   - lo aplicado de una NC no supera su monto;
   - lo que cubre una boleta **sumando pagos y NC** no supera su monto. El trigger de los pagos
     (`validar_imputacion`) también pasa a contar las NC.
4. Permisos como las entregas: ver/crear/editar cualquier usuario activo; **borrar una NC, sólo
   admin** (borrarla sube la deuda). Aplicar y deshacer una aplicación: cualquier usuario activo.
5. Renombrar un proveedor renombra también sus NC.
6. El corte de registros (SPEC-corte-registros.md) deja afuera las NC cargadas antes del corte,
   igual que las entregas.

### Cuentas

7. La NC **no crea ningún movimiento**: el total de Movimientos, la caja, el Resumen por
   proveedor y Rentabilidad no cambian al cargarla ni al aplicarla.
8. Saldo del proveedor = entregado − pagado − notas de crédito.
9. Saldo de una boleta = monto − pagos aplicados − NC aplicadas. El estado (Impaga / Parcial /
   Pagada) cuenta las dos cosas.
10. "A cuenta" pasa a ser lo ya pagado **o acreditado** que todavía no se aplicó a ninguna boleta
    (pagos sin aplicar + NC sin aplicar).
11. Todo a centavos, como el resto de la cuenta corriente.

### Pantalla

12. Botón **"Cargar nota de crédito"** al lado de "Cargar entrega", en la lista general (con
    selector de proveedor) y en la ficha del proveedor.
13. Formulario: proveedor, fecha (hoy por defecto), importe, N° de nota, motivo y
    **"Aplicar a la boleta"**: un desplegable con las boletas pendientes de ese proveedor y la
    opción "No aplicar ahora (queda a favor)", que es la que viene elegida.
14. Antes de guardar dice qué va a pasar: "Se aplican $X a la boleta R-0001 (queda debiendo $Y)",
    "Se aplican $X y quedan $Z a favor" o "Queda $X a favor". No crea ningún egreso.
15. Importe obligatorio y > 0. Si la NC supera el saldo de la boleta elegida, se aplica hasta el
    saldo y el resto queda a favor.
16. La lista general muestra una columna **"N. crédito"** con el total de NC de cada proveedor.
17. La ficha muestra una tarjeta **NOTAS DE CRÉDITO** y una tabla de NC: fecha, N°/motivo, monto,
    aplicado, sin aplicar. Las NC con saldo sin aplicar tienen "Aplicar automático" (a las boletas
    pendientes, de la más vieja a la más nueva) y "Elegir" (boleta y monto). El admin la puede
    borrar, con confirmación.
18. En la tabla de entregas, una boleta con NC aplicadas lo muestra debajo de lo pagado
    ("NC −$X").
19. La lista de "Aplicaciones" incluye las de NC ("$X de la NC del dd/mm → entrega del …") y cada
    una se puede deshacer.
20. La franja de "saldo a cuenta" (SPEC-proveedores R9.5) cuenta también las NC sin aplicar y el
    botón las reparte junto con los pagos, de la más vieja a la más nueva.
21. El modal de "Pagar" avisa si el proveedor tiene NC sin aplicar, para que no se pague de más.

## Verificación

22. Test de cálculos (`npm run verificar:notas-credito-calculos`): saldos con NC, estados,
    "a cuenta", reparto FIFO de pagos y NC juntos, centavos, NC mayor que la boleta.
23. Navegador (`npm run verificar:notas-credito`, banco `/login/preview-proveedores`): cargar una NC
    aplicada a una boleta, una a favor, aplicarla con "Aplicar automático" y "Elegir", deshacer,
    borrar; que el total de egresos de Movimientos no cambie. Capturas en escritorio y celular,
    sin scroll horizontal de la página.
24. Base (`npm run verificar:base-notas-credito`, después de aplicar la 038): las tablas existen,
    la base rechaza aplicar de más (por la NC y por la boleta, sumando pagos y NC) y un monto
    ≤ 0. Crea datos de prueba marcados y los borra.
25. `npm run build` sin errores, lint sin errores nuevos, y `verificar:proveedores` y
    `verificar:cheque-a-proveedor` siguen pasando.

## Asunciones

- A1. La NC es en pesos y por el total (sin discriminar IVA), como las boletas.
- A2. No se edita una NC ya cargada: si está mal, se borra (admin) y se carga de nuevo, como las
  entregas.
- A3. No se le aplica el % de descuento del proveedor: se carga el importe que dice la nota.

## Fuera de alcance

- Que el proveedor devuelva la plata en efectivo o por transferencia (eso es un ingreso en
  Movimientos, como hoy).
- Notas de débito.
- Leer la NC desde una foto o desde ARCA.
- Tocar el Resumen por proveedor y Rentabilidad.
