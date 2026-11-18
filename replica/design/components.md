# Componentes de la tienda

Tokens en `tokens.json` → `src/app/globals.css` (bloque `.tienda`, clases `bg-t-*`, `text-t-*`).
Código en `src/app/tienda/_componentes/`. Vitrina: `/tienda/diseno` (sólo en desarrollo).
Íconos: Lucide (MIT, ya está en el proyecto). Fuente: Geist (ya está). Nada de Día.

Reglas para todos:
- Área tocable mínima 44 px. Todo funciona a 375 px sin scroll horizontal.
- Foco visible: anillo de 2 px `focus` (azul) con separación de 2 px, en todo lo interactivo.
- Texto de precios con `tabular-nums` para que no salten al cambiar.
- Colores sólo por token, nunca hex en el componente.

```
Boton
  variantes  primario (accent), whatsapp, secundario (borde), fantasma, peligro
  tamaños    sm 36px, md 44px, lg 52px; ancho completo opcional
  estados    normal, hover (accent-hover), activo (escala .98), foco, deshabilitado (opacidad .5),
             cargando (spinner + texto se mantiene para lectores, aria-busy)
  tokens     bg accent, text on-accent, radio md, texto base/700
  a11y       <button> real; si sólo tiene ícono, aria-label obligatorio
  usado en   tarjeta, S05, S07, S08', S10

Precio
  variantes  normal; oferta (anterior tachado + % en pastilla amarilla); por kg ("/kg");
             aproximado ("aprox." para pesables en el carrito)
  partes     precio grande (xl/800, price o price-sale si hay oferta), anterior (sm, muted, tachado),
             precio por medida (xs, muted): "$ 5.067 por litro"
  a11y       el tachado se lee: <s> con texto oculto "antes"
  usado en   tarjeta, S05, S07

Etiqueta (pastilla)
  variantes  descuento (highlight/on-highlight, "-26%"), +18 (surface-alt, "+18"),
             pesable (surface-alt, "Se pesa"), nuevo
  tamaño     xs/700, radio pill, alto 22px

SinFoto
  qué es     reemplazo de la foto mientras no hay: fondo surface-alt, inicial del producto
             grande y nombre de la categoría. Mismo tamaño que una foto (cuadrado).
  a11y       aria-hidden (el nombre ya está en la tarjeta)

TarjetaProducto
  partes     foto o SinFoto (1:1) · etiquetas · nombre (sm, 2 líneas máx.) · marca y presentación
             (xs, muted) · Precio · Agregar
  estados    normal; en el carrito (Agregar → Cantidad); oferta; sin foto; pausado (no se muestra)
  layout     2 columnas en celular, 3 en tablet, 5 en escritorio; gap 8/12/16
  a11y       <article>; el nombre es el enlace a la ficha; Agregar es otro botón aparte
  usado en   S01, S03

Cantidad (stepper)
  variantes  unidades (− 2 +); peso (− 500 g +, paso 100 o 250 g, atajos ¼ ½ 1 kg)
  estados    normal; mínimo (el − se convierte en tacho y quita); máximo (99 u / 10 kg)
  a11y       role="group" con aria-label "Cantidad de <producto>"; el valor en aria-live polite
  usado en   tarjeta, S05, S07

Buscador
  partes     ícono lupa, campo, botón limpiar (×)
  estados    vacío (placeholder "Buscá leche, yerba, asado…"), escribiendo, sin resultados
  a11y       role="search", <input type="search">, enterKeyHint="search"
  usado en   encabezado

Encabezado
  partes     logo (public/logo.jpg, 40px) · buscador · carrito con contador
  layout     celular: logo + carrito arriba, buscador abajo (alto total ~108px), fijo al hacer scroll;
             escritorio: todo en una fila de 64px
  tokens     bg accent, on-accent; contador highlight/on-highlight

Aviso (banner)
  variantes  info (surface-alt), éxito (success-bg/success), error (danger-bg/danger),
             atención (warning-bg/on-warning)
  a11y       error y éxito con role="alert"/"status"
  usado en   S07 (precio cambió), S08' (fuera de horario, mínimo), S10

Segmentado
  qué es     elegir una de 2–3 opciones grandes: Retiro en el local / Envío a domicilio
  a11y       role="radiogroup", flechas para moverse
  usado en   S08'

Campo
  partes     etiqueta arriba, input 44px, ayuda o error debajo
  estados    normal, foco, error (borde danger + texto), deshabilitado
  a11y       <label for>, aria-describedby al error, inputMode según tipo (tel, text)
  usado en   S08'

LineaCarrito
  partes     nombre, cantidad (Cantidad), subtotal, quitar
  estados    normal; pesable ("aprox."); precio cambió (aviso chico); ya no está (tachada, sin cantidad)
  usado en   S07, S08'

EstadoVacio
  variantes  carrito vacío, sin resultados (con sugerencia), tienda cerrada
  partes     ícono, título, texto, acción
```

Pendientes para la etapa 3 (no hacen falta para el circuito): Carrusel, Banner, Cajón
lateral (el carrito arranca como página propia), Filtros.
