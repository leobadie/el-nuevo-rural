import { toDate, todayMidnight } from "./calculos";
import { esFinDeSemana, mapaNoHabiles, proximoDiaHabil, type Feriado } from "./feriados";
import type { ChequeEnriquecido, ChequeTercero, EstadoCheque, EstadoTercero } from "./types";

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

export type EstadosContados = Record<EstadoCheque, boolean>;

export const ESTADOS_CHEQUE: EstadoCheque[] = [
  "Pendiente",
  "Próximo",
  "Vencido",
  "Pagado",
  "Rechazado",
];

/*
 * Por defecto se cuenta todo menos los rechazados: un cheque pagado sí debitó plata ese
 * día (sacarlo vaciaría los meses pasados), mientras que uno rechazado nunca debitó.
 */
export const ESTADOS_POR_DEFECTO: EstadosContados = {
  Pendiente: true,
  Próximo: true,
  Vencido: true,
  Pagado: true,
  Rechazado: false,
};

/** Cheques de terceros que entran plata: los que todavía se pueden acreditar. */
const ESTADOS_TERCEROS_QUE_ENTRAN: EstadoTercero[] = ["En cartera", "Depositado"];

export interface DiaCalendario {
  fecha: string;
  dia: number;
  /** Cheques propios que salen ese día (ya filtrados por estado). */
  cheques: ChequeEnriquecido[];
  cantidad: number;
  /** Lo que realmente sale: usa debito_banco cuando existe (R11). */
  monto: number;
  /** Suma de los importes nominales, para comparar contra el débito real. */
  montoNominal: number;
  /** Cheques de terceros que entran ese día (R12). */
  terceros: ChequeTercero[];
  cantidadEntrada: number;
  montoEntrada: number;
  /** Entra menos sale. Positivo = el día suma. */
  neto: number;
  finDeSemana: boolean;
  /** El banco no opera: fin de semana, feriado o día propio del usuario. */
  noHabil: boolean;
  nombreNoHabil: string | null;
  /** Si el día no es hábil y tiene cheques, cuándo se cobrarían realmente (R10.8). */
  proximoHabil: string | null;
  esHoy: boolean;
}

export interface MesCalendario {
  anio: number;
  mes: number;
  label: string;
  semanas: (DiaCalendario | null)[][];
  totalCantidad: number;
  totalMonto: number;
  totalMontoNominal: number;
  totalEntrada: number;
  /** Días con cheques cuya fecha de cobro cae en día no hábil. */
  diasNoHabilesConCheques: DiaCalendario[];
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

/**
 * Monto que realmente mueve un cheque. `debito_banco` es lo que efectivamente salió del
 * banco, así que gana sobre el importe nominal cuando está cargado (R11.1). Se pide > 0
 * porque un débito en cero significa "todavía no debitó", no "debitó nada".
 */
export function montoCheque(c: Pick<ChequeEnriquecido, "importe" | "debito_banco">): number {
  const debito = Number(c.debito_banco) || 0;
  return debito > 0 ? debito : Number(c.importe) || 0;
}

export function montoNominalCheque(c: Pick<ChequeEnriquecido, "importe">): number {
  return Number(c.importe) || 0;
}

/** Un cheque tiene diferencia si el banco debitó algo distinto del importe emitido. */
export function tieneDiferenciaDebito(
  c: Pick<ChequeEnriquecido, "importe" | "debito_banco">,
): boolean {
  const debito = Number(c.debito_banco) || 0;
  return debito > 0 && Math.round(debito) !== Math.round(Number(c.importe) || 0);
}

/** Agrupa por fecha_cobro los cheques cuyo estado se está contando. Sin fecha, no entran. */
export function agruparPorFechaCobro(
  enriched: ChequeEnriquecido[],
  estados: EstadosContados = ESTADOS_POR_DEFECTO,
): Map<string, ChequeEnriquecido[]> {
  const map = new Map<string, ChequeEnriquecido[]>();
  enriched.forEach((c) => {
    if (!estados[c.estado]) return;
    if (!c.fecha_cobro || !toDate(c.fecha_cobro)) return;
    const key = c.fecha_cobro.slice(0, 10);
    const lista = map.get(key);
    if (lista) lista.push(c);
    else map.set(key, [c]);
  });
  return map;
}

/** Agrupa por fecha de cobro los cheques de terceros que van a acreditarse (R12.1). */
export function agruparTercerosPorFecha(
  terceros: ChequeTercero[],
): Map<string, ChequeTercero[]> {
  const map = new Map<string, ChequeTercero[]>();
  terceros.forEach((t) => {
    if (!ESTADOS_TERCEROS_QUE_ENTRAN.includes(t.estado)) return;
    if (!t.fecha_cobro || !toDate(t.fecha_cobro)) return;
    const key = t.fecha_cobro.slice(0, 10);
    const lista = map.get(key);
    if (lista) lista.push(t);
    else map.set(key, [t]);
  });
  return map;
}

export function contarSinFechaCobro(
  enriched: ChequeEnriquecido[],
  estados: EstadosContados = ESTADOS_POR_DEFECTO,
): number {
  return enriched.filter(
    (c) => estados[c.estado] && (!c.fecha_cobro || !toDate(c.fecha_cobro)),
  ).length;
}

/** Cuántos cheques quedan afuera de la grilla por el filtro de estados (R9.5). */
export function contarExcluidosPorEstado(
  enriched: ChequeEnriquecido[],
  estados: EstadosContados,
): number {
  return enriched.filter((c) => !estados[c.estado]).length;
}

function sumaSalida(cheques: ChequeEnriquecido[]): number {
  return cheques.reduce((s, c) => s + montoCheque(c), 0);
}

function sumaNominal(cheques: ChequeEnriquecido[]): number {
  return cheques.reduce((s, c) => s + montoNominalCheque(c), 0);
}

function sumaTerceros(terceros: ChequeTercero[]): number {
  return terceros.reduce((s, t) => s + (Number(t.importe) || 0), 0);
}

export interface OpcionesCalendario {
  porFecha: Map<string, ChequeEnriquecido[]>;
  anio: number;
  mes: number;
  porFechaTerceros?: Map<string, ChequeTercero[]>;
  noHabiles?: Map<string, Feriado>;
}

/** Construye la grilla lunes→domingo del mes pedido (mes: 0-11). */
export function buildCalendarioMes({
  porFecha,
  anio,
  mes,
  porFechaTerceros,
  noHabiles,
}: OpcionesCalendario): MesCalendario {
  const hoy = claveFecha(todayMidnight());
  const primero = new Date(anio, mes, 1);
  const diasEnMes = new Date(anio, mes + 1, 0).getDate();
  const feriados = noHabiles ?? mapaNoHabiles(anio);

  const celdas: (DiaCalendario | null)[] = [];
  for (let i = 0; i < indiceSemana(primero); i++) celdas.push(null);

  let totalCantidad = 0;
  let totalMonto = 0;
  let totalMontoNominal = 0;
  let totalEntrada = 0;
  const diasNoHabilesConCheques: DiaCalendario[] = [];

  for (let dia = 1; dia <= diasEnMes; dia++) {
    const fechaObj = new Date(anio, mes, dia);
    const fecha = claveFecha(fechaObj);
    const cheques = porFecha.get(fecha) ?? [];
    const terceros = porFechaTerceros?.get(fecha) ?? [];
    const monto = sumaSalida(cheques);
    const montoNominal = sumaNominal(cheques);
    const montoEntrada = sumaTerceros(terceros);
    const finDeSemana = indiceSemana(fechaObj) >= 5;
    const feriado = feriados.get(fecha);
    const noHabil = finDeSemana || Boolean(feriado);

    totalCantidad += cheques.length;
    totalMonto += monto;
    totalMontoNominal += montoNominal;
    totalEntrada += montoEntrada;

    // Solo tiene sentido anunciar "se cobra el hábil siguiente" si queda algo por debitar:
    // un cheque ya pagado no espera ninguna fecha futura.
    const esperanCobro = cheques.some((c) => c.estado !== "Pagado");

    const celda: DiaCalendario = {
      fecha,
      dia,
      cheques,
      cantidad: cheques.length,
      monto,
      montoNominal,
      terceros,
      cantidadEntrada: terceros.length,
      montoEntrada,
      neto: montoEntrada - monto,
      finDeSemana,
      noHabil,
      nombreNoHabil: feriado ? feriado.nombre : finDeSemana ? "Fin de semana" : null,
      proximoHabil: noHabil && esperanCobro ? proximoDiaHabil(fecha, feriados) : null,
      esHoy: fecha === hoy,
    };
    if (celda.noHabil && celda.proximoHabil) diasNoHabilesConCheques.push(celda);
    celdas.push(celda);
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
    totalMontoNominal,
    totalEntrada,
    diasNoHabilesConCheques,
  };
}

/**
 * Porcentaje de uso del día (0-1+) según los topes definidos. null si no hay topes.
 * Se mide solo sobre lo que sale: los ingresos por cheques de terceros no habilitan a
 * emitir más (decisión D5 del SPEC).
 */
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
  montoEntrada: number;
  nivel: NivelDia;
  margen: MargenDia;
  finDeSemana: boolean;
  noHabil: boolean;
}

export interface OpcionesSugerencias {
  soloHabiles?: boolean;
  ventanaDias?: number;
  maximo?: number;
  porFechaTerceros?: Map<string, ChequeTercero[]>;
  noHabiles?: Map<string, Feriado>;
}

/**
 * Próximos días con margen para emitir, desde hoy en adelante.
 * Un día entra si está libre (0 cheques) o si tiene uso < 100%.
 * Con "solo hábiles" se saltan fines de semana y feriados (R10.7).
 */
export function proximosDiasDisponibles(
  porFecha: Map<string, ChequeEnriquecido[]>,
  topes: TopesDiarios,
  opciones: OpcionesSugerencias = {},
): SugerenciaDia[] {
  const {
    soloHabiles = true,
    ventanaDias = 60,
    maximo = 12,
    porFechaTerceros,
    noHabiles,
  } = opciones;
  const hoy = todayMidnight();
  const out: SugerenciaDia[] = [];
  // La ventana puede cruzar el año, así que se resuelven los feriados de cada año tocado.
  const cache = new Map<number, Map<string, Feriado>>();
  const feriadosDe = (anio: number): Map<string, Feriado> => {
    if (noHabiles && anio === hoy.getFullYear()) return noHabiles;
    let m = cache.get(anio);
    if (!m) {
      m = mapaNoHabiles(anio);
      cache.set(anio, m);
    }
    return m;
  };

  for (let i = 0; i < ventanaDias && out.length < maximo; i++) {
    const d = new Date(hoy);
    d.setDate(d.getDate() + i);
    const fecha = claveFecha(d);
    const finDeSemana = indiceSemana(d) >= 5;
    const noHabil = finDeSemana || feriadosDe(d.getFullYear()).has(fecha);
    if (soloHabiles && noHabil) continue;

    const cheques = porFecha.get(fecha) ?? [];
    const resumen = { cantidad: cheques.length, monto: sumaSalida(cheques) };
    const nivel = nivelDia(resumen, topes);
    if (nivel === "sinMargen") continue;

    out.push({
      fecha,
      cantidad: resumen.cantidad,
      monto: resumen.monto,
      montoEntrada: sumaTerceros(porFechaTerceros?.get(fecha) ?? []),
      nivel,
      margen: margenDia(resumen, topes),
      finDeSemana,
      noHabil,
    });
  }
  return out;
}

export { esFinDeSemana, mapaNoHabiles };

export const NIVEL_STYLES: Record<NivelDia, { bg: string; border: string; text: string; label: string }> = {
  libre: { bg: "#E8F8EF", border: "#A9DFBF", text: "#145A32", label: "Libre" },
  margen: { bg: "#FEF6E7", border: "#F5CBA7", text: "#7E5109", label: "Con margen" },
  sinMargen: { bg: "#FDEDEC", border: "#F1948A", text: "#922B21", label: "Sin margen" },
  sinTope: { bg: "#F4F6F7", border: "#D5DBDB", text: "#566573", label: "Con cheques" },
};
