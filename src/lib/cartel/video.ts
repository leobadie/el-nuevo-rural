import type { Clip, EncuadreVideo, FocoVideo, Placa, TextoVideo } from "./types";

/**
 * Cálculos de las placas de video (SPEC-cartel-videos.md). Código puro, sin
 * navegador, para poder probarlo con `verificar:cartel-videos-calculos`.
 */

/** Tope de Supabase por archivo en el plan gratuito. */
export const MAX_BYTES_VIDEO = 50 * 1024 * 1024;

/** Por encima de esto se sugiere comprimir: 10 TVs bajándolo pesan. */
export const BYTES_SUGERIDOS_VIDEO = 20 * 1024 * 1024;

/** Un tramo más corto que esto no se llega a ver en el TV. */
export const MIN_TRAMO_SEG = 1;

/** Segundos que dura la placa: la suma de los tramos. */
export function duracionClips(clips: Clip[] | null | undefined): number {
  if (!clips) return 0;
  return clips.reduce((total, c) => total + Math.max(0, c.hasta - c.desde), 0);
}

/**
 * Deja un tramo dentro del archivo y con un largo mínimo. Lo que venga del
 * recortador (o de una fila vieja) pasa por acá antes de guardarse.
 */
export function acotarTramo(clip: Clip): Clip {
  const dur = Number.isFinite(clip.duracion) && clip.duracion > 0 ? clip.duracion : Math.max(clip.hasta, 0);
  let desde = Math.min(Math.max(0, clip.desde), Math.max(0, dur - MIN_TRAMO_SEG));
  let hasta = Math.min(Math.max(clip.hasta, desde + MIN_TRAMO_SEG), dur);
  if (hasta - desde < MIN_TRAMO_SEG) {
    // Archivo más corto que el mínimo: se usa entero.
    desde = 0;
    hasta = dur;
  }
  return { ...clip, desde: redondear(desde), hasta: redondear(hasta) };
}

function redondear(seg: number): number {
  return Math.round(seg * 10) / 10;
}

export type Codec = "h264" | "hevc" | "av1" | "vp8" | "vp9" | "desconocido";

/**
 * Qué códec de video trae el archivo, buscando sus marcas dentro de los bytes:
 * los MP4/MOV declaran "avc1", "hvc1"… y los WebM "V_VP9", "V_MPEGH/ISO/HEVC"…
 *
 * Hace falta porque el navegador de la compu del admin puede reproducir un HEVC
 * de iPhone sin problema y el del televisor no: probar "si se ve acá" engaña.
 */
export function detectarCodec(bytes: Uint8Array): Codec {
  const hay = (texto: string) => buscar(bytes, texto);
  if (hay("hvc1") || hay("hev1") || hay("V_MPEGH/ISO/HEVC")) return "hevc";
  if (hay("av01") || hay("V_AV1")) return "av1";
  if (hay("avc1") || hay("avc3") || hay("V_MPEG4/ISO/AVC")) return "h264";
  if (hay("vp09") || hay("V_VP9")) return "vp9";
  if (hay("vp08") || hay("V_VP8")) return "vp8";
  return "desconocido";
}

function buscar(bytes: Uint8Array, texto: string): boolean {
  const patron = Array.from(texto, (c) => c.charCodeAt(0));
  const primero = patron[0];
  const fin = bytes.length - patron.length;
  for (let i = 0; i <= fin; i++) {
    if (bytes[i] !== primero) continue;
    let j = 1;
    while (j < patron.length && bytes[i + j] === patron[j]) j++;
    if (j === patron.length) return true;
  }
  return false;
}

export type Veredicto = { puede: boolean; aviso: string | null };

/** Si el video se va a poder ver en los televisores, y qué decirle al usuario si no. */
export function veredictoVideo(codec: Codec, bytes: number): Veredicto {
  if (bytes > MAX_BYTES_VIDEO) {
    return {
      puede: false,
      aviso: `El video pesa ${mb(bytes)} y el máximo es ${mb(MAX_BYTES_VIDEO)}. Recortalo o exportalo más liviano (CapCut: 1080p, 30 fps) y subilo de nuevo.`,
    };
  }
  if (codec === "hevc") {
    return {
      puede: false,
      aviso:
        "Este video está en HEVC (el formato de los iPhone) y los televisores no lo pueden reproducir. " +
        "Para los próximos: en el iPhone, Ajustes → Cámara → Formatos → «Más compatible». " +
        "Para este: pasalo por CapCut y exportalo, o mandátelo por WhatsApp y bajalo de ahí.",
    };
  }
  if (codec === "av1") {
    return {
      puede: false,
      aviso: "Este video está en AV1 y los televisores no lo pueden reproducir. Exportalo de nuevo como MP4 (H.264), por ejemplo con CapCut.",
    };
  }
  if (codec === "desconocido") {
    return {
      puede: true,
      aviso: "No se pudo reconocer el formato del video. Se sube igual, pero probalo en un televisor antes de dejarlo.",
    };
  }
  if (bytes > BYTES_SUGERIDOS_VIDEO) {
    return {
      puede: true,
      aviso: `El video pesa ${mb(bytes)}. Anda, pero si lo exportás más liviano (menos de ${mb(BYTES_SUGERIDOS_VIDEO)}) los televisores lo bajan más rápido.`,
    };
  }
  return { puede: true, aviso: null };
}

export function mb(bytes: number): string {
  return `${(bytes / 1024 / 1024).toLocaleString("es-AR", { maximumFractionDigits: 1 })} MB`;
}

/** "12,5 s" para mostrar tiempos en el recortador. */
export function fmtSeg(seg: number): string {
  return `${(Math.round(seg * 10) / 10).toLocaleString("es-AR")} s`;
}

/** Opciones de una placa de video con sus valores por defecto (migración 030). */
export function opcionesVideo(placa: Pick<Placa, "video_encuadre" | "video_foco" | "video_texto">): {
  encuadre: EncuadreVideo;
  foco: FocoVideo;
  texto: TextoVideo;
} {
  return {
    encuadre: placa.video_encuadre === "llenar" ? "llenar" : "entero",
    foco: placa.video_foco === "inicio" || placa.video_foco === "fin" ? placa.video_foco : "centro",
    texto: placa.video_texto === "arriba" || placa.video_texto === "abajo" ? placa.video_texto : "ninguno",
  };
}

/**
 * CSS para el video. Con "llenar" solo sobra en un eje (el que no coincide), así
 * que el mismo porcentaje en los dos sirve: 0% es arriba o izquierda, 100% abajo
 * o derecha. Con "entero" no sobra nada y la posición no importa.
 */
export function estiloVideo(encuadre: EncuadreVideo, foco: FocoVideo): { objectFit: "contain" | "cover"; objectPosition: string } {
  if (encuadre === "entero") return { objectFit: "contain", objectPosition: "50% 50%" };
  const p = foco === "inicio" ? "0%" : foco === "fin" ? "100%" : "50%";
  return { objectFit: "cover", objectPosition: `${p} ${p}` };
}
