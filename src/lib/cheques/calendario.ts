import { toDate, todayMidnight } from "./calculos";
import type { ChequeEnriquecido } from "./types";

export const MESES_LARGOS = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
];

export const DIAS_CORTOS = ["L", "M", "M", "J", "V", "S", "D"];

export interface TopesDiarios {
  monto: number | null;
  cantidad: number | null;
}

export type NivelDia = "libre" | "margen" | "sinMargen" | "sinTope";

export interface DiaCalendario {
  fecha: string;
  dia: number;
  cheques: ChequeEnriquecido[];
  cantidad: number;
  monto: number;
  finDeSemana: boolean;
  esHoy: boolean;
}

export interface MesCalendario {
  anio: number;
  mes: number;
  label: string;
  semanas: (DiaCalendario | null)[][];
  totalCantidad: number;
  totalMonto: number;
}

/** Clave YYYY-MM-DD de una fecha local, sin pasar por UTC. */
export function claveFecha(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

/** Índice 0=lunes ... 6=domingo. */
function indiceSemana(d: Date): number {
  return (d.getDay() + 6) % 7;
}

/** Agrupa los cheques por fecha_cobro. Los que no la tienen quedan afuera. */
export function agruparPorFechaCobro(
  enriched: ChequeEnriquecido[],
): Map<string, ChequeEnriquecido[]> {
  const map = new Map<string, ChequeEnriquecido[]>();
  enriched.forEach((c) => {
    if (!c.fecha_cobro || !toDate(c.fecha_cobro)) return;
    const key = c.fecha_cobro.slice(0, 10);
    const lista = map.get(key);
    if (lista) lista.push(c);
    else map.set(key, [c]);
  });
  return map;
}

export function contarSinFechaCobro(enriched: ChequeEnriquecido[]): number {
  return enriched.filter((c) => !c.fecha_cobro || !toDate(c.fecha_cobro)).length;
}

function sumaImportes(cheques: ChequeEnriquecido[]): number {
  return cheques.reduce((s, c) => s + (Number(c.importe) || 0), 0);
}

/** Construye la grilla lunes→domingo del mes pedido (mes: 0-11). */
export function buildCalendarioMes(
  porFecha: Map<string, ChequeEnriquecido[]>,
  anio: number,
  mes: number,
): MesCalendario {
  const hoy = claveFecha(todayMidnight());
  const primero = new Date(anio, mes, 1);
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();

  const celdas: (DiaCalendario | null)[] = [];
  for (let i = 0; i < indiceSemana(primero); i++) celdas.push(null);

  let totalCantidad = 0;
  let totalMonto = 0;

  for (let dia = 1; dia <= diasEnMes; dia++) {
    const fechaObj = new Date(anio, mes, dia);
    const fecha = claveFecha(fechaObj);
    const cheques = porFecha.get(fecha) ?? [];
    const monto = sumaImportes(cheques);
    totalCantidad += cheques.length;
    totalMonto += monto;
    celdas.push({
      fecha,
      dia,
      cheques,
      cantidad: cheques.length,
      monto,
      finDeSemana: indiceSemana(fechaObj) >= 5,
      esHoy: fecha === hoy,
    });
  }

  while (celdas.length % 7 !== 0) celdas.push(null);

  const semanas: (DiaCalendario | null)[][] = [];
  for (let i = 0; i < celdas.length; i += 7) semanas.push(celdas.slice(i, i + 7));

  return {
    anio,
    mes,
    label: `${MESES_LARGOS[mes]} ${anio}`,
    semanas,
    totalCantidad,
    totalMonto,
  };
}

/** Porcentaje de uso del día (0-1+) según los topes definidos. null si no hay topes. */
export function usoDia(
  dia: Pick<DiaCalendario, "cantidad" | "monto">,
  topes: TopesDiarios,
): number | null {
  const ratios: number[] = [];
  if (topes.monto && topes.monto > 0) ratios.push(dia.monto / topes.monto);
  if (topes.cantidad && topes.cantidad > 0) ratios.push(dia.cantidad / topes.cantidad);
  if (ratios.length === 0) return null;
  return Math.max(...ratios);
}

export function nivelDia(
  dia: Pick<DiaCalendario, "cantidad" | "monto">,
  topes: TopesDiarios,
): NivelDia {
  if (dia.cantidad === 0) return "libre";
  const uso = usoDia(dia, topes);
  if (uso === null) return "sinTope";
  return uso >= 1 ? "sinMargen" : "margen";
}

export interface MargenDia {
  monto: number | null;
  cantidad: number | null;
}

export function margenDia(
  dia: Pick<DiaCalendario, "cantidad" | "monto">,
  topes: TopesDiarios,
): MargenDia {
  return {
    monto: topes.monto && topes.monto > 0 ? Math.max(0, topes.monto - dia.monto) : null,
    cantidad:
      topes.cantidad && topes.cantidad > 0 ? Math.max(0, topes.cantidad - dia.cantidad) : null,
  };
}

export interface SugerenciaDia {
  fecha: string;
  cantidad: number;
  monto: number;
  nivel: NivelDia;
  margen: MargenDia;
  finDeSemana: boolean;
}

/**
 * Próximos días con margen para emitir, desde hoy en adelante.
 * Un día entra si está libre (0 cheques) o si tiene uso < 100%.
 */
export function proximosDiasDisponibles(
  porFecha: Map<string, ChequeEnriquecido[]>,
  topes: TopesDiarios,
  opciones: { soloHabiles?: boolean; ventanaDias?: number; maximo?: number } = {},
): SugerenciaDia[] {
  const { soloHabiles = true, ventanaDias = 60, maximo = 12 } = opciones;
  const hoy = todayMidnight();
  const out: SugerenciaDia[] = [];

  for (let i = 0; i < ventanaDias && out.length < maximo; i++) {
    const d = new Date(hoy);
    d.setDate(d.getDate() + i);
    const finDeSemana = indiceSemana(d) >= 5;
    if (soloHabiles && finDeSemana) continue;

    const fecha = claveFecha(d);
    const cheques = porFecha.get(fecha) ?? [];
    const resumen = { cantidad: cheques.length, monto: sumaImportes(cheques) };
    const nivel = nivelDia(resumen, topes);
    if (nivel === "sinMargen") continue;

    out.push({
      fecha,
      cantidad: resumen.cantidad,
      monto: resumen.monto,
      nivel,
      margen: margenDia(resumen, topes),
      finDeSemana,
    });
  }
  return out;
}

export const NIVEL_STYLES: Record<NivelDia, { bg: string; border: string; text: string; label: string }> = {
  libre: { bg: "#E8F8EF", border: "#A9DFBF", text: "#145A32", label: "Libre" },
  margen: { bg: "#FEF6E7", border: "#F5CBA7", text: "#7E5109", label: "Con margen" },
  sinMargen: { bg: "#FDEDEC", border: "#F1948A", text: "#922B21", label: "Sin margen" },
  sinTope: { bg: "#F4F6F7", border: "#D5DBDB", text: "#566573", label: "Con cheques" },
};
