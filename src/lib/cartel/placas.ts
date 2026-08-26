import type { Placa } from "./types";

/** Azul de la marca, el mismo que usa el resto del sistema. */
export const NAVY = "#1F3864";
export const NARANJA = "#D97757";
export const VERDE = "#1E7B4D";

/**
 * Fecha de hoy en Argentina, como "YYYY-MM-DD".
 *
 * Va con zona horaria explícita a propósito: el server de Vercel corre en UTC,
 * así que después de las 21 hs de acá `new Date()` ya cae en el día siguiente.
 * Sin esto, una oferta que vence hoy desaparecería del televisor a las nueve de
 * la noche, con el local todavía abierto.
 */
export function hoyISO(ahora: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Argentina/Buenos_Aires",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(ahora);
}

/** ¿La placa está dentro de su ventana de vigencia en la fecha dada? */
export function estaVigente(placa: Placa, hoy: string = hoyISO()): boolean {
  if (!placa.activa) return false;
  if (placa.vigencia_desde && hoy < placa.vigencia_desde) return false;
  if (placa.vigencia_hasta && hoy > placa.vigencia_hasta) return false;
  return true;
}

/**
 * Las placas que el televisor tiene que mostrar, en orden.
 *
 * Si no queda ninguna —nadie cargó nada, se vencieron todas, o Supabase no
 * respondió— devuelve las de demostración. Un TV en negro en el salón de ventas
 * se ve como que el local está roto, así que siempre hay algo en pantalla.
 */
export function placasParaMostrar(placas: Placa[], hoy: string = hoyISO()): Placa[] {
  const vigentes = placas
    .filter((p) => estaVigente(p, hoy))
    .sort((a, b) => a.orden - b.orden || a.titulo.localeCompare(b.titulo, "es"));

  return vigentes.length > 0 ? vigentes : PLACAS_DEMO;
}

/** Formato de precio para la pantalla: "$ 2.499" y "$ 2.499,50". */
export function fmtPrecio(valor: number): string {
  const decimales = Number.isInteger(valor) ? 0 : 2;
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: "ARS",
    minimumFractionDigits: decimales,
    maximumFractionDigits: decimales,
  }).format(valor);
}

/**
 * Ahorro en porcentaje, redondeado. Devuelve null cuando no hay un descuento
 * real que mostrar, así no aparece un cartel de "0% OFF".
 */
export function porcentajeAhorro(placa: Placa): number | null {
  const { precio, precio_anterior: anterior } = placa;
  if (precio == null || anterior == null || anterior <= 0) return null;
  if (anterior <= precio) return null;

  const pct = Math.round(((anterior - precio) / anterior) * 100);
  return pct > 0 ? pct : null;
}

/** Cuánto dura la placa en pantalla, en milisegundos. */
export function duracionMs(placa: Placa): number {
  const seg = Number.isFinite(placa.duracion_seg) ? placa.duracion_seg : 8;
  return Math.min(Math.max(seg, 3), 60) * 1000;
}

function demo(p: Partial<Placa> & { id: string; titulo: string }): Placa {
  return {
    tipo: "oferta",
    bajada: null,
    precio: null,
    precio_anterior: null,
    unidad: null,
    imagen_url: null,
    color: null,
    vigencia_desde: null,
    vigencia_hasta: null,
    duracion_seg: 8,
    orden: 0,
    activa: true,
    ...p,
  };
}

/**
 * Contenido de arranque: lo que se ve en el televisor antes de que alguien
 * cargue la primera placa, y la red de seguridad si la base no responde.
 */
export const PLACAS_DEMO: Placa[] = [
  demo({
    id: "demo-1",
    tipo: "institucional",
    titulo: "El Nuevo Rural",
    bajada: "Todo lo que necesitás, cerca tuyo",
    color: NAVY,
    duracion_seg: 7,
    orden: 1,
  }),
  demo({
    id: "demo-2",
    titulo: "Asado de tira",
    bajada: "Carnicería",
    precio: 8990,
    precio_anterior: 11500,
    unidad: "el kilo",
    orden: 2,
  }),
  demo({
    id: "demo-3",
    titulo: "Leche entera 1 L",
    bajada: "Llevando 3 unidades",
    precio: 1150,
    precio_anterior: 1490,
    unidad: "c/u",
    orden: 3,
  }),
  demo({
    id: "demo-4",
    tipo: "aviso",
    titulo: "Aceptamos todos los medios de pago",
    bajada: "Débito · Crédito · QR · Transferencia",
    color: VERDE,
    duracion_seg: 7,
    orden: 4,
  }),
  demo({
    id: "demo-5",
    titulo: "Tomate perita",
    bajada: "Verdulería",
    precio: 1690,
    precio_anterior: 2200,
    unidad: "el kilo",
    orden: 5,
  }),
  demo({
    id: "demo-6",
    titulo: "Yerba mate 1 kg",
    bajada: "Segunda unidad al 50%",
    precio: 4250,
    unidad: "c/u",
    orden: 6,
  }),
  demo({
    id: "demo-7",
    tipo: "institucional",
    titulo: "Estamos abiertos",
    bajada: "Lunes a sábado de 8 a 21 · Domingos de 9 a 14",
    color: NAVY,
    duracion_seg: 7,
    orden: 7,
  }),
  demo({
    id: "demo-8",
    titulo: "Aceite de girasol 900 ml",
    bajada: "Almacén",
    precio: 2390,
    precio_anterior: 2990,
    unidad: "c/u",
    orden: 8,
  }),
  demo({
    id: "demo-9",
    titulo: "Pollo entero",
    bajada: "Fresco, todos los días",
    precio: 3450,
    unidad: "el kilo",
    orden: 9,
  }),
  demo({
    id: "demo-10",
    tipo: "aviso",
    titulo: "¿Encontraste todo?",
    bajada: "Preguntale a cualquiera de nuestros empleados",
    color: NARANJA,
    duracion_seg: 7,
    orden: 10,
  }),
];
