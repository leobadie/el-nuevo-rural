/**
 * "imagen" es un cartel ya diseñado que se muestra tal cual, a pantalla
 * completa. Los otros tres los dibuja el sistema a partir de los datos.
 */
export type TipoPlaca = "oferta" | "institucional" | "aviso" | "imagen";

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
};

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
};

/** Fila de la tabla puente: esta placa va explícitamente a esta pantalla. */
export type Asignacion = { placa_id: string; pantalla_slug: string };
