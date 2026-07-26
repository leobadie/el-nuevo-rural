import type {
  Cheque,
  ChequeEnriquecido,
  EstadoCheque,
} from "./types";

export function toDate(str: string | null | undefined): Date | null {
  if (!str) return null;
  const d = new Date(str + "T00:00:00");
  return isNaN(d.getTime()) ? null : d;
}

export function todayMidnight(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86400000);
}

export function computeEstado(ch: Pick<Cheque, "rechazado" | "importe" | "debito_banco" | "fecha_cobro">): EstadoCheque {
  if (ch.rechazado) return "Rechazado";
  const importe = Number(ch.importe) || 0;
  const debito = Number(ch.debito_banco) || 0;
  if (debito >= importe && importe > 0) return "Pagado";
  const fc = toDate(ch.fecha_cobro);
  if (!fc) return "Pendiente";
  const today = todayMidnight();
  if (fc < today) return "Vencido";
  if (diffDays(fc, today) <= 7) return "Próximo";
  return "Pendiente";
}

export function computeDias(
  ch: Pick<Cheque, "fecha_cobro">,
  estado: EstadoCheque,
): number | null {
  if (estado === "Pagado") return null;
  const fc = toDate(ch.fecha_cobro);
  if (!fc) return null;
  const today = todayMidnight();
  return diffDays(fc, today);
}

export function fmtMoney(n: number | string | null | undefined): string {
  const v = parseFloat(String(n ?? "")) || 0;
  return "$" + Math.round(v).toLocaleString("es-AR");
}

export function fmtDate(str: string | null | undefined): string {
  if (!str) return "-";
  const [y, m, d] = str.split("-");
  return `${d}/${m}/${y}`;
}

export function isDuplicateNumber(
  nCheque: string | null | undefined,
  all: Pick<Cheque, "id" | "n_cheque">[],
  selfId: string | null,
): boolean {
  const v = (nCheque || "").trim().toLowerCase();
  if (!v || v === "echeq") return false;
  return all.some(
    (c) => c.id !== selfId && (c.n_cheque || "").trim().toLowerCase() === v,
  );
}

export function enriquecerCheques(cheques: Cheque[]): ChequeEnriquecido[] {
  return cheques.map((c) => {
    const estado = computeEstado(c);
    const dias = computeDias(c, estado);
    const dup = isDuplicateNumber(c.n_cheque, cheques, c.id);
    return { ...c, estado, dias, dup };
  });
}

export interface WeeklyFlowBucket {
  label: string;
  monto: number;
}

export function buildWeeklyFlow(enriched: ChequeEnriquecido[]): WeeklyFlowBucket[] {
  const today = todayMidnight();
  const vencido = enriched
    .filter((c) => c.estado === "Vencido")
    .reduce((s, c) => s + (Number(c.importe) || 0), 0);

  const weeks: WeeklyFlowBucket[] = [];
  let start = new Date(today);
  const nWeeks = 6;
  for (let w = 0; w < nWeeks; w++) {
    const end = new Date(start);
    end.setDate(end.getDate() + 6);
    const monto = enriched
      .filter((c) => {
        if (c.estado === "Pagado" || c.estado === "Rechazado") return false;
        const fc = toDate(c.fecha_cobro);
        return fc && fc >= start && fc <= end;
      })
      .reduce((s, c) => s + (Number(c.importe) || 0), 0);
    weeks.push({ label: `Sem ${w + 1}`, monto: Math.round(monto) });
    start = new Date(end);
    start.setDate(start.getDate() + 1);
  }
  const masAdelante = enriched
    .filter((c) => {
      if (c.estado === "Pagado" || c.estado === "Rechazado") return false;
      const fc = toDate(c.fecha_cobro);
      return fc && fc > start;
    })
    .reduce((s, c) => s + (Number(c.importe) || 0), 0);

  return [
    { label: "Vencido", monto: Math.round(vencido) },
    ...weeks,
    { label: "+6 sem", monto: Math.round(masAdelante) },
  ];
}

export interface ConcentracionProveedor {
  name: string;
  value: number;
}

export function buildProviderConcentration(
  enriched: ChequeEnriquecido[],
): ConcentracionProveedor[] {
  const open = enriched.filter((c) => c.estado !== "Pagado" && c.estado !== "Rechazado");
  const totals: Record<string, number> = {};
  open.forEach((c) => {
    const key = (c.proveedor || "Sin nombre").trim() || "Sin nombre";
    totals[key] = (totals[key] || 0) + (Number(c.importe) || 0);
  });
  const sorted = Object.entries(totals).sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, 6).map(([name, value]) => ({ name, value: Math.round(value) }));
  const otrosTotal = sorted.slice(6).reduce((s, [, v]) => s + v, 0);
  if (otrosTotal > 0) top.push({ name: "Otros", value: Math.round(otrosTotal) });
  return top;
}

export interface ResumenProveedor {
  proveedor: string;
  cantidad: number;
  totalEmitido: number;
  totalPagado: number;
  totalAbierto: number;
}

export function buildProviderSummary(enriched: ChequeEnriquecido[]): ResumenProveedor[] {
  const map: Record<string, ResumenProveedor> = {};
  enriched.forEach((c) => {
    const key = (c.proveedor || "Sin nombre").trim() || "Sin nombre";
    if (!map[key]) {
      map[key] = { proveedor: key, cantidad: 0, totalEmitido: 0, totalPagado: 0, totalAbierto: 0 };
    }
    const imp = Number(c.importe) || 0;
    map[key].cantidad += 1;
    map[key].totalEmitido += imp;
    if (c.estado === "Pagado") map[key].totalPagado += imp;
    else map[key].totalAbierto += imp;
  });
  return Object.values(map).sort((a, b) => b.totalAbierto - a.totalAbierto);
}

export interface AgingBand {
  label: string;
  min: number;
  max: number;
  monto: number;
}

export interface AgingDetalle extends ChequeEnriquecido {
  diasAtraso: number;
}

export function buildAging(enriched: ChequeEnriquecido[]): { bands: AgingBand[]; detail: AgingDetalle[] } {
  const today = todayMidnight();
  const overdue = enriched.filter((c) => c.estado === "Vencido" || c.estado === "Rechazado");
  const bands: AgingBand[] = [
    { label: "1 - 15 días", min: 1, max: 15, monto: 0 },
    { label: "16 - 30 días", min: 16, max: 30, monto: 0 },
    { label: "31 - 60 días", min: 31, max: 60, monto: 0 },
    { label: "Más de 60 días", min: 61, max: Infinity, monto: 0 },
  ];
  const detail: AgingDetalle[] = [];
  overdue.forEach((c) => {
    const fc = toDate(c.fecha_cobro);
    const diasAtraso = fc ? diffDays(today, fc) : 0;
    detail.push({ ...c, diasAtraso });
    const band = bands.find((b) => diasAtraso >= b.min && diasAtraso <= b.max);
    if (band) band.monto += Number(c.importe) || 0;
  });
  detail.sort((a, b) => b.diasAtraso - a.diasAtraso);
  return { bands, detail };
}

export interface ResumenMensual {
  key: string;
  label: string;
  cantidad: number;
  totalEmitido: number;
  totalPagado: number;
  totalAbierto: number;
}

const MESES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export function buildMonthlySummary(enriched: ChequeEnriquecido[]): ResumenMensual[] {
  const map: Record<string, ResumenMensual> = {};
  enriched.forEach((c) => {
    if (!c.fecha_emision) return;
    const [y, m] = c.fecha_emision.split("-");
    const key = `${y}-${m}`;
    if (!map[key]) {
      map[key] = {
        key,
        label: `${MESES[parseInt(m, 10) - 1]} ${y}`,
        cantidad: 0,
        totalEmitido: 0,
        totalPagado: 0,
        totalAbierto: 0,
      };
    }
    const imp = Number(c.importe) || 0;
    map[key].cantidad += 1;
    map[key].totalEmitido += imp;
    if (c.estado === "Pagado") map[key].totalPagado += imp;
    else map[key].totalAbierto += imp;
  });
  return Object.values(map).sort((a, b) => (a.key < b.key ? -1 : 1));
}

export function getSortValue(c: ChequeEnriquecido, key: string): string | number {
  switch (key) {
    case "nCheque":
      return (c.n_cheque || "").toLowerCase();
    case "proveedor":
      return (c.proveedor || "").toLowerCase();
    case "tipo":
      return c.tipo || "Físico";
    case "fechaEmision":
      return c.fecha_emision || "";
    case "fechaCobro":
      return c.fecha_cobro || "";
    case "importe":
      return Number(c.importe) || 0;
    case "debitoBanco":
      return Number(c.debito_banco) || 0;
    case "estado":
      return c.estado || "";
    case "dias":
      return c.dias === null ? -Infinity : c.dias;
    default:
      return "";
  }
}
