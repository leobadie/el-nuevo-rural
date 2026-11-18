# Arquitectura: tienda online de El Nuevo Rural

Parte de `replica/recon.md` y `replica/features.csv`. Esquema en `replica/schema.sql`
(borrador; pasa a `supabase/033_tienda.sql` cuando se construya y lo aplica el usuario a mano).
Fecha: 2026-11-18

## 1. Stack

Se usa lo que ya tiene el sistema. Nada nuevo para instalar ni pagar.

| capa | elección | por qué |
| --- | --- | --- |
| web | Next.js 16.2 (App Router) + TypeScript, el mismo proyecto | ya deploya a Vercel (región gru1); la tienda comparte base y login del admin |
| estilos | Tailwind 4, con tokens que define /replica-design | ya está en el proyecto |
| base | Supabase Postgres, la misma | una sola base: el admin de ofertas y el catálogo se tocan |
| acceso | RLS de Postgres, mismo patrón que el cartel | `anon` sólo lee lo publicado; `is_usuario_activo()` administra |
| login del admin | Supabase Auth, el actual | los encargados ya tienen usuario |
| pedidos | enlace `wa.me` con el mensaje armado + copia en la base | decisión del usuario: sin pago online |
| fotos | Supabase Storage, bucket `tienda` público | igual que las fotos del cartel |
| lector de Excel | propio, sin dependencias (zip con `DecompressionStream` + XML) | el `.xlsx` de XRP es simple; evita sumar una librería pesada o con avisos de seguridad |
| búsqueda | en el navegador, sobre el catálogo completo | 2.219 productos son ~50 KB comprimidos; responde al instante y sin servidor |
| hosting | Vercel, el actual | — |

**Rutas:** la tienda vive en **`/tienda`**, pública por prefijo. El admin en **`/catalogo`**,
privado. Van separados a propósito: `/` es el panel interno, y abrir `/tienda/...` por prefijo
nunca debe abrir una pantalla de administración (la misma lección que `/cartel` y
`/cartel/admin`). Más adelante, un dominio propio (por ejemplo `tienda.<dominio>`) puede apuntar
a `/tienda` sin tocar el código.

## 2. Lo que dice el Excel (hoja "Productos web", 15/11/2026)

| dato | valor | qué implica |
| --- | --- | --- |
| productos | 2.219, código XRP único, sin repetidos | el código XRP es la clave para actualizar |
| se venden por kg | **237** | muestran **"$ X /kg"** (pedido del usuario) |
| …de esos, pesables (PLU corto) | 188: carnicería, fiambres, verdulería, sueltos | se piden en **gramos**; total "aproximado" |
| …de esos, paquetes de 1 kg (EAN largo) | 49: arroz, harina, yerba | se piden **por unidad**; muestran "$ X /kg" igual |
| sin marca | 283 | la tarjeta no muestra marca vacía |
| nombres en MAYÚSCULAS | 745 | se muestran en tipo oración ("ACEITE DE GIRASOL" → "Aceite de girasol"); el original queda guardado |
| categoría "Varios" | 165, con errores (aceitunas, condimentos) | la categoría se corrige a mano y **la importación no la pisa** |
| "En oferta" | **todas "No"** | las ofertas no salen del Excel: se marcan en el admin (precio anterior) |
| fotos y stock | no vienen | fotos: ver riesgo 1; stock: se asume que hay |
| Cigarrillos | 10 | **ocultos de entrada** (ver riesgo 4) |
| precio raro | "Amargo Patagónico cero 1,35 L" a $159,90 | la importación avisa precios sospechosos; no los corrige sola |
| texto | acentos guardados como `&#243;` | el lector los decodifica |

## 3. Esquema

7 tablas (`replica/schema.sql`):

- `tienda_productos`: lo de XRP (se pisa al importar) separado de lo de la web (nombre lindo,
  categoría corregida, foto, tachado, pausado: **no se pisa**). `fraccionable` distingue
  pesable de paquete de 1 kg. `en_ultima_importacion` en false oculta lo que ya no viene en
  el Excel: **se oculta, no se borra** (si vuelve, reaparece con su foto).
- `tienda_categorias`: se crean solas desde el Excel; `visible` y `orden` a mano.
- `tienda_importaciones`: historial de cada Excel subido, con nuevos, cambios de precio,
  retirados y filas con problemas.
- `tienda_config` (una fila): WhatsApp, horarios, dirección de retiro, mínimo, aviso,
  `abierta` (arranca **cerrada** hasta que el usuario la abra).
- `tienda_zonas_envio`: nombre, costo, mínimo.
- `tienda_pedidos` + `tienda_pedido_lineas`: copia de cada pedido, con precios y nombres
  congelados al momento de pedir.

Reglas en la base, no en la pantalla: precio > 0; tachado mayor que el precio (con
`is not null` explícito, ver la memoria de CHECK con nulos); sólo un `kg` puede ser
fraccionable; envío exige dirección; teléfono sólo dígitos.

Acceso: `anon` lee productos visibles, vigentes, de categorías visibles y sólo con la tienda
abierta; nunca lee pedidos. Los pedidos entran únicamente por la función
`tienda_crear_pedido`, que **recalcula los precios desde la base**.

## 4. Rutas y acciones

### F01–F03: ver y buscar (público)

| método ruta | qué hace | quién | entrada | salida |
| --- | --- | --- | --- | --- |
| GET `/tienda` | inicio: ofertas, categorías, buscador | todos | — | página (se regenera al importar) |
| GET `/tienda/c/[slug]` | categoría con orden y filtro por marca | todos | `?orden=` | página |
| GET `/tienda/p/[codigo]` | ficha de producto | todos | — | página |
| GET `/tienda/catalogo.json` | catálogo liviano para buscar en el navegador | todos | — | JSON, cacheado, se invalida al importar |

### F04–F05: pedir (público)

| método ruta | qué hace | quién | entrada | salida |
| --- | --- | --- | --- | --- |
| — | carrito | navegador (`localStorage`, con try/catch) | — | — |
| GET `/tienda/pedido` | formulario: nombre, teléfono, retiro/envío, zona, pago, nota | todos | — | página |
| acción `enviarPedido` | valida, llama a `tienda_crear_pedido`, arma el texto | todos, con límite por IP | formulario + líneas | número, total, enlace `wa.me` |
| GET `/tienda/pedido/[numero]` | "Pedido enviado", reabrir WhatsApp | quien lo creó (token en la URL) | — | página |

### F06–F07: administrar (`/catalogo`, con login)

| método ruta | qué hace | quién | flujo |
| --- | --- | --- | --- |
| GET `/catalogo` | productos: buscar, filtrar sin foto / sin categoría / ocultos | usuario activo | F06 |
| acción `importarExcel` | lee la hoja "Productos web", muestra **vista previa de cambios**, confirma y aplica | usuario activo | F06 |
| acción `guardarProducto` | nombre web, categoría, foto, tachado, pausar | usuario activo | F06, F07 |
| GET `/catalogo/pedidos` | pedidos de la web y su estado | usuario activo | — |
| GET `/catalogo/tienda` | WhatsApp, horarios, zonas, mínimo, abrir/cerrar | usuario activo | — |

Sin webhooks ni tareas programadas en esta etapa. Al importar se regeneran las páginas de
`/tienda` (`revalidatePath`/`revalidateTag`; ver la guía de caché de Next 16 antes de escribirlo).

## 5. Las partes que muerden

- **Fotos (la más grande).** Hay 2.219 productos y ninguna foto. Plan: tarjeta prolija sin foto
  (inicial y color por categoría); subir fotos desde el celular en el admin, empezando por los
  más vendidos y las ofertas; opcional, sugerir fotos por código de barras desde Open Food Facts
  (base pública; pide citar la fuente).
- **Pesables.** El cliente pide "500 g de paleta" pero el precio final depende de la balanza.
  El total se muestra como **aproximado** y el WhatsApp lo dice. Paso de 100 g (mínimo 100 g)
  para fiambres y quesos; de 250 g para carne, pollo, verdura y sueltos. Atajos ¼, ½ y 1 kg.
- **Que el Excel no rompa nada.** Siempre vista previa antes de aplicar ("312 cambian de precio,
  14 nuevos, 9 ya no vienen"); la importación es una sola transacción; filas malas se saltean y
  se listan; un precio que cambia más de 50% se marca para revisar.
- **Cigarrillos y alcohol.** La Ley 26.687 prohíbe publicitar y promocionar tabaco por cualquier
  medio, internet incluido: la categoría arranca oculta. El alcohol se vende sólo a mayores de
  18 (Ley 24.788): aviso en esas tarjetas y en el pedido.
- **Precio por unidad de medida.** La normativa de exhibición de precios pide mostrar el precio
  por kilo o litro. Para los "por kg" sale directo; para el resto se calcula de la presentación
  ("1x1500 cc" → $/litro) cuando se puede leer.
- **Pedidos basura.** La única escritura pública es una función que valida todo; límite de
  pedidos por IP y por teléfono; sin datos sensibles (no hay pagos).
- **Precios viejos en el celular del cliente.** El carrito guarda códigos y cantidades, no
  precios: al abrir el pedido se recalcula con los precios del momento y se avisa si algo cambió
  o ya no está.
- **Fecha y horario.** "Fuera de horario" se calcula en hora de Argentina, no en UTC (ver
  `hoyISO()` en `src/lib/fechas.ts`).
- **Celular.** Todo pensado a 375 px primero; nada de anchos mínimos internos que estiren la
  página (lección del body flex).

## 6. Orden de construcción

Cada etapa termina verificada en el navegador (celular y escritorio) con capturas, y con
`SPEC-tienda.md` como lista de requisitos.

**Etapa 1. Circuito completo, feo (prueba el stack)**
- Migración 033 (la aplica el usuario). Lector de Excel + importación con vista previa.
- `/tienda` con lista y buscador, "Agregar", carrito, formulario y WhatsApp. Pesables en gramos.
- Pantallas: S01 (simple), S03, S07, S08', S10, S11 (sólo importar). Tablas: todas.
- Listo cuando: subo el Excel, busco "leche", agrego 2 y 500 g de queso, y me abre WhatsApp
  con el pedido y el total correcto.

**Etapa 2. Imprescindibles**
- Categorías y navegación (S02), ficha de producto (S05), precio /kg y tachado, nombres en tipo
  oración, búsqueda que perdona acentos y errores, admin de producto (foto, categoría, nombre,
  pausar), config de la tienda y zonas (S12), retiro/envío con costo y mínimo, horario.

**Etapa 3. Recomendables**
- Inicio con carruseles y banner (con las placas del cartel), orden y filtros, precio por
  litro/kilo calculado, admin de pedidos con estados, importación desde Excel con avisos de
  precios raros, fotos sugeridas por código de barras.

**Etapa 4. Lo que encuentre /replica-entrepreneur** en las reseñas de Día y PedidosYa.

## Resumen

- Stack: el mismo sistema (Next 16 + Supabase + Vercel), tienda en `/tienda` y admin en `/catalogo`.
- 7 tablas, 1 función pública, 4 páginas públicas + 3 de admin, 4 acciones.
- Riesgos: fotos de 2.219 productos, pesables con total aproximado, y que un Excel malo no
  rompa precios.
- Siguiente: `/replica-design` (cómo se ve, con identidad propia).
