# Encuadre automático de los videos

Continuación de `SPEC-cartel-videos.md` (paso 3, encuadre) y `SPEC-cartel-convertir-video.md`.
Pedido del 27/11/2026, retomando lo que quedó abierto el 20/10: en Carnicería 1 el video se
veía derecho pero con **bordes negros a los costados** (886 de ancho sobre 1080), porque la
placa quedó en encuadre "entero", que es el valor por defecto.

## 0. La idea

La forma de un video de celular parado (1080×2340, 0,46) se parece a la de la tele parada
(1080×1920, 0,5625): llenar la pantalla recorta ~18 % del alto y se ve mucho mejor que con
bordes. Un video acostado en una tele parada, en cambio, recortado perdería dos tercios de la
imagen: ahí conviene "entero". Hoy hay que darse cuenta y elegirlo a mano; la idea es que se
elija solo.

**Recorte** = qué parte del video queda afuera al llenar la pantalla:
`1 − min(forma video, forma tele) / max(forma video, forma tele)`, con forma = ancho / alto.

## 1. Al subir un video (admin)

1. Al agregar un video a la placa, el encuadre **se elige solo**:
   - **"Llenar"** si el recorte es **≤ 25 %** para todos los videos de la placa.
   - **"Entero"** si algún video recortaría más.
2. La forma de la tele contra la que se compara:
   - **parada (9:16)** si la placa va a alguna tele parada (giro 90 o 270), o si no se sabe;
   - **acostada (16:9)** solo si todas las teles a las que va son acostadas.
   "A las que va" = las teles elegidas en la placa; si no eligió ninguna, las activas que
   coinciden con la sección (la misma regla que usa la pantalla).
3. También se vuelve a elegir si cambian las teles elegidas o la sección, **mientras no se haya
   tocado el encuadre a mano**. Si se tocó, se respeta hasta guardar o cancelar.
4. Abrir una placa ya guardada **no cambia** su encuadre: solo cambia al agregar o sacar videos,
   o al cambiar teles o sección.
5. Debajo de la opción se ve una línea que explica la elección, por ejemplo
   *"Elegido solo: el video tiene casi la forma de la tele, recorta 18 %."* o
   *"Elegido solo: la forma del video es muy distinta a la de la tele (recortaría 68 %)."*
6. El encuadre se puede seguir cambiando a mano como hoy.
7. Videos sin medidas guardadas (subidos antes de que se guardaran) no cuentan para la
   elección; si ninguno tiene medidas, no se cambia nada.

## 2. En la tele

8. Si la placa está en "llenar" pero **en esa tele** el recorte pasaría el **50 %**, se muestra
   "entero". Caso real: una placa de Carnicería con un video parado que también sale en Pasillo
   o Acceso (teles acostadas): ahí recortado se perdería tres cuartos de la imagen.
9. Se mide con lo que de verdad se dibuja: las medidas del archivo que está reproduciendo y la
   caja donde se dibuja (así vale igual para el video girado de fábrica y para el girado por CSS).

## 3. Verificación

10. `npm run verificar:cartel-encuadre-calculos`: recorte, elección por forma de teles,
    elección con varios videos, videos sin medidas, y el límite del punto 8.
11. Verificación en navegador del admin (banco `/login/preview-ofertas`): subir un video parado
    deja "Llenar" elegido con la línea explicativa; uno acostado deja "Entero"; tocar a mano
    se respeta.
12. Siguen pasando `verificar:cartel-videos-calculos` y `verificar:ofertas`.

## Lo que asumo

- 25 % como límite para elegir "llenar" y 50 % para el resguardo de la tele. Se ajustan con
  dos constantes en `src/lib/cartel/video.ts`.
- El foco (qué parte se ve si sobra) queda en "el centro".

## Fuera de alcance

- Detectar dónde está lo importante del video (caras, el producto) para elegir el foco.
- Cambiar placas ya guardadas: siguen como estén hasta que se les agregue un video o se toque
  el encuadre. **Si la placa de Carnicería 1 tiene que llenar, hay que cambiarla a mano una vez**
  (o volver a subir el video).
- Migración de base: no hace falta, se siguen guardando "entero" o "llenar".
