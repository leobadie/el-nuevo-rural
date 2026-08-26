# SPEC — Cartelería digital para los televisores del local

Pantallas verticales (tipo tótem) en el supermercado que muestran solas, en loop,
ofertas con precio, avisos y contenido institucional. El TV abre una URL a pantalla
completa; el contenido se edita desde el celular y se actualiza en todas las
pantallas sin tocar el televisor.

## 1. Qué se construye

1. **`/cartel`** — la pantalla que se ve en el TV. Rota las placas sola, sin
   intervención, para siempre. **Es pública: no pide login**, porque el televisor
   no tiene a nadie que escriba una contraseña.
2. **`/cartel/admin`** — el ABM de placas. Vive detrás del login, como el resto
   del sistema.

## 2. Requisitos verificables

### Pantalla del TV (`/cartel`)

1. Se ve a pantalla completa, sin barras de navegación, encabezados ni scroll.
2. Está diseñada para **9:16 vertical** (1080×1920). Todo el tablero escala
   proporcionalmente con la unidad `--u = min(100vw/1080, 100vh/1920)`, así se ve
   igual en un TV de 32" que en uno de 55" sin recortes ni desbordes.
3. Rota automáticamente entre las placas activas. Cada placa se muestra durante su
   `duracion_seg` (por defecto 8 s) y pasa a la siguiente con una transición suave.
4. Al llegar a la última placa vuelve a la primera: el loop **nunca termina y nunca
   queda en negro**.
5. Muestra siempre visibles: el logo de El Nuevo Rural, la hora y una barra de
   progreso que indica cuánto falta para la próxima placa.
6. Refresca los datos desde la base **cada 5 minutos**, sin recargar la página y
   sin cortar la animación. Una oferta cargada desde el celular aparece en el TV
   en 5 minutos como máximo.
7. **Si Supabase falla o no hay ninguna placa cargada, el cartel igual muestra
   contenido** (placas de demostración incluidas en el código). Un TV en negro en
   el salón de ventas no es un error aceptable.
8. Nunca muestra un mensaje de error técnico en pantalla: ante cualquier falla
   sigue rotando con lo último que tenía.

### Tipos de placa

9. **Oferta**: nombre del producto, precio grande, precio anterior tachado
   (opcional), unidad ("el kilo", "c/u"), foto (opcional) y el ahorro en % calculado
   solo cuando hay precio anterior.
10. **Institucional**: logo, título, bajada y foto opcional. Para marca, horarios,
    medios de pago.
11. **Aviso**: título y bajada sobre fondo de color, sin precio. Para "Aceptamos
    débito y crédito", cambios de horario, etc.

### Vigencia

12. Cada placa puede tener `vigencia_desde` / `vigencia_hasta`. Fuera de esa
    ventana **no se muestra**, sin que nadie tenga que acordarse de apagarla.
13. Una placa con `activa = false` no se muestra nunca.
14. El filtro de vigencia se evalúa también en el cliente en cada refresco, para
    que una oferta que vence a medianoche desaparezca sola con el TV prendido.

### Administración (`/cartel/admin`)

15. Requiere sesión iniciada (mismo login del sistema).
16. Permite crear, editar, activar/desactivar, reordenar y borrar placas.
17. Permite subir una foto por placa a Supabase Storage.
18. Muestra una **previsualización en vivo** de cómo queda la placa en el TV.
19. Tiene un botón para abrir `/cartel` en otra pestaña y mandarlo al televisor.

### Datos

20. Tabla `cartel_placas` en Supabase, con RLS:
    - **lectura pública (rol `anon`)**, limitada a placas activas — es lo que
      permite que el TV funcione sin login;
    - escritura solo para usuarios activos del sistema.
21. Bucket público `cartel` en Supabase Storage para las fotos.

## 3. Supuestos

- El TV se maneja con un Chromecast, Fire Stick, mini PC o el navegador del smart
  TV; cualquiera puede abrir una URL a pantalla completa.
- Hay conexión a internet en el local. Ante un corte breve, el cartel sigue
  rotando con los datos que ya tenía en memoria.
- Los precios se cargan a mano: el sistema actual no tiene catálogo de productos.
- Moneda: pesos argentinos, formato `$ 1.234` (sin decimales cuando es entero).

## 3 bis. Exportar para el panel de señalización

Los televisores no se manejan solos: los administra un panel externo
(`badie.cdenet.com.ar`, "Data Computacion"). Se revisó y **no acepta URLs**: una
zona solo admite Multimedia (imagen/video), Texto, Reloj, Clima o Noticias RSS.
Por eso el cartel no se puede enchufar como página y hay que exportarlo a archivo.

22. `npm run cartel:video` levanta `/cartel`, recorre las placas y guarda una
    imagen PNG de **1080×1920 exactos** por placa.
23. Si hay un `ffmpeg` con H.264, además arma el `.mp4` respetando la duración de
    cada placa. El ffmpeg que trae Playwright **no sirve** (solo encodea VP8).
24. `--rotar 90|180|270` genera copias giradas, porque el reproductor del panel
    no rota la imagen y algunos televisores están puestos de costado.
25. La captura usa `/cartel?fijo=N`, que congela la pantalla en una placa. En ese
    modo **no se muestran el reloj ni la barra de progreso**: en un archivo
    grabado el reloj quedaría congelado en una hora vieja.
26. El indicador flotante del servidor de desarrollo se oculta antes de capturar,
    para que no quede grabado en un rincón.

## 4. Fuera de alcance

- Subir el archivo al panel de señalización: se hace a mano desde Multimedia.
- Programar horarios por franja (ofertas distintas a la mañana y a la tarde).
- Panel por sucursal o por pantalla: todas las pantallas muestran lo mismo.
- Traer precios automáticamente desde un sistema de facturación.

## 5. Nota de seguridad

`/cartel` es una URL pública: cualquiera que la conozca ve las ofertas. Es
información que igual se exhibe en un televisor del salón, así que no se considera
un problema. La lectura pública está acotada por RLS **solo** a las placas activas
de `cartel_placas`; ninguna otra tabla del sistema queda expuesta.

## 6. Verificación

Al no haber suite de tests en el proyecto, se verifica con el navegador real sobre
el dev server:

- `/cartel` en 1080×1920 (vertical): rota, no desborda, no scrollea.
- Se confirma el avance automático comparando el contenido en dos momentos.
- La consola del navegador no muestra errores.
- El admin carga y muestra el formulario y la previsualización.
- Screenshots de la pantalla vertical y del admin en desktop y móvil.
