import type {
  CuentaProveedor,
  EntregaConSaldo,
  EntregaProveedor,
  ImputacionPago,
  Movimiento,
  PagoConSaldo,
} from "./types";

/**
 * Los montos vienen de columnas numeric(14,2), que supabase-js entrega como string o
 * number según el caso. Se normaliza a centavos enteros para que las comparaciones de
 * "¿ya está pagada?" no fallen por el redondeo binario de los flotantes.
 */
const centavos = (n: unknown): number => Math.round((Number(n) || 0) * 100);
const pesos = (c: number): number => c / 100;

/**
 * Es pago a un proveedor todo egreso con ese proveedor cargado, sin filtrar por categoría (R2.1),
 * siempre que se haya cargado a partir del corte (R8).
 *
 * El corte se compara contra `creado_el` (cuándo se cargó) y no contra `fecha` (a qué día
 * corresponde): un pago de la semana pasada que se carga hoy tiene que entrar en la cuenta.
 * Los movimientos anteriores al corte no desaparecen de ningún lado — sólo no los mira esta
 * pantalla, que no tiene entregas viejas contra las cuales imputarlos.
 */
export function esPagoAProveedor(m: Movimiento, corte?: string | null): boolean {
  if (!m.proveedor || centavos(m.egreso) <= 0) return false;
  if (corte && m.creado_el && m.creado_el < corte) return false;
  return true;
}

function imputadoPorClave(imputaciones: ImputacionPago[], clave: "entrega_id" | "movimiento_id"): Map<string, number> {
  const map = new Map<string, number>();
  imputaciones.forEach((i) => {
    map.set(i[clave], (map.get(i[clave]) ?? 0) + centavos(i.monto));
  });
  return map;
}

/** Entregas de un proveedor, de la más vieja a la más nueva, con su saldo pendiente. */
export function entregasConSaldo(
  entregas: EntregaProveedor[],
  imputaciones: ImputacionPago[],
  proveedor: string,
): EntregaConSaldo[] {
  const porEntrega = imputadoPorClave(imputaciones, "entrega_id");
  return entregas
    .filter((e) => e.proveedor === proveedor)
    .map((e) => {
      const montoC = centavos(e.monto);
      const pagadoC = Math.min(porEntrega.get(e.id) ?? 0, montoC);
      const saldoC = montoC - pagadoC;
      return {
        ...e,
        monto: pesos(montoC),
        pagado: pesos(pagadoC),
        saldo: pesos(saldoC),
        estado: saldoC === 0 ? "Pagada" : pagadoC === 0 ? "Impaga" : "Parcial",
      } as EntregaConSaldo;
    })
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.creado_el < b.creado_el ? -1 : 1));
}

/** Pagos de un proveedor, del más viejo al más nuevo, con lo que queda sin imputar. */
export function pagosConSaldo(
  movs: Movimiento[],
  imputaciones: ImputacionPago[],
  proveedor: string,
  corte?: string | null,
): PagoConSaldo[] {
  const porPago = imputadoPorClave(imputaciones, "movimiento_id");
  return movs
    .filter((m) => esPagoAProveedor(m, corte) && m.proveedor === proveedor)
    .map((m) => {
      const montoC = centavos(m.egreso);
      const imputadoC = Math.min(porPago.get(m.id) ?? 0, montoC);
      return {
        id: m.id,
        fecha: m.fecha,
        descripcion: m.descripcion,
        medio_pago: m.medio_pago,
        monto: pesos(montoC),
        imputado: pesos(imputadoC),
        disponible: pesos(montoC - imputadoC),
      };
    })
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
}

/**
 * Una fila por proveedor que tenga al menos una entrega o un pago (R3.3).
 * Ordenadas por saldo, la mayor deuda primero.
 */
export function buildCuentasProveedores(
  entregas: EntregaProveedor[],
  movs: Movimiento[],
  imputaciones: ImputacionPago[],
  corte?: string | null,
): CuentaProveedor[] {
  const porEntrega = imputadoPorClave(imputaciones, "entrega_id");
  const porPago = imputadoPorClave(imputaciones, "movimiento_id");
  const map = new Map<string, { entregado: number; pagado: number; aCuenta: number; pendientes: number }>();
  const tocar = (nombre: string) => {
    if (!map.has(nombre)) map.set(nombre, { entregado: 0, pagado: 0, aCuenta: 0, pendientes: 0 });
    return map.get(nombre)!;
  };

  entregas.forEach((e) => {
    const acc = tocar(e.proveedor);
    const montoC = centavos(e.monto);
    acc.entregado += montoC;
    if (Math.min(porEntrega.get(e.id) ?? 0, montoC) < montoC) acc.pendientes += 1;
  });

  movs.forEach((m) => {
    if (!esPagoAProveedor(m, corte)) return;
    const acc = tocar(m.proveedor!);
    const montoC = centavos(m.egreso);
    acc.pagado += montoC;
    acc.aCuenta += montoC - Math.min(porPago.get(m.id) ?? 0, montoC);
  });

  return [...map.entries()]
    .map(([proveedor, a]) => ({
      proveedor,
      entregado: pesos(a.entregado),
      pagado: pesos(a.pagado),
      saldo: pesos(a.entregado - a.pagado),
      aCuenta: pesos(a.aCuenta),
      cantEntregasPendientes: a.pendientes,
    }))
    .sort((a, b) => b.saldo - a.saldo || a.proveedor.localeCompare(b.proveedor, "es"));
}

/**
 * Reparte el disponible de un pago contra las entregas pendientes, de la más vieja a la
 * más nueva, hasta que se agote uno de los dos (R6.2).
 */
export function repartirFIFO(
  disponible: number,
  entregas: EntregaConSaldo[],
): { entrega_id: string; monto: number }[] {
  let restanteC = centavos(disponible);
  const salida: { entrega_id: string; monto: number }[] = [];
  for (const e of entregas) {
    if (restanteC <= 0) break;
    const saldoC = centavos(e.saldo);
    if (saldoC <= 0) continue;
    const aplicarC = Math.min(restanteC, saldoC);
    salida.push({ entrega_id: e.id, monto: pesos(aplicarC) });
    restanteC -= aplicarC;
  }
  return salida;
}

/**
 * Reparte TODO el saldo a cuenta del proveedor contra sus entregas pendientes: pagos del más
 * viejo al más nuevo contra entregas de la más vieja a la más nueva (R9.5).
 *
 * Lleva su propio registro de lo que va consumiendo de cada entrega porque las `EntregaConSaldo`
 * que recibe se calcularon antes de este reparto: si mirara sólo el `saldo` de cada una, el
 * segundo pago volvería a apuntar a una entrega que el primero ya cubrió y la base rechazaría
 * la imputación por pasarse del monto.
 */
export function repartirTodoFIFO(
  pagos: PagoConSaldo[],
  entregas: EntregaConSaldo[],
): { movimiento_id: string; entrega_id: string; monto: number }[] {
  const saldos = new Map(entregas.map((e) => [e.id, centavos(e.saldo)]));
  const salida: { movimiento_id: string; entrega_id: string; monto: number }[] = [];
  for (const p of pagos) {
    let restanteC = centavos(p.disponible);
    if (restanteC <= 0) continue;
    for (const e of entregas) {
      if (restanteC <= 0) break;
      const saldoC = saldos.get(e.id) ?? 0;
      if (saldoC <= 0) continue;
      const aplicarC = Math.min(restanteC, saldoC);
      salida.push({ movimiento_id: p.id, entrega_id: e.id, monto: pesos(aplicarC) });
      saldos.set(e.id, saldoC - aplicarC);
      restanteC -= aplicarC;
    }
  }
  return salida;
}
