/*
 * Cliente de las APIs públicas del BCRA.
 *
 * Se llaman DESDE EL NAVEGADOR del usuario, no desde el servidor: la API responde
 * `Access-Control-Allow-Origin: *`, así que el navegador puede consultarla directo. Hacerlo
 * así evita dos problemas: que todas las consultas salgan desde una misma IP de Vercel
 * (servidores en EE.UU., con riesgo de bloqueo geográfico) y depender del servidor para algo
 * que es una consulta pública de solo lectura.
 *
 * Sobre los importes: el BCRA los informa **en miles de pesos** (un 250 son $250.000), tanto
 * en deudas como en cheques rechazados. Se convierten a pesos con pesosDesdeMiles().
 */

const BASE = "https://api.bcra.gob.ar";
const TIMEOUT_MS = 20000;

/** Los importes del BCRA vienen en miles de pesos. */
export function pesosDesdeMiles(monto: number): number {
  return (Number(monto) || 0) * 1000;
}

export type Resultado<T> =
  | { estado: "ok"; datos: T }
  | { estado: "sinDatos" }
  | { estado: "error"; mensaje: string };

// ---------- Deudas ----------

export interface DeudaEntidad {
  entidad: string;
  situacion: number;
  fechaSit1: string | null;
  monto: number;
  diasAtrasoPago: number;
  refinanciaciones: boolean;
  recategorizacionOblig: boolean;
  situacionJuridica: boolean;
  irrecDisposicionTecnica: boolean;
  enRevision: boolean;
  procesoJud: boolean;
}

export interface PeriodoDeuda {
  periodo: string; // YYYYMM
  entidades: DeudaEntidad[];
}

export interface Deudas {
  identificacion: number;
  denominacion: string;
  periodos: PeriodoDeuda[];
}

// ---------- Cheques rechazados ----------

export interface DetalleChequeRechazado {
  nroCheque: number;
  fechaRechazo: string | null;
  monto: number;
  fechaPago: string | null;
  fechaPagoMulta: string | null;
  estadoMulta: string | null;
  ctaPersonal: boolean;
  denomJuridica: string | null;
  enRevision: boolean;
  procesoJud: boolean;
}

export interface EntidadRechazos {
  /** Código de entidad: hay que cruzarlo con el catálogo para mostrar el nombre. */
  entidad: number;
  detalle: DetalleChequeRechazado[];
}

export interface CausalRechazo {
  causal: string;
  entidades: EntidadRechazos[];
}

export interface ChequesRechazados {
  identificacion: number;
  denominacion: string;
  causales: CausalRechazo[];
}

// ---------- Cheques denunciados ----------

export interface EntidadBancaria {
  codigoEntidad: number;
  denominacion: string;
}

export interface ChequeDenunciado {
  numeroCheque: number;
  denunciado: boolean;
  fechaProcesamiento: string;
  denominacionEntidad: string;
  /** La API no documenta el contenido; se muestra tal como venga. */
  detalles: Array<Record<string, unknown>>;
}

// ---------- Núcleo ----------

function mensajeDeError(status: number): string {
  if (status === 400) return "El BCRA rechazó la consulta: revisá el número ingresado.";
  if (status === 500) return "El BCRA tuvo un error interno. Probá de nuevo en un rato.";
  if (status === 503) return "El servicio del BCRA no está disponible en este momento.";
  return `El BCRA respondió con un error (${status}).`;
}

async function consultar<T>(ruta: string): Promise<Resultado<T>> {
  try {
    const resp = await fetch(`${BASE}${ruta}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    // El 404 es la forma en que la API dice "no hay registros para este número".
    if (resp.status === 404) return { estado: "sinDatos" };
    if (!resp.ok) return { estado: "error", mensaje: mensajeDeError(resp.status) };
    const json = (await resp.json()) as { results?: T };
    if (!json || json.results === undefined) return { estado: "sinDatos" };
    return { estado: "ok", datos: json.results };
  } catch (e) {
    if (e instanceof DOMException && e.name === "TimeoutError") {
      return {
        estado: "error",
        mensaje: "El BCRA tardó demasiado en responder. Probá de nuevo.",
      };
    }
    return {
      estado: "error",
      mensaje:
        "No se pudo conectar con el BCRA. Revisá tu conexión a internet e intentá de nuevo.",
    };
  }
}

export function consultarDeudas(cuit: string): Promise<Resultado<Deudas>> {
  return consultar<Deudas>(`/centraldedeudores/v1.0/Deudas/${cuit}`);
}

export function consultarDeudasHistoricas(cuit: string): Promise<Resultado<Deudas>> {
  return consultar<Deudas>(`/centraldedeudores/v1.0/Deudas/Historicas/${cuit}`);
}

export function consultarChequesRechazados(
  cuit: string,
): Promise<Resultado<ChequesRechazados>> {
  return consultar<ChequesRechazados>(
    `/centraldedeudores/v1.0/Deudas/ChequesRechazados/${cuit}`,
  );
}

export function consultarEntidades(): Promise<Resultado<EntidadBancaria[]>> {
  return consultar<EntidadBancaria[]>(`/cheques/v1.0/entidades`);
}

export function consultarChequeDenunciado(
  codigoEntidad: number,
  nroCheque: number,
): Promise<Resultado<ChequeDenunciado>> {
  return consultar<ChequeDenunciado>(
    `/cheques/v1.0/denunciados/${codigoEntidad}/${nroCheque}`,
  );
}

// ---------- Derivados ----------

/** "202605" → "mayo 2026" */
export function nombrePeriodo(periodo: string): string {
  const MESES = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  const anio = periodo.slice(0, 4);
  const mes = parseInt(periodo.slice(4, 6), 10);
  if (!anio || !mes || mes < 1 || mes > 12) return periodo;
  return `${MESES[mes - 1]} ${anio}`;
}

/** A partir de la situación 3 el BCRA considera que hay problemas de pago. */
export const SITUACION_IRREGULAR_DESDE = 3;

export interface ResumenDeuda {
  periodo: string;
  peorSituacion: number;
  totalMiles: number;
  cantidadEntidades: number;
  maxDiasAtraso: number;
  /** Monto en entidades con situación 3 o peor. */
  irregularMiles: number;
  /** Qué proporción del total está en situación irregular (0 a 1). */
  proporcionIrregular: number;
  /** Entidades en situación irregular, de peor a mejor. */
  entidadesIrregulares: DeudaEntidad[];
  /** Todas las entidades, ordenadas con las peores primero. */
  entidades: DeudaEntidad[];
}

/** Peores situaciones primero y, dentro de la misma situación, los montos más grandes. */
function ordenarPorGravedad(entidades: DeudaEntidad[]): DeudaEntidad[] {
  return [...entidades].sort((a, b) => {
    const sa = Number(a.situacion) || 0;
    const sb = Number(b.situacion) || 0;
    if (sa !== sb) return sb - sa;
    return (Number(b.monto) || 0) - (Number(a.monto) || 0);
  });
}

/** Resume el período más reciente que informa la API (los períodos vienen ordenados). */
export function resumirUltimoPeriodo(deudas: Deudas): ResumenDeuda | null {
  const periodos = [...(deudas.periodos ?? [])].sort((a, b) =>
    a.periodo < b.periodo ? 1 : -1,
  );
  const ultimo = periodos[0];
  if (!ultimo) return null;
  const entidades = ordenarPorGravedad(ultimo.entidades ?? []);
  const totalMiles = entidades.reduce((s, e) => s + (Number(e.monto) || 0), 0);
  const entidadesIrregulares = entidades.filter(
    (e) => (Number(e.situacion) || 0) >= SITUACION_IRREGULAR_DESDE,
  );
  const irregularMiles = entidadesIrregulares.reduce(
    (s, e) => s + (Number(e.monto) || 0),
    0,
  );
  return {
    periodo: ultimo.periodo,
    peorSituacion: entidades.reduce((max, e) => Math.max(max, Number(e.situacion) || 0), 0),
    totalMiles,
    cantidadEntidades: entidades.length,
    maxDiasAtraso: entidades.reduce(
      (max, e) => Math.max(max, Number(e.diasAtrasoPago) || 0),
      0,
    ),
    irregularMiles,
    proporcionIrregular: totalMiles > 0 ? irregularMiles / totalMiles : 0,
    entidadesIrregulares,
    entidades,
  };
}

export interface PeriodoResumido {
  periodo: string;
  peorSituacion: number;
  totalMiles: number;
  /** Monto del período en situación 3 o peor. */
  irregularMiles: number;
  /** Qué proporción del período está en situación irregular (0 a 1). */
  proporcionIrregular: number;
}

/**
 * Peor situación y total por período, del más nuevo al más viejo.
 *
 * Se informa también cuánta plata había en situación irregular en cada período: la peor
 * situación sola repite mes a mes el mismo problema aislado (una deuda chica en situación 5
 * pinta doce meses de rojo aunque el resto de la cartera esté impecable).
 */
export function evolucionPorPeriodo(deudas: Deudas): PeriodoResumido[] {
  return [...(deudas.periodos ?? [])]
    .map((p) => {
      const entidades = p.entidades ?? [];
      const totalMiles = entidades.reduce((s, e) => s + (Number(e.monto) || 0), 0);
      const irregularMiles = entidades
        .filter((e) => (Number(e.situacion) || 0) >= SITUACION_IRREGULAR_DESDE)
        .reduce((s, e) => s + (Number(e.monto) || 0), 0);
      return {
        periodo: p.periodo,
        peorSituacion: entidades.reduce(
          (max, e) => Math.max(max, Number(e.situacion) || 0),
          0,
        ),
        totalMiles,
        irregularMiles,
        proporcionIrregular: totalMiles > 0 ? irregularMiles / totalMiles : 0,
      };
    })
    .sort((a, b) => (a.periodo < b.periodo ? 1 : -1));
}

export interface ResumenRechazos {
  cantidad: number;
  totalMiles: number;
  sinPagar: number;
  conMultaImpaga: number;
}

export function resumirRechazos(datos: ChequesRechazados): ResumenRechazos {
  let cantidad = 0;
  let totalMiles = 0;
  let sinPagar = 0;
  let conMultaImpaga = 0;
  (datos.causales ?? []).forEach((c) =>
    (c.entidades ?? []).forEach((e) =>
      (e.detalle ?? []).forEach((d) => {
        cantidad += 1;
        totalMiles += Number(d.monto) || 0;
        if (!d.fechaPago) sinPagar += 1;
        if (!d.fechaPagoMulta && d.estadoMulta && !/pagad/i.test(d.estadoMulta)) {
          conMultaImpaga += 1;
        }
      }),
    ),
  );
  return { cantidad, totalMiles, sinPagar, conMultaImpaga };
}
