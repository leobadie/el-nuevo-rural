export type TipoPago = "Jornal" | "Semanal" | "Mensual";
export type TipoJornada = "Jornada Completa" | "Media Jornada";

export type CodigoAsistencia = "A" | "AM" | "DF" | "FI" | "FJ" | "FM" | "FV" | "FC" | "FD";

export interface Colaborador {
  id: string;
  codigo: string;
  nombre: string;
  area: string | null;
  cargo: string | null;
  tipo_pago: TipoPago;
  valor: number;
  tipo_jornada: TipoJornada;
}

export type NuevoColaborador = Omit<Colaborador, "id">;

export interface RegistroAsistencia {
  id: string;
  colaborador_id: string;
  mes: string;
  dias: Record<string, CodigoAsistencia | string>;
  he_50: number;
  he_100: number;
}

export type NuevoRegistroAsistencia = Omit<RegistroAsistencia, "id">;

export interface ParametrosEmpleados {
  horas_completa: number;
  horas_media: number;
  recargo_50: number;
  recargo_100: number;
}

export interface ResumenColaborador {
  diasCompletos: number;
  diasMedia: number;
  diaFranco: number;
  faltaInj: number;
  faltaJust: number;
  vacaciones: number;
  descMed: number;
  otras: number;
  he50: number;
  he100: number;
  valorHora: number;
  pagoBase: number;
  pagoHE: number;
  totalPagar: number;
}
