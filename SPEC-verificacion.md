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
| DT5 | Un cheque se identifica por banco + **cuenta** + número, nunca por el número solo. | El endpoint busca el número en todas las cuentas del banco; ver el hallazgo del 30/07. |
| DT6 | La app cuenta sus propias consultas y frena al llegar a 10 por minuto por endpoint. | El 429 del BCRA no trae header CORS, así que el navegador no puede distinguirlo de una caída de red, y cada reintento durante el bloqueo lo sostiene. |

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
- V6.2 Con banco y número, consulta las denuncias registradas para ese número en ese banco.
- V6.3 Muestra la fecha de procesamiento del dato (es diario).
- V6.4 El **número de cuenta** del cheque es obligatorio: sin él no se consulta y se pide.
       El número de cheque solo no identifica un cheque, identifica uno por cada chequera
       del banco, así que sin la cuenta no hay respuesta que sirva.
- V6.5 El resultado es un veredicto binario sobre **el cheque consultado**:
  - la cuenta coincide con una denuncia → **rojo**, "DENUNCIADO: no lo aceptes", con causal
    y sucursal;
  - no coincide con ninguna → **verde**, "Cheque limpio".
- V6.6 Las denuncias de otras cuentas **no se listan**: no afectan al cheque consultado y
       enterrarían el veredicto. Se mencionan en una sola línea al pie, como contexto.
- V6.7 El veredicto nombra el cheque sobre el que responde: número, cuenta y banco.
- V6.8 La cuenta se compara por dígitos, ignorando guiones, barras y espacios.
- V6.9 Si lo tipeado coincide solo con el final de una cuenta denunciada (se omitió la
       sucursal), no se da por limpio: se marca **ámbar** y se muestran esas cuentas para
       compararlas, que son las únicas que sí pueden ser este cheque.
- V6.10 La lógica nunca da "limpio" sin haber comparado una cuenta, aunque se la llame sin
        ella: un veredicto verde siempre significa que el cruce se hizo.
- V6.11 El veredicto en pantalla siempre corresponde a lo que está escrito en los campos: si
        la consulta se corta por un dato faltante, o si se cambia el banco o el número de
        cheque, el veredicto anterior desaparece en vez de quedar como respuesta a otro cheque.

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
- V8.5 Al llegar al límite de consultas del BCRA se dice eso, no "revisá tu conexión", y se
       avisa que reintentar antes de tiempo sostiene el bloqueo.
- V8.6 Alcanzado el límite, la app deja de llamar a la API por su cuenta.

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
5. `npm run verificar:denuncias` — interpretación de la respuesta de cheques denunciados (V6),
   con los datos que devolvió la API real para el cheque 456 del Banco Nación.
6. `npm run verificar:limite` — control del límite de consultas (V8.5, V8.6), con un doble de
   `fetch` que reproduce lo medido contra la API real.
7. `npm run verificar:bcra` (con `npm run dev` corriendo) — carga la pestaña en un navegador
   real, hace consultas **reales** a la API del BCRA y comprueba V1–V9 en desktop y móvil.
   Los checks que dependen de la API externa quedan marcados como tales en la salida.

Si `verificar:bcra` avisa que el BCRA frenó consultas, esperar un minuto sin consultar y
volver a correrlo: los checks `[API]` de esa corrida no son concluyentes.

Estado al 30/07/2026: **45 comprobaciones de navegador + 23 de CUIT + 39 de denuncias + 16 de
límite, todas en verde.**

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

### Hallazgo del 30/07/2026: "denunciado" no era sobre el cheque consultado

Consultando el cheque **456** del Banco Nación, la pantalla decía **"DENUNCIADO: no lo
aceptes"** y listaba 18 denuncias. Ninguna era necesariamente la del cheque consultado.

`GET /cheques/v1.0/denunciados/{entidad}/{nroCheque}` busca ese número **en todas las cuentas
del banco** y devuelve una denuncia por cada cuenta que lo denunció. Medido contra la API real
(entidad 11, Banco de la Nación Argentina):

| N° de cheque | `denunciado` | Cuentas distintas en `detalles` |
|---|---|---|
| 1 | `true` | **229** |
| 100 | `true` | 120 |
| 456 | `true` | 18 |
| 1234 | `true` | 5 |
| 12345678 | `false` | 0 |

No hay 229 cheques robados con el número 1: hay 229 chequeras distintas, y en cada una alguien
denunció su cheque número 1. Un cheque se identifica por banco + cuenta + número; el número
solo identifica uno por chequera.

Las dos fallas que esto producía:

1. **Falso positivo casi garantizado con números bajos.** Todo cheque de numeración baja daba
   "no lo aceptes". Rechazar un cheque bueno tiene costo comercial real.
2. **Ningún veredicto era utilizable, ni siquiera el verdadero.** Aun con un cheque
   efectivamente robado, la pantalla no permitía distinguir si la denuncia era la del cheque
   que se tenía en la mano o la de otra chequera.

Por eso ahora el **número de cuenta** es obligatorio (está impreso en el cheque, en la línea
CMC7 del pie) y el resultado es un veredicto binario sobre el cheque consultado: **Cheque
limpio** o **DENUNCIADO**.

Un primer intento mostraba el veredicto correcto pero seguido de la lista de las 18 denuncias
de otras cuentas. El veredicto quedaba enterrado: la pantalla se leía como una advertencia
aunque dijera "limpio". Las denuncias ajenas no cambian ninguna decisión sobre este cheque, así
que ya no se listan; quedan mencionadas en una línea al pie. Solo se muestra la denuncia que
**sí** es este cheque, cuando la hay.

El caso de coincidencia parcial (V6.9) es deliberado: los números de cuenta se escriben de
varias formas y la sucursal a veces va como prefijo (sucursal 89 → cuenta 890036218). Ante la
duda se marca ámbar y no verde, porque el costo de un falso negativo acá es aceptar un cheque
robado.

Exigir la cuenta destapó un tercer defecto (V6.11): al cortar la consulta por falta de cuenta,
el veredicto de la consulta anterior seguía en pantalla. Cambiando el número de cheque y
olvidando la cuenta, se leía un "Cheque limpio" que era de otro cheque. Ahora cualquier cambio
de banco o de número, y cualquier corte por validación, descartan el veredicto anterior.

### Hallazgo del 30/07/2026: el BCRA frena, y el navegador no puede verlo

Corriendo la verificación varias veces seguidas apareció en consola un error de CORS. No era
un problema de la app: es el límite de consultas del BCRA. Medido contra la API real:

| Comprobación | Resultado |
|---|---|
| Consultas admitidas por minuto | **10**; la 11 devuelve `429` |
| Alcance del cupo | Por **endpoint**: agotado `Deudas/{cuitA}`, `Deudas/{cuitB}` también da 429, pero `/cheques/v1.0/entidades` responde 200 |
| Headers del `429` | **Sin** `Access-Control-Allow-Origin` |
| Reintentando cada 5 s | Seguía bloqueado a los 120 s |
| Esperando 70 s en silencio | Se liberó al primer intento |

Las dos consecuencias:

1. **El navegador no puede leer el 429.** Sin el header CORS, el `fetch` falla igual que si se
   hubiera cortado internet. La app decía *"No se pudo conectar con el BCRA. Revisá tu conexión
   a internet"* con la conexión perfecta, mandando a buscar el problema donde no estaba.
2. **Reintentar empeora el bloqueo.** Cada intento cuenta contra la ventana, así que apretar
   "Consultar" de nuevo —lo que cualquiera hace al ver un error de conexión— lo sostiene.

Por eso la app ahora lleva la cuenta de sus propias consultas por endpoint: al llegar a 10 deja
de llamar y explica el límite, en vez de golpear una API que ya la frenó. Una consulta de CUIT
usa tres endpoints distintos, uno por llamada, así que el uso normal (un CUIT cada tanto antes
de aceptar un cheque) no se acerca al límite; lo alcanza quien consulta muchos seguidos.

La verificación de navegador distingue ahora este caso: si el BCRA frena durante la corrida,
lo avisa aparte en vez de contarlo como error de consola de la app.
