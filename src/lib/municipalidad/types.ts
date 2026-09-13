export type MedioCobro = "Transferencia" | "Cheque" | "Efectivo";

/** Una boleta/factura entregada a la Municipalidad por el PAICOR. */
export interface FacturaMunicipalidad {
  id: string;
  fecha_entrega: string;
  numero_factura: string | null;
  fecha_factura: string | null;
  monto: number;
  orden_compra: string | null;
  lugar_entrega: string | null;
  detalle: string | null;
  creado_el: string;
  creado_por: string | null;
}

export type NuevaFacturaMunicipalidad = Omit<FacturaMunicipalidad, "id" | "creado_el" | "creado_por">;

/** Un pago de la Municipalidad. Cancela facturas por monto_cobrado + retenciones. */
export interface CobroMunicipalidad {
  id: string;
  fecha: string;
  monto_cobrado: number;
  retenciones: number;
  medio_pago: MedioCobro | null;
  comprobante: string | null;
  detalle: string | null;
  creado_el: string;
  creado_por: string | null;
}

export type NuevoCobroMunicipalidad = Omit<CobroMunicipalidad, "id" | "creado_el" | "creado_por">;

export interface ImputacionCobro {
  id: string;
  cobro_id: string;
  factura_id: string;
  monto: number;
  creado_el: string;
}

export interface AplicacionCobro {
  cobro_id: string;
  factura_id: string;
  monto: number;
}

export type EstadoFactura = "Pendiente" | "Parcial" | "Cobrada";

export interface FacturaConSaldo extends FacturaMunicipalidad {
  cobrado: number;
  saldo: number;
  estado: EstadoFactura;
  /** Días desde la fecha de factura (o de entrega si no hay). null si ya está cobrada. */
  dias: number | null;
}

export interface CobroConSaldo extends CobroMunicipalidad {
  /** monto_cobrado + retenciones: lo que cancela de facturas. */
  total: number;
  aplicado: number;
  disponible: number;
  /** Una por factura: si el cobro se aplicó en varias veces a la misma, se suman (y se deshacen juntas). */
  aplicaciones: { imputacion_ids: string[]; factura_id: string; numero_factura: string | null; monto: number }[];
}

export interface ResumenMunicipalidad {
  facturado: number;
  /** Total de los cobros, retenciones incluidas. */
  cobrado: number;
  retenido: number;
  /** facturado − cobrado. Positivo = la Municipalidad te debe. */
  teDebe: number;
  facturasPendientes: number;
  diasMasVieja: number | null;
  /** Cobros que todavía no se aplicaron a ninguna factura. */
  sinAplicar: number;
}
