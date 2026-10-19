# Vincular cada televisor a su sector

Continuación de `SPEC-cartel-tv-en-vivo.md`. Pedido del 19/10/2026: "que identifiquemos
cuál es cada tele, para que queden bien sectorizados". Hoy casi todas las teles siguen
con cdenet: se van a pasar a la app de a una, y cada una tiene que quedar con su sector
(Carnicería 1-3, Pollería 1-3, Fiambrería 1-2, Pasillo, Acceso) sin confusiones.

## 0. Decisión de fondo

**Vincular con un código, como Netflix** (elegido por el usuario). En vez de tipear con
el control una dirección distinta en cada tele (`/cartel/tv/polleria-2`), todas se cargan
con la misma dirección corta, **`el-nuevo-rural.vercel.app/tv`**. Una tele sin asignar
muestra un código de 4 cifras; parado frente a ella, desde el celular, se elige en el
admin a qué pantalla corresponde. La asignación se puede cambiar después sin ir hasta la tele.

La tele recuerda quién es en su propio navegador (una clave al azar guardada en
`localStorage`). Si alguien le borra los datos, vuelve a mostrar un código y se vincula
de nuevo.

## 1. En el televisor

1. `/tv` es pública (sin login), igual que `/cartel/tv/<slug>`.
2. La primera vez, la tele genera su clave, se presenta al servidor y recibe un **código
   de 4 cifras** que no cambia mientras no se vincule (si se reinicia, muestra el mismo).
   Los códigos no usan 6 ni 9, que se confunden en una tele montada parada.
3. La pantalla del código muestra, en grande: el código, "Entrá a /cartel/admin →
   Pantallas → Vincular" y el tamaño de la pantalla. Se lee en una tele parada o acostada.
4. Mientras espera, consulta cada 5 segundos. Al quedar vinculada pasa sola a
   `/cartel/tv/<slug>`, sin tocar el control.
5. Una tele ya vinculada que se prende y abre `/tv` va directo a su pantalla **sin
   esperar a la red** (lo sabe por lo guardado). Con eso sigue arrancando sin internet:
   `/tv` queda guardada por el service worker igual que la página del TV.
6. Con la pantalla ya andando, la tele consulta cada 15 segundos su asignación:
   - si en el admin la pasaron a otra pantalla, cambia sola;
   - si la desvincularon, vuelve a `/tv` y muestra un código nuevo.
   Sin internet no cambia nada: sigue con lo que tenía.
7. Las teles cargadas a mano con `/cartel/tv/<slug>` (la forma de hoy) siguen andando
   igual. No tienen clave, así que no se vinculan ni se reasignan solas, pero sí
   responden a "Identificar" (punto 10).

## 2. En el admin (`/cartel/admin`, sección Pantallas)

8. **Vincular:** se escribe el código que muestra la tele, se elige la pantalla y listo.
   Debajo se listan las **teles esperando vincularse** (código, tamaño de pantalla, hace
   cuánto se vio): si hay una sola, se ve cuál es sin tener que leer el código.
   Un código que no existe o ya está vinculado da un error claro.
9. En cada pantalla: cuántas teles tiene vinculadas y **Desvincular**. Se permite más de
   una tele por pantalla (dos teles mostrando lo mismo).
10. **Identificar:** botón en cada pantalla. Durante 30 segundos, toda tele que esté
    mostrando esa pantalla pone encima su nombre en grande ("POLLERÍA 2"). Llega en
    menos de 15 segundos. Al vincular una tele, se identifica sola para confirmar.

## 3. Seguridad

11. La tele no inicia sesión (rol `anon`). No escribe tablas directamente: solo a través
    de dos funciones de la base, que crean o leen únicamente su propia fila.
12. Vincular, desvincular e identificar son solo para usuarios del sistema.
13. Una tele no vinculada que no se ve hace 7 días se borra sola, para que nadie llene
    la tabla con códigos.

## 4. Fuera de alcance

- Que la tele elija su sector desde el control (se hace siempre desde el admin).
- Mostrar en el admin qué está viendo cada tele en este momento (ya existe el latido).
- Apagar o reiniciar teles a distancia.
- Pasar las teles de cdenet a la app: lo hace el usuario en el local, tele por tele.

## 5. Base de datos

Migración `031_cartel_dispositivos.sql` (se aplica a mano en Supabase):
- tabla `cartel_dispositivos` (clave, código, pantalla, visto, navegador, tamaño);
- `cartel_pantallas.identificar_hasta`;
- funciones `cartel_tv_hola` y `cartel_tv_estado` para el rol `anon`.

## 6. Verificación

- `verificar:base-cartel` extendido: un anónimo no puede leer ni modificar
  `cartel_dispositivos`, ni vincularse solo, ni ver la clave de otra tele.
- Script nuevo en navegador real (`verificar:cartel-vincular`): una tele nueva en `/tv`
  muestra un código; se vincula desde el admin; la tele pasa sola a su pantalla y
  muestra el nombre; "Identificar" lo vuelve a mostrar; reasignar la cambia de pantalla;
  desvincular la devuelve al código; con la red cortada, `/tv` lleva a la pantalla.
- Siguen pasando `verificar:pantallas`, `verificar:cartel-sin-internet` y
  `verificar:cartel-videos`.
- Capturas de la pantalla del código (parada y acostada) y del admin en celular y desktop.
- Prueba en una tele del local.

## 7. Estado

- **Hecho el 19/10/2026.** Migración 031 aplicada; la 032 (sacarle a `anon` el permiso de
  llamar a vincular e identificar) queda para pegar en Supabase.
- Verificado con `verificar:cartel-vincular` (admin en el banco, tele contra la base real y,
  con `PROBAR_SIN_INTERNET=1` contra la versión compilada, `/tv` sin internet),
  `verificar:cartel-vincular-calculos` y `verificar:base-cartel`.
- Hallazgo al probar sin internet: la primera carga de `/tv` ocurre antes de que exista el
  guardado, así que `/tv` le pasa sus archivos al service worker, y la pantalla le agrega
  `/tv` a lo que guarda.
- **Pendiente:** prueba en una tele del local.
