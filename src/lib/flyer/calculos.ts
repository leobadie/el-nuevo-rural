import { COLOR_POR_SECCION, NAVY, normalizarSeccion } from "@/lib/cartel/placas";
import type { Flyer, FormatoFlyer, MedidaFlyer, ProductoFlyer } from "./tipos";

/*
 * Cuentas del flyer, separadas del dibujo para poder probarlas sin navegador
 * (`npm run verificar:flyer-calculos`). No importa nada de React a propósito.
 */

/** Cuántos productos entran en un flyer sin que se vea amontonado (R1.7). */
export const MAX_PRODUCTOS = 6;

export const MEDIDAS: Record<FormatoFlyer, MedidaFlyer> = {
  redes: { ancho: 1080, alto: 1350, etiqueta: "WhatsApp y redes", destino: "publicaciones y mensajes" },
  story: { ancho: 1080, alto: 1920, etiqueta: "Estado y televisores", destino: "estados, stories y los TVs del local" },
};

/** Alto del encabezado y del pie, en píxeles del diseño (el lienzo siempre mide 1080 de ancho). */
export const ENCABEZADO = 210;
export const PIE = 215;
export const ANCHO = 1080;
/** Aire a los costados: el de la columna de productos más el de adentro de cada fila. */
const PADDING_COLUMNA = 40;
const PADDING_FILA = 30;
const HUECO_FOTO = 28;
/** Aire entre la franja de arriba, los productos y el pie. */
export const AIRE = 24;

export interface EscalaFlyer {
  /**
   * Con uno o dos productos el nombre va arriba y el precio abajo, ocupando el ancho entero:
   * al lado del nombre el precio nunca podría crecer, y el flyer quedaba medio vacío.
   */
  apilado: boolean;
  /** Alto que le toca a cada producto. */
  altoFila: number;
  precioFS: number;
  nombreFS: number;
  tachadoFS: number;
  unidadFS: number;
  /** Lado de la foto cuadrada del producto. */
  foto: number;
  /** Separación entre productos. */
  hueco: number;
}

const acotar = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/**
 * Reparte el alto libre entre los productos y de ahí saca los tamaños de letra: un flyer de
 * una sola oferta tiene que llenarse con el precio, y uno de seis tiene que entrar igual.
 * Se calcula en vez de elegirse de una tabla para que sirva a los dos formatos sin tocar nada.
 */
export function escalaDe(formato: FormatoFlyer, cantidad: number): EscalaFlyer {
  const n = acotar(cantidad, 1, MAX_PRODUCTOS);
  const libre = MEDIDAS[formato].alto - ENCABEZADO - PIE - AIRE * 2;
  const apilado = n <= 2;
  const hueco = n > 1 ? acotar(Math.round(libre * 0.02), 10, 26) : 0;
  const repartido = Math.floor((libre - hueco * (n - 1)) / n);
  /*
   * Con tres o más, tope al alto de cada fila: el precio va al lado del nombre y no puede crecer
   * más allá de lo que le permite ese ancho, así que repartir todo el alto entre pocas filas deja
   * tarjetas enormes y medio vacías. Con el tope quedan compactas y el bloque se centra.
   * Apilado no hace falta: ahí el contenido sí crece con el alto.
   */
  const altoFila = Math.min(apilado ? 720 : 340, repartido);
  return {
    apilado,
    altoFila,
    hueco,
    precioFS: Math.round(acotar(altoFila * (apilado ? 0.34 : 0.42), 54, 260)),
    nombreFS: Math.round(acotar(altoFila * (apilado ? 0.17 : 0.2), 30, 120)),
    tachadoFS: Math.round(acotar(altoFila * 0.12, 20, 54)),
    unidadFS: Math.round(acotar(altoFila * 0.1, 18, 40)),
    foto: Math.round(acotar(altoFila * (apilado ? 0.7 : 0.82), 90, 460)),
  };
}

/**
 * Cuánto ancho le toca a cada columna de una fila. El nombre y el precio no pueden pelearse el
 * lugar: con anchos repartidos de antemano, un precio grande no se le monta encima al nombre.
 */
export function anchosDeFila(escala: EscalaFlyer, conFoto: boolean): { nombre: number; precio: number } {
  const util = ANCHO - PADDING_COLUMNA * 2 - PADDING_FILA * 2;
  const libre = util - (conFoto ? escala.foto + HUECO_FOTO : 0);
  // Apilado no se reparte: el nombre y el precio van uno debajo del otro, con todo el ancho.
  if (escala.apilado) return { nombre: libre, precio: libre };
  const precio = Math.round(libre * 0.52);
  return { nombre: libre - precio - 20, precio };
}

/**
 * El tamaño de letra más grande con el que un texto entra en el ancho que tiene. Se estima por
 * cantidad de caracteres porque acá no hay forma de medir el dibujo: el factor es conservador
 * a propósito, así un precio de seis cifras se achica antes de tocar el borde.
 */
export function tamanoQueEntra(texto: string, anchoDisponible: number, maximo: number, minimo = 34): number {
  const ANCHO_POR_LETRA = 0.62;
  const porAncho = anchoDisponible / Math.max(1, texto.length * ANCHO_POR_LETRA);
  // Hacia abajo: redondear hacia arriba devuelve un tamaño que ya no entra.
  return Math.max(minimo, Math.floor(Math.min(maximo, porAncho)));
}

/** El color de la franja: el de la sección del cartel, o el azul de la marca. */
export function colorDeFlyer(seccion: string): string {
  const clave = normalizarSeccion(seccion || "");
  return COLOR_POR_SECCION[clave] ?? NAVY;
}

/**
 * Por qué no se puede dibujar el flyer, o null si está bien. Es la misma validación en la
 * pantalla y en el servidor, así que el botón de descargar y la ruta no pueden discrepar.
 */
export function validarFlyer(flyer: Pick<Flyer, "productos">): string | null {
  const ps = flyer.productos;
  if (!Array.isArray(ps) || ps.length === 0) return "Cargá al menos un producto para armar el flyer.";
  if (ps.length > MAX_PRODUCTOS) return `En un flyer entran hasta ${MAX_PRODUCTOS} productos.`;
  for (const p of ps) {
    if (!p.nombre?.trim()) return "Hay un producto sin nombre.";
    if (p.precio == null || !(p.precio > 0)) return `Poné el precio de ${p.nombre.trim()}.`;
    if (p.precio_anterior != null && p.precio_anterior <= p.precio) {
      return `El precio anterior de ${p.nombre.trim()} tiene que ser mayor al precio de oferta.`;
    }
  }
  return null;
}

export function esFormato(valor: unknown): valor is FormatoFlyer {
  return valor === "redes" || valor === "story";
}

/** Cómo se llama el archivo que se descarga (R3.5). */
export function nombreArchivo(formato: FormatoFlyer, hoy: string): string {
  return `flyer-${formato}-${hoy}.png`;
}

/**
 * El % de descuento de un producto, o null si no hay uno real. Espeja la regla del cartel:
 * sin precio anterior, o si no es mayor, no se muestra nada (nunca un "0% OFF").
 */
export function descuentoDe(p: Pick<ProductoFlyer, "precio" | "precio_anterior">): number | null {
  const { precio, precio_anterior: anterior } = p;
  if (precio == null || anterior == null || anterior <= 0) return null;
  if (anterior <= precio) return null;
  const pct = Math.round(((anterior - precio) / anterior) * 100);
  return pct > 0 ? pct : null;
}
