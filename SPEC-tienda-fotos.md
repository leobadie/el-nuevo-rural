# SPEC — Tienda online: fotos de productos desde Open Food Facts

Pedido del usuario (18/11/2026): «recopilar las fotos de todos los productos publicados».
Decisión: buscar automáticamente en **Open Food Facts** (base pública, fotos con licencia
CC BY-SA) por código de barras, y que **el usuario revise cada foto antes de publicarla**.
Medido sobre 80 productos al azar: 36 tienen foto (45 %) → unas 900 de 2.014 con código.

## Requisitos

### Base (migración `supabase/034_tienda_fotos.sql`, la aplica el usuario)

1. `tienda_fotos_busquedas`: una fila por producto consultado (resultado: `con_foto`,
   `sin_foto`, `no_esta`, `error`, y cuándo), para no volver a preguntar lo mismo.
2. `tienda_fotos_sugeridas`: foto encontrada, guardada en nuestro almacenamiento, con el
   nombre que tiene en Open Food Facts (para comparar), la URL de origen, el crédito y el
   estado `pendiente` / `aceptada` / `descartada`. Una por producto y fuente.
3. `tienda_productos.foto_credito`: de dónde salió la foto publicada.
4. `tienda_decidir_foto(id, aceptar)`: en una transacción, acepta (pone la foto y el
   crédito en el producto) o descarta. Sólo un usuario activo. Aceptar no pisa una foto
   que el producto ya tenga cargada a mano, salvo que se pida.
5. Nada de esto se ve sin login.

### Búsqueda (`npm run tienda:fotos`, corre en la compu del usuario)

6. Recorre los productos publicados con código de barras de 8 a 14 dígitos, sin foto y
   sin búsqueda previa. Excluye cigarrillos. `--limite N` para probar con pocos;
   `--reintentar-errores` vuelve a probar los que dieron error.
7. Consulta `world.openfoodfacts.org/api/v2/product/<código>` de a uno, con pausa entre
   pedidos y espera larga si responde 429 (exceso de pedidos). Identificación genérica,
   sin datos del usuario.
8. Usa la foto de frente en 400 px (la que Open Food Facts ya ofrece achicada); la baja y
   la sube a `tienda/off/<código XRP>.jpg`. Si no es una imagen o pesa más de 1 MB, la
   descarta y lo anota.
9. Se puede cortar y retomar: lo ya consultado no se repite.
10. Al final muestra cuántas encontró, cuántas no, y errores.

### Revisión (`/catalogo`, con login)

11. Sección "Fotos sugeridas" con contador de pendientes y una grilla: nuestra foto
    candidata, **nuestro nombre** y el **nombre en Open Food Facts**, y botones
    **Usar** / **Descartar**. De a 24 por página.
12. "Usar todas las de esta página" para ir rápido cuando están todas bien.
13. Al decidir, la tarjeta sale de la lista y la tienda se actualiza (como al importar).

### Tienda

14. La tarjeta muestra la foto aceptada. En el pie: "Algunas fotos de productos: Open Food
    Facts (CC BY-SA)" con enlace, sólo si hay alguna publicada de esa fuente.

## Fuera de alcance (etapa 2, después)

Sacar fotos con el celular desde `/catalogo`, fotos genéricas de lo que se pesa, editar
productos uno por uno.

## Verificación

15. `npm run verificar:tienda-fotos`: elegir la foto de la respuesta de Open Food Facts,
    validar imagen, ritmo y reintentos (sin red).
16. `npm run verificar:base-tienda-fotos`: RLS y `tienda_decidir_foto` contra Supabase.
17. Lote real de 30 productos, revisado en el navegador (celular y escritorio) con capturas.
