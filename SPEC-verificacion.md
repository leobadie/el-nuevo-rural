# SPEC — Verificación de terceros (módulo Cheques)

Fecha: 2026-07-29
Alcance: nueva pestaña "Verificación" dentro de `/cheques`.

## Objetivo

Antes de aceptar un cheque de un tercero, poder ver en un solo lugar: cómo viene pagando
ese CUIT en el sistema financiero, si tiene cheques rechazados, y si el cheque que te están
dando está denunciado por robo o extravío.

## Fuente de datos

APIs públicas del BCRA, sin autenticación ni costo:

| Consulta | Endpoint | Actualización |
|---|---|---|
| Deudas por entidad | `GET /centraldedeudores/v1.0/Deudas/{cuit}` | **Mensual** |
| Evolución (24 meses) | `GET /centraldedeudores/v1.0/Deudas/Historicas/{cuit}` | **Mensual** |
| Cheques rechazados | `GET /centraldedeudores/v1.0/Deudas/ChequesRechazados/{cuit}` | **Mensual** |
| Cheque denunciado | `GET /cheques/v1.0/denunciados/{codigoEntidad}/{nroCheque}` | **Diaria** |
| Bancos con su código | `GET /cheques/v1.0/entidades` | — |

Base: `https://api.bcra.gob.ar`

## Decisiones tomadas por el usuario

| # | Decisión | Valor elegido |
|---|----------|---------------|
| DV1 | Alcance | Consulta por CUIT (deudas + rechazados) y verificación de cheque denunciado. |
| DV2 | Informe de cartera propia | Fuera de alcance por ahora. |
| DV3 | Historial de consultas guardado | Fuera de alcance (no se crea tabla). |
| DV4 | CUIT en cheques de terceros | Sí: campo opcional + botón "verificar librador". |

## Decisiones técnicas

| # | Decisión | Por qué |
|---|----------|---------|
| DT1 | La consulta se hace **desde el navegador del usuario**, no desde el servidor. | La API responde `Access-Control-Allow-Origin: *`, así que el navegador puede llamarla directo. Si saliera desde Vercel (servidores en EE.UU.) habría riesgo de bloqueo geográfico del BCRA, y además todas las consultas compartirían una misma IP. |
| DT2 | Un `404` significa "sin registros", no un error. | Verificado contra la API: un CUIT sin cheques rechazados devuelve 404 con cuerpo vacío. Mostrarlo como error diría "falló" cuando en realidad la respuesta es "está limpio". |
| DT3 | Siempre se muestra el período informado. | La Central de Deudores tiene 1 a 2 meses de atraso (consultando en julio de 2026 devolvió el período 202605). Sin el período a la vista, un dato viejo se lee como actual. |
| DT4 | El CUIT se valida antes de consultar. | Evita gastar consultas y mostrar "sin datos" cuando en realidad el número está mal tipeado. |

## Requisitos verificables

### V1 — Pestaña
- V1.1 Aparece una pestaña "Verificación" en la barra de pestañas de `/cheques`.
- V1.2 No se modifica el comportamiento de ninguna pestaña existente.

### V2 — Validación del CUIT
- V2.1 Acepta el CUIT con o sin guiones y espacios (`30-54668997-9` y `30546689979`).
- V2.2 Rechaza los que no tienen 11 dígitos, indicando el problema.
- V2.3 Rechaza los que tienen dígito verificador incorrecto, indicando el problema.
- V2.4 No se consulta a la API si el CUIT es inválido.
- V2.5 El CUIT se muestra formateado con guiones en el resultado.

### V3 — Situación en el sistema financiero
- V3.1 Muestra la denominación (nombre o razón social) que informa el BCRA.
- V3.2 Lista cada entidad con su situación, el monto y los días de atraso.
- V3.3 Traduce el número de situación a su significado (1 Normal … 6 Irrecuperable por
       disposición técnica) con un color según la gravedad.
- V3.4 Muestra un resumen con la peor situación registrada y la deuda total.
- V3.5 Muestra el período informado (mes y año) y aclara que el dato es mensual.
- V3.6 Señala las marcas de la API cuando están activas: refinanciaciones, recategorización
       obligatoria, situación jurídica, proceso judicial, en revisión.
- V3.7 El veredicto pondera por monto, no solo por la peor situación: indica cuánta plata
       está en situación irregular (3 o peor) y qué porcentaje del total representa.
- V3.8 La tabla ordena las entidades con las peores situaciones primero.

### V4 — Cheques rechazados
- V4.1 Lista los cheques rechazados agrupados por causal, con entidad, número, fecha y monto.
- V4.2 Indica el estado de la multa y si el cheque fue pagado luego del rechazo.
- V4.3 Si el CUIT no tiene rechazos, dice explícitamente que no registra (no un error).
- V4.4 Muestra el total de cheques rechazados y su monto.

### V5 — Evolución
- V5.1 Muestra la peor situación por período de los últimos meses informados.
- V5.2 Si no hay histórico, lo dice sin romper el resto de la consulta.
- V5.3 Cada período con situación irregular indica cuánta plata representa y qué porcentaje
       del mes, por el mismo motivo que V3.7.

### V6 — Cheque denunciado
- V6.1 Selector con los bancos que informa la API (traídos de `/cheques/v1.0/entidades`).
- V6.2 Con banco y número, responde si el cheque está denunciado.
- V6.3 Muestra la fecha de procesamiento del dato (es diario).
- V6.4 Si está denunciado, muestra el detalle que devuelve la API y lo marca en rojo.

### V7 — CUIT en cheques de terceros
- V7.1 Los cheques de terceros tienen un campo CUIT del librador, opcional.
- V7.2 El CUIT se valida al guardarlo; si es inválido no se guarda y se avisa.
- V7.3 Desde la lista de cheques de terceros, un botón lleva a Verificación con el CUIT
       ya cargado y la consulta hecha.
- V7.4 Los cheques de terceros que ya existen sin CUIT siguen funcionando igual.

### V8 — Errores y estados
- V8.1 Mientras consulta, se ve que está consultando y no se puede disparar dos veces.
- V8.2 Si la API no responde o falla la red, se muestra un mensaje claro y accionable.
- V8.3 Un error en una de las tres consultas no impide mostrar el resultado de las otras.
- V8.4 Se aclara que los datos son públicos del BCRA y con qué frecuencia se actualizan.

### V9 — Presentación
- V9.1 Mismo lenguaje visual que el resto del módulo (NAVY `#1F3864`, Arial, `estilos.ts`).
- V9.2 En pantallas angostas nada scrollea en horizontal salvo las tablas, dentro de su caja,
       y esa caja se puede arrastrar: si la tabla desborda sin poder arrastrarla, el monto
       queda cortado y es un dato inalcanzable.
- V9.3 Sin dependencias nuevas.

## Fuera de alcance

- Informe de rechazos de la cartera propia (DV2).
- Guardar historial de consultas (DV3).
- Informes pagos tipo Nosis o Veraz (requieren contrato comercial).
- Consultar el padrón de AFIP para traer la razón social a partir del CUIT.

## Verificación

1. `npx tsc --noEmit` sin errores.
2. `npm run lint` sin errores nuevos.
3. `npm run build` exitoso.
4. `npm run verificar:cuit` — validación del dígito verificador contra CUITs reales.
5. `npm run verificar:bcra` (con `npm run dev` corriendo) — carga la pestaña en un navegador
   real, hace consultas **reales** a la API del BCRA y comprueba V1–V9 en desktop y móvil.
   Los checks que dependen de la API externa quedan marcados como tales en la salida.

Estado al 29/07/2026: **29 comprobaciones de navegador + 25 de validación de CUIT, todas
en verde.**

Pendiente de despliegue: aplicar `supabase/008_cheques_terceros_cuit.sql` en la base. Sin esa
columna, guardar un cheque de terceros falla (el `insert` manda `cuit_librador`).

### Hallazgo durante la verificación: la peor situación sin el monto engaña

Al consultar un CUIT real (YPF), el resultado mostraba **"Registra atrasos importantes"**
porque figuraba en situación 5 (Irrecuperable)… por **$35.000** con una empresa de telepeaje,
mientras que sus $1.164.094.099.000 en 30 bancos estaban todos en situación 1 (Normal).

Tomar la peor situación sin mirar cuánta plata representa llevaría a rechazar a un cliente
bueno por una deuda insignificante y probablemente olvidada. Por eso:

- El veredicto pondera por monto: si lo irregular es menos del 20% de la deuda, dice
  "Atraso puntual, el resto normal" y nombra dónde está ese registro.
- Se muestra siempre el monto y el porcentaje en situación irregular.
- La tabla ordena las peores situaciones primero, para que no queden perdidas entre decenas
  de filas normales.

Esto no oculta el dato: la peor situación se sigue mostrando bien visible. Lo que cambia es
que se muestra **con su contexto**.

El bloque "cómo viene mes a mes" tenía el mismo defecto multiplicado por doce: mostraba los
12 períodos en **"5 · Irrecuperable"**, siempre por los mismos $35.000. Leído de corrido daba
un año entero en rojo. Ahora cada mes que tiene situación irregular dice el monto y el
porcentaje (`irregular: $35.000 (menos del 1%)`).
