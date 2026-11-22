/**
 * Cuentas para vincular cheques ya cargados con pagos a proveedores
 * (SPEC-cheque-a-proveedor.md). Sin dependencias: se prueba en verificacion/cheque-a-proveedor-calculos.mts.
 */

export interface ChequeBasico {
  id: string;
  n_cheque: string | null;
  proveedor: string;
  fecha_emision: string | null;
  fecha_cobro: string | null;
  importe: number;
  rechazado: boolean;
  observaciones: string | null;
  creado_el: string;
}

export interface MovimientoConCheque {
  id: string;
  cheque_id?: string | null;
  proveedor: string | null;
  descripcion: string | null;
  fecha: string;
}

/** Un pago con el cheque que lo pagó, para mostrar en Control de Cheques. */
export interface PagoVinculado {
  id: string;
  cheque_id: string;
  proveedor: string | null;
  descripcion: string | null;
  fecha: string;
}

/**
 * Si a un cheque se le ofrece "Aplicar a deuda" (R5): no rechazado, sin pago vinculado y cargado
 * desde el corte de registros. Los anteriores se usaron antes de que existiera la cuenta
 * corriente; ofrecerlo en los 460 cheques viejos sólo llenaría la tabla de botones.
 */
export function puedeAplicarseADeuda(c: ChequeBasico, usados: Set<string>, corte: string | null): boolean {
  if (c.rechazado || usados.has(c.id)) return false;
  return !corte || c.creado_el >= corte;
}

export interface EntregaPendiente {
  id: string;
  saldo: number;
}

export const PREFIJO_GENERADO = "Generado desde Ingresos y Egresos";

const centavos = (n: unknown): number => Math.round((Number(n) || 0) * 100);
const pesos = (c: number): number => c / 100;

/** Palabras que no dicen quién es el proveedor: bancos, formas societarias, rubros genéricos. */
const RUIDO = new Set([
  "santander", "galicia", "nacion", "macro", "provincia", "bbva", "frances", "credicoop", "icbc", "hsbc", "patagonia",
  "sa", "srl", "sas", "de", "del", "la", "el", "los", "las", "y", "e", "cheque", "echeque", "mayorista", "distribuidora",
]);

/** Las palabras que identifican a un proveedor, sin acentos, mayúsculas, signos ni ruido. */
export function palabrasProveedor(nombre: string | null | undefined): string[] {
  return (nombre ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((p) => p.length >= 2 && !RUIDO.has(p));
}

/**
 * Qué tanto se parecen dos nombres de proveedor, de 0 a 1: la parte de las palabras del más
 * corto que aparecen en el otro. "santa rita santander" vs "SANTA RITA SOTO (MAYORISTA)" = 1;
 * "REGGIO" vs "REGGIO CHICO" = 1; "TERRABUSI" vs "Italiana" = 0.
 */
export function parecidoProveedor(a: string | null | undefined, b: string | null | undefined): number {
  const pa = palabrasProveedor(a);
  const pb = palabrasProveedor(b);
  if (pa.length === 0 || pb.length === 0) return 0;
  const [corto, largo] = pa.length <= pb.length ? [pa, pb] : [pb, pa];
  const coinciden = corto.filter((p) => largo.some((q) => q === p || (p.length >= 4 && q.length >= 4 && (q.startsWith(p) || p.startsWith(q)))));
  return coinciden.length / corto.length;
}

/** Ids de los cheques que ya tienen un pago vinculado. */
export function idsChequesUsados(movs: MovimientoConCheque[]): Set<string> {
  return new Set(movs.map((m) => m.cheque_id).filter((id): id is string => !!id));
}

/** Cheques que se pueden asignar: no rechazados y sin pago vinculado (R2). */
export function chequesSinUsar<C extends ChequeBasico>(cheques: C[], movs: MovimientoConCheque[]): C[] {
  const usados = idsChequesUsados(movs);
  return cheques.filter((c) => !c.rechazado && !usados.has(c.id));
}

/** Busca por N° de cheque, proveedor o importe (con o sin puntos). Vacío = todos. */
export function filtrarCheques<C extends ChequeBasico>(cheques: C[], texto: string): C[] {
  const t = texto.trim().toLowerCase();
  if (!t) return cheques;
  const soloDigitos = t.replace(/[^0-9]/g, "");
  return cheques.filter((c) => {
    if ((c.n_cheque ?? "").toLowerCase().includes(t)) return true;
    if (palabrasProveedor(c.proveedor).join(" ").includes(t) || c.proveedor.toLowerCase().includes(t)) return true;
    if (soloDigitos.length >= 3 && String(Math.round(Number(c.importe))).includes(soloDigitos)) return true;
    return false;
  });
}

/**
 * Primero los cheques cuyo proveedor se parece al buscado; dentro de cada grupo, el más nuevo
 * primero (por emisión y, si empatan, por cuándo se cargó) (R3).
 */
export function ordenarParaProveedor<C extends ChequeBasico>(cheques: C[], proveedor: string | null | undefined): C[] {
  const fechaDe = (c: C) => `${c.fecha_emision ?? ""}|${c.creado_el}`;
  return [...cheques]
    .map((c) => ({ c, p: proveedor ? parecidoProveedor(c.proveedor, proveedor) : 0 }))
    .sort((x, y) => {
      if (y.p !== x.p) return y.p - x.p;
      return fechaDe(y.c) < fechaDe(x.c) ? -1 : fechaDe(y.c) > fechaDe(x.c) ? 1 : 0;
    })
    .map((x) => x.c);
}

/**
 * Cómo se reparte un cheque entre las entregas pendientes de un proveedor (R4): primero la
 * entrega donde se tocó "Pagar" (si hay), después las demás de la más vieja a la más nueva.
 * `pendientes` tiene que venir ordenada de la más vieja a la más nueva. Lo que no entra queda a cuenta.
 */
export function repartirCheque(
  importe: number,
  pendientes: EntregaPendiente[],
  entregaPrimeroId?: string | null,
): { aplicaciones: { entrega_id: string; monto: number }[]; aCuenta: number } {
  const orden = entregaPrimeroId
    ? [...pendientes.filter((e) => e.id === entregaPrimeroId), ...pendientes.filter((e) => e.id !== entregaPrimeroId)]
    : pendientes;
  let restanteC = centavos(importe);
  const aplicaciones: { entrega_id: string; monto: number }[] = [];
  for (const e of orden) {
    if (restanteC <= 0) break;
    const saldoC = centavos(e.saldo);
    if (saldoC <= 0) continue;
    const aplicarC = Math.min(restanteC, saldoC);
    aplicaciones.push({ entrega_id: e.id, monto: pesos(aplicarC) });
    restanteC -= aplicarC;
  }
  return { aplicaciones, aCuenta: pesos(Math.max(restanteC, 0)) };
}

const diasEntre = (a: string, b: string): number =>
  Math.abs((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${b}T12:00:00Z`)) / 86_400_000);

/** Un cheque que creó la app sola al cargar un pago con medio Cheque. */
export function esChequeGenerado(c: ChequeBasico): boolean {
  return (c.observaciones ?? "").startsWith(PREFIJO_GENERADO);
}

/**
 * Pares de cheques que parecen el mismo (R9): uno generado desde un pago y otro cargado a mano,
 * con el mismo importe, proveedor parecido y emitidos a 15 días o menos. Dos cargados a mano —o
 * dos generados— con el mismo importe no cuentan: pueden ser pagos distintos de verdad (un
 * alquiler, dos facturas iguales).
 */
export function posiblesRepetidos<C extends ChequeBasico>(cheques: C[]): { generado: C; otro: C }[] {
  const pares: { generado: C; otro: C }[] = [];
  const generados = cheques.filter((c) => esChequeGenerado(c));
  for (const g of generados) {
    for (const o of cheques) {
      if (o.id === g.id || esChequeGenerado(o)) continue;
      if (centavos(o.importe) !== centavos(g.importe)) continue;
      if (parecidoProveedor(o.proveedor, g.proveedor) === 0) continue;
      if (g.fecha_emision && o.fecha_emision && diasEntre(g.fecha_emision, o.fecha_emision) > 15) continue;
      pares.push({ generado: g, otro: o });
    }
  }
  return pares;
}
