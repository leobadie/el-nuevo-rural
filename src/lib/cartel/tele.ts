/*
 * Lo que la tele recuerda de sí misma (SPEC-cartel-vincular.md).
 *
 * Cada televisor que entra por /tv genera una clave al azar y la guarda en su
 * navegador: es lo que el admin vincula a una pantalla. Al lado se guarda la
 * última pantalla asignada, para que la tele arranque directo en ella aunque se
 * prenda sin internet.
 *
 * localStorage puede no existir o tirar error (modo privado, datos borrados):
 * todo va con try/catch y sin él la tele sigue andando, solo que olvida quién es.
 */

const CLAVE = "cartel_tv_clave";
const PANTALLA = "cartel_tv_pantalla";

/** Cada cuánto pregunta una tele que muestra el código si ya la vincularon. */
export const ESPERA_VINCULO_MS = 5 * 1000;

/** Cada cuánto pregunta una tele andando si la movieron o piden identificarla. */
export const MIRAR_VINCULO_MS = 15 * 1000;

function leer(nombre: string): string | null {
  try {
    return window.localStorage.getItem(nombre);
  } catch {
    return null;
  }
}

function escribir(nombre: string, valor: string | null) {
  try {
    if (valor == null) window.localStorage.removeItem(nombre);
    else window.localStorage.setItem(nombre, valor);
  } catch {
    // Sin almacenamiento: la tele vuelve a pedir código la próxima vez que se prenda.
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

/**
 * UUID v4 armado a mano: crypto.randomUUID no existe en los navegadores de TV
 * anteriores a Chrome 92, y los de las teles suelen ser más viejos.
 */
function nuevoUuid(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

/** La clave de esta tele, si ya tiene una. Las cargadas a mano no tienen. */
export function claveDeLaTele(): string | null {
  const c = leer(CLAVE);
  return c && UUID.test(c) ? c : null;
}

/** La clave de esta tele; si no tiene, la crea y la guarda. */
export function claveDeLaTeleOCrear(): string {
  const existente = claveDeLaTele();
  if (existente) return existente;
  const nueva = nuevoUuid();
  escribir(CLAVE, nueva);
  return nueva;
}

export function pantallaGuardada(): string | null {
  const s = leer(PANTALLA);
  return s && /^[a-z0-9]+(-[a-z0-9]+)*$/.test(s) ? s : null;
}

export function guardarPantalla(slug: string | null) {
  escribir(PANTALLA, slug);
}

/** Respuesta de cartel_tv_hola. */
export type Hola = { codigo: string; pantalla: string | null };

/** Respuesta de cartel_tv_estado. */
export type EstadoTele = { identificar_seg: number; conocida?: boolean; pantalla?: string | null };

/**
 * Qué tiene que hacer una tele andando con lo que le contestó el servidor.
 * Separado para poder probarlo sin navegador.
 */
export function decidirVinculo(
  slugActual: string,
  tieneClave: boolean,
  estado: EstadoTele,
): { tipo: "seguir" } | { tipo: "ir"; slug: string } | { tipo: "desvinculada" } {
  // Cargada a mano con /cartel/tv/<slug>: no se reasigna sola.
  if (!tieneClave || estado.conocida === undefined) return { tipo: "seguir" };
  if (!estado.conocida || !estado.pantalla) return { tipo: "desvinculada" };
  if (estado.pantalla !== slugActual) return { tipo: "ir", slug: estado.pantalla };
  return { tipo: "seguir" };
}
