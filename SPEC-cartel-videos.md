# Videos en los televisores — subir, editar y mostrar

Continuación de `SPEC-cartel-tv-en-vivo.md`. Pedido del 18/10/2026: "un editor de
videos, para poder subir videos y editarlos desde nuestra app".

## 0. Decisiones de fondo

**Lo que se le pidió al editor:** recortar inicio y fin, precio y texto encima,
encuadrar, unir varios clips. Videos de 15 a 60 segundos, de cualquier origen
(celular, hechos por terceros, bajados de redes). Los televisores van **siempre mudos**.

**Edición "en vivo", sin fabricar videos nuevos.** El TV muestra una página web, así
que no hace falta re-codificar nada: se sube el video original una vez y el editor
guarda *instrucciones* (desde qué segundo, hasta cuál, qué parte se ve, qué precio va
encima). El TV reproduce el tramo y dibuja el precio arriba con HTML. Consecuencias:

- Cambiar un precio o un recorte es instantáneo y no hay que volver a subir nada.
- No hace falta un servidor que procese video (en Vercel no hay ffmpeg, y en el
  navegador del celular re-codificar 60 segundos es muy lento).
- El precio sale con la misma letra y colores que las placas.

**CapCut / Canva para lo creativo.** Efectos, transiciones, música y subtítulos
animados se hacen en esas apps (gratis, en el celular) y se sube el resultado. CapCut
no tiene API pública; Canva sí, pero conectarla (registro de app, login con Canva) no
se justifica hoy. Queda fuera de alcance.

## 1. Subir

1. En `/cartel/admin` hay un tipo de placa nuevo: **video**. Se sube un archivo desde
   la compu o el celular (`.mp4`, `.mov`, `.webm`).
2. **Compatibilidad con el TV.** Los iPhone graban por defecto en HEVC, que los
   navegadores de TV en general no reproducen. Al subir, el editor prueba si el video
   se puede reproducir como H.264/MP4 y, si no, avisa con instrucciones concretas
   ("en el iPhone: Ajustes → Cámara → Formatos → Más compatible", o pasarlo por
   CapCut/WhatsApp). No se sube un video que el TV no va a poder mostrar sin avisar.
3. **Peso.** Tope de 50 MB por archivo (el límite de Supabase en el plan gratuito).
   Por encima, el editor avisa antes de subir, no después de esperar la carga.
4. Los archivos se guardan con nombre único y caché larga (no cambian nunca: una
   edición cambia las instrucciones, no el archivo). Ver el punto 15.

## 2. Editar

5. **Recortar:** elegir inicio y fin sobre una línea de tiempo con vista previa. El
   TV reproduce solo ese tramo.
6. **Unir clips:** una placa de video puede tener varios tramos, de uno o varios
   archivos, en el orden que se elija. Se reproducen uno detrás del otro.
7. **Encuadrar:** si la forma del video no es la del TV (un video acostado en un TV
   parado), se elige "llenar la pantalla recortando" (y qué parte queda: arriba,
   centro, abajo / izquierda, centro, derecha) o "mostrar entero con bordes".
8. **Precio y texto encima:** título, precio, precio anterior / % OFF, unidad y
   vigencia, usando los datos y el estilo de la placa de oferta. Posición: arriba o
   abajo. Todo opcional: un video de proveedor puede ir sin nada encima.
9. **Vista previa** en el admin con la forma real del TV (parado y acostado).

## 3. En el televisor

10. La placa de video dura lo que dura su recorte (suma de tramos), no la duración
    fija de las placas. Termina y pasa a la siguiente placa.
11. Siempre muda, con reproducción automática.
12. Si un video no carga o da error, la placa se salta y sigue la siguiente: nunca un
    cuadro negro trabado.
13. El video mantiene la animación de salida entre placas, igual que el resto.
14. En modo captura (`?fijo=N`, el generador de PNG) la placa de video muestra un
    cuadro fijo del inicio del recorte.

## 4. Costo de datos (lo que más hay que cuidar)

15. Un video de 30 MB en 10 televisores, si se volviera a bajar en cada vuelta,
    serían gigas por día y se agota la cuota gratuita de Supabase. Por eso:
    - el archivo se sube con `cacheControl` de un año (nunca cambia, punto 4);
    - **depende del punto 10 de SPEC-cartel-tv-en-vivo.md** (guardar en el TV): el
      service worker guarda los videos y el TV los baja una sola vez.
    - el admin muestra el peso de cada video y sugiere comprimir si pasa los 20 MB.
16. Se verifica midiendo cuántas veces se pide el archivo en una hora de reproducción
    (tiene que ser una).

## 5. Fuera de alcance

- Efectos, transiciones, filtros, música, subtítulos animados (→ CapCut/Canva).
- Conexión directa con Canva o CapCut.
- Que la IA escriba precios o textos dentro del video (ver sección 8).
- Sonido en los televisores.
- Convertir HEVC → H.264 dentro de la app (se avisa y se explica cómo hacerlo).
- Grabar video desde la app.

## 6. Orden de trabajo

1. Guardar en el TV (punto 10 del SPEC anterior): sin eso, los videos se comen la
   cuota de datos. Es además el arranque sin internet.
2. Subir + recortar + reproducir en el TV (puntos 1-5, 10-14). **Probar en un Quantic
   real antes de seguir.**
3. Precio encima y encuadre (7-9).
4. Unir clips (6).
5. Generar videos con IA (Higgsfield, sección 8).

## 7. Verificación

- Banco de pruebas en memoria (como `/login/preview-ofertas`) con videos de muestra
  H.264 y HEVC: el HEVC tiene que dar el aviso.
- Navegador real: la placa de video dura lo del recorte, empieza y termina donde
  dice, pasa a la siguiente, y un video roto se saltea.
- Capturas con precio arriba y abajo, en TV parado y acostado, y en el celular.
- Prueba en un televisor del local con un video filmado con el celular.

## 8. Videos generados con IA (Higgsfield)

Agregado el 18/10/2026 a pedido del usuario. Es lo que se buscaba en el primer pedido:
que la app "haga videos por sí sola".

17. En una placa de video, **"Generar video con IA"**: se elige una foto (del producto o
    una ya subida) y se describe el movimiento ("la costilla girando, humo de parrilla").
    Formato del TV de destino: vertical 9:16 o apaisado 16:9.
18. El pedido lo hace **nuestro servidor** con la API de Higgsfield (pago por uso,
    saldo prepago en dólares). La clave va en una variable de entorno de Vercel y nunca
    llega al navegador. La generación es asíncrona: el admin muestra "generando…" y
    se entera solo cuando termina.
19. Higgsfield guarda lo generado como mínimo 7 días: al terminar, el video **se copia
    a nuestro almacenamiento** y desde ahí lo usa el TV.
20. **El precio nunca lo escribe la IA**: los generadores deforman números. El video
    sale sin texto y el precio lo dibuja la app encima (punto 8), nítido y editable.
21. **Nada generado va directo a los TVs**: queda como borrador hasta que alguien lo
    revisa y lo activa.
22. **Tope de gasto** mensual configurable en el admin, con el gasto del mes a la
    vista y el costo estimado antes de generar (ej. 10 s en Kling 3.0 ≈ US$1,12, según
    los precios publicados en octubre de 2026). Al llegar al tope, el botón se desactiva.
23. Requiere que el usuario cree la cuenta de desarrollador, cargue saldo y pegue la
    clave en Vercel. El modelo concreto se elige probando 2 o 3 con fotos reales del
    local antes de fijarlo.

## 9. Estado

- **Paso 1 (guardar en el TV): hecho** el 18/10/2026, ver SPEC-cartel-tv-en-vivo.md, punto 28.
- **Paso 2 (subir, recortar, reproducir): hecho** el 18/10/2026, commit `989f882`, migración
  029 aplicada. Los tramos ya admiten varios clips en la base y en el TV (probado); falta la
  interfaz para unirlos (paso 4). Se verifica con `verificar:cartel-videos` (admin en el banco,
  TV contra la base con una pantalla apartada) y `verificar:cartel-videos-calculos`.
  **Pendiente: probar en un Quantic real con un video filmado con el celular.**
- **Paso 3 (encuadre y precio encima): hecho** el 18/10/2026, migración 030 aplicada.
  `video_encuadre` (entero / llenar), `video_foco` (inicio / centro / fin) y `video_texto`
  (ninguno / arriba / abajo). La banda usa los datos de oferta de la misma placa; en TV
  acostado se achica (46% del alto con precio anterior y unidad). Previa parado/acostado.
- **Paso 4 (unir clips): hecho** el 18/10/2026. Cada clip con su recorte, se agrega otro video
  al final, se reordena, se saca, y "Sumar otra parte de este video" usa dos tramos del mismo
  archivo sin subirlo dos veces. Aviso si el total pasa de un minuto. Sin migración nueva.
- **Queda: paso 5 (Higgsfield)**, que espera la cuenta y la clave del usuario.
