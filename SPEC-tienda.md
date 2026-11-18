# SPEC — Tienda online, etapa 1: el circuito completo

Base: `replica/recon.md`, `replica/architecture.md`, `replica/design/` (aprobados el 18/11/2026).

Pedido del usuario: una web para el súper, tomando como modelo a Día Online, con pedidos por
**WhatsApp**, **retiro o envío**, catálogo desde el **Excel de XRP** (hoja "Productos web") y que
**lo que va por kg muestre el precio por kilo**. Vive dentro del sistema actual.

Etapa 1 = el circuito de punta a punta, funcional aunque sea simple. Lo lindo viene en la 2.

## Requisitos

### Base (migración `supabase/033_tienda.sql`, la aplica el usuario a mano)

1. Las 7 tablas de `replica/schema.sql`, más `token` en `tienda_pedidos` para ver el pedido
   después sin login.
2. `anon` lee sólo productos visibles, del último Excel, de categorías visibles, y sólo con la
   tienda **abierta**. `anon` no lee ni escribe pedidos, importaciones ni nada de admin.
3. `tienda_importar(filas, archivo, aplicar)`: en **una transacción** compara el Excel con lo
   cargado y devuelve el resumen (nuevos, cambian de precio, iguales, ya no vienen, ejemplos).
   Con `aplicar = false` no cambia nada (vista previa). Con `aplicar = true`:
   - inserta o actualiza por código XRP lo que viene de XRP;
   - **no pisa** nombre web, categoría corregida a mano, foto, tachado ni pausado;
   - lo que no vino queda oculto (`en_ultima_importacion = false`), **no se borra**;
   - crea las categorías nuevas; "Cigarrillos" nace oculta;
   - guarda el registro de la importación.
   Sólo la puede usar un usuario activo del sistema.
4. `tienda_crear_pedido(p)`: la única escritura pública. Rechaza si la tienda está cerrada, si
   el carrito está vacío o tiene más de 100 líneas, si un producto no está disponible, si una
   cantidad no es válida (unidades enteras 1–99; pesables de 0,1 a 10 kg) o si el mismo teléfono
   hizo más de 5 pedidos en 10 minutos. **Toma los precios de la base**, no del navegador.
   Devuelve número, token, líneas con precio y total, y si el total es aproximado.
5. `tienda_ver_pedido(numero, token)`: devuelve el pedido sólo con el token correcto.

### Importar el Excel (`/catalogo`, con login)

6. Se elige el `.xlsx`; se lee **en el navegador** (sin subir el archivo a ningún lado) y se usa
   la hoja **"Productos web"**. Si no está, se avisa y se listan las hojas que hay.
7. Se valida cada fila: código, nombre, precio > 0, "Se vende por" kg/unidad. Las filas malas
   se saltean y se listan con el motivo; códigos repetidos también.
8. Se infiere:
   - **pesable** = se vende por kg **y** el código de barras es corto (PLU, menos de 8 dígitos);
     un kg con código largo (EAN) es un paquete de 1 kg y se pide por unidad;
   - el texto de búsqueda (nombre + marca + presentación, sin acentos, minúsculas);
   - los acentos que el Excel trae como `&#243;` se decodifican.
9. Antes de aplicar se ve la **vista previa** con los números del punto 3 y ejemplos de cambios
   de precio. Un precio que cambia más de 50% se marca para revisar. Recién con "Aplicar" se
   guarda, y la tienda muestra los precios nuevos al instante.
10. Configuración mínima en la misma pantalla: número de WhatsApp, dirección de retiro,
    tienda abierta/cerrada.

### Tienda (`/tienda`, pública)

11. Abre sin login y sin pasar por la validación de sesión. Con la tienda cerrada muestra
    "Estamos preparando la tienda" y nada más.
12. Lista de productos en tarjetas (2 columnas en celular), con filtro por categoría y
    "Mostrar más" de a 40.
13. Buscador que no distingue acentos ni mayúsculas y exige todas las palabras
    ("leche ent" encuentra "Leche entera"). Sin resultados, lo dice.
14. Precio: lo que va por kg muestra **"$ X /kg"**; con presentación legible, el precio por
    litro o por kilo; nombres en MAYÚSCULAS en tipo oración; "+18" en bebidas con alcohol.
15. "Agregar" y − cantidad + desde la tarjeta. Pesables en gramos (pasos de 100 g en fiambres
    y quesos, 250 g en el resto). El contador del carrito se actualiza.
16. El carrito se guarda en el navegador (sobrevive a recargar), guarda **códigos y
    cantidades, no precios**, y si un producto ya no está lo saca y lo avisa.

### Pedido

17. `/tienda/carrito`: líneas con cantidad editable y subtotal; total, marcado "aprox." si hay
    pesables, con la explicación de la balanza.
18. Formulario: nombre, teléfono (sólo dígitos, 8 a 15), retiro o envío (envío pide dirección),
    forma de pago (efectivo, transferencia, tarjeta), nota opcional. Errores al lado del campo.
19. "Enviar por WhatsApp": guarda el pedido (req. 4), abre `wa.me/<número>` con el mensaje
    armado (número de pedido, líneas, total, entrega, pago, datos) y lleva a la pantalla de
    pedido enviado; el carrito se vacía.
20. `/tienda/pedido/<número>?t=<token>`: "¡Listo!", resumen y botón para volver a abrir
    WhatsApp por si no se abrió.

### General

21. Funciona a 375 px sin scroll horizontal; botones de al menos 44 px; foco visible.
22. Sin errores en la consola. Tipos y lint sin errores.

## Lo que asumo yo (corregible)

23. El envío en esta etapa no tiene zonas ni costo: el mensaje dice "costo de envío a
    confirmar". Zonas, costos y mínimo van en la etapa 2.
24. El admin vive en `/catalogo` (privado). En esta etapa sólo importa y configura; editar
    productos uno por uno (foto, nombre, categoría, oferta) es la etapa 2.
25. "Bebidas con alcohol" lleva +18; "Cigarrillos" arranca oculta (Ley 26.687).

## Fuera de alcance de la etapa 1

Fotos, ficha de producto, inicio con carruseles, zonas de envío, horarios, búsqueda con
errores de tipeo, admin de pedidos, editar productos, pago online.

## Verificación

26. `npm run verificar:tienda-formato`, `verificar:tienda-contraste`: unidades.
27. `npm run verificar:tienda-importar`: lector de Excel (comprimido y sin comprimir), hoja
    faltante, filas malas, pesables, acentos; y la hoja real del usuario si se pasa la ruta.
28. `npm run verificar:tienda-pedido`: mensaje de WhatsApp, búsqueda, carrito.
29. `npm run verificar:base-tienda`: con la migración aplicada, RLS y las tres funciones contra
    Supabase (datos de prueba que se borran al final).
30. `npm run verificar:tienda`: navegador real, celular y escritorio, con capturas.
