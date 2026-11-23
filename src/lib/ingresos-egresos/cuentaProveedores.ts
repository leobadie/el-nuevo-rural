import type {
  AplicacionNotaCredito,
  CuentaProveedor,
  EntregaConSaldo,
  EntregaProveedor,
  ImputacionPago,
  Movimiento,
  NotaConSaldo,
  NotaCreditoProveedor,
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
 * Lo que se debe de una boleta con descuento (SPEC-descuento-proveedores.md): el descuento se
 * redondea a centavos y se resta, así la boleta, el descuento y lo que se debe siempre suman.
 * Con 5% sobre $ 33.333,33 se descuentan $ 1.666,67 y se deben $ 31.666,66.
 */
export function montoConDescuento(boleta: number, pct: number): number {
  const boletaC = centavos(boleta);
  const descuentoC = Math.round((boletaC * pct) / 100);
  return pesos(boletaC - descuentoC);
}

/** Un % de descuento válido: más de 0 y menos de 100 (la base exige lo mismo). */
export function esDescuentoValido(pct: number | null | undefined): pct is number {
  return pct != null && Number.isFinite(pct) && pct > 0 && pct < 100;
}

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

function imputadoPorClave<T extends { monto: number }>(filas: T[], clave: keyof T): Map<string, number> {
  const map = new Map<string, number>();
  filas.forEach((i) => {
    const k = String(i[clave]);
    map.set(k, (map.get(k) ?? 0) + centavos(i.monto));
  });
  return map;
}

/**
 * Entregas de un proveedor, de la más vieja a la más nueva, con su saldo pendiente. El saldo
 * descuenta los pagos aplicados y las notas de crédito aplicadas (SPEC-notas-credito.md, 9).
 * Quien vaya a repartir plata contra estas entregas tiene que pasar las aplicaciones de NC: si
 * no, ofrece saldo que ya no existe y la base rechaza la imputación.
 */
export function entregasConSaldo(
  entregas: EntregaProveedor[],
  imputaciones: ImputacionPago[],
  proveedor: string,
  aplicacionesNota: AplicacionNotaCredito[] = [],
): EntregaConSaldo[] {
  const porEntrega = imputadoPorClave(imputaciones, "entrega_id");
  const porEntregaNC = imputadoPorClave(aplicacionesNota, "entrega_id");
  return entregas
    .filter((e) => e.proveedor === proveedor)
    .map((e) => {
      const montoC = centavos(e.monto);
      const pagadoC = Math.min(porEntrega.get(e.id) ?? 0, montoC);
      const acreditadoC = Math.min(porEntregaNC.get(e.id) ?? 0, montoC - pagadoC);
      const saldoC = montoC - pagadoC - acreditadoC;
      return {
        ...e,
        monto: pesos(montoC),
        pagado: pesos(pagadoC),
        acreditado: pesos(acreditadoC),
        saldo: pesos(saldoC),
        estado: saldoC === 0 ? "Pagada" : pagadoC + acreditadoC === 0 ? "Impaga" : "Parcial",
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

/** Notas de crédito de un proveedor, de la más vieja a la más nueva, con lo que queda a favor. */
export function notasConSaldo(
  notas: NotaCreditoProveedor[],
  aplicaciones: AplicacionNotaCredito[],
  proveedor: string,
): NotaConSaldo[] {
  const porNota = imputadoPorClave(aplicaciones, "nota_id");
  return notas
    .filter((n) => n.proveedor === proveedor)
    .map((n) => {
      const montoC = centavos(n.monto);
      const aplicadoC = Math.min(porNota.get(n.id) ?? 0, montoC);
      return { ...n, monto: pesos(montoC), aplicado: pesos(aplicadoC), disponible: pesos(montoC - aplicadoC) };
    })
    .sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : a.creado_el < b.creado_el ? -1 : 1));
}

/**
 * Lo que entra en una NC aplicada a una boleta al cargarla (SPEC-notas-credito.md, 14-15): hasta
 * el saldo de la boleta; el resto queda a favor. Sin boleta (null), todo a favor.
 */
export function partirNota(montoNota: number, saldoBoleta: number | null): { aplicar: number; aFavor: number } {
  const notaC = centavos(montoNota);
  const aplicarC = saldoBoleta == null ? 0 : Math.max(0, Math.min(notaC, centavos(saldoBoleta)));
  return { aplicar: pesos(aplicarC), aFavor: pesos(notaC - aplicarC) };
}

/**
 * Una fila por proveedor que tenga al menos una entrega, un pago o una nota de crédito (R3.3).
 * Ordenadas por saldo, la mayor deuda primero.
 */
export function buildCuentasProveedores(
  entregas: EntregaProveedor[],
  movs: Movimiento[],
  imputaciones: ImputacionPago[],
  corte?: string | null,
  notas: NotaCreditoProveedor[] = [],
  aplicacionesNota: AplicacionNotaCredito[] = [],
): CuentaProveedor[] {
  const porEntrega = imputadoPorClave(imputaciones, "entrega_id");
  const porEntregaNC = imputadoPorClave(aplicacionesNota, "entrega_id");
  const porPago = imputadoPorClave(imputaciones, "movimiento_id");
  const porNota = imputadoPorClave(aplicacionesNota, "nota_id");
  const map = new Map<string, { entregado: number; pagado: number; notas: number; aCuenta: number; pendientes: number }>();
  const tocar = (nombre: string) => {
    if (!map.has(nombre)) map.set(nombre, { entregado: 0, pagado: 0, notas: 0, aCuenta: 0, pendientes: 0 });
    return map.get(nombre)!;
  };

  entregas.forEach((e) => {
    const acc = tocar(e.proveedor);
    const montoC = centavos(e.monto);
    acc.entregado += montoC;
    if ((porEntrega.get(e.id) ?? 0) + (porEntregaNC.get(e.id) ?? 0) < montoC) acc.pendientes += 1;
  });

  notas.forEach((n) => {
    const acc = tocar(n.proveedor);
    const montoC = centavos(n.monto);
    acc.notas += montoC;
    acc.aCuenta += montoC - Math.min(porNota.get(n.id) ?? 0, montoC);
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
      notas: pesos(a.notas),
      saldo: pesos(a.entregado - a.pagado - a.notas),
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

/**
 * Reparte TODO lo que el proveedor tiene a favor —pagos y notas de crédito sin aplicar— contra sus
 * entregas pendientes, del crédito más viejo al más nuevo y de la entrega más vieja a la más nueva
 * (SPEC-notas-credito.md, 20). Devuelve por separado lo que va a imputaciones_pago y lo que va a
 * aplicaciones_nota_credito, porque son tablas distintas.
 */
export function repartirTodoConNotasFIFO(
  pagos: PagoConSaldo[],
  notas: NotaConSaldo[],
  entregas: EntregaConSaldo[],
): {
  pagos: { movimiento_id: string; entrega_id: string; monto: number }[];
  notas: { nota_id: string; entrega_id: string; monto: number }[];
} {
  const creditos = [
    ...pagos.map((p) => ({ tipo: "pago" as const, id: p.id, fecha: p.fecha, disponible: p.disponible })),
    ...notas.map((n) => ({ tipo: "nota" as const, id: n.id, fecha: n.fecha, disponible: n.disponible })),
  ].sort((a, b) => (a.fecha < b.fecha ? -1 : a.fecha > b.fecha ? 1 : 0));
  const saldos = new Map(entregas.map((e) => [e.id, centavos(e.saldo)]));
  const salida = {
    pagos: [] as { movimiento_id: string; entrega_id: string; monto: number }[],
    notas: [] as { nota_id: string; entrega_id: string; monto: number }[],
  };
  for (const c of creditos) {
    let restanteC = centavos(c.disponible);
    if (restanteC <= 0) continue;
    for (const e of entregas) {
      if (restanteC <= 0) break;
      const saldoC = saldos.get(e.id) ?? 0;
      if (saldoC <= 0) continue;
      const aplicarC = Math.min(restanteC, saldoC);
      if (c.tipo === "pago") salida.pagos.push({ movimiento_id: c.id, entrega_id: e.id, monto: pesos(aplicarC) });
      else salida.notas.push({ nota_id: c.id, entrega_id: e.id, monto: pesos(aplicarC) });
      saldos.set(e.id, saldoC - aplicarC);
      restanteC -= aplicarC;
    }
  }
  return salida;
}

/**
 * Reparto de una transferencia que paga varias boletas (SPEC-transferencia-proveedor.md, 4): sin
 * boletas elegidas va contra todas las pendientes; con elegidas, sólo contra ésas. Siempre de la más
 * vieja a la más nueva, y lo que no entra queda a cuenta. `pendientes` viene de entregasConSaldo
 * (ya ordenada y con las notas de crédito descontadas).
 */
export function repartirTransferencia(
  importe: number,
  pendientes: EntregaConSaldo[],
  elegidas: string[],
): { aplicaciones: { entrega_id: string; monto: number }[]; aCuenta: number } {
  const destino = elegidas.length > 0 ? pendientes.filter((e) => elegidas.includes(e.id)) : pendientes;
  const aplicaciones = repartirFIFO(importe, destino);
  const aplicadoC = aplicaciones.reduce((t, a) => t + centavos(a.monto), 0);
  return { aplicaciones, aCuenta: pesos(Math.max(centavos(importe) - aplicadoC, 0)) };
}
