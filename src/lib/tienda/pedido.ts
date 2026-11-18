// Lógica pura del lado del cliente: búsqueda, carrito y mensaje de WhatsApp.
// Sin React ni Supabase: lo prueba verificacion/tienda-pedido.mts.

import { formatoPeso, formatoPrecio, nombreLindo, normalizar, subtotalCentavos } from "./formato.ts";

/** Lo que la tienda manda al navegador por cada producto (nombres cortos: son ~2.200). */
export type ProductoPublico = {
  c: string; // código XRP
  n: string; // nombre ya prolijo
  m: string | null; // marca
  pr: string | null; // presentación
  k: string | null; // slug de categoría
  kn: string | null; // nombre de categoría
  p: number; // precio en centavos
  a: number | null; // precio anterior (tachado)
  kg: boolean; // se vende por kg
  f: boolean; // pesable (se pide en gramos)
  ft: string | null; // foto
  b: string; // texto de búsqueda normalizado
};

// ---------------------------------------------------------------- búsqueda

/**
 * Todas las palabras tienen que aparecer (en cualquier orden), sin acentos ni mayúsculas.
 * Orden: primero los que EMPIEZAN con lo buscado, después por nombre.
 */
export function buscar(productos: ProductoPublico[], consulta: string): ProductoPublico[] {
  const palabras = normalizar(consulta).split(" ").filter(Boolean);
  if (!palabras.length) return productos;
  const coinciden = productos.filter((p) => palabras.every((w) => p.b.includes(w)));
  const primera = palabras[0];
  return coinciden
    .map((p) => ({ p, empieza: p.b.startsWith(primera) ? 0 : p.b.split(" ").some((x) => x.startsWith(primera)) ? 1 : 2 }))
    .sort((x, y) => x.empieza - y.empieza || x.p.n.localeCompare(y.p.n, "es"))
    .map((x) => x.p);
}

// ---------------------------------------------------------------- carrito

/**
 * [código, cantidad] en el orden en que se agregaron (unidades, o kilos si es pesable).
 * Es una lista y no un objeto porque los códigos de XRP son números, y un objeto JS ordena
 * solo las claves numéricas: el carrito perdería el orden en que el cliente fue agregando.
 * Nunca guarda precios.
 */
export type Carrito = [string, number][];

export type LineaCarrito = { producto: ProductoPublico; cantidad: number; subtotal: number };

/** Cantidad de un producto en el carrito (0 si no está). */
export function cantidadEn(carrito: Carrito, codigo: string): number {
  return carrito.find(([c]) => c === codigo)?.[1] ?? 0;
}

/** Pone una cantidad: 0 lo saca; si es nuevo va al final; si ya estaba conserva su lugar. */
export function ponerCantidad(carrito: Carrito, codigo: string, cantidad: number): Carrito {
  if (!(cantidad > 0)) return carrito.filter(([c]) => c !== codigo);
  if (carrito.some(([c]) => c === codigo)) return carrito.map(([c, v]) => [c, c === codigo ? cantidad : v]);
  return [...carrito, [codigo, cantidad]];
}

/**
 * Cruza el carrito guardado con el catálogo actual: saca lo que ya no está y corrige
 * cantidades imposibles (p. ej. un pesable guardado como 3 unidades de otro día).
 */
export function reconciliar(carrito: Carrito, catalogo: Map<string, ProductoPublico>) {
  const lineas: LineaCarrito[] = [];
  const quitados: string[] = [];
  for (const [codigo, cant] of carrito) {
    const p = catalogo.get(codigo);
    if (!p) {
      quitados.push(codigo);
      continue;
    }
    if (!(cant > 0)) continue;
    const cantidad = p.f ? Math.min(10, Math.max(0.1, Math.round(cant * 1000) / 1000)) : Math.min(99, Math.max(1, Math.round(cant)));
    lineas.push({ producto: p, cantidad, subtotal: subtotalCentavos(p.p, cantidad, p.f) });
  }
  const total = lineas.reduce((s, l) => s + l.subtotal, 0);
  return { lineas, quitados, total, aproximado: lineas.some((l) => l.producto.f) };
}

/** Lee el carrito del navegador sin romper nunca (modo privado, datos viejos o corruptos). */
export function leerCarrito(texto: string | null): Carrito {
  if (!texto) return [];
  try {
    const lista = JSON.parse(texto);
    if (!Array.isArray(lista)) return [];
    const limpio: Carrito = [];
    for (const e of lista) {
      if (!Array.isArray(e) || typeof e[0] !== "string" || typeof e[1] !== "number") continue;
      if (!(e[1] > 0) || !Number.isFinite(e[1]) || limpio.some(([c]) => c === e[0])) continue;
      limpio.push([e[0], e[1]]);
    }
    return limpio;
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------- mensaje de WhatsApp

export type LineaPedido = {
  nombre: string;
  marca?: string | null;
  presentacion?: string | null;
  fraccionable: boolean;
  cantidad: number;
  subtotal_centavos: number;
};

export type PedidoParaMensaje = {
  numero: number;
  nombre: string;
  telefono: string;
  entrega: "retiro" | "envio";
  direccion?: string | null;
  forma_pago: "efectivo" | "transferencia" | "tarjeta";
  nota?: string | null;
  total_centavos: number;
  total_aproximado: boolean;
  lineas: LineaPedido[];
};

const PAGO = { efectivo: "Efectivo", transferencia: "Transferencia", tarjeta: "Tarjeta" } as const;

export function mensajeWhatsapp(p: PedidoParaMensaje): string {
  const lineas = p.lineas.map((l) => {
    const nombre = [nombreLindo(l.nombre), l.marca, l.fraccionable ? null : l.presentacion].filter(Boolean).join(" ");
    const cant = l.fraccionable ? formatoPeso(Number(l.cantidad)) : `${l.cantidad} ×`;
    return `• ${cant} ${nombre} — ${l.fraccionable ? "aprox. " : ""}${formatoPrecio(l.subtotal_centavos)}`;
  });
  const entrega =
    p.entrega === "retiro" ? "Retiro en el local" : `Envío a domicilio: ${p.direccion} (costo de envío a confirmar)`;
  return [
    `¡Hola! Quiero hacer este pedido (#${p.numero}):`,
    "",
    ...lineas,
    "",
    `*Total${p.total_aproximado ? " aproximado" : ""}: ${formatoPrecio(p.total_centavos)}*`,
    ...(p.total_aproximado ? ["(los productos que se pesan se cobran según la balanza)"] : []),
    "",
    `Entrega: ${entrega}`,
    `Pago: ${PAGO[p.forma_pago]}`,
    `Nombre: ${p.nombre}`,
    `Teléfono: ${p.telefono}`,
    ...(p.nota ? [`Nota: ${p.nota}`] : []),
  ]
    .join("\n")
    .replace(/ | /g, " ");
}

/** wa.me sólo acepta el número en dígitos, con código de país y sin el 0 ni el 15. */
export function enlaceWhatsapp(numero: string, texto: string): string {
  return `https://wa.me/${numero.replace(/\D/g, "")}?text=${encodeURIComponent(texto)}`;
}

// ---------------------------------------------------------------- errores del pedido

/** Traduce los errores de tienda_crear_pedido a algo que el cliente entienda. */
export function explicarError(mensaje: string): { campo?: string; texto: string } {
  const m = mensaje.replace(/^.*?tienda:\s*/, "");
  if (m.startsWith("cerrada")) return { texto: "La tienda está cerrada en este momento. Probá más tarde." };
  if (m.startsWith("sin whatsapp")) return { texto: "El súper todavía no cargó su WhatsApp. Avisanos por otro medio." };
  if (m.startsWith("nombre")) return { campo: "nombre", texto: "Poné tu nombre (al menos 2 letras)." };
  if (m.startsWith("telefono")) return { campo: "telefono", texto: "El teléfono tiene que tener entre 8 y 15 números, con código de área." };
  if (m.startsWith("direccion")) return { campo: "direccion", texto: "Para el envío necesitamos la dirección." };
  if (m.startsWith("pago")) return { campo: "forma_pago", texto: "Elegí cómo vas a pagar." };
  if (m.startsWith("entrega")) return { campo: "entrega", texto: "Elegí retiro o envío." };
  if (m.startsWith("vacio")) return { texto: "Tu carrito está vacío." };
  if (m.startsWith("no disponible")) return { texto: "Un producto del carrito ya no está disponible. Revisá el carrito." };
  if (m.startsWith("cantidad")) return { texto: "Hay una cantidad que no es válida. Revisá el carrito." };
  if (m.startsWith("demasiados pedidos")) return { texto: "Ya hiciste varios pedidos seguidos. Esperá unos minutos o escribinos por WhatsApp." };
  if (m.startsWith("demasiadas lineas")) return { texto: "El pedido es muy grande para la web (más de 100 productos). Escribinos por WhatsApp." };
  return { texto: "No pudimos enviar el pedido. Probá de nuevo en un momento." };
}
