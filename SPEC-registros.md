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
| DU2 | Almacenamiento | A definir según el espacio disponible; se decide con la medición de abajo. |

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

Medido sobre los archivos reales, con el esquema de DR2 y DR3:

| Tabla | Filas | Tamaño estimado |
|---|---|---|
| `sociedades` | 1.251.568 | ~142 MB |
| `sociedad_personas` | 1.168.771 | ~71 MB |
| Índices (~35 %) | | ~75 MB |
| **Total** | | **~288 MB** |

El plan gratuito de Supabase son 500 MB. Entra, pero ocuparía más de la mitad, así que la
carga es incremental y verificable: se importa, se mide el tamaño real en la base y recién ahí
se decide si se deja completo o se acota por provincia (DR5).

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

## Fuera de alcance

- Accionistas de sociedades anónimas: no son públicos.
- Datos de personas físicas por CUIL: no hay fuente pública desde la baja del padrón de AFIP.
- Registros de comercio provinciales: no publican datos abiertos.
- Balances y asambleas de IGJ (existen en la fuente, pero no ayudan a decidir si aceptar un
  cheque).

## Verificación

1. `npx tsc --noEmit`, `npm run lint` y `npm run build` sin errores.
2. `npm run verificar:registros` — parseo de los CSV reales (comas, BOM, deduplicación) y
   armado del resultado, sin depender de la base.
3. `npm run verificar:bcra` — la pestaña completa en navegador, desktop y móvil.
