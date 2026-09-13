# SPEC — Cobranzas de la Municipalidad (PAICOR)

Módulo nuevo para llevar lo que la Municipalidad le debe al local por las entregas del
PAICOR: se carga cada boleta/factura entregada y, cuando la Municipalidad paga, se registra
el cobro y se aplica contra las facturas que cancela. Es la cuenta corriente de proveedores
dada vuelta: acá la plata te la deben a vos.

## Decisiones tomadas con el usuario (13/09/2026)

| Tema | Decisión |
|---|---|
| Estructura | **Cada boleta es una factura**: una sola carga por comprobante (no hay remitos que se agrupen) |
| Detalle | **Solo monto total**, más datos de referencia (nº factura, orden/expediente, lugar, detalle libre) |
| Cobro y caja | **No** crea movimientos en Ingresos y Egresos: el cobro queda sólo en este control |
| Retenciones | **"No sé todavía"**: campo de retenciones opcional (por defecto $0) en cada cobro |

## Requisitos

### R1 — Modelo de datos (migración `supabase/018_municipalidad.sql`)

- **R1.1** Tabla `facturas_municipalidad`: `id`, `fecha_entrega` (obligatoria), `numero_factura`
  (opcional: se puede cargar la entrega antes de tener el número), `fecha_factura` (opcional),
  `monto` (> 0), `orden_compra` (nº de orden de compra / expediente, opcional), `lugar_entrega`
  (escuela o establecimiento, opcional), `detalle` (opcional), `creado_el`, `creado_por`.
- **R1.2** No puede haber dos facturas con el mismo número (índice único sobre
  `numero_factura` cuando no es nulo). Evita cargar dos veces la misma boleta.
- **R1.3** Tabla `cobros_municipalidad`: `id`, `fecha`, `monto_cobrado` (≥ 0, lo que entró),
  `retenciones` (≥ 0, por defecto 0), `medio_pago` (Transferencia / Cheque / Efectivo),
  `comprobante` (nº de orden de pago o de transferencia, opcional), `detalle`, `creado_el`,
  `creado_por`. El **total del cobro** es `monto_cobrado + retenciones` y tiene que ser > 0.
- **R1.4** Tabla `imputaciones_cobro_municipalidad`: `id`, `cobro_id`, `factura_id`, `monto`
  (> 0), `creado_el`. Un cobro puede cancelar varias facturas y una factura puede cobrarse
  en varias veces. **Sin** restricción única por par (`cobro_id`, `factura_id`): volver a aplicar
  lo que quedó libre de un cobro a la misma factura es una fila más, y la pantalla las muestra
  sumadas como una sola aplicación (que se deshace entera).
- **R1.5** Un trigger en la base impide aplicar a una factura más que su monto, y a un cobro
  más que su total. También impide bajar el monto de una factura (o el total de un cobro)
  por debajo de lo que ya tiene aplicado.
- **R1.6** Borrar una factura o un cobro borra en cascada sus imputaciones.
- **R1.7** RLS con el patrón del proyecto: ver / crear / editar, usuario activo; **borrar
  facturas y cobros, sólo admin**; las imputaciones (reversibles) las maneja cualquier activo.

### R2 — Pantalla `/municipalidad`

- **R2.1** Pide sesión, como el resto de la app. Tiene encabezado con "← Volver" al inicio.
- **R2.2** Tarjetas de resumen: **Te debe** (Σ facturas − Σ totales de cobros), **Facturas
  pendientes** (cantidad y antigüedad de la más vieja en días), **Cobrado** (total, con lo
  retenido aclarado aparte) y **Cobros sin aplicar** (sólo si hay).
- **R2.3** Dos pestañas: **Facturas** y **Cobros**.
- **R2.4** Si la migración no está aplicada, la pantalla lo dice en vez de mostrar todo en cero.

### R3 — Facturas

- **R3.1** Formulario "Cargar factura" con fecha de entrega (hoy por defecto), nº factura,
  fecha de factura, monto, orden/expediente, lugar de entrega y detalle. Monto obligatorio
  y > 0; fecha de entrega obligatoria.
- **R3.2** Si el número de factura ya existe, avisa y no la guarda.
- **R3.3** Tabla con: fecha de entrega, nº factura, orden, lugar, monto, cobrado, saldo,
  días (desde la fecha de factura, o de entrega si no hay), estado **Pendiente / Parcial /
  Cobrada**, y acciones.
- **R3.4** Filtro por estado (Pendientes — por defecto —, Cobradas, Todas) y buscador por
  nº de factura, orden, lugar o detalle.
- **R3.5** Fila de totales (monto, cobrado, saldo) sobre lo filtrado.
- **R3.6** Cada factura se puede **editar** (todos sus datos) — p. ej. para agregar el número
  cuando se factura después de entregar.
- **R3.7** Botón **Cobrar** en cada factura pendiente o parcial: abre el formulario de cobro
  con esa factura ya tildada y el monto cobrado precargado en su saldo.
- **R3.8** Eliminar una factura (sólo admin) pide confirmación y avisa que se deshacen los
  cobros aplicados (los cobros en sí no se borran).

### R4 — Cobros

- **R4.1** Botón **Registrar cobro**: fecha (hoy), monto cobrado, retenciones (opcional),
  medio de pago, comprobante y detalle. Muestra el total del cobro.
- **R4.2** En el mismo formulario, lista de facturas pendientes con tilde y monto a aplicar.
  Al tildar una se precarga el mínimo entre su saldo y lo que queda sin aplicar del cobro.
- **R4.3** Botón **"Repartir automático"**: aplica el total del cobro a las facturas
  pendientes de la más vieja a la más nueva, hasta agotar uno u otro.
- **R4.4** No deja aplicar a una factura más que su saldo, ni en total más que el total del
  cobro. Lo que sobre queda **sin aplicar** y el formulario lo dice antes de guardar.
- **R4.5** Tabla de cobros con fecha, comprobante, medio, cobrado, retenciones, total, facturas
  que cancela (cada una con su monto y una ✕ para **deshacer** esa aplicación) y sin aplicar.
- **R4.6** Un cobro con saldo sin aplicar tiene botón **Aplicar** que lo reparte automático
  (R4.3) contra las facturas pendientes.
- **R4.7** Eliminar un cobro: sólo admin, con confirmación.

### R5 — Inicio

- **R5.1** Tarjeta "Municipalidad (PAICOR)" en el inicio con **Te debe** y **facturas
  pendientes**, y link al módulo.

### R6 — Verificación

- **R6.1** Lógica de saldos probada con `npm run verificar:municipalidad-calculos`.
- **R6.2** La app compila (`npm run build`) y pasa `npm run lint` sin errores nuevos.
- **R6.3** Prueba en navegador real (`npm run verificar:municipalidad`) sobre un banco de
  pruebas con datos ficticios en `/login/preview-municipalidad` (sólo en desarrollo).
- **R6.4** Cuadra: `Te debe = Σ saldos de facturas − Σ cobros sin aplicar`.
- **R6.5** En móvil (390 px) la página no se desborda a lo ancho, y facturas y cobros se ven
  como tarjetas (con saldo, estado y "Cobrar" a la vista) en lugar de tabla.
- **R6.6** Los topes y el cascade se verifican contra la base real
  (`npm run verificar:base-municipalidad`), una vez aplicada la migración.
- **R6.7** Screenshots de desktop y móvil antes de dar la tarea por terminada.

## Asunciones

- **A1** Hay un solo deudor (la Municipalidad): no hay tabla de clientes.
- **A2** Todo en pesos. Las retenciones se cargan como un único importe por cobro, sin
  discriminar por impuesto (si hace falta, va en el detalle).
- **A3** No hay fecha de vencimiento: la antigüedad en días es la alerta.
- **A4** Módulo propio en el inicio (no pestaña de Ingresos y Egresos), porque no toca la
  caja. Lo ven los mismos usuarios que Ingresos y Egresos (cualquier usuario activo).
- **A5** Los cobros no se editan: si uno se cargó mal, el admin lo borra y se carga de nuevo.

## Fuera de alcance

- Generar la factura electrónica (AFIP/ARCA) o imprimir boletas.
- Renglones de productos, cantidades y precios.
- Registrar el cobro como ingreso en Movimientos.
- Notas de crédito, intereses o actualización de montos.
