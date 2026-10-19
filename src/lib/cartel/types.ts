/**
 * "imagen" es un cartel ya diseñado que se muestra tal cual, a pantalla
 * completa. Los otros tres los dibuja el sistema a partir de los datos.
 */
export type TipoPlaca = "oferta" | "institucional" | "aviso" | "imagen" | "video";

/**
 * Un tramo de video: qué archivo y entre qué segundos (SPEC-cartel-videos.md).
 * La placa de video tiene una lista; se reproducen en orden y el archivo no se
 * re-codifica nunca: recortar es solo cambiar `desde` y `hasta`.
 */
export type Clip = {
  url: string;
  desde: number;
  hasta: number;
  /** Duración del archivo entero, para el recortador. */
  duracion: number;
  ancho?: number | null;
  alto?: number | null;
  bytes?: number | null;
  /** Lo que se detectó al subirlo: "h264", "vp9"… */
  codec?: string | null;
};

export type Placa = {
  id: string;
  tipo: TipoPlaca;
  /** Sector del local: "Carnicería", "Verdulería"… Texto libre, puede faltar. */
  seccion: string | null;
  titulo: string;
  bajada: string | null;
  precio: number | null;
  precio_anterior: number | null;
  unidad: string | null;
  imagen_url: string | null;
  color: string | null;
  vigencia_desde: string | null;
  vigencia_hasta: string | null;
  duracion_seg: number;
  orden: number;
  activa: boolean;
  /**
   * Va también al flyer (SPEC-ofertas.md). Opcionales porque las placas de ejemplo y las
   * leídas antes de la migración 023 no los traen: faltar es "no va al flyer".
   */
  en_flyer?: boolean;
  /** Orden dentro del flyer, independiente del de rotación del TV. */
  orden_flyer?: number;
  /** Tramos de una placa de video (migración 029). Opcional: las filas viejas no lo traen. */
  clips?: Clip[] | null;
  /** Opciones de la placa de video (migración 030). Faltar es el valor por defecto. */
  video_encuadre?: EncuadreVideo;
  video_foco?: FocoVideo;
  video_texto?: TextoVideo;
};

/** "entero": se ve todo, con bordes. "llenar": ocupa la pantalla y recorta. */
export type EncuadreVideo = "entero" | "llenar";
/** Con "llenar", qué parte queda a la vista: arriba/izquierda, centro, abajo/derecha. */
export type FocoVideo = "inicio" | "centro" | "fin";
/** El precio de la oferta encima del video. */
export type TextoVideo = "ninguno" | "arriba" | "abajo";

/** Lo que la pantalla necesita para dibujar; el admin maneja el resto. */
export type PlacaNueva = Omit<Placa, "id">;

/**
 * Un televisor concreto del local.
 *
 * El slug es la clave porque va en la dirección que se tipea con el control
 * remoto: `/cartel/tv/carniceria-1`. Los nombres son los mismos que usa el panel
 * de Data Computación, para no tener que traducir entre los dos sistemas.
 */
export type Pantalla = {
  slug: string;
  nombre: string;
  /** Sector por defecto. null = la pantalla no filtra por sección. */
  seccion: string | null;
  activa: boolean;
  orden: number;
  /**
   * Grados para girar la placa en un TV montado parado (migración 028).
   * Opcional porque las filas leídas antes de la migración no lo traen.
   */
  rotacion?: number;
};

/** Fila de la tabla puente: esta placa va explícitamente a esta pantalla. */
export type Asignacion = { placa_id: string; pantalla_slug: string };

/** Último aviso de un televisor de que está prendido (migración 027). */
export type Latido = {
  pantalla_slug: string;
  visto_el: string;
  navegador: string | null;
  version: string | null;
  ancho: number | null;
  alto: number | null;
};
