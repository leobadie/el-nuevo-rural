# SPEC — Pagar varias boletas con una sola transferencia

Pedido del usuario (23/11/2026): "también necesito poder aplicar pagos a proveedores con
transferencias". Hoy ya se paga con transferencia desde el botón "Pagar" de una boleta, pero ese
pago **no puede superar lo que debe esa boleta** (SPEC-proveedores R5.6). Una transferencia que
cubre varias boletas había que cargarla en Movimientos y después aplicarla a mano.

## Decisión del usuario (23/11/2026)

**Una transferencia, varias boletas**: un botón en la ficha del proveedor donde se pone el importe
de la transferencia, se eligen las boletas que cubre (o se reparte sola de la más vieja a la más
nueva) y lo que sobra queda a cuenta. Crea un solo egreso en Movimientos.

## Requisitos

1. En la ficha del proveedor, botón **"Pagar con transferencia"** al lado de "Cargar entrega" y
   "Cargar nota de crédito". Abre un modal.
2. El modal pide: fecha (hoy por defecto), **importe de la transferencia** (obligatorio, > 0) y
   **N° de operación** (opcional).
3. Lista las boletas pendientes del proveedor (fecha, comprobante, lo que debe) con una casilla
   cada una. El saldo de cada boleta descuenta pagos y notas de crédito ya aplicados.
4. Reparto:
   - **Sin ninguna marcada**: se reparte entre todas las pendientes, de la más vieja a la más nueva.
   - **Con boletas marcadas**: se reparte sólo entre las marcadas, de la más vieja a la más nueva.
   - Lo que no entra en las boletas queda **a cuenta** del proveedor.
5. Antes de confirmar se ve el reparto: cuánto va a cada boleta, cuál queda debiendo y cuánto
   queda a cuenta. Al lado, el total de lo marcado ("Marcaste $X"), para comparar con la
   transferencia.
6. Al confirmar se crea **un solo egreso** en Movimientos: categoría "Pago a Proveedor", medio
   "Transferencia", ese proveedor, esa fecha, ese importe. Descripción: "Pago a <proveedor> —
   transferencia N° <op> — <comprobantes>" (sin las partes que falten). Después se aplica a las
   boletas según el reparto.
7. El texto del modal dice que se crea un egreso nuevo. Si el proveedor ya tiene pagos o notas a
   cuenta sin aplicar, avisa: si la transferencia ya está cargada en Movimientos, hay que usar
   "Aplicar a las entregas pendientes" y no cargarla de nuevo.
8. Si el egreso se guarda pero alguna aplicación falla, el egreso queda (con el resto a cuenta) y
   se muestra el error. Lo aplicado no se pierde ni se duplica.
9. El botón "Pagar" de cada boleta no cambia.

## Verificación

10. Test de cálculos (`npm run verificar:transferencia-calculos`): reparto sin marcar, con
    marcadas, con sobrante, centavos, boleta ya cubierta en parte por NC.
11. Navegador (`npm run verificar:transferencia`, banco `/login/preview-proveedores`): transferencia
    que cubre dos boletas y deja resto a cuenta; con una sola boleta marcada; validaciones; que
    cree exactamente un egreso de ese importe con medio Transferencia. Capturas en escritorio y
    celular, sin scroll horizontal de la página.
12. `npm run build` sin errores, lint limpio, y `verificar:proveedores`, `verificar:notas-credito`
    y `verificar:cheque-a-proveedor` siguen pasando.

## Asunciones

- A1. Sin migración: es un movimiento y sus imputaciones, como cualquier pago.
- A2. El botón vive en la ficha del proveedor (no en la lista general), porque ahí se ven sus
  boletas.
- A3. No se adjunta el comprobante de la transferencia ni se concilia con el banco.

## Fuera de alcance

- Pagar varias boletas en efectivo o con cheque desde este modal (el cheque ya tiene su "Aplicar a
  deuda").
- Leer transferencias desde el home banking o desde un extracto.
