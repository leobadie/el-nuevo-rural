# SPEC — Ofertas: televisores y flyer en un solo módulo

Hoy hay dos módulos que hacen algo parecido y se cargan por separado:

- **Cartel del local** (`/cartel/admin`, `SPEC-cartel.md` y `SPEC-cartel-pantallas.md`): placas
  guardadas en la base (`cartel_placas`) con título, precio, precio anterior, unidad, foto,
  sección, vigencia y a qué televisores van.
- **Flyer de ofertas** (`/flyer`, `SPEC-flyer.md`): productos con casi los mismos datos, pero
  guardados **sólo en el navegador** donde se armó.

La misma oferta se carga dos veces, y el flyer armado en la compu no está en el celular.

Decisiones del usuario (26/09/2026):
- **Una sola lista de ofertas.** Cada oferta se carga una vez; desde ahí se elige en qué
  televisores sale y si va al flyer.
- Después de unificar, se agregan cuatro opciones (fase 2): programar ofertas por fecha, más
  diseños de flyer, más productos por flyer y flyer para imprimir (A4).

## Fase 1 — Unificar

### Lo que pidió el usuario

1. **Una sola tarjeta en el inicio**, "Ofertas: televisores y flyer", en lugar de las dos. La de
   Flyer desaparece.
2. **Una sola lista de ofertas**: son las placas que ya existen en `cartel_placas`. Nada de lo
   cargado se pierde ni se vuelve a cargar.
3. Cada oferta tiene una casilla **"Va en el flyer"**, además de la elección de televisores que
   ya tiene.
4. El flyer se arma con las ofertas marcadas **que estén vigentes hoy** (misma regla que el TV:
   activa y dentro de su fecha desde/hasta). Una oferta que vence sale sola del flyer y del TV.

### Lo que asumo yo (corregible)

5. El módulo unificado vive en **`/cartel/admin`**, con tres pestañas: **Ofertas**, **Televisores**
   (lo que hoy es el panel de pantallas) y **Flyer**. Las direcciones públicas de los televisores
   (`/cartel` y `/cartel/tv/<slug>`) **no cambian**: están cargadas en el panel de Data
   Computación.
6. `/flyer` sigue existiendo como atajo: redirige a la pestaña Flyer, para que un marcador
   guardado no dé error.
7. Al flyer sólo van ofertas de tipo **oferta** (las que tienen nombre y precio). Las de tipo
   **imagen** (carteles ya diseñados, con el precio adentro) y los avisos institucionales no se
   pueden marcar: el flyer no tiene cómo dibujarlos.
8. La pestaña Flyer muestra las ofertas marcadas, **permite reordenarlas para el flyer** (orden
   propio, distinto del de rotación del TV) y quitarlas, y tiene la misma vista previa y los
   mismos botones de descarga de hoy (1080×1350 redes y 1080×1920 estado/TV). El arte no cambia.
9. El título, la sección, el texto de vigencia y los datos del pie (dirección, teléfono, horarios,
   Instagram) se guardan **en la base** (tabla nueva de una fila), así se ven igual desde cualquier
   dispositivo. La primera vez se traen los que haya guardados en ese navegador, para no perder lo
   que ya estaba escrito.
10. Los productos que hoy están guardados sólo en el navegador **no** se convierten en ofertas
    solos: si lo hicieran, aparecerían de golpe en los televisores. Se muestra un aviso con la
    lista, para marcarlos a mano.
11. Mientras hay más ofertas marcadas que el máximo del flyer (hoy 6), entran las 6 primeras en
    el orden del flyer y se avisa cuáles quedan afuera.
12. Permisos: los mismos que hoy tiene `/cartel/admin` (cualquier usuario activo).

### Datos (migración `supabase/023_ofertas_flyer.sql`, la aplica el usuario a mano)

- `cartel_placas`: columnas nuevas `en_flyer boolean not null default false` y
  `orden_flyer int not null default 0`.
- `flyer_config` (una sola fila): `titulo`, `seccion`, `vigencia`, `direccion`, `telefono`,
  `horarios`, `instagram`. RLS igual que `cartel_placas`.

### Verificación

13. Test de cálculos: qué ofertas entran al flyer (marcadas, vigentes, tipo oferta, orden, tope).
14. En el navegador (banco de pruebas): marcar una oferta la suma al flyer y a la vista previa;
    una vencida no entra; reordenar; descargar los dos formatos; `/flyer` redirige; en el
    celular nada se desborda. Capturas de escritorio y celular.
15. `verificar:base-cartel` ampliado: columnas y tabla nuevas, y que el TV sigue igual.
16. `npm run build` sin errores. Las pruebas del cartel y del flyer que ya existen siguen pasando.

## Fase 2 — Opciones nuevas (se detalla con el usuario antes de construir)

- **Programar ofertas por fecha**: el TV ya respeta "desde/hasta" y con la fase 1 el flyer
  también. Falta confirmar qué más se quiere (¿horario del día? ¿días de la semana?).
- **Más diseños de flyer**: cuáles.
- **Más productos por flyer**: hasta cuántos.
- **Flyer para imprimir (A4)**: PDF o imagen, color o blanco y negro.

## Fuera de alcance

- Cambiar el diseño de las placas del TV o del flyer (el de la fase 2 se define aparte).
- Publicar solo en el panel de Data Computación: sigue sin aceptar URLs, las imágenes se suben a
  mano.
