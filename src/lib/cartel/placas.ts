import type { Asignacion, Pantalla, Placa } from "./types";

/** Azul de la marca, el mismo que usa el resto del sistema. */
export const NAVY = "#1F3864";
export const NARANJA = "#D97757";
export const VERDE = "#1E7B4D";

/**
 * Color de fondo de cada sección del local.
 *
 * La clave es el nombre sin acentos ni mayúsculas, porque en el admin se escribe
 * a mano y "Carnicería", "carniceria" y "CARNICERIA" tienen que pintar igual.
 */
export const COLOR_POR_SECCION: Record<string, string> = {
  carniceria: "#A62C2C",
  embutidos: "#B4541F",
  fiambreria: "#B4541F",
  verduleria: VERDE,
  fruteria: VERDE,
  almacen: NAVY,
  panaderia: "#9C6B18",
  lacteos: "#2E5C8A",
  limpieza: "#4B3F8F",
  bebidas: "#0F6B70",
  general: NAVY,
};

/** Sugerencias que ofrece el admin; no limitan lo que se puede escribir. */
export const SECCIONES_SUGERIDAS = [
  "Carnicería",
  "Embutidos",
  "Verdulería",
  "Almacén",
  "Panadería",
  "Lácteos",
  "Limpieza",
  "Bebidas",
  "General",
];

const SIN_ACENTO: Record<string, string> = {
  á: "a", é: "e", í: "i", ó: "o", ú: "u", ü: "u", ñ: "n",
};

export function normalizarSeccion(seccion: string): string {
  return seccion
    .trim()
    .toLowerCase()
    .replace(/[áéíóúüñ]/g, (c) => SIN_ACENTO[c] ?? c);
}

/**
 * Color de fondo de la placa: manda el de la sección, y si es una sección nueva
 * sin color asignado se respeta el que se haya elegido a mano.
 */
export function colorDePlaca(placa: Placa): string {
  if (placa.seccion) {
    const color = COLOR_POR_SECCION[normalizarSeccion(placa.seccion)];
    if (color) return color;
  }
  return placa.color || NAVY;
}

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
export function placasParaMostrar(
  placas: Placa[],
  hoy: string = hoyISO(),
  seccion: string | null = null,
): Placa[] {
  const buscada = seccion ? normalizarSeccion(seccion) : null;

  const vigentes = placas
    .filter((p) => estaVigente(p, hoy))
    // Con una sección pedida, esa pantalla muestra lo suyo y lo que no tiene
    // sección asignada (institucional, avisos), que sirve para todo el local.
    .filter((p) => !buscada || !p.seccion || normalizarSeccion(p.seccion) === buscada)
    .sort((a, b) => a.orden - b.orden || a.titulo.localeCompare(b.titulo, "es"));

  return vigentes.length > 0 ? vigentes : PLACAS_DEMO;
}

/**
 * Las placas que le tocan a un televisor concreto.
 *
 * Una placa entra si está asignada a mano a esta pantalla, o si no está asignada
 * a ninguna y coincide con la sección de la pantalla. Ese segundo caso es el que
 * hace que todo lo cargado antes de que existieran las pantallas siga
 * apareciendo: ninguna placa vieja tiene asignación.
 *
 * El contrario también importa: una placa asignada a *otras* pantallas no entra
 * acá aunque la sección coincida. Si alguien mandó una oferta solo al televisor
 * de la entrada, no tiene que colarse en los de la carnicería.
 *
 * Igual que placasParaMostrar, nunca devuelve vacío: sin nada vigente caen las
 * de demostración, porque un televisor negro en el salón se lee como que el
 * local está roto.
 */
export function placasDePantalla(
  placas: Placa[],
  asignaciones: Asignacion[],
  pantalla: Pick<Pantalla, "slug" | "seccion">,
  hoy: string = hoyISO(),
): Placa[] {
  const deEstaPantalla = new Set(
    asignaciones.filter((a) => a.pantalla_slug === pantalla.slug).map((a) => a.placa_id),
  );
  const asignadas = new Set(asignaciones.map((a) => a.placa_id));
  const buscada = pantalla.seccion ? normalizarSeccion(pantalla.seccion) : null;

  const vigentes = placas
    .filter((p) => estaVigente(p, hoy))
    .filter((p) => {
      if (deEstaPantalla.has(p.id)) return true;
      if (asignadas.has(p.id)) return false;
      return !buscada || !p.seccion || normalizarSeccion(p.seccion) === buscada;
    })
    .sort((a, b) => a.orden - b.orden || a.titulo.localeCompare(b.titulo, "es"));

  return vigentes.length > 0 ? vigentes : PLACAS_DEMO;
}

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

/**
 * "Válido hasta el domingo" / "Válido hasta el 15/09", para el pie de la placa.
 *
 * Dentro de la semana se nombra el día, que es como lo diría un cliente; más
 * lejos se pone la fecha, porque "hasta el jueves" a tres semanas no se entiende.
 */
export function textoVigencia(placa: Placa, hoy: string = hoyISO()): string | null {
  if (!placa.vigencia_hasta) return null;

  // Se parsea a mano y no con new Date(texto) porque esa forma interpreta
  // "2026-09-15" como UTC y en Argentina devuelve el día anterior.
  const [a, m, d] = placa.vigencia_hasta.split("-").map(Number);
  const [ah, mh, dh] = hoy.split("-").map(Number);
  if (!a || !m || !d) return null;

  const fin = new Date(a, m - 1, d);
  const dias = Math.round((fin.getTime() - new Date(ah, mh - 1, dh).getTime()) / 86_400_000);

  if (dias < 0) return null;
  if (dias === 0) return "Válido solo por hoy";
  if (dias === 1) return "Válido hasta mañana";
  if (dias <= 6) return `Válido hasta el ${DIAS[fin.getDay()]}`;

  return `Válido hasta el ${String(d).padStart(2, "0")}/${String(m).padStart(2, "0")}`;
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
    seccion: null,
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
    seccion: "Carnicería",
    titulo: "Asado de tira",
    precio: 8990,
    precio_anterior: 11500,
    unidad: "el kilo",
    orden: 2,
  }),
  demo({
    id: "demo-3",
    seccion: "Lácteos",
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
    seccion: "Verdulería",
    titulo: "Tomate perita",
    precio: 1690,
    precio_anterior: 2200,
    unidad: "el kilo",
    orden: 5,
  }),
  demo({
    id: "demo-6",
    seccion: "Almacén",
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
    seccion: "Almacén",
    titulo: "Aceite de girasol 900 ml",
    bajada: "Almacén",
    precio: 2390,
    precio_anterior: 2990,
    unidad: "c/u",
    orden: 8,
  }),
  demo({
    id: "demo-9",
    seccion: "Carnicería",
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
