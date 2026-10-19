# Adaptar los videos a las teles al subirlos

Continuación de `SPEC-cartel-videos.md`. Pedido del 19/10/2026: "una herramienta en la app
que nos edite los videos, que nos cambie el formato y el tamaño, así siempre podemos subir
los videos".

## 0. Por qué y cómo

Ese mismo día, dos videos originales del celular (1080×2336, H.264 High nivel 5.0, 12 y
26 Mbps) dejaron en negro la tele de Carnicería 1: una LG Full HD con Chrome 94, que como
máximo decodifica 1080×1920 (nivel 4.2). Antes, uno que había pasado por WhatsApp se veía
pixelado (392×848). Hoy la app solo avisa o frena; la idea es que **convierta**.

**La conversión la hace el navegador de quien sube** (celular o compu), con el codificador
de video del propio aparato (WebCodecs), mediante la librería **Mediabunny** (MPL-2.0,
versión fijada). Sin servidor, sin costos y sin mandar el video a terceros. En Vercel no hay
ffmpeg, y ffmpeg compilado para el navegador es varias veces más lento.

Esto reemplaza lo que `SPEC-cartel-videos.md` dejaba fuera de alcance ("convertir HEVC →
H.264 dentro de la app"): ahora se puede, donde el navegador sepa leer HEVC.

## 1. Qué se considera "apto para la tele"

1. H.264, perfil High o menor, **nivel ≤ 4.1**.
2. Que entre en **1080×1920** (parado) o **1920×1080** (acostado), según la forma del video.
3. **30 cuadros por segundo** como máximo.
4. Hasta **8 Mbps** de video. Sin pista de audio: las teles van siempre mudas, y así pesa menos.
5. MP4 con el índice al principio, para que arranque sin bajar el archivo entero.

## 2. Al subir

6. Si el video ya es apto, se sube tal cual, como hoy.
7. Si no lo es (más grande que 1080p, nivel alto, más de 30 fps, demasiado pesado, HEVC,
   MOV), **se convierte antes de subir**: se escala para que entre en 1080×1920 (o
   1920×1080) sin deformar ni recortar, a 30 fps, H.264 ~6 Mbps y sin audio. El encuadre
   (llenar o mostrar entero) sigue siendo el de la placa, no se "quema" en el archivo.
8. Mientras convierte se ve **"Adaptando el video para las teles… 45%"** con barra de avance
   y un botón **Cancelar**. Un video de 15 a 60 s tarda de segundos a un par de minutos,
   según el aparato.
9. Después de convertir, el resultado se revisa igual que hoy (duración, tamaño) y se sube.
   El aviso dice qué se cambió: "Lo adaptamos: 1080×2336 → 886×1920, 49 MB → 11 MB".
10. **El tope de 50 MB pasa a aplicarse al resultado**, no al original: un video de 200 MB
    del celular se puede subir si convertido entra. Al original se le pone un tope de
    500 MB para no colgar el celular.
11. **HEVC (iPhone):** si el navegador lo puede leer (Safari en iPhone y Mac, Chrome con
    soporte del equipo), se convierte. Si no, sigue el aviso de hoy con instrucciones.
12. **Si el navegador no puede convertir** (sin WebCodecs, o el aparato no tiene codificador
    H.264), se avisa claro: "Este navegador no puede adaptar videos. Probá desde Chrome en la
    compu o en el celular", y no se sube un video no apto.
13. **Poca resolución** (lado corto < 720): no se puede arreglar convirtiendo. Se mantiene
    el aviso de pixelado.

## 3. En la tele

14. **Saltear más rápido un video que no avanza.** Si en 8 segundos la imagen no avanzó
    (la tele no lo decodifica y no da error), se pasa a la placa siguiente. Hoy espera ~45 s.

## 4. Fuera de alcance

- Recortar el video a 9:16 dentro del archivo (el encuadre se sigue resolviendo en vivo).
- Efectos, filtros, música, textos (→ CapCut/Canva, sin cambios).
- Volver a convertir videos ya subidos (se suben de nuevo).
- Convertir en el servidor.

## 5. Verificación

- Cálculos: decidir si un video es apto y a qué tamaño escalarlo (1080×2336 → 886×1920;
  1920×1080 queda igual; 3840×2160 → 1920×1080; 720×1280 queda igual; 60 fps → 30).
- Navegador real (Edge): se genera un video de muestra no apto (1080×2336 a 60 fps), se
  sube en el banco de pruebas, se ve la barra de avance y el resultado sale 886×1920,
  H.264 nivel ≤ 4.1, 30 fps, sin audio, y se reproduce. Cancelar a mitad no sube nada.
  Un video ya apto se sube sin convertir.
- El video convertido se reproduce en la tele de prueba (la previa del admin y una pantalla
  apartada contra la base real).
- Siguen pasando `verificar:cartel-videos` y `verificar:cartel-videos-calculos`.
- Capturas en celular y desktop. Prueba final en Carnicería 1 con un video del celular.

## 6. Estado

- **Hecho el 19/10/2026** (sin subir todavía). Mediabunny 1.60.0, cargada recién al subir un video.
- `verificar:cartel-adaptar-video`: el video de muestra (1080×2336, 60 fps, nivel 5.1) sale
  886×1920, nivel 4.1, sin audio y con el índice al principio, en desktop y celular; Cancelar
  no sube nada; uno apto se sube tal cual; en la tele, un video que no avanza se saltea en ~8,8 s.
- Con el video real que dejó en negro a Carnicería 1: 3,8 s en la compu, 22,7 MB → 11,8 MB.
- Ojo para pruebas: WebCodecs solo existe en páginas seguras (https o localhost).
- **Pendiente:** probar desde un celular real y ver el resultado en Carnicería 1.
- **Puntos 15-18 hechos el 19/10/2026** tras la prueba en Carnicería 1: `verificar:cartel-adaptar-video` comprueba que la copia girada mide 1920×886, queda girada para el mismo lado que la placa (rojo arriba → izquierda) y que la tele parada la dibuja en la capa sin girar, a pantalla completa, con la placa transparente encima.

## 7. Teles paradas: el video llega girado de fábrica (19/10/2026, tras probar en Carnicería 1)

En la LG de Carnicería 1 (navegador Chrome 94, montada parada, giro 270) las placas
comunes salen derechas pero **el video sale de costado**: la tele dibuja el video en un
circuito aparte que ignora el giro por CSS. Además, ese circuito informa 0 cuadros
dibujados aunque el video se vea, y el salto del punto 14 lo cortaba a los ~8 s.

15. **El salto del punto 14 mira solo si el tiempo avanza**, no los cuadros dibujados.
16. **Versión girada.** Al subir un video, si hay pantallas activas montadas paradas, se
    genera además una copia del video **ya girada** con el mismo giro (270 o 90), del mismo
    largo, y se guarda junto al clip (`girados: { "270": url }`). Sin migración: va dentro
    de `clips`. Se ve en la barra de avance ("Preparando la versión para teles paradas…").
17. **En la tele parada**, si el clip tiene la versión de su giro, el video se dibuja en una
    capa **sin girar** que ocupa toda la pantalla, por debajo de la placa; la placa (y el
    precio encima) sigue girada como siempre, con fondo transparente. El encuadre (llenar
    o entero, y qué parte queda) se traduce a la versión girada.
18. Si el clip no tiene versión girada (videos subidos antes, o un navegador que no pudo
    generarla), se ve como hasta ahora.
19. Fuera de alcance: generar las versiones giradas de los videos ya subidos (se suben de
    nuevo).

**Estado de los puntos 15-18: hechos el 19/10/2026.** `verificar:cartel-adaptar-video` comprueba que la copia girada
mide 1920×886, queda girada para el mismo lado que la placa (rojo arriba → izquierda) y que la tele
parada la dibuja en la capa sin girar, a pantalla completa, con la placa transparente encima.
Pendiente: verlo en Carnicería 1.
