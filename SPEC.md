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
| D2 | Alcance de datos | Solo cheques propios (tabla `cheques`), no terceros |
| D3 | Filtro de estado | Todos los cheques (incluye Pagados y Rechazados) |

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
4. `npm run verificar:calendario` (con `npm run dev` corriendo en otra terminal):
   carga el calendario en un navegador real y comprueba R1–R8 uno por uno, en
   desktop (1280px) y móvil (390px). Deja las capturas en `verificacion/capturas/`.

El script vive en `verificacion/calendario.mjs` y usa el Edge o Chrome ya instalado
(no descarga navegadores). Se apoya en la ruta `/login/preview-calendario`, un banco de
pruebas con cheques ficticios que **sólo existe en desarrollo**: en producción da 404.

Estado al 29/07/2026: 28 comprobaciones, 28 en verde.

### Defectos encontrados y corregidos durante la verificación

- **Scroll horizontal de toda la página en móvil.** El `body` es un contenedor flex
  (`layout.tsx`), así que el ancho mínimo de la grilla (560px) empujaba el ancho de la
  página entera en vez de scrollear sólo el calendario. Resuelto haciendo del div raíz
  del tab una grilla de una columna encogible (`minmax(0, 1fr)`).
- **Error de hidratación al recargar con topes guardados.** Leer `localStorage` durante
  el primer render hacía que el HTML del cliente no coincidiera con el del servidor.
  Resuelto leyendo los topes con `useSyncExternalStore`.
