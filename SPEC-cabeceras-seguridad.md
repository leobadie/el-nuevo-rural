# SPEC — Cabeceras de seguridad HTTP

Objetivo: endurecer la app agregando cabeceras de seguridad estándar a todas las respuestas,
para reducir el riesgo de clickjacking, degradación a HTTP y confusión de tipos de archivo.
Surge de la revisión de seguridad del 26/11/2026 (a raíz de ARTEX): el `npm audit` quedó en 0,
pero la app no enviaba ninguna cabecera de seguridad.

Decisión: en este paso van solo las cabeceras de **bajo riesgo** (no rompen la app). La CSP
(Content-Security-Policy) y Permissions-Policy quedan **fuera de alcance** acá: son más potentes
pero delicadas y hay que probarlas con cuidado en un paso aparte.

## Pedido por el usuario

1. Todas las rutas (`/:path*`) devuelven estas cabeceras en la respuesta:
   1.1. `Strict-Transport-Security: max-age=63072000; includeSubDomains` — fuerza HTTPS (HSTS).
   1.2. `X-Frame-Options: SAMEORIGIN` — evita que la app se incruste en otra web (clickjacking).
   1.3. `X-Content-Type-Options: nosniff` — el navegador no adivina el tipo de archivo.
   1.4. `Referrer-Policy: strict-origin-when-cross-origin` — no filtra la URL completa a terceros.
2. Se agregan en `next.config.ts` con la función `headers()` (API estándar de Next 16.4).

## Verificable

3. En el navegador, la respuesta de `/login` y de `/tienda` trae las 4 cabeceras de R1.
4. La app sigue funcionando: `/login` y `/tienda` cargan sin errores de consola.
5. `npm run build` compila sin errores.

## Fuera de alcance

- Content-Security-Policy (CSP): paso aparte, probado.
- Permissions-Policy.
- Cabeceras por ruta distintas a las globales.
