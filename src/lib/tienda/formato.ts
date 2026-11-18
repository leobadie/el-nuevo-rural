// Cómo se muestran precios, nombres y cantidades en la tienda.
// Sin dependencias de React ni de Supabase: lo prueba verificacion/tienda-formato.mts.

export type SeVendePor = "unidad" | "kg";

const miles = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 0 });
const conDecimales = new Intl.NumberFormat("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** 222500 → "$ 2.225" · 15990 → "$ 159,90" (sólo muestra centavos si los hay). */
export function formatoPrecio(centavos: number): string {
  const pesos = centavos / 100;
  return `$ ${centavos % 100 === 0 ? miles.format(pesos) : conDecimales.format(pesos)}`;
}

/** "/kg" para lo que se vende por kilo; nada para lo que va por unidad. */
export function sufijoPrecio(seVendePor: SeVendePor): string {
  return seVendePor === "kg" ? "/kg" : "";
}

/** Porcentaje de descuento redondeado hacia abajo (nunca prometer de más). */
export function porcentajeDescuento(precio: number, anterior: number | null | undefined): number | null {
  if (!anterior || anterior <= precio) return null;
  return Math.floor(((anterior - precio) / anterior) * 100);
}

// ---------------------------------------------------------------- nombres

const SIGLAS = new Set(["uht", "sin tacc", "tacc", "ddl", "pet", "xl", "xxl", "a1", "a2"]);

/**
 * XRP trae 745 nombres en MAYÚSCULAS ("ACEITE DE GIRASOL"). Sólo esos se pasan a tipo
 * oración; un nombre que ya viene con minúsculas se respeta tal cual.
 */
export function nombreLindo(nombre: string): string {
  const limpio = nombre.trim().replace(/\s+/g, " ");
  if (!limpio || limpio !== limpio.toUpperCase() || !/[A-ZÁÉÍÓÚÑ]/.test(limpio)) return limpio;
  const bajo = limpio.toLocaleLowerCase("es-AR");
  const palabras = bajo.split(" ").map((p) => (SIGLAS.has(p) ? p.toUpperCase() : p));
  const unido = palabras.join(" ");
  return unido.charAt(0).toLocaleUpperCase("es-AR") + unido.slice(1);
}

/** Minúsculas y sin acentos, para buscar: "Azúcar" y "azucar" son lo mismo. */
export function normalizar(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9ñ/.,%]+/g, " ")
    .trim();
}

// ---------------------------------------------------------------- pesables

/** Paso del selector en gramos: fino para fiambres y quesos, más grueso para el resto. */
export function pasoGramos(categoria: string | null | undefined): number {
  return normalizar(categoria ?? "").includes("fiambre") ? 100 : 250;
}

/** 0.5 → "500 g" · 1.25 → "1,25 kg" · 1 → "1 kg". */
export function formatoPeso(kg: number): string {
  if (kg < 1) return `${Math.round(kg * 1000)} g`;
  return `${new Intl.NumberFormat("es-AR", { maximumFractionDigits: 3 }).format(kg)} kg`;
}

/**
 * Subtotal de una línea, en centavos. Para lo pesable, `cantidad` son kilos y el
 * resultado es aproximado (lo define la balanza); se redondea al peso entero.
 */
export function subtotalCentavos(precioCentavos: number, cantidad: number, fraccionable: boolean): number {
  if (!fraccionable) return precioCentavos * Math.round(cantidad);
  return Math.round((precioCentavos * cantidad) / 100) * 100;
}

// ---------------------------------------------------------------- precio por medida

export type Contenido = { cantidad: number; unidad: "g" | "ml" | "un" };

/**
 * Lee la presentación de XRP: "1x1500 cc", "1x1.5 Lts", "1x120 grs", "1x4 Un", "1x1 Kgr".
 * Devuelve el contenido total normalizado a g, ml o unidades; null si no se entiende.
 */
export function leerPresentacion(presentacion: string | null | undefined): Contenido | null {
  if (!presentacion) return null;
  const m = presentacion
    .trim()
    .match(/^(\d+)\s*x\s*([\d]+(?:[.,]\d+)?)\s*(kgr|kg|grs|gr|g|lts|lt|l|ml|cc|un|unid)\b/i);
  if (!m) return null;
  const packs = Number(m[1]);
  const valor = Number(m[2].replace(",", "."));
  if (!packs || !valor) return null;
  const u = m[3].toLowerCase();
  const total = packs * valor;
  if (u === "kgr" || u === "kg") return { cantidad: total * 1000, unidad: "g" };
  if (u === "grs" || u === "gr" || u === "g") return { cantidad: total, unidad: "g" };
  if (u === "lts" || u === "lt" || u === "l") return { cantidad: total * 1000, unidad: "ml" };
  if (u === "ml" || u === "cc") return { cantidad: total, unidad: "ml" };
  return { cantidad: total, unidad: "un" };
}

/**
 * Precio por kilo o por litro, como pide la exhibición de precios.
 * Para lo que se vende por kg, el precio YA es por kilo. Devuelve null cuando no aplica
 * (unidades sueltas) o la presentación no se puede leer.
 */
export function precioPorMedida(
  precioCentavos: number,
  seVendePor: SeVendePor,
  presentacion: string | null | undefined,
): { centavos: number; medida: "kg" | "litro" } | null {
  if (seVendePor === "kg") return { centavos: precioCentavos, medida: "kg" };
  const c = leerPresentacion(presentacion);
  if (!c || c.unidad === "un") return null;
  // Es un precio de referencia: se redondea al peso entero ("$ 5.067", no "$ 5.066,67").
  return {
    centavos: Math.round((precioCentavos * 1000) / c.cantidad / 100) * 100,
    medida: c.unidad === "g" ? "kg" : "litro",
  };
}
