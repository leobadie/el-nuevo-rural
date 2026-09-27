/** Tipos de la sección Carnicería. Ver SPEC-carniceria.md. */

export type Especie = "vaca" | "cerdo";

/** Un corte de la pizarra. Lo comparten el escandallo (módulo 3) y el prorrateo (módulo 4). */
export interface Corte {
  id: string;
  nombre: string;
  precio_pizarra: number;
  /** Kilos que salen de una media res en un desposte de referencia (módulo 3). */
  kilos_desposte: number;
  /** El precio no se toca al prorratear (módulo 4): asado y picada en la planilla. */
  fijo: boolean;
  orden: number;
  activo: boolean;
}

/** Cada media res que entra al local. Los datos del desposte son opcionales. */
export interface MediaRes {
  id: string;
  fecha: string;
  abastecedor: string | null;
  especie: Especie;
  kg_factura: number;
  precio_kg: number;
  kg_balanza: number | null;
  dias_camara: number | null;
  hueso_kg: number | null;
  grasa_kg: number | null;
  merma_kg: number | null;
  precio_grasero: number | null;
  notas: string | null;
  creado_el?: string;
}

export type NuevaMediaRes = Omit<MediaRes, "id" | "creado_el">;

/** Un gasto fijo de Ingresos y Egresos, con si cuenta para la carnicería. */
export interface GastoCarniceria {
  id: string;
  descripcion: string;
  categoria: string;
  monto: number;
  incluido: boolean;
}

/** Valores cargados a mano, por clave ("m1.hueso", "gen.dias_mes"...). */
export type Parametros = Record<string, number>;

/** Cada ingreso de cajones de pollo. Alimenta el módulo 7. */
export interface IngresoPollo {
  id: string;
  fecha: string;
  proveedor: string | null;
  cajones: number;
  /** Kilos totales de la factura (todos los cajones juntos). */
  kg_total: number;
  precio_kg: number;
  notas: string | null;
  creado_el?: string;
}

export type NuevoIngresoPollo = Omit<IngresoPollo, "id" | "creado_el">;
