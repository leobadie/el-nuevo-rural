# SPEC — Calendario de cheques (módulo Cheques)

Fecha: 2026-07-29
Alcance: nueva pestaña "Calendario" dentro de `/cheques`.

## Objetivo

Ver, día por día, cuántos cheques entran a cobro y por qué monto, e identificar
qué días quedan con margen para emitir cheques nuevos.

## Decisiones tomadas por el usuario

| # | Decisión | Valor elegido |
|---|----------|---------------|
| D1 | Criterio de "día disponible" | Tope diario configurable (monto y/o cantidad), con semáforo |
| D2 | Alcance de datos | ~~Solo cheques propios~~ → ampliado en D8 |
| D3 | Filtro de estado | ~~Todos los cheques~~ → ampliado en D4 |

### Segunda etapa — precisión (29/07/2026)

| # | Decisión | Valor elegido |
|---|----------|---------------|
| D4 | Estados contados | Los **Pagados sí cuentan** (debitaron plata ese día); los **Rechazados no** (nunca debitaron). Selector para cambiarlo. |
| D5 | Tope vs. ingresos | El tope se mide contra **lo que sale** (salidas brutas). Los ingresos se muestran aparte y en el neto, pero no habilitan a emitir más. |
| D6 | Cheque en día no hábil | Queda en la fecha que tiene cargada, con aviso de que se cobra el hábil siguiente. **No se corre el monto** (la grilla sigue coincidiendo con la tabla). |
| D7 | Monto del día | Usa `debito_banco` cuando existe (es lo que realmente salió del banco); si difiere del importe nominal, se avisa. |
| D8 | Cheques de terceros | Se suman como ingresos del día los que están **En cartera** o **Depositado**. Los **Entregado** (se usaron para pagar) y **Rechazado** no entran. |
| D9 | Feriados | Base calculada por año: fijos + móviles derivados de Pascua + traslados de la Ley 27.399. Los no laborables turísticos ("puentes") se fijan por decreto y **no son calculables**: quedan en una lista editable por el usuario. |

## Requisitos verificables

### R1 — Pestaña nueva
- R1.1 Aparece una pestaña "Calendario" en la barra de pestañas de `/cheques`.
- R1.2 Al hacer click, se renderiza el calendario y las demás pestañas se ocultan.
- R1.3 No se modifica el comportamiento de ninguna pestaña existente.

### R2 — Grilla mensual
- R2.1 Grilla de 7 columnas, semana de **lunes a domingo**, con encabezados L M M J V S D.
- R2.2 Los días de otros meses se muestran como celdas vacías (no se rellena con días vecinos).
- R2.3 Cada celda muestra: número de día, cantidad de cheques y monto total del día.
- R2.4 Un día sin cheques no muestra cantidad ni monto (solo el número y el color).
- R2.5 El día de hoy se distingue con borde destacado.
- R2.6 Los fines de semana se muestran con fondo atenuado.

### R3 — Agrupación por fecha
- R3.1 Un cheque cae en el día de su `fecha_cobro`.
- R3.2 Los cheques sin `fecha_cobro` **no** aparecen en la grilla; se informan aparte
       con un aviso ("N cheques sin fecha de cobro").
- R3.3 Se cuentan todos los estados (D3), incluidos Pagado y Rechazado.

### R4 — Topes y semáforo
- R4.1 Dos campos editables: **tope de monto por día** y **tope de cantidad de cheques por día**.
- R4.2 Cualquiera de los dos puede dejarse vacío = sin límite por ese criterio.
- R4.3 Uso del día = `max(monto/topeMonto, cantidad/topeCantidad)` sobre los topes definidos.
- R4.4 Colores:
  - **Verde (libre)**: 0 cheques ese día.
  - **Amarillo (con margen)**: hay cheques pero uso < 100%.
  - **Rojo (sin margen)**: uso ≥ 100%.
  - **Gris**: hay cheques y no hay ningún tope configurado (no se puede evaluar margen).
- R4.5 Hay una leyenda visible que explica los colores.
- R4.6 Los topes persisten entre recargas de página (`localStorage`, por navegador).

### R5 — Navegación de mes
- R5.1 Botones ‹ y › para mes anterior / siguiente, y botón "Hoy".
- R5.2 El título muestra mes y año en español (ej. "Julio 2026").
- R5.3 Cabecera con totales del mes visible: cantidad de cheques y monto total.

### R6 — Detalle del día
- R6.1 Al hacer click en un día con cheques, se abre debajo el detalle de ese día.
- R6.2 El detalle lista: N° de cheque, proveedor, importe, estado (con su color existente).
- R6.3 Muestra el margen restante del día en $ y en cantidad, si hay topes.
- R6.4 Click en el mismo día cierra el detalle.

### R7 — Próximos días para emitir
- R7.1 Panel con los próximos días (desde hoy, ventana de 60 días) que tienen margen.
- R7.2 Cada sugerencia indica la fecha y cuánto margen queda ($ y/o cantidad).
- R7.3 Checkbox "solo días hábiles" (activado por defecto) que excluye sábados y domingos.
- R7.4 Se muestran hasta 12 sugerencias.

### R8 — Presentación
- R8.1 Mismo lenguaje visual que las otras pestañas (NAVY `#1F3864`, Arial, estilos de `estilos.ts`).
- R8.2 En pantallas angostas la grilla scrollea horizontalmente; la página nunca scrollea en horizontal.
- R8.3 Sin dependencias nuevas.

## Requisitos verificables — segunda etapa

### R9 — Estados que se cuentan (D4)
- R9.1 Por defecto se cuentan todos los estados **menos Rechazado**.
- R9.2 Hay un control visible para incluir o excluir cada estado (Pagado, Vencido, Próximo, Pendiente, Rechazado).
- R9.3 La elección afecta al monto y cantidad del día, al semáforo, a los totales del mes y a las sugerencias.
- R9.4 La elección persiste entre recargas (`localStorage`).
- R9.5 Un aviso indica cuántos cheques quedan afuera por el filtro de estados.

### R10 — Feriados y días no hábiles (D9)
- R10.1 Los feriados nacionales del año visible se marcan en la grilla, distinguibles de un fin de semana.
- R10.2 Al ver el detalle de un día feriado, se muestra el nombre del feriado.
- R10.3 Los feriados móviles se derivan de la fecha de Pascua del año (Carnaval = lunes y martes 48 y 47 días antes; Viernes Santo = 2 días antes; Jueves Santo = 3 días antes).
- R10.4 Los feriados trasladables se corren según la Ley 27.399: si caen martes o miércoles, al lunes anterior; si caen jueves o viernes, al lunes siguiente.
- R10.5 El cálculo funciona para cualquier año, no solo 2026.
- R10.6 El usuario puede agregar y quitar días no hábiles propios (puentes por decreto, cierres bancarios), y persisten en `localStorage`.
- R10.7 "Solo días hábiles" excluye de las sugerencias los sábados, domingos **y** los días no hábiles.
- R10.8 Si un cheque cae en día no hábil, se avisa que se cobra el hábil siguiente y se indica qué día sería (D6).

### R11 — Débito real del banco (D7)
- R11.1 El monto de un cheque es `debito_banco` cuando ese campo tiene valor; si no, el importe nominal.
- R11.2 Cuando el débito difiere del importe nominal, el día lo señala y el detalle muestra ambos valores.
- R11.3 El detalle del día indica el total nominal y el total realmente debitado cuando no coinciden.

### R12 — Ingresos por cheques de terceros (D5, D8)
- R12.1 El día muestra, además de lo que sale, lo que entra por cheques de terceros a cobrar (estados En cartera y Depositado).
- R12.2 El día muestra el neto (entra menos sale) cuando hay ingresos.
- R12.3 El semáforo y el margen se siguen calculando **solo sobre las salidas** (D5).
- R12.4 El detalle del día lista los cheques de terceros que entran, con librador, banco e importe.
- R12.5 Un control permite mostrar u ocultar los ingresos, y persiste entre recargas.
- R12.6 Si no hay cheques de terceros cargados, la vista no cambia respecto de la primera etapa.

## Asunciones

- A1 Los topes son globales del usuario/navegador, no por proveedor (ya existen límites por
  proveedor en otra pestaña y son un concepto distinto).
- A2 La persistencia de topes es local al navegador. Si se quiere compartida entre usuarios,
  requiere una tabla nueva en Supabase (fuera de este alcance).
- A3 Los fines de semana se marcan visualmente y se excluyen de las *sugerencias* por
  defecto, pero **no** se pintan de rojo: si hay un cheque un sábado, se cuenta igual.
- A4 Zona horaria local del navegador; las fechas se manejan como `YYYY-MM-DD` sin hora,
  igual que el resto del módulo (`toDate` en `calculos.ts`).

## Fuera de alcance

- F1 Cheques de terceros en el calendario (D2).
- F2 Crear/editar cheques desde el calendario (se sigue haciendo en "Tabla y dashboard").
- F3 Exportar el calendario a PDF/Excel.
- F4 Saldo bancario real o proyección de caja.
- F5 Persistencia de topes en base de datos (ver A2).

## Verificación

1. `npx tsc --noEmit` sin errores.
2. `npm run lint` sin errores nuevos.
3. `npm run build` exitoso.
4. `npm run verificar:feriados`: comprueba el cálculo de feriados (Pascua, traslados de
   la Ley 27.399, días propios, próximo día hábil). No necesita la app corriendo.
5. `npm run verificar:calendario` (con `npm run dev` corriendo en otra terminal):
   carga el calendario en un navegador real y comprueba R1–R12 uno por uno, en
   desktop (1280px) y móvil (390px). Deja las capturas en `verificacion/capturas/`.

Los scripts viven en `verificacion/` y usan el Edge o Chrome ya instalado (no descargan
navegadores). El de navegador se apoya en la ruta `/login/preview-calendario`, un banco de
pruebas con cheques y cheques de terceros ficticios que **sólo existe en desarrollo**: en
producción da 404. El banco de pruebas calcula sus fechas en relativo (próximo sábado,
feriado del mes, sábado ya pagado), así que los casos límite se verifican cualquier día
que se corra.

Estado al 29/07/2026: **52 comprobaciones de navegador + 43 de feriados, todas en verde.**

### Defectos encontrados y corregidos durante la verificación

- **Scroll horizontal de toda la página en móvil.** El `body` es un contenedor flex
  (`layout.tsx`), así que el ancho mínimo de la grilla (560px) empujaba el ancho de la
  página entera en vez de scrollear sólo el calendario. Resuelto haciendo del div raíz
  del tab una grilla de una columna encogible (`minmax(0, 1fr)`).
- **Error de hidratación al recargar con topes guardados.** Leer `localStorage` durante
  el primer render hacía que el HTML del cliente no coincidiera con el del servidor.
  Resuelto leyendo los topes con `useSyncExternalStore`.
- **Segunda etapa: se anunciaba fecha de cobro para cheques ya pagados.** Un cheque con
  fecha en día no hábil pero ya debitado mostraba "se cobra el hábil siguiente", una fecha
  que además podía estar en el pasado. Ahora el aviso solo aparece si queda algo por
  debitar, y el texto es "Cobro efectivo:" en vez de una frase en futuro.

### Sobre los feriados

Las listas de feriados publicadas en la web **se contradicen entre sí**: al construir esto,
una fuente daba Carnaval solo el martes y otra lunes y martes; una daba el Día de la
Soberanía el 20/11 y otra el 23/11. Por eso no se copió ninguna lista: se calcula lo
calculable (Pascua determina Carnaval y Semana Santa; la Ley 27.399 determina los
traslados) y `npm run verificar:feriados` comprueba el resultado contra las fechas donde
las fuentes sí coinciden. Los "puentes" turísticos se fijan por decreto cada año y no son
calculables: se cargan a mano desde el panel "Días no hábiles propios".
