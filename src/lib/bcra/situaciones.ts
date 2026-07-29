/*
 * Clasificación de deudores del BCRA (situación 1 a 6).
 *
 * Los días de atraso que se indican corresponden a la cartera de consumo o vivienda; para
 * cartera comercial la clasificación mira la capacidad de pago del deudor y no solo la mora,
 * así que se mencionan como referencia y no como definición exacta.
 *
 * Fuente: texto ordenado "Clasificación de deudores" del BCRA
 * (https://www.bcra.gob.ar/archivos/Pdfs/texord/t-cladeu.pdf).
 */

export interface SituacionBcra {
  nivel: number;
  label: string;
  detalle: string;
  bg: string;
  text: string;
  /** Para ordenar el semáforo: verde, amarillo, naranja, rojo. */
  gravedad: "normal" | "atencion" | "riesgo" | "grave";
}

export const SITUACIONES: Record<number, SituacionBcra> = {
  1: {
    nivel: 1,
    label: "Normal",
    detalle: "Paga en término. Sin atrasos que se informen.",
    bg: "#D5F5E3",
    text: "#145A32",
    gravedad: "normal",
  },
  2: {
    nivel: 2,
    label: "Riesgo bajo",
    detalle: "Atraso de entre 31 y 90 días, o paga solo los mínimos.",
    bg: "#FCF3CF",
    text: "#7D6608",
    gravedad: "atencion",
  },
  3: {
    nivel: 3,
    label: "Riesgo medio",
    detalle: "Atraso de entre 91 y 180 días. Con problemas para pagar.",
    bg: "#FDEBD0",
    text: "#784212",
    gravedad: "riesgo",
  },
  4: {
    nivel: 4,
    label: "Riesgo alto",
    detalle: "Atraso de entre 181 y 365 días. Alto riesgo de insolvencia.",
    bg: "#FADBD8",
    text: "#922B21",
    gravedad: "grave",
  },
  5: {
    nivel: 5,
    label: "Irrecuperable",
    detalle: "Atraso de más de 365 días.",
    bg: "#F5B7B1",
    text: "#7B241C",
    gravedad: "grave",
  },
  6: {
    nivel: 6,
    label: "Irrecuperable por disposición técnica",
    detalle:
      "Deuda con una entidad liquidada o revocada, clasificada por disposición técnica.",
    bg: "#E8DAEF",
    text: "#4A235A",
    gravedad: "grave",
  },
};

const DESCONOCIDA: SituacionBcra = {
  nivel: 0,
  label: "Sin clasificar",
  detalle: "El BCRA no informa una situación para este registro.",
  bg: "#F8F9FA",
  text: "#1A1A2E",
  gravedad: "normal",
};

export function situacionBcra(nivel: number | null | undefined): SituacionBcra {
  return SITUACIONES[Number(nivel)] ?? DESCONOCIDA;
}

export interface DatosVeredicto {
  peorSituacion: number;
  cantidadRechazos: number;
  /** Proporción de la deuda que está en situación 3 o peor (0 a 1). */
  proporcionIrregular: number;
  /** Nombre de la entidad donde está el peor registro, para poder nombrarla. */
  entidadPeor?: string | null;
}

/**
 * A partir de acá se considera que la mora define el perfil del deudor y no es un caso
 * aislado. Debajo de este umbral, la peor situación se informa igual pero se aclara que
 * es marginal: una empresa grande puede tener una deuda chica en situación 5 con un
 * servicio menor mientras el resto de su deuda está impecable, y leer eso como "riesgo
 * alto" haría rechazar a un cliente bueno.
 */
const UMBRAL_IRREGULAR = 0.2;

export function veredicto(datos: DatosVeredicto): {
  titulo: string;
  detalle: string;
  bg: string;
  text: string;
} {
  const { peorSituacion, cantidadRechazos, proporcionIrregular, entidadPeor } = datos;
  const porcentaje = Math.round(proporcionIrregular * 100);
  const donde = entidadPeor ? ` con ${entidadPeor}` : "";

  if (cantidadRechazos > 0) {
    return {
      titulo:
        cantidadRechazos === 1
          ? "Tiene 1 cheque rechazado"
          : `Tiene ${cantidadRechazos} cheques rechazados`,
      detalle:
        peorSituacion >= 3
          ? "Además registra mora en el sistema financiero. Conviene pedir otra forma de pago."
          : "Está al día con los bancos, pero registra rechazos de cheques.",
      bg: "#FADBD8",
      text: "#922B21",
    };
  }
  if (peorSituacion >= 3 && proporcionIrregular >= UMBRAL_IRREGULAR) {
    return {
      titulo: "Registra atrasos importantes",
      detalle: `Sin cheques rechazados, pero el ${porcentaje}% de su deuda está en situación irregular.`,
      bg: "#FDEBD0",
      text: "#784212",
    };
  }
  if (peorSituacion >= 3) {
    return {
      titulo: "Atraso puntual, el resto normal",
      detalle: `Figura en situación ${peorSituacion}${donde}, pero eso es apenas el ${porcentaje < 1 ? "menos del 1" : porcentaje}% de su deuda: el resto está en situación normal y no tiene cheques rechazados.`,
      bg: "#FCF3CF",
      text: "#7D6608",
    };
  }
  if (peorSituacion === 2) {
    return {
      titulo: "Atraso leve",
      detalle: "Sin cheques rechazados. Registra un atraso de entre 31 y 90 días.",
      bg: "#FCF3CF",
      text: "#7D6608",
    };
  }
  if (peorSituacion === 1) {
    return {
      titulo: "Sin señales de alerta",
      detalle: "Situación normal en todas las entidades y sin cheques rechazados.",
      bg: "#D5F5E3",
      text: "#145A32",
    };
  }
  return {
    titulo: "Sin registros en el BCRA",
    detalle:
      "No figura con deudas ni con cheques rechazados. Puede no haber operado con bancos.",
    bg: "#F8F9FA",
    text: "#1A1A2E",
  };
}
