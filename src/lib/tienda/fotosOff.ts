// Lógica pura para buscar fotos en Open Food Facts (SPEC-tienda-fotos.md).
// Sin red: la usa scripts/buscar-fotos-off.mjs y la prueba verificacion/tienda-fotos.mts.

export const FUENTE_OFF = "openfoodfacts";
export const CREDITO_OFF = "Open Food Facts (CC BY-SA)";
/** Identificación genérica: Open Food Facts pide un User-Agent propio, sin datos personales. */
export const USER_AGENT_OFF = "TiendaCatalogoFotos/1.0";
export const PAUSA_ENTRE_CONSULTAS_MS = 1500;
export const MAX_BYTES_FOTO = 1024 * 1024;

export type Resultado = "con_foto" | "sin_foto" | "no_esta" | "error";

export function codigoConsultable(codigo: string | null | undefined): codigo is string {
  return typeof codigo === "string" && /^\d{8,14}$/.test(codigo);
}

export function urlConsulta(codigo: string): string {
  return `https://world.openfoodfacts.org/api/v2/product/${codigo}.json?fields=code,product_name,product_name_es,brands,image_front_url,image_url`;
}

/** Sólo se aceptan fotos servidas por Open Food Facts, por https. */
function urlDeFotoValida(u: unknown): u is string {
  if (typeof u !== "string") return false;
  try {
    const x = new URL(u);
    return x.protocol === "https:" && /(^|\.)openfoodfacts\.(org|net)$/.test(x.hostname) && /\.(jpe?g|png|webp)$/i.test(x.pathname);
  } catch {
    return false;
  }
}

export type Interpretacion =
  | { resultado: "con_foto"; url: string; nombre: string | null }
  | { resultado: "sin_foto" | "no_esta"; nombre: string | null }
  | { resultado: "error"; detalle: string };

/**
 * Interpreta la respuesta de /api/v2/product. Prefiere la foto de frente (que Open Food
 * Facts ya da en 400 px); si no hay, la principal.
 */
export function interpretar(status: number, cuerpo: unknown): Interpretacion {
  if (status === 404) return { resultado: "no_esta", nombre: null };
  if (status !== 200 || !cuerpo || typeof cuerpo !== "object") return { resultado: "error", detalle: `HTTP ${status}` };
  const j = cuerpo as { status?: number; product?: Record<string, unknown> };
  if (j.status !== 1 || !j.product) return { resultado: "no_esta", nombre: null };
  const p = j.product;
  const nombreBase = [p.product_name_es, p.product_name].find((x) => typeof x === "string" && x.trim()) as string | undefined;
  const marca = typeof p.brands === "string" && p.brands.trim() ? p.brands.split(",")[0].trim() : null;
  const nombre = nombreBase ? [nombreBase.trim(), marca].filter(Boolean).join(" · ") : marca;
  const url = [p.image_front_url, p.image_url].find(urlDeFotoValida);
  return url ? { resultado: "con_foto", url, nombre } : { resultado: "sin_foto", nombre };
}

/** Qué tipo de imagen es, mirando los primeros bytes (no confiar en la extensión). */
export function tipoDeImagen(b: Uint8Array): "image/jpeg" | "image/png" | "image/webp" | null {
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 12 && String.fromCharCode(...b.slice(0, 4)) === "RIFF" && String.fromCharCode(...b.slice(8, 12)) === "WEBP")
    return "image/webp";
  return null;
}

export function validarImagen(b: Uint8Array): { ok: true; tipo: string; extension: string } | { ok: false; motivo: string } {
  if (b.length === 0) return { ok: false, motivo: "vacía" };
  if (b.length > MAX_BYTES_FOTO) return { ok: false, motivo: `pesa ${Math.round(b.length / 1024)} KB (máx. 1 MB)` };
  const tipo = tipoDeImagen(b);
  if (!tipo) return { ok: false, motivo: "no es una imagen" };
  return { ok: true, tipo, extension: tipo === "image/jpeg" ? "jpg" : tipo.split("/")[1] };
}

/** Ruta en el bucket: off/<código XRP>.<ext>, con el código limpio. */
export function rutaEnStorage(codigoXrp: string, extension: string): string {
  return `off/${codigoXrp.replace(/[^A-Za-z0-9_-]/g, "_")}.${extension}`;
}

/**
 * Cuánto esperar antes de reintentar. 429 = exceso de pedidos: espera larga y creciente.
 * null = no reintentar más.
 */
export function esperaReintento(intento: number, status: number | null): number | null {
  if (intento >= 4) return null;
  if (status === 429) return 60_000 * intento;
  if (status === null || status >= 500) return 5_000 * intento;
  return null; // 4xx que no son 429: no tiene sentido insistir
}
