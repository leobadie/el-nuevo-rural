# Cartel en vivo en los televisores — dejar de exportar archivos

Continuación de `SPEC-cartel.md` y `SPEC-cartel-pantallas.md`.

## 0. De dónde viene

Hoy los televisores muestran la publicidad del panel de Data Computación (cdenet),
que no acepta direcciones web: cada cambio de precio obliga a exportar PNG con
`npm run cartel:video` y subirlos a mano. El pedido (18/10/2026) es que los TVs
muestren nuestra app directamente, y que las placas se armen solas con movimiento.

**Lo que se averiguó en el local:** no hay caja ni stick. Los televisores son
**Quantic LED 43" FHD con webOS Hub** (el sistema de LG licenciado a otras marcas).
Manteniendo apretado el **botón 1** del control, el navegador del propio TV abre la
dirección que cargó el técnico de cdenet en cada uno. Para pasar a nuestra app
alcanza con que esa dirección sea `/cartel/tv/<slug>`, que ya existe y es pública.

**Riesgo principal:** el navegador de webOS Hub es un Chromium de varios años.
Next.js 16 apunta a Chrome 111+ (`node_modules/next/dist/docs/03-architecture/supported-browsers.md`).
Puede andar, o puede quedar en blanco. Se resuelve probando en un TV real (punto 1),
no suponiendo.

## 1. Prueba en el televisor (antes de construir lo que depende de ella)

1. En **un solo TV** se abre el navegador y se tipea
   `el-nuevo-rural.vercel.app/cartel/tv/acceso`. Se anota: si carga, si rota, si se
   ve acostada, y la versión del navegador (la registra el punto 7 sola).
2. Se deja la página abierta **20 minutos** para ver si el TV la tapa con el
   protector de pantalla o se apaga solo. La de cdenet reproduce video y eso puede
   ser lo que hoy lo mantiene despierto.
3. Los otros 9 televisores **siguen con cdenet** hasta que todo esto esté probado.
   La dirección del botón 1 no se cambia sin hablar con el técnico.

## 2. Que se vea en el navegador del TV

4. Si la prueba da pantalla en blanco, la pantalla del TV se hace compatible con ese
   navegador (bajar el objetivo de compilación para estas rutas, o una versión
   liviana sin React). La forma exacta se decide con la versión real en la mano.
5. Aunque falle el JavaScript, el HTML que manda el servidor ya trae la primera
   placa dibujada. Se agrega una recarga automática de respaldo (cada 10 minutos)
   que no depende de JavaScript, para que un TV donde el JS no corre igual vaya
   mostrando ofertas nuevas.

## 3. Pantalla vertical

6. `/cartel/tv/<slug>?rotar=90` (y `270`) gira toda la placa dentro de una pantalla
   apaisada de 1920×1080, para los TVs montados parados. Sin el parámetro se ve
   como hoy. Se verifica con capturas en 1920×1080 y en 1080×1920.

## 4. Saber qué TVs están andando

7. Cada televisor avisa cada 5 minutos que está prendido: guarda la hora, la
   versión de la app y el navegador (`User-Agent`). Solo puede escribir su propia
   fila, y solo para una pantalla activa que exista.
8. En `/cartel/admin`, pestaña Televisores, cada pantalla muestra **"conectado"**
   (aviso de hace menos de 15 minutos), **"sin señal desde las HH:MM"** o
   **"nunca se conectó"**, más el navegador que reportó.
9. Requiere una migración nueva (`027_cartel_latidos.sql`) que se aplica a mano en
   Supabase, como todas.

## 5. Que arranque sin internet

10. La primera vez que el TV abre su dirección, guarda la página, las ofertas y las
    fotos. Si después se prende sin wifi, muestra lo último que tenía en vez de una
    pantalla de error.
11. Con internet, siempre manda lo nuevo: lo guardado es solo el respaldo. Un
    cambio de precio no puede quedar tapado por una copia vieja.
12. Una vez por día, de madrugada, la pantalla se recarga sola, para tomar la
    última versión de la app y no acumular horas de memoria en el navegador del TV.
13. Depende del punto 1: si el navegador del TV no soporta guardar páginas
    (service worker), este bloque queda en "lo que tenía en memoria", como hoy.

## 6. Placas con movimiento

14. Las placas se animan solas a partir de los datos cargados, sin generar video:
    - **Oferta con foto:** la foto hace un zoom lento durante toda la placa.
    - **Precio:** entra con un golpe corto y queda quieto, para poder leerlo.
    - **Entre placa y placa:** fundido o deslizamiento, nunca un corte seco.
15. El tipo **imagen** (cartel ya diseñado) **no hace zoom**: recortarlo puede
    comerse el precio. Solo entra con fundido.
16. Las animaciones se prueban en los dos casos de la placa de oferta, **con foto
    y sin foto**, porque el diseño cambia de uno al otro.
17. En modo captura (`?fijo=N`, el que usa `cartel:video`) no hay animación, así
    los PNG salen iguales que hoy.
18. Si el navegador del TV anda lento con las animaciones (tirones), se bajan a
    fundidos simples. Lo que se lee primero es el precio, no el efecto.

## 7. Lo que no cambia

19. `/cartel/admin` sigue detrás del login. `/cartel` y `/cartel/tv/<slug>` siguen
    públicas por igualdad o patrón, sin abrir el prefijo `/cartel/`.
20. El respaldo de `PLACAS_DEMO` cuando no hay placas vigentes se mantiene.
21. `npm run cartel:video` sigue funcionando, para los TVs que sigan con cdenet.

## 8. Fuera de alcance

- Generar fotos o textos con IA (el usuario eligió solo "armar la placa automática").
- Generar archivos `.mp4` desde la app.
- Comprar o configurar hardware: los TVs ya abren páginas web.
- Cambiar la dirección del botón 1 en los 10 televisores: lo hace el técnico o el
  usuario, después de la prueba.
- Videos subidos por el usuario como tipo de placa.

## 9. Verificación

- `npm run verificar:pantallas` y `verificar:base-cartel` siguen pasando.
- Nuevo script en navegador real: rotación (capturas 1920×1080 con y sin `?rotar`),
  animaciones con y sin foto, y la página cargando con la red cortada después de
  una primera visita.
- `verificar:base-cartel` se extiende a la tabla de latidos: un anónimo no puede
  escribir la fila de otra pantalla ni inventar una pantalla.
- Prueba final en el TV del local, con foto.

## 10. Agregado tras la prueba en el local (18/10/2026)

El usuario probó en un TV: la app anda, rota sola y con `?rotar=270` queda derecha y a
pantalla completa. Aparecieron tres cosas, que se suman al alcance:

22. **El protector de pantalla se activa** con imágenes fijas. La página pide mantener la
    pantalla prendida (Wake Lock) y, de respaldo, reproduce en loop un video mínimo de 4 px
    (`public/cartel/despierto.webm`): el reproductor de cdenet evitaba el protector porque
    pasaba video. En modo captura no va.
23. **La barra del navegador tapa el borde** (se comía la última cifra del precio). Cualquier
    botón del control pone la página en pantalla completa: el navegador solo lo permite
    después de una acción de alguien.
24. **El giro se elige en el admin** ("Cómo está montado", migración 028), para no tener que
    ir al local a cambiar la dirección. `?rotar=` en la dirección sigue teniendo prioridad.
25. **Se actualiza sola** (adelanto del punto 12): cada 10 minutos la página pide su propia
    dirección y, si el servidor tiene otra versión, se recarga. Sin internet no recarga.
26. **Dos TVs son horizontales** (Pasillo y Acceso, de otra marca; los 8 Quantic están
    parados). Un TV horizontal sin giro usa un **diseño apaisado** de 1920x1080: la foto a
    la izquierda y el precio a la derecha, y sin foto el precio ocupa todo el ancho. Se
    activa por la forma de la pantalla y solo en la del televisor: la vista previa del
    admin sigue vertical.
27. **Los televisores del local** son Carnicería 1-3, Pollería 1-3, Fiambrería 1-2, Pasillo
    y Acceso. Los "Embutidos 1-5" que venían de cdenet se renombraron (dirección incluida)
    antes de que ningún TV las tuviera cargadas. cdenet ya no los muestra: cada TV queda
    identificado por la dirección que se le carga.
28. **Hecho (18/10/2026): puntos 10-13.** `public/cartel-sw.js`, con scope `/cartel/tv/`.
    Página y lecturas de Supabase: red primero (8 s) y respaldo guardado. Código, fotos,
    videos y logo: lo guardado primero, con soporte de pedidos por partes (Range) para que
    los videos tampoco se vuelvan a bajar. Se verifica con `verificar:cartel-sin-internet`
    contra la versión compilada (en `npm run dev` no aplica).
