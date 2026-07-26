import { computeEstado } from "@/lib/cheques/calculos";
import type { Cheque } from "@/lib/cheques/types";
import type { Movimiento } from "@/lib/ingresos-egresos/types";

export interface KpisCheques {
  total: number;
  pendiente: number;
  vencido: number;
  vencidoCant: number;
  proximo: number;
}

export function buildKpisCheques(cheques: Cheque[]): KpisCheques {
  const enriched = cheques.map((c) => ({ ...c, estado: computeEstado(c) }));
  const total = enriched.reduce((s, c) => s + (Number(c.importe) || 0), 0);
  const byEstado = (est: string) =>
    enriched.filter((c) => c.estado === est).reduce((s, c) => s + (Number(c.importe) || 0), 0);
  const pagado = byEstado("Pagado");
  const vencido = byEstado("Vencido");
  const vencidoCant = enriched.filter((c) => c.estado === "Vencido").length;
  const proximo = byEstado("Próximo");
  return { total, pendiente: total - pagado, vencido, vencidoCant, proximo };
}

export interface KpisMovs {
  ingresos: number;
  egresos: number;
  saldo: number;
  ingresosHoy: number;
  egresosHoy: number;
}

export function buildKpisMovs(movs: Movimiento[]): KpisMovs {
  const ingresos = movs.reduce((s, m) => s + (Number(m.ingreso) || 0), 0);
  const egresos = movs.filter((m) => m.medio_pago !== "Cheque").reduce((s, m) => s + (Number(m.egreso) || 0), 0);
  const hoy = new Date().toISOString().slice(0, 10);
  const movsHoy = movs.filter((m) => m.fecha === hoy);
  const ingresosHoy = movsHoy.reduce((s, m) => s + (Number(m.ingreso) || 0), 0);
  const egresosHoy = movsHoy
    .filter((m) => m.medio_pago !== "Cheque")
    .reduce((s, m) => s + (Number(m.egreso) || 0), 0);
  return { ingresos, egresos, saldo: ingresos - egresos, ingresosHoy, egresosHoy };
}

export function countProveedoresEnRiesgo(cheques: Cheque[], limites: Record<string, number>): number {
  const enriched = cheques.map((c) => ({ ...c, estado: computeEstado(c) }));
  const totales: Record<string, number> = {};
  enriched.forEach((c) => {
    if (c.estado === "Pagado" || c.estado === "Rechazado") return;
    const prov = (c.proveedor || "").trim();
    if (!prov) return;
    totales[prov] = (totales[prov] || 0) + (Number(c.importe) || 0);
  });
  return Object.entries(totales).filter(([prov, total]) => limites[prov] && total > limites[prov]).length;
}

export function countCategoriasEnRiesgo(movs: Movimiento[], limites: Record<string, number>): number {
  const totales: Record<string, number> = {};
  movs.forEach((m) => {
    const cat = (m.categoria || "").trim();
    if (!cat) return;
    totales[cat] = (totales[cat] || 0) + (Number(m.egreso) || 0);
  });
  return Object.entries(totales).filter(([cat, total]) => limites[cat] && total > limites[cat]).length;
}
