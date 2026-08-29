export type TipoPlaca = "oferta" | "institucional" | "aviso";

export type Placa = {
  id: string;
  tipo: TipoPlaca;
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
};

/** Lo que la pantalla necesita para dibujar; el admin maneja el resto. */
export type PlacaNueva = Omit<Placa, "id">;
