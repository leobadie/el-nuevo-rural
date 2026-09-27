/*
 * El corte de registros de Ingresos y Egresos (SPEC-corte-registros.md): "empezar de cero" sin
 * borrar nada. Lo cargado antes del corte sigue en la base; estas funciones deciden qué se cuenta.
 *
 * Sin React ni Supabase, para probarlo suelto (`npm run verificar:corte`).
 */
import type { EntregaProveedor, ImputacionPago, Movimiento, Pedido, VentaXRP } from "./types";

/**
 * ¿Un registro cargado en `cargadoEl` entra, con este corte? Sin corte entra todo. Se compara
 * como instante y no como texto: la base devuelve "+00:00" y el navegador arma "Z".
 * Un registro sin fecha de carga entra: esconder algo por un dato faltante sería peor.
 */
export function cuentaDesdeCorte(cargadoEl: string | null | undefined, corte: string | null | undefined): boolean {
  if (!corte || !cargadoEl) return true;
  return Date.parse(cargadoEl) >= Date.parse(corte);
}

export interface DatosIE {
  movimientos: Movimiento[];
  ventasXRP: VentaXRP[];
  pedidos: Pedido[];
  entregas: EntregaProveedor[];
  imputaciones: ImputacionPago[];
}

export interface Guardados {
  movimientos: number;
  ventasXRP: number;
  pedidos: number;
  entregas: number;
}

/**
 * Lo que se ve con el corte y cuánto quedó guardado antes. Los pagos aplicados sólo se ven si
 * el pago y la entrega se ven: uno que cruza el corte dejaría una entrega "pagada" con plata
 * que no aparece en ningún lado (SPEC 5).
 */
export function aplicarCorte(datos: DatosIE, corte: string | null | undefined): { visibles: DatosIE; guardados: Guardados } {
  const movimientos = datos.movimientos.filter((m) => cuentaDesdeCorte(m.creado_el, corte));
  const ventasXRP = datos.ventasXRP.filter((v) => cuentaDesdeCorte(v.creado_el, corte));
  const pedidos = datos.pedidos.filter((p) => cuentaDesdeCorte(p.enviado_el, corte));
  const entregas = datos.entregas.filter((e) => cuentaDesdeCorte(e.creado_el, corte));
  const idsMov = new Set(movimientos.map((m) => m.id));
  const idsEnt = new Set(entregas.map((e) => e.id));
  const imputaciones = datos.imputaciones.filter((i) => idsMov.has(i.movimiento_id) && idsEnt.has(i.entrega_id));
  return {
    visibles: { movimientos, ventasXRP, pedidos, entregas, imputaciones },
    guardados: {
      movimientos: datos.movimientos.length - movimientos.length,
      ventasXRP: datos.ventasXRP.length - ventasXRP.length,
      pedidos: datos.pedidos.length - pedidos.length,
      entregas: datos.entregas.length - entregas.length,
    },
  };
}

/** El corte de la cuenta corriente: el más nuevo entre el suyo (013) y el general (SPEC 5). */
export function corteCuentaCorriente(propio: string | null | undefined, general: string | null | undefined): string | null {
  if (!propio) return general ?? null;
  if (!general) return propio;
  return Date.parse(general) > Date.parse(propio) ? general : propio;
}

/** "799 movimientos, 18 ventas XRP y 6 pedidos". Vacío si no quedó nada guardado. */
export function textoGuardados(g: Guardados): string {
  const partes = [
    [g.movimientos, "movimiento", "movimientos"],
    [g.ventasXRP, "venta XRP", "ventas XRP"],
    [g.pedidos, "pedido", "pedidos"],
    [g.entregas, "entrega de proveedor", "entregas de proveedores"],
  ]
    .filter(([n]) => (n as number) > 0)
    .map(([n, uno, varios]) => `${(n as number).toLocaleString("es-AR")} ${n === 1 ? uno : varios}`);
  if (partes.length <= 1) return partes[0] ?? "";
  return `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}`;
}

/** El corte que arma el admin al elegir un día: las 00:00 de ese día en hora local. */
export function corteDesdeDia(dia: string): string {
  return new Date(`${dia}T00:00:00`).toISOString();
}
