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
