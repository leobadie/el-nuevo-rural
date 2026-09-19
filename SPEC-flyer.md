# SPEC — Flyer de ofertas

Una pantalla para armar el flyer de ofertas del local y descargarlo como imagen, lista para
mandar por WhatsApp, subir como estado o cargar en los televisores. Reusa la identidad visual
de la cartelería (`SPEC-cartel.md`) para que el flyer y las pantallas del local se vean como
lo mismo.

## Decisiones tomadas con el usuario (19/09/2026)

| Tema | Decisión |
|---|---|
| Dónde circula | WhatsApp y redes, estados/stories, y los televisores del local |
| De dónde salen los datos | **Pantalla propia** para cargarlos, no las placas de `/cartel` |
| Formatos | **1080×1350** (redes) y **1080×1920** (estado; el mismo archivo sirve para el TV) |
| Impreso | Fuera de alcance por ahora: no se eligió |

## Cómo se genera la imagen, y por qué

El PNG lo arma el servidor con `ImageResponse` de `next/og` (Next 16.2.11), no el navegador.
Dos razones: sale nítido a 1080 px reales aunque se descargue desde un celular, y no depende de
que el teléfono tenga cargada la tipografía. El costo es que el arte se dibuja con el subconjunto
de CSS que entiende Satori: **sólo flexbox, nada de `grid`**, y por eso el arte del flyer no
comparte el CSS del cartel sino sus valores.

## Requisitos

### R1 — El arte (componente único)

- **R1.1** Un solo componente `FlyerArte` dibuja el flyer, con estilos **inline** dentro del
  subconjunto que soporta Satori. Lo usan **las dos** partes: la vista previa en pantalla y el
  PNG del servidor. No hay dos diseños que puedan divergir.
- **R1.2** Identidad heredada del cartel: azul de marca `#1F3864`, fondo `#12203c`, amarillo de
  descuento `#ffd400` con texto `#1a1a2e`, texto blanco, velos `rgba(0,0,0,.26–.28)`. El color de
  la franja lo da `colorDePlaca` / `COLOR_SECCION` de `src/lib/cartel/placas.ts` (carnicería
  `#A62C2C`, verdulería `#1E7B4D`, etc.).
- **R1.3** Los precios se formatean con `fmtPrecio` y el descuento con `porcentajeAhorro`, **las
  funciones que ya usa el cartel**: mismo formato en el TV y en el flyer, y nunca un "0% OFF".
- **R1.4** Logo `/logo.jpg` recortado en círculo, como en el cartel.
- **R1.5** Dos formatos, mismo arte: **`redes` 1080×1350** y **`story` 1080×1920**. El de 1080×1920
  es el que se sube al panel de los televisores (que no acepta URLs, ver `SPEC-cartel-pantallas.md`).
- **R1.6** Estructura: encabezado (logo + título editable + sección), lista de productos, y pie con
  los datos del local y la vigencia de las ofertas.
- **R1.7** Entre **1 y 6 productos**. Los tamaños de letra escalan según cuántos haya, para que
  1 producto ocupe el flyer entero y 6 entren sin amontonarse ni recortarse.
- **R1.8** Cada producto puede tener foto o no. Sin foto, el precio manda y crece.

### R2 — La imagen (`POST /api/flyer`)

- **R2.1** Un route handler devuelve el PNG con `ImageResponse`. Va por **POST con el flyer en el
  cuerpo**, no por query string: seis productos con textos y URLs no entran cómodos en una URL.
- **R2.2** **Pide sesión**: sin usuario activo responde 401 y no genera nada. Es una ruta de la
  app, no un generador público.
- **R2.3** El PNG sale con las medidas exactas del formato pedido: 1080×1350 o 1080×1920,
  comprobable en la cabecera del archivo.
- **R2.4** Rechaza lo que no puede dibujar (sin productos, más de 6, formato desconocido) con un
  mensaje claro y código 400, en vez de devolver una imagen rota.
- **R2.5** Las fotos de producto se traen en el momento desde el bucket público `cartel` de
  Supabase Storage, que ya existe. No se empaquetan en el código.

### R3 — La pantalla (`/flyer`)

- **R3.1** Pide sesión y tiene "← Volver" al inicio, como el resto de la app.
- **R3.2** Agregar, editar, reordenar y quitar productos: nombre, precio, precio anterior
  (opcional), unidad ("el kilo", "c/u") y foto (opcional).
- **R3.3** La foto se sube al bucket `cartel` **reusando el uploader que ya funciona** en
  `/cartel/admin`. No se inventa un segundo mecanismo de subida.
- **R3.4** Vista previa en vivo, a escala, **fiel al PNG** porque es el mismo componente (R1.1).
  Se puede cambiar entre los dos formatos y la previa cambia.
- **R3.5** Un botón por formato descarga el archivo, con nombre `flyer-redes-AAAA-MM-DD.png` /
  `flyer-story-AAAA-MM-DD.png`.
- **R3.6** El título, la sección, la vigencia y los datos del pie (dirección, teléfono, horarios)
  se editan en la pantalla.
- **R3.7** Lo cargado **sobrevive a recargar la página**: si se corta la luz o se cierra sin
  querer, los productos siguen ahí. Se guarda en el navegador, no en la base.
- **R3.8** En móvil (390 px) la pantalla no se desborda a lo ancho y se puede cargar un flyer
  entero desde el celular.
- **R3.9** Tarjeta "Flyer de ofertas" en el inicio, con link al módulo.

### R4 — Verificación

- **R4.1** La lógica (escalado por cantidad, validaciones, nombre del archivo) probada con
  `npm run verificar:flyer-calculos`.
- **R4.2** Prueba en navegador real con `npm run verificar:flyer`: cargar productos, ver la previa,
  pedir la descarga y **comprobar sobre los bytes del PNG** que mide 1080×1350 y 1080×1920. Incluye
  que sin sesión la ruta responde 401.
- **R4.3** `npm run lint` y `npm run build` sin errores nuevos.
- **R4.4** Capturas de desktop y móvil, y el PNG generado, antes de dar la tarea por terminada.

## Asunciones

- **A1** **Sin migración de base.** El flyer no agrega tablas: usa el bucket `cartel` que ya
  existe y guarda lo demás en el navegador. Evita el paso manual de pegar SQL en Supabase.
- **A2** Un flyer por vez. No hay historial de flyers hechos.
- **A3** La tipografía del PNG es la que traiga `next/og`; Geist viene de `next/font/google` como
  `woff2` y `ImageResponse` sólo acepta `ttf`/`otf`/`woff`. **A verificar en la implementación**:
  si se consigue un `ttf` de un peso grueso, se usa; si no, se deja la de `next/og` y se elige el
  peso más parecido. El flyer tiene que verse bien igual.
- **A4** Los datos del pie los escribe el usuario una vez en la pantalla y quedan guardados (R3.6),
  así que el SPEC no fija dirección ni teléfono.

## Fuera de alcance

- Traer automáticamente las ofertas cargadas en `/cartel/admin` (se evaluó y el usuario eligió
  pantalla propia; se puede agregar después sin rehacer nada).
- Versión para imprimir (A5, 300 dpi, márgenes de corte).
- Publicar el flyer en redes o mandarlo por WhatsApp desde el sistema.
- Guardar los flyers hechos en la base para reusarlos.
- Editor libre de diseño (mover cajas, elegir tipografías): el flyer sale de una plantilla.
