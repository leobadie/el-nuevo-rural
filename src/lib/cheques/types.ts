export type TipoCheque = "Físico" | "E-cheque";

export type EstadoCheque =
  | "Pagado"
  | "Vencido"
  | "Próximo"
  | "Pendiente"
  | "Rechazado";

export type EstadoTercero =
  | "En cartera"
  | "Entregado"
  | "Rechazado"
  | "Depositado";

export interface Cheque {
  id: string;
  n_cheque: string | null;
  proveedor: string;
  fecha_emision: string | null;
  fecha_cobro: string | null;
  importe: number;
  debito_banco: number | null;
  rechazado: boolean;
  tipo: TipoCheque;
  entregado: boolean;
  observaciones: string | null;
  creado_el: string;
  modificado_el: string;
  creado_por: string | null;
}

export type NuevoCheque = Omit<
  Cheque,
  "id" | "creado_el" | "modificado_el" | "creado_por"
>;

export interface ChequeEnriquecido extends Cheque {
  estado: EstadoCheque;
  dias: number | null;
  dup: boolean;
}

export interface ChequeTercero {
  id: string;
  n_cheque: string | null;
  librador: string;
  banco: string | null;
  fecha_emision: string | null;
  fecha_cobro: string | null;
  importe: number;
  estado: EstadoTercero;
  entregado_a: string | null;
  fecha_entrega: string | null;
  observaciones: string | null;
  creado_el: string;
  modificado_el: string;
}

export type NuevoChequeTercero = Omit<
  ChequeTercero,
  "id" | "creado_el" | "modificado_el" | "estado" | "entregado_a" | "fecha_entrega"
>;

export interface LimiteProveedor {
  proveedor: string;
  limite: number;
}

export interface MovimientoBanco {
  id: string;
  fecha: string;
  importe: number;
  descripcion: string;
  comprobante?: string;
}

export interface MovimientoMatcheado extends MovimientoBanco {
  cheque: ChequeEnriquecido | null;
  matchPor: "comprobante" | "importe" | null;
}

export interface SortConfig {
  key: string | null;
  dir: "asc" | "desc";
}
