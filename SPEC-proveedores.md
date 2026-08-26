# SPEC — Cuenta corriente de proveedores

Pestaña nueva dentro del módulo **Ingresos y Egresos** para llevar la deuda con cada
proveedor: se cargan las entregas que ingresan (lo que se debe) y los pagos se van
descontando contra ellas.

## Decisiones tomadas con el usuario (26/08/2026)

| Tema | Decisión |
|---|---|
| Imputación | **Imputada a cada entrega**: cada pago se aplica a una o varias entregas puntuales |
| Ubicación | Pestaña dentro de Ingresos y Egresos (no un módulo aparte) |
| Carga de pagos | **Las dos formas**: desde la ficha del proveedor y desde la pestaña Movimientos |
| Carga de entregas | Formulario propio con fecha, monto y comprobante (no atado al pedido de WhatsApp) |

## Requisitos

### R1 — Modelo de datos

- **R1.1** Tabla `entregas_proveedor`: `id`, `proveedor` (texto, mismo criterio que
  `movimientos.proveedor`), `fecha`, `monto`, `comprobante` (nº remito/factura, opcional),
  `detalle` (opcional), `creado_el`, `creado_por`.
- **R1.2** Tabla `imputaciones_pago`: `id`, `movimiento_id` → `movimientos`,
  `entrega_id` → `entregas_proveedor`, `monto`, `creado_el`. Un mismo pago puede
  imputarse a varias entregas y una entrega puede recibir varios pagos.
- **R1.3** Ambas con RLS siguiendo el patrón del proyecto: ver/crear/editar para usuario
  activo; **borrar una entrega, solo admin** (borra deuda registrada). Las imputaciones
  las puede deshacer cualquier usuario activo: es reversible y no destruye datos.
- **R1.4** Borrar un movimiento o una entrega borra en cascada sus imputaciones.
- **R1.5** El monto de una imputación debe ser > 0.

### R2 — Qué cuenta como pago

- **R2.1** Es pago a un proveedor **todo movimiento con `egreso > 0` y ese `proveedor`
  cargado**, sin filtrar por categoría. Si le pagaste el alquiler a Martín, es plata que
  le diste a Martín.
- **R2.2** Un pago cargado desde Movimientos nace **sin imputar**: aparece en la ficha del
  proveedor como saldo a cuenta hasta que se aplique a alguna entrega.
- **R2.3** La suma de las imputaciones de un pago nunca puede superar su egreso.
- **R2.4** La suma de las imputaciones de una entrega nunca puede superar su monto.

### R3 — Vista general (lista de proveedores)

- **R3.1** Una fila por proveedor con: Entregado, Pagado, **Saldo (deuda)**, y A cuenta
  (pagos sin imputar).
- **R3.2** El saldo se muestra en rojo si se debe, en verde si está saldado.
- **R3.3** Se listan los proveedores que tengan al menos una entrega o un pago; el resto
  no ensucia la tabla.
- **R3.4** Total general de deuda arriba de la tabla.
- **R3.5** Ordenable por saldo (mayor deuda primero, por defecto).

### R4 — Ficha del proveedor

- **R4.1** Se abre haciendo clic en la fila del proveedor y se puede volver a la lista.
- **R4.2** Formulario para cargar una entrega: fecha (por defecto hoy), monto,
  comprobante y detalle. Monto obligatorio y > 0.
- **R4.3** Tabla de entregas con fecha, comprobante, monto, pagado y saldo, y un estado
  visible: **Impaga**, **Parcial** o **Pagada**.
- **R4.4** Botón "Pagar" en cada entrega impaga o parcial.
- **R4.5** Tabla de pagos con fecha, descripción, monto, imputado y disponible.
- **R4.6** Los pagos con saldo disponible se pueden aplicar a las entregas pendientes.
- **R4.7** Cada imputación se puede deshacer.

### R5 — Registrar un pago desde la ficha

- **R5.1** Al pagar una entrega se abre un formulario con el monto pre-cargado en el saldo
  pendiente de esa entrega, editable (permite pago parcial).
- **R5.2** Se elige fecha y medio de pago (Efectivo / Transferencia / Cheque).
- **R5.3** Al confirmar se crea **un movimiento de egreso real** en Ingresos y Egresos con
  categoría "Pago a Proveedor" y el proveedor cargado, más la imputación contra esa
  entrega. Una sola carga: no hay que anotar el pago dos veces.
- **R5.4** El movimiento generado aparece en la pestaña Movimientos como cualquier otro y
  afecta el saldo de caja igual que siempre.
- **R5.5** Si el medio de pago es Cheque, se respeta el comportamiento que ya existe
  (se genera el cheque en Control de Cheques).
- **R5.6** No se puede imputar más que el saldo pendiente de la entrega.

### R6 — Aplicar un pago que ya estaba cargado

- **R6.1** Los pagos con saldo disponible se pueden aplicar a una entrega pendiente
  eligiendo entrega y monto.
- **R6.2** Botón "Aplicar automático": reparte el disponible del pago contra las entregas
  pendientes de la más vieja a la más nueva, hasta agotar uno u otro.

### R7 — Verificación

- **R7.1** La app compila (`npm run build`) y pasa el lint sin errores nuevos.
- **R7.2** Se prueba en un navegador real, no de memoria.
- **R7.3** Screenshots en desktop y móvil antes de dar la tarea por terminada.
- **R7.4** El saldo tiene que cerrar: `Entregado − Pagado = Σ saldos de entregas − Σ pagos a cuenta`.

## Asunciones

- **A1** El proveedor se vincula **por nombre**, no por id, porque así funciona hoy
  `movimientos.proveedor`. Renombrar un proveedor ya actualiza los movimientos; la
  migración extiende ese renombrado a las entregas.
- **A2** Las entregas se cargan a mano. No se importan facturas ni se leen remitos.
- **A3** Todo en pesos, sin IVA discriminado ni notas de crédito.
- **A4** La deuda no tiene fecha de vencimiento: no hay alertas de "vence en X días".

## Fuera de alcance

- Convertir un pedido de WhatsApp en entrega automáticamente (se descartó explícitamente).
- Notas de crédito, devoluciones y ajustes de saldo.
- Vencimientos, intereses y antigüedad de la deuda.
- Tocar la pestaña "Resumen por proveedor" que ya existe: queda como está.
