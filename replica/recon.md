# Mapa de reconocimiento: tienda online de supermercado (web, celular primero)

Modelo principal: **Día Online** (tienda de un solo supermercado).
Referencia de experiencia de pedido: **PedidosYa** (sólo patrones generales, ver Fuentes).
Alcance: catálogo con buscador y ofertas, carrito, y pedido que se envía por WhatsApp con
retiro en el local o envío a domicilio.
Para: la web pública de El Nuevo Rural, dentro del sistema actual (mismo proyecto Next.js y
misma base Supabase).
Fecha: 2026-11-18

## Decisiones del usuario (18/11/2026)

1. **Pedidos por WhatsApp.** Sin pago online en esta etapa: el carrito arma el mensaje y abre
   WhatsApp con el número del súper.
2. **Retiro en el local y envío a domicilio**, a elección del cliente.
3. **Catálogo completo**, idealmente desde lo que ya se carga en el sistema.
4. **Vive dentro del sistema actual**, en una parte pública sin login.

> **Hallazgo que cambia el punto 3:** `/precios` es sólo una calculadora y **no guarda
> productos** (SPEC-precios.md lo deja fuera de alcance). En la base no hay ninguna tabla de
> productos de góndola: lo más parecido son `cartel_placas` (ofertas con foto y precio) y
> `carniceria_cortes`. Por eso el catálogo necesita una tabla nueva y una forma de cargarla
> (a mano, o importada desde el sistema de caja si exporta Excel/CSV). Lo decide
> /replica-architect con el usuario.

## Fuentes

| # | fuente | URL | notas |
| --- | --- | --- | --- |
| 1 | Día Online, inicio | https://diaonline.supermercadosdia.com.ar/ | recorrida en navegador, sin cuenta |
| 2 | Día Online, búsqueda "leche" | https://diaonline.supermercadosdia.com.ar/leche?_q=leche&map=ft | grilla, orden y filtros |
| 3 | Día Online, ficha de producto | https://diaonline.supermercadosdia.com.ar/leche-infantil-la-serenisima-baby-3-200-ml-22729/p | precio, promo, descripción |
| 4 | PedidosYa | https://www.pedidosya.com.ar/ | **bloqueado**: pide confirmar que sos humano (403). No se salteó. Se usan sólo patrones públicos conocidos, con confianza baja |
| 5 | Sistema propio | `supabase/014_cartel.sql`, `023_ofertas_flyer.sql`, `SPEC-ofertas.md` | ofertas ya cargadas con foto, precio y vigencia |

No se recorrieron: el carrito y el checkout de Día (el botón "Agregar" no respondió en el
navegador de prueba, y el checkout pide cuenta), ni nada de PedidosYa.

## El circuito central

El cliente encuentra lo que necesita (buscando u hojeando ofertas), lo suma al carrito y manda
el pedido en un par de toques, eligiendo si lo retira o se lo llevan.

## Pantallas

| ID | pantalla | ruta / cómo se llega | para qué | componentes clave | estados vistos |
| --- | --- | --- | --- | --- | --- |
| S01 | Inicio | `/` | vidriera: ofertas y destacados | encabezado fijo (logo, "Elegí tu envío", buscador, cuenta, carrito), carrusel de banners, fila de círculos de promo por categoría ("Hasta 35% Cif"), carruseles de productos ("Especial de la Semana", "Destacados de la semana", "¡Exclusivo Online!") con "Ver más", términos más buscados | lleno |
| S02 | Menú de categorías | ícono ☰ del encabezado | navegar por Departamento → Categoría → Subcategoría | cajón lateral | no visto (inferido de las migas de pan y filtros) |
| S03 | Resultados / listado | buscador o categoría (`/leche?_q=leche&map=ft`) | elegir entre muchos productos | migas de pan, "Ordenar por", "Filtrar", grilla de tarjetas, "Patrocinado", "Mostrar más" (paginado por botón) | lleno; vacío ("SIN SUGERENCIAS" en el autocompletado) |
| S04 | Panel de filtros | botón "Filtrar" en S03 | acotar resultados | Subcategoría, Categoría, Departamento, Marca ("Ver más 36"), Sin TACC, rango de precio, "Limpiar" / "Aplicar" | lleno |
| S05 | Ficha de producto | clic en una tarjeta (`/<slug>-<id>/p`) | ver detalle y agregar | migas de pan, marca, código, foto grande, precio con tachado y % de descuento, precio por litro/kilo, precio sin impuestos nacionales, "Agregar", favorito, descripción, "Buscá tu tienda más cercana", "Promociones bancarias" | lleno |
| S06 | Elegir envío | "Elegí tu envío" en el encabezado | retiro en tienda o envío a domicilio y zona | modal | no visto (no abrió) |
| S07 | Carrito | ícono de carrito | revisar y ajustar cantidades | cajón lateral con líneas, +/−, subtotal, aviso "¡Tu pedido alcanzó la capacidad para envío express!" | no visto (el texto del aviso está en la página) |
| S08 | Checkout | desde el carrito | datos, entrega, pago | — | no visto (pide cuenta). **En el clon lo reemplaza S08' "Enviar pedido"** |
| S09 | Cuenta / ingresar | ícono de persona | login, pedidos, favoritos | — | no visto. **Fuera de alcance** (ver abajo) |

Pantallas propias del clon (no existen en Día así):

| ID | pantalla | para qué |
| --- | --- | --- |
| S08' | Enviar pedido | nombre, teléfono, retiro o envío (dirección y zona), forma de pago en la entrega, nota; resumen; botón "Enviar por WhatsApp" |
| S10 | Pedido enviado | confirmación, qué pasa ahora, "volver a la tienda"; el carrito se vacía |
| S11 | Admin de catálogo | dentro del sistema, con login: productos, categorías, fotos, precios, activo/pausado |
| S12 | Admin de la tienda | número de WhatsApp, horarios, zonas y costo de envío, mínimo de compra, texto del retiro |

## Flujos

```
F01 Cliente busca un producto y lo agrega
    S01 -> (buscador) S03 -> "Agregar" -> contador del carrito
    clics del camino feliz: 3 (tocar buscador, escribir + Enter, Agregar)
    borde: sin resultados, error de tipeo ("lehe"), producto sin stock/pausado

F02 Cliente aprovecha una oferta del inicio
    S01 -> "Agregar" en el carrusel de ofertas
    clics: 1
    borde: oferta vencida mientras navegaba, promo "3x2" / "llevando 2" que depende de la cantidad

F03 Cliente navega por categoría y filtra
    S01 -> S02 -> S03 -> S04 -> S03 -> S05 -> "Agregar"
    clics: ~6
    borde: filtros que dejan 0 resultados, volver atrás y perder los filtros

F04 Cliente manda el pedido con retiro en el local      (propio del clon)
    S07 -> S08' (retiro) -> "Enviar por WhatsApp" -> S10
    clics: 3 + escribir nombre y teléfono
    borde: carrito vacío, WhatsApp no instalado (en compu abre WhatsApp Web), fuera de horario

F05 Cliente manda el pedido con envío a domicilio       (propio del clon)
    S07 -> S08' (envío: dirección, zona) -> "Enviar por WhatsApp" -> S10
    clics: 4 + escribir dirección
    borde: zona sin envío, no llega al mínimo, costo de envío que cambia el total

F06 Encargado actualiza un precio o pausa un producto   (propio del clon)
    S11 -> producto -> guardar
    borde: foto pesada, precio en 0, producto duplicado

F07 Encargado marca una oferta (patrón PedidosYa/Día: precio tachado y %)
    reutiliza las ofertas de /cartel/admin: lo que va al TV y al flyer puede ir a la web
```

Número a superar: **3 toques del inicio a un producto en el carrito; 3 más hasta tener el
pedido en WhatsApp.** Día necesita cuenta para comprar; el clon no.

## Componentes

| componente | variantes | estados | se usa en |
| --- | --- | --- | --- |
| Encabezado | fijo, con buscador | normal, con carrito con productos | todas |
| Buscador | con autocompletado y "más buscados" | vacío, escribiendo, sin sugerencias | S01, S03 |
| Tarjeta de producto | normal, con oferta (tachado + %), con promo por cantidad ("3x2", "llevando 2 a $X c/u"), patrocinado | normal, en el carrito (− cant +), sin stock | S01, S03 |
| Carrusel de productos | con título y "Ver más" | lleno | S01 |
| Banner | carrusel con puntos | — | S01 |
| Círculo de promo por categoría | imagen + "Hasta X%" + nombre | — | S01 |
| Migas de pan | — | — | S03, S05 |
| Ordenar | relevancia, precio, nombre | — | S03 |
| Panel de filtros | listas con "Ver más", rango de precio | aplicado, limpio | S04 |
| Precio | grande; tachado; % en etiqueta; por kilo/litro; sin impuestos nacionales | — | tarjeta, S05, S07 |
| Botón "Agregar" | primario rojo | normal, cargando, convertido en − cant + | tarjeta, S05 |
| Cajón (drawer) | izquierda (menú), derecha (carrito) | abierto, cerrado | S02, S07 |
| Modal | elegir envío | — | S06 |
| Aviso (toast) | "agregado", "capacidad de envío alcanzada" | — | todas |
| Botón flotante de ayuda | asistente con contador | — | todas |

## Modelo de datos inferido

```
Producto   id, nombre, marca, codigo_barras (EAN), slug, descripcion, foto,
           precio, precio_anterior (tachado), unidad_medida (kg|lt|ud), contenido (473 ml),
           sin_tacc, activo, categoria_id
           evidencia: S03 tarjetas, S05 ficha ("REFERENCIA: 7795323775515", "Precio por 1 LT")
           confianza: alta

Categoria  id, nombre, padre_id (Departamento > Categoría > Subcategoría), orden
           evidencia: migas de pan de S05, filtros de S04
           confianza: alta (Día usa 3 niveles; para un súper de barrio alcanza con 1 o 2)

Promo      tipo (descuento % | NxM "3x2" | precio por cantidad "llevando 2 a $X"), valor,
           desde, hasta, productos
           evidencia: S01, S03
           confianza: media. En el clon arranca simple: precio_anterior + precio, y las
           ofertas de cartel_placas (que ya tienen vigencia)

Coleccion  titulo ("Especial de la semana"), productos, orden
           evidencia: carruseles de S01
           confianza: media

Pedido     (propio del clon) id, nombre, telefono, entrega (retiro|envio), direccion,
           zona_id, costo_envio, pago_en_entrega (efectivo|transferencia|tarjeta), nota,
           lineas [producto_id, nombre, precio, cantidad], total, estado, creado
           evidencia: decisión del usuario (WhatsApp, retiro y envío)
           confianza: suposición. Guardarlo es opcional: con WhatsApp solo, no hace falta;
           guardarlo da historial y permite ver qué se pide

ZonaEnvio  nombre, costo, minimo, activa
           confianza: suposición

ConfigTienda  whatsapp, horarios, direccion_retiro, texto_aviso
           confianza: suposición
```

Relaciones: Categoria 1-n Categoria (subcategorías); Categoria 1-n Producto;
Coleccion n-n Producto; Pedido 1-n LineaPedido; ZonaEnvio 1-n Pedido.
Puente con lo existente: `cartel_placas` (ofertas) podría enlazarse a un Producto.

## Matriz de funciones

Ver `features.csv`. Must: 17, should: 11, could: 5, skip: 7.

## Fuera de alcance (no se puede o no conviene copiar)

- La marca, el logo, los colores exactos, las fotos y los textos de Día. Se arma todo propio.
- El volumen de su catálogo (miles de productos) y las fotos de producto de Día.
- Productos "Patrocinados" y "Exclusivo Online": son acuerdos comerciales con marcas.
- Promociones bancarias: son convenios con bancos.
- Club Día / precios para socios: programa de fidelidad con su propia base.
- "Buscá tu tienda más cercana": hay un solo local.
- Cuentas de cliente, favoritos e historial: posibles más adelante; para pedir por WhatsApp
  no hacen falta y agregan fricción.
- Pago online (Mercado Pago): segunda etapa, por decisión del usuario.

## Tamaño

Pantallas 9 públicas + 2 de admin, flujos 7, entidades 6. Partes difíciles:

1. **Cargar el catálogo**: no hay lista de productos en el sistema. Fotos y precios de cientos
   de productos son el trabajo grande, más que el código.
2. **Mantener los precios al día** sin cargar dos veces (caja y web).
3. **Buscador que perdone errores** de tipeo y acentos ("lehe", "azucar") rápido en el celular.

Tamaño: **M** (unas semanas), si el catálogo arranca chico y crece. El código solo es S/M.
