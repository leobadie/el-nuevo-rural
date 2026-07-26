import type { Colaborador, ParametrosEmpleados, RegistroAsistencia, ResumenColaborador } from "./types";

export function round2(n: number | string | null | undefined): number {
  return Math.round((parseFloat(String(n ?? "")) || 0) * 100) / 100;
}

export function diasEnMes(anio: number, mes: number): number {
  return new Date(anio, mes, 0).getDate();
}

export function contarCodigo(dias: Record<string, string> | null | undefined, codigo: string): number {
  return Object.values(dias || {}).filter((v) => v === codigo).length;
}

export const fmtMoneyEmp = (n: number | string | null | undefined): string =>
  "$" + Math.round(parseFloat(String(n ?? "")) || 0).toLocaleString("es-AR");

export function computeResumenColaborador(
  colaborador: Colaborador,
  registro: Pick<RegistroAsistencia, "dias" | "he_50" | "he_100"> | null | undefined,
  parametros: ParametrosEmpleados,
  totalDiasMes: number,
): ResumenColaborador {
  const dias = registro?.dias || {};

  const diasCompletos = contarCodigo(dias, "A");
  const diasMedia = contarCodigo(dias, "AM");
  const diaFranco = contarCodigo(dias, "DF");
  const faltaInj = contarCodigo(dias, "FI");
  const faltaJust = contarCodigo(dias, "FJ");
  const vacaciones = contarCodigo(dias, "FV");
  const descMed = contarCodigo(dias, "FM");
  const otras = contarCodigo(dias, "FC") + contarCodigo(dias, "FD");

  const he50 = Number(registro?.he_50) || 0;
  const he100 = Number(registro?.he_100) || 0;

  const valor = Number(colaborador.valor) || 0;

  const horasJornada = colaborador.tipo_jornada === "Media Jornada" ? parametros.horas_media : parametros.horas_completa;

  const baseHora =
    colaborador.tipo_pago === "Jornal" ? valor : colaborador.tipo_pago === "Semanal" ? valor / 7 : valor / 30;

  const valorHora = horasJornada > 0 ? round2(baseHora / horasJornada) : 0;

  let pagoBase: number;
  if (colaborador.tipo_pago === "Jornal") {
    pagoBase = valor * diasCompletos + (valor / 2) * diasMedia;
  } else if (colaborador.tipo_pago === "Semanal") {
    pagoBase = (valor / 7) * (totalDiasMes - faltaInj);
  } else {
    pagoBase = valor - (valor / 30) * faltaInj;
  }

  const pagoHE = round2(he50 * valorHora * (1 + parametros.recargo_50) + he100 * valorHora * (1 + parametros.recargo_100));

  const totalPagar = round2(pagoBase + pagoHE);

  return {
    diasCompletos, diasMedia, diaFranco, faltaInj, faltaJust, vacaciones, descMed, otras,
    he50, he100, valorHora, pagoBase: round2(pagoBase), pagoHE, totalPagar,
  };
}
