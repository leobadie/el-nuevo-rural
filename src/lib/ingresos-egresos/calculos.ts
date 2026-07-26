import { fmtDate, fmtMoney } from "@/lib/cheques/calculos";
import type {
  Movimiento,
  MovimientoEnriquecido,
  ResumenCategoriaIE,
  ResumenMensualIE,
  ResumenProveedorIE,
} from "./types";

export const fmtMoneyIE = fmtMoney;
export const fmtDateIE = fmtDate;

export function mesActualClave(): string {
  return new Date().toISOString().slice(0, 7);
}

export function buildSaldoAcumulado(movs: Movimiento[]): MovimientoEnriquecido[] {
  const ordenados = [...movs].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  const saldoPorId = new Map<string, number>();
  let saldo = 0;
  ordenados.forEach((m) => {
    if (m.medio_pago !== "Cheque") {
      saldo += (Number(m.ingreso) || 0) - (Number(m.egreso) || 0);
    }
    saldoPorId.set(m.id, saldo);
  });
  return movs.map((m) => ({ ...m, saldoAcumulado: saldoPorId.get(m.id) ?? 0 }));
}

export function buildResumenCategoria(movs: Movimiento[], categorias: string[]): ResumenCategoriaIE[] {
  const map: Record<string, ResumenCategoriaIE> = {};
  categorias.forEach((c) => {
    map[c] = { categoria: c, ingresos: 0, egresos: 0 };
  });
  movs.forEach((m) => {
    const key = m.categoria || "(sin categoría)";
    if (!map[key]) map[key] = { categoria: key, ingresos: 0, egresos: 0 };
    map[key].ingresos += Number(m.ingreso) || 0;
    map[key].egresos += Number(m.egreso) || 0;
  });
  return Object.values(map);
}

export function buildResumenProveedorIE(movs: Movimiento[]): ResumenProveedorIE[] {
  const map: Record<string, ResumenProveedorIE> = {};
  movs.forEach((m) => {
    if (!m.proveedor) return;
    if (!map[m.proveedor]) map[m.proveedor] = { proveedor: m.proveedor, total: 0, cantidad: 0 };
    map[m.proveedor].total += Number(m.egreso) || 0;
    map[m.proveedor].cantidad += 1;
  });
  return Object.values(map).sort((a, b) => b.total - a.total);
}

const MESES_IE = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function buildResumenMensualIE(movs: Movimiento[]): ResumenMensualIE[] {
  const map: Record<string, ResumenMensualIE> = {};
  movs.forEach((m) => {
    if (!m.fecha) return;
    const [y, mo] = m.fecha.split("-");
    const key = `${y}-${mo}`;
    if (!map[key]) {
      map[key] = { key, label: `${MESES_IE[parseInt(mo, 10) - 1]} ${y}`, ingresos: 0, egresos: 0 };
    }
    map[key].ingresos += Number(m.ingreso) || 0;
    map[key].egresos += Number(m.egreso) || 0;
  });
  return Object.values(map).sort((a, b) => (a.key < b.key ? -1 : 1));
}

export function getSortValueIE(m: MovimientoEnriquecido, key: string): string | number {
  switch (key) {
    case "fecha":
      return m.fecha || "";
    case "descripcion":
      return (m.descripcion || "").toLowerCase();
    case "categoria":
      return (m.categoria || "").toLowerCase();
    case "proveedor":
      return (m.proveedor || "").toLowerCase();
    case "ingreso":
      return Number(m.ingreso) || 0;
    case "egreso":
      return Number(m.egreso) || 0;
    case "saldoAcumulado":
      return m.saldoAcumulado;
    default:
      return "";
  }
}

export function estaCargadoEsteMes(movs: Movimiento[], gastoFijoId: string): boolean {
  const mes = mesActualClave();
  return movs.some((m) => m.gasto_fijo_id === gastoFijoId && m.fecha.startsWith(mes));
}
