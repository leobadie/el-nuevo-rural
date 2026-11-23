export type MedioPago = "Efectivo" | "Transferencia" | "Cheque";

export interface Movimiento {
  id: string;
  fecha: string;
  descripcion: string | null;
  categoria: string | null;
  ingreso: number | null;
  egreso: number | null;
  proveedor: string | null;
  medio_pago: MedioPago | null;
  n_cheque_pago: string | null;
  fecha_cobro_cheque_pago: string | null;
  cheque_creado: boolean;
  /** Cheque de Control de Cheques con el que se pagó (migración 037). Falta si la migración no está aplicada. */
  cheque_id?: string | null;
  gasto_fijo_id: string | null;
  creado_el: string;
  modificado_el: string;
  creado_por: string | null;
}

export type NuevoMovimiento = Omit<
  Movimiento,
  "id" | "creado_el" | "modificado_el" | "creado_por" | "cheque_creado"
> & { cheque_creado?: boolean };

export interface MovimientoEnriquecido extends Movimiento {
  saldoAcumulado: number;
}

export interface VentaXRP {
  id: string;
  fecha: string;
  empresa: string | null;
  venta_total: number | null;
  cobro_total: number | null;
  venta_por_medio: Record<string, number>;
  cobro_por_medio: Record<string, number>;
  creado_el: string;
}

export interface GastoFijo {
  id: string;
  descripcion: string;
  categoria: string;
  monto: number;
  proveedor: string | null;
  activo: boolean;
}

export type NuevoGastoFijo = Omit<GastoFijo, "id" | "activo"> & { activo?: boolean };

export interface Proveedor {
  id: string;
  nombre: string;
  telefono: string | null;
  /**
   * % que descuenta en algunas boletas (SPEC-descuento-proveedores.md). null = no tiene.
   * Opcional porque antes de la migración 025 la columna no existe.
   */
  descuento_pct?: number | null;
}

export interface Categoria {
  id: string;
  nombre: string;
}

export interface LimiteCategoria {
  categoria: string;
  limite: number;
}

export interface ItemPedido {
  id: number;
  producto: string;
  cantidad: string;
  unidad: string;
}

export interface Pedido {
  id: string;
  proveedor: string;
  items: ItemPedido[];
  notas: string | null;
  texto: string;
  telefono: string | null;
  confirmado: boolean;
  enviado_el: string;
}

export type NuevoPedido = Omit<Pedido, "id" | "enviado_el" | "confirmado"> & { confirmado?: boolean };

export interface SortConfigIE {
  key: string | null;
  dir: "asc" | "desc";
}

export interface ResumenCategoriaIE {
  categoria: string;
  ingresos: number;
  egresos: number;
}

export interface ResumenProveedorIE {
  proveedor: string;
  total: number;
  cantidad: number;
}

export interface ResumenMensualIE {
  key: string;
  label: string;
  ingresos: number;
  egresos: number;
}

export interface EntregaProveedor {
  id: string;
  proveedor: string;
  fecha: string;
  monto: number;
  comprobante: string | null;
  detalle: string | null;
  /**
   * Con descuento, el importe de la boleta y el %; `monto` es lo que se debe, ya descontado.
   * null (o ausentes, antes de la 025) = sin descuento.
   */
  monto_boleta?: number | null;
  descuento_pct?: number | null;
  creado_el: string;
  creado_por: string | null;
}

export type NuevaEntregaProveedor = Omit<EntregaProveedor, "id" | "creado_el" | "creado_por">;

export interface ImputacionPago {
  id: string;
  movimiento_id: string;
  entrega_id: string;
  monto: number;
  creado_el: string;
}

/**
 * Nota de crédito de un proveedor (SPEC-notas-credito.md): baja la deuda sin que salga plata de
 * la caja, así que no es un movimiento. Se aplica a boletas o queda a favor.
 */
export interface NotaCreditoProveedor {
  id: string;
  proveedor: string;
  fecha: string;
  monto: number;
  comprobante: string | null;
  detalle: string | null;
  creado_el: string;
  creado_por: string | null;
}

export type NuevaNotaCredito = Omit<NotaCreditoProveedor, "id" | "creado_el" | "creado_por">;

export interface AplicacionNotaCredito {
  id: string;
  nota_id: string;
  entrega_id: string;
  monto: number;
  creado_el: string;
}

/** Una NC con lo que ya se aplicó a boletas y lo que queda a favor. */
export interface NotaConSaldo extends NotaCreditoProveedor {
  aplicado: number;
  disponible: number;
}

/** Una entrega con lo que ya se le imputó y lo que falta. */
export interface EntregaConSaldo extends EntregaProveedor {
  /** Lo cubierto con pagos (movimientos). */
  pagado: number;
  /** Lo cubierto con notas de crédito. 0 si no tiene. */
  acreditado: number;
  /** monto − pagado − acreditado. */
  saldo: number;
  estado: "Impaga" | "Parcial" | "Pagada";
}

/** Un pago (movimiento con egreso) con lo que ya se aplicó y lo que queda a cuenta. */
export interface PagoConSaldo {
  id: string;
  fecha: string;
  descripcion: string | null;
  medio_pago: MedioPago | null;
  monto: number;
  imputado: number;
  disponible: number;
}

export interface CuentaProveedor {
  proveedor: string;
  entregado: number;
  pagado: number;
  /** Total de notas de crédito. */
  notas: number;
  /** entregado − pagado − notas. Positivo = le debés. */
  saldo: number;
  /** Pagos y notas de crédito que todavía no se aplicaron a ninguna entrega. */
  aCuenta: number;
  cantEntregasPendientes: number;
}

export interface ConfigProveedores {
  /**
   * La cuenta corriente sólo mira lo cargado a partir de acá. Los movimientos anteriores
   * siguen intactos en Movimientos: es un filtro de esa pantalla, no un borrado.
   */
  corte_cuenta_corriente: string;
}
