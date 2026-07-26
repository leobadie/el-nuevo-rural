import { computeResumenColaborador, diasEnMes } from "@/lib/empleados/calculos";
import type { Colaborador, ParametrosEmpleados, RegistroAsistencia } from "@/lib/empleados/types";
import type { Movimiento, VentaXRP } from "@/lib/ingresos-egresos/types";

export const CATEGORIAS_INGRESO_REAL = ["Otro Ingreso"];

export interface DatosMes {
  ingresosReales: number;
  retiroCaja: number;
  cobroCliente: number;
  egresosOperativos: number;
  egresosPorCategoria: Record<string, number>;
  costoPersonal: number;
  utilidad: number;
  margen: number;
}

export interface GastoCategoria {
  categoria: string;
  total: number;
}

export interface EvolucionMes {
  key: string;
  label: string;
  ingresos: number;
  gastos: number;
  utilidad: number;
}

function claveMes(anio: number, mes: number): string {
  return `${anio}-${String(mes).padStart(2, "0")}`;
}

export function ventasXRPDelMes(ventasXRP: VentaXRP[], anio: number, mes: number): VentaXRP[] {
  const clave = claveMes(anio, mes);
  return ventasXRP.filter((v) => v.fecha?.startsWith(clave));
}

export function costoPersonalDelMes(
  colaboradores: Colaborador[],
  registros: RegistroAsistencia[],
  parametros: ParametrosEmpleados,
  anio: number,
  mes: number,
): number {
  const clave = claveMes(anio, mes);
  const dias = diasEnMes(anio, mes);
  return colaboradores.reduce((s, c) => {
    const registro = registros.find((r) => r.colaborador_id === c.id && r.mes === clave);
    return s + computeResumenColaborador(c, registro, parametros, dias).totalPagar;
  }, 0);
}

export function calcularMes(
  movs: Movimiento[],
  ventasXRP: VentaXRP[],
  colaboradores: Colaborador[],
  registros: RegistroAsistencia[],
  parametros: ParametrosEmpleados,
  anio: number,
  mes: number,
): DatosMes {
  const clave = claveMes(anio, mes);
  const movsMes = movs.filter((m) => m.fecha?.startsWith(clave));
  const ventasDelMes = ventasXRPDelMes(ventasXRP, anio, mes);
  const ventasXRPTotal = ventasDelMes.reduce((s, v) => s + (v.venta_total || 0), 0);
  const cobrosXRPTotal = ventasDelMes.reduce((s, v) => s + (v.cobro_total || 0), 0);

  const ingresosReales =
    ventasXRPTotal +
    movsMes
      .filter((m) => m.categoria && CATEGORIAS_INGRESO_REAL.includes(m.categoria))
      .reduce((s, m) => s + (Number(m.ingreso) || 0), 0);

  const retiroCaja = movsMes
    .filter((m) => m.categoria === "Retiro de Caja")
    .reduce((s, m) => s + (Number(m.ingreso) || 0), 0);

  const cobroCliente =
    cobrosXRPTotal +
    movsMes.filter((m) => m.categoria === "Cobro a Cliente").reduce((s, m) => s + (Number(m.ingreso) || 0), 0);

  const egresosPorCategoria: Record<string, number> = {};
  movsMes
    .filter((m) => m.categoria && m.categoria !== "Sueldos")
    .forEach((m) => {
      const cat = m.categoria as string;
      egresosPorCategoria[cat] = (egresosPorCategoria[cat] || 0) + (Number(m.egreso) || 0);
    });
  const egresosOperativos = Object.values(egresosPorCategoria).reduce((s, v) => s + v, 0);

  const costoPersonal = costoPersonalDelMes(colaboradores, registros, parametros, anio, mes);

  const utilidad = ingresosReales - egresosOperativos - costoPersonal;
  const margen = ingresosReales > 0 ? (utilidad / ingresosReales) * 100 : 0;

  return { ingresosReales, retiroCaja, cobroCliente, egresosOperativos, egresosPorCategoria, costoPersonal, utilidad, margen };
}

export function buildGastosPorCategoria(datosMes: DatosMes): GastoCategoria[] {
  const arr: GastoCategoria[] = Object.entries(datosMes.egresosPorCategoria).map(([categoria, total]) => ({
    categoria,
    total: Math.round(total),
  }));
  if (datosMes.costoPersonal > 0) {
    arr.push({ categoria: "Costo de Personal", total: Math.round(datosMes.costoPersonal) });
  }
  return arr.sort((a, b) => b.total - a.total);
}

const MESES_RENT = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export function buildEvolucion(
  movs: Movimiento[],
  ventasXRP: VentaXRP[],
  colaboradores: Colaborador[],
  registros: RegistroAsistencia[],
  parametros: ParametrosEmpleados,
): EvolucionMes[] {
  const claves = new Set<string>();
  movs.forEach((m) => {
    if (m.fecha) claves.add(m.fecha.slice(0, 7));
  });
  ventasXRP.forEach((v) => {
    if (v.fecha) claves.add(v.fecha.slice(0, 7));
  });
  registros.forEach((r) => claves.add(r.mes));

  const ordenadas = Array.from(claves).sort();
  return ordenadas.map((clave) => {
    const [anio, mes] = clave.split("-").map(Number);
    const datos = calcularMes(movs, ventasXRP, colaboradores, registros, parametros, anio, mes);
    return {
      key: clave,
      label: `${MESES_RENT[mes - 1]} ${anio}`,
      ingresos: Math.round(datos.ingresosReales),
      gastos: Math.round(datos.egresosOperativos + datos.costoPersonal),
      utilidad: Math.round(datos.utilidad),
    };
  });
}
