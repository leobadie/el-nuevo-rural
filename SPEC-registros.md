# SPEC — Quién está detrás de un CUIT (módulo Cheques → Verificación)

Fecha: 2026-07-30
Alcance: ampliar el resultado de "Verificar un CUIT" con datos de la sociedad y las personas
físicas registradas en ella.

## Objetivo

Hoy, al verificar un CUIT, el BCRA devuelve solo la denominación ("YPF SOCIEDAD ANONIMA"). Eso
dice cómo se llama la empresa, no quién es. Antes de aceptar un cheque de un tercero se quiere
ver también qué sociedad es (tipo, antigüedad, dónde está, a qué se dedica) y qué personas
figuran registradas en ella.

## Lo que hay y lo que no

Investigado y medido contra las fuentes reales el 30/07/2026.

**No existe ninguna API pública que devuelva socios por CUIT.** El padrón REST de AFIP que
cumplía esa función está dado de baja: `soa.afip.gob.ar/sr-padron/v2/persona/{cuit}` y las
otras tres rutas conocidas responden 404 o "Servicio inexistente". Los **accionistas de una
S.A. no son públicos** en ningún registro abierto: lo que se publica es el directorio.

Lo que sí existe son dos datasets oficiales de Datos Abiertos de Justicia, descargables:

| Fuente | CUIT únicos | Qué aporta |
|---|---|---|
| Registro Nacional de Sociedades | **1.251.568**, todo el país | Razón social, tipo societario, fecha del contrato social, domicilio fiscal y legal, actividad |
| Inspección General de Justicia (IGJ) | 414.406, solo CABA | Personas con nombre y documento: socios, autoridades y representantes |

Cruzados por CUIT: **279.309 sociedades llegan hasta las personas físicas**, el 22,3 % del
total nacional.

### La cobertura de personas tiene un sesgo geográfico fuerte

Sociedades con personas identificadas, por provincia del domicilio legal:

```
224.652  CIUDAD AUTONOMA BUENOS AIRES
 44.831  BUENOS AIRES
  1.934  CORDOBA
  1.137  SANTA FE
    673  ENTRE RIOS
    535  MENDOZA
```

La IGJ es el registro de CABA; cada provincia tiene el suyo y no publica datos abiertos. Una
S.R.L. de Córdoba va a tener datos de sociedad pero **no** personas. La pantalla tiene que
decir eso explícitamente: sin esa aclaración, "no se encontraron socios" se lee como "no
tiene", que es falso.

## Decisiones tomadas por el usuario

| # | Decisión | Valor elegido |
|---|----------|---------------|
| DU1 | Alcance | Datos de sociedad para todo el país + personas donde la fuente las tenga. |
| DU2 | Almacenamiento | Todo el país (~288 MB de los 500 MB del plan). Decidido el 01/08/2026 contra la medición real del importador: acotar a Buenos Aires, CABA, Córdoba y Santa Fe daba 956.638 sociedades y ~239 MB, o sea ahorraba 50 MB y dejaba afuera 295.000 sociedades a las que la pantalla les diría "no figura". Las personas no eran el motivo: con el filtro ya entraba el 97,3 % de ellas. |

## Decisiones técnicas

| # | Decisión | Por qué |
|---|----------|---------|
| DR1 | Los datos se copian a Supabase, no se consultan en vivo. | No hay API: son CSV de ~1,3 GB por semestre, sin CORS. |
| DR2 | Una fila por CUIT en `sociedades`, no una por actividad. | El CSV nacional trae 3.070.317 filas para 1.251.568 CUIT: repite el CUIT por cada actividad y domicilio. |
| DR3 | Las personas se deduplican por (sociedad, documento, rol). | El dataset de IGJ repite la misma persona con el nombre escrito de varias formas: 1.900.296 filas se reducen a 1.168.771 reales, un 38 % menos. |
| DR4 | La carga se hace con un script y una `service_role` key, no desde la app. | Con la `anon` key, RLS bloquea la escritura, y el importador del panel de Supabase no toma archivos de este tamaño. |
| DR5 | El script se puede acotar por provincia. | Si el plan de Supabase no da el espacio, se carga solo donde opera el negocio en vez de resignar la función. |
| DR6 | Las tablas son de solo lectura para la app. | Son una copia de un registro público: nada en la app las modifica. |
| DR7 | El CSV se parsea respetando comillas, no partiendo por comas. | Partir por comas corre las columnas y devuelve el CUIT equivocado en las filas con coma en el nombre. Con comillas respetadas, las 2.331.970 filas de autoridades quedan exactas y de 1.070.756 entidades fallan 2, que son una sola razón social con un salto de línea adentro y se recupera juntando líneas. |

### Cuánto ocupa

La estimación previa a la carga (~288 MB) resultó ser **casi la mitad de lo real**, y el error
estuvo entero en los índices: se calcularon como un 35 % del tamaño de los datos y pesaban más
del doble. Queda anotado porque esa estimación fue la base para decidir el alcance (DU2), y con
el número correcto la decisión podría haber sido otra.

Medido en la base el 01/08/2026, con la carga nacional completa:

| Objeto | | Al importar | Tras la 010 | Tras la 011 |
|---|---|---|---|---|
| `sociedades` | datos | 224 MB | 224 MB | 224 MB |
| `sociedades_pkey` | índice | 38 MB | 38 MB | 38 MB |
| `sociedades_razon_social_idx` | índice GIN | 34 MB | — | — |
| `sociedad_personas` | datos | 127 MB | 127 MB | 118 MB |
| `..._cuit_rol_numero_documento_key` | índice único | 60 MB | 60 MB | — |
| `sociedad_personas_pkey` | índice | 25 MB (el `id`) | 25 MB | 45 MB (la tripleta) |
| `sociedad_personas_cuit_idx` | índice | 23 MB | — | — |
| **Total** (`pg_total_relation_size`) | | **530 MB** | **473 MB** | **425 MB** |

Las columnas salen de `detalle_registros()`; los dos índices borrados por la 010 están por
resta contra la medición anterior, que es de dónde salió cada MB.

La clave primaria nueva de `sociedad_personas` ocupa 45 MB donde el índice único ocupaba 60,
aunque indexa las mismas tres columnas: se construyó sobre la tabla ya compactada por el
`vacuum full` y sin el `id`, así que quedó sin el bloat que traía el original.

El plan gratuito de Supabase son 500 MB: la carga completa **no entraba**. Lo que sobraba no
eran los datos sino los índices, y ninguno de los tres que se borraron servía para algo:

- `sociedades_razon_social_idx` era un GIN de búsqueda de texto sobre 1,25M de razones
  sociales, y la app llega siempre por CUIT: `razon_social` solo se muestra.
- `sociedad_personas_cuit_idx` era redundante con el único de `(cuit, rol, numero_documento)`,
  que empieza por `cuit`.
- El `id` de `sociedad_personas` no aparecía en ninguna consulta; la clave real es esa
  tripleta, que pasó a ser la clave primaria reusando el índice que ya existía.

`npm run verificar:base` mide esto en cada corrida y falla si el margen baja del 10 %.

## Requisitos verificables

### R1 — Datos de la sociedad
- R1.1 Verificar un CUIT muestra, además de lo del BCRA: tipo societario, fecha del contrato
       social, domicilio legal (provincia y localidad) y actividad principal.
- R1.2 Se muestra la antigüedad en años, calculada desde el contrato social.
- R1.3 Si el CUIT no está en el registro, se dice que no figura, sin romper el resto de la
       consulta del BCRA.
- R1.4 Se indica de qué fuente y de qué fecha es el dato.

### R2 — Personas
- R2.1 Se listan las personas registradas con nombre, rol (socio, autoridad, representante) y
       tipo y número de documento.
- R2.2 Los socios se muestran primero, después autoridades y por último representantes.
- R2.3 No se repite la misma persona dos veces con el mismo rol.

### R3 — Decir la verdad sobre la cobertura
- R3.1 Si la sociedad no tiene personas cargadas, se explica que el registro de personas es
       el de CABA y que las sociedades inscriptas en otras provincias no están, en vez de
       dejar entender que la sociedad no tiene socios.
- R3.2 Se aclara que son las personas **registradas**, y que los accionistas de una S.A. no
       son información pública.
- R3.3 Nunca se presenta la ausencia de datos como un resultado limpio.
- R3.4 Si la consulta vuelve vacía porque RLS le esconde la tabla a esta sesión, el bloque se
       calla en vez de decir que el CUIT no figura: con una lista vacía no se puede distinguir
       un CUIT ausente de uno que no se puede ver.
- R3.5 Si la provincia tiene un registro propio que publique las personas, se dice cuál es, se
       enlaza, y se aclara qué hace falta para entrar. Ver "Registros provinciales" abajo.

### R4 — CUIL de persona física
- R4.1 Con un CUIT de persona (20, 23, 24, 27) se aclara que estos registros son de
       sociedades y que no hay padrón público de personas físicas.

### R5 — Carga de los datos
- R5.1 Un script descarga los ZIP oficiales, los parsea y carga las tablas.
- R5.2 El parseo respeta las comillas del CSV (los campos con comas van entrecomillados: hay
       razones sociales como `"GARCIA,NIMO,COBAS Y CIA."` y nombres como
       `"ALVAREZ, HORACIO RAUL"`), saca el BOM, y junta las filas partidas por un salto de
       línea dentro de un campo.
- R5.3 El script se puede correr de nuevo sin duplicar datos.
- R5.4 Al terminar informa cuántas filas cargó y cuánto ocupa.
- R5.5 Acepta acotar la carga a una lista de provincias.

### R6 — Presentación
- R6.1 Mismo lenguaje visual que el resto del módulo (NAVY `#1F3864`, Arial, `estilos.ts`).
- R6.2 En pantallas angostas nada scrollea en horizontal salvo las tablas, dentro de su caja.
- R6.3 Sin dependencias nuevas.

## Registros provinciales

Investigado el 01/08/2026, a pedido del usuario, porque el negocio opera en Córdoba y las
98.998 sociedades cordobesas cargadas llegan a sus personas en apenas el 1,4 % de los casos
(medido sobre una muestra de 1.000: 14 tenían personas, y por estar además inscriptas en la
IGJ).

**No hay forma de cargarlas.** El portal provincial de datos abiertos
(`datosgestionabierta.cba.gov.ar`, 150 datasets) no publica nada de la Inspección de Personas
Jurídicas, y en el catálogo nacional el único dataset con personas de sociedades sigue siendo
el de la IGJ. Tampoco hay dataset de autoridades para ninguna otra provincia.

**Pero el dato existe y es gratis.** La IPJ de Córdoba tiene *Consulta de Sociedad*
(`tramitesipj.cba.gov.ar`): inmediata, sin costo, se busca **por CUIT** y devuelve los datos de
la entidad, el capital social, el estado de la sociedad y **las autoridades con sus cargos**.
Cubre S.A.S., S.A. y S.R.L. con sede en la provincia. Requiere CiDi nivel 2.

Por eso R3.5: la pantalla enlaza esa consulta cuando la sociedad es de Córdoba, con el CUIT a
mano y avisando que hace falta CiDi. No se automatiza: es una consulta autenticada con la
identidad personal del usuario, de a una; hacerlo en masa sería frágil y contra sus términos.
Agregar otra provincia es sumar una entrada a `CONSULTAS_PROVINCIALES` en
`src/lib/registros/sociedad.ts`.

## Fuera de alcance

- Accionistas de sociedades anónimas: no son públicos.
- Datos de personas físicas por CUIL: no hay fuente pública desde la baja del padrón de AFIP.
- Copiar los registros de comercio provinciales: no publican datos abiertos (ver arriba: lo que
  sí se hace es enlazar su consulta).
- Los edictos del Boletín Oficial de Córdoba, que sí publican socios con documento al
  constituirse una sociedad: son PDF sin estructura y solo cubren desde la publicación digital.
- Balances y asambleas de IGJ (existen en la fuente, pero no ayudan a decidir si aceptar un
  cheque).

## Verificación

1. `npx tsc --noEmit`, `npm run lint` y `npm run build` sin errores.
2. `npm run verificar:registros` — parseo de los CSV reales (comas, BOM, deduplicación) y
   armado del resultado, sin depender de la base.
3. `npm run verificar:bcra` — la pestaña completa en navegador, desktop y móvil.
4. `npm run verificar:base` — los datos ya cargados en Supabase: que las filas hayan entrado,
   que el cruce CUIT → personas cierre con filas reales y que el tamaño entre en el plan.
   Es el único de los cuatro que mira la base; necesita la misma `service_role` key que el
   importador.
