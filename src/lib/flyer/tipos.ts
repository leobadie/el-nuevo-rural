/** Los dos formatos del flyer (SPEC-flyer.md R1.5). El de story es el que se sube a los TVs. */
export type FormatoFlyer = "redes" | "story";

export interface MedidaFlyer {
  ancho: number;
  alto: number;
  /** Cómo se llama en pantalla, para los botones de descarga. */
  etiqueta: string;
  /** Para qué sirve, en una línea. */
  destino: string;
}

export interface ProductoFlyer {
  /** Sólo para React y para reordenar; no sale en la imagen. */
  id: string;
  nombre: string;
  precio: number | null;
  precio_anterior: number | null;
  unidad: string | null;
  imagen_url: string | null;
}

/** Los datos del local y del encabezado: se escriben una vez y quedan guardados (R3.6). */
export interface PieFlyer {
  direccion: string;
  telefono: string;
  horarios: string;
  instagram: string;
}

export interface Flyer {
  titulo: string;
  /** Pinta la franja con el color de la sección del cartel; vacío usa el azul de la marca. */
  seccion: string;
  /** Texto libre: "Válidas hasta el sábado". Vacío no se muestra. */
  vigencia: string;
  productos: ProductoFlyer[];
  pie: PieFlyer;
}
