/*
 * Armado del bloque "quién está detrás del CUIT".
 *
 * Lo delicado acá no es mostrar los datos, es lo que se dice cuando NO hay. El registro de
 * personas es el de la IGJ, o sea CABA: de las 279.309 sociedades con personas identificadas,
 * 224.652 son de CABA y 44.831 de Buenos Aires, contra 1.934 de Córdoba y 1.137 de Santa Fe.
 * Una S.R.L. de Córdoba no está, y no porque no tenga socios: porque su registro es
 * provincial y no publica datos abiertos.
 *
 * Mostrar "no se encontraron socios" en ese caso sería afirmar algo falso sobre la empresa
 * que te está por dar un cheque. Por eso cada ausencia viene con su motivo.
 */

// Con extensión: este módulo lo importa también verificacion/registros.mts, que corre en node
// y exige la extensión en el import (allowImportingTsExtensions en tsconfig).
import { tipoDeCuit } from "../bcra/cuit.ts";
import type { RolPersona } from "./parseo";

export interface Sociedad {
  cuit: string;
  razon_social: string;
  tipo_societario: string | null;
  fecha_contrato: string | null;
  provincia: string | null;
  localidad: string | null;
  actividad: string | null;
  periodo_fuente: string | null;
}

export interface Persona {
  nombre: string;
  rol: RolPersona;
  tipo_documento: string | null;
  numero_documento: string | null;
}

export const NOMBRE_ROL: Record<RolPersona, string> = {
  S: "Socio",
  A: "Autoridad",
  R: "Representante",
};

/** Socios primero: son los dueños. Después el directorio, y al final los apoderados. */
const ORDEN_ROL: Record<RolPersona, number> = { S: 0, A: 1, R: 2 };

export function ordenarPersonas(personas: Persona[]): Persona[] {
  return [...personas].sort(
    (a, b) => ORDEN_ROL[a.rol] - ORDEN_ROL[b.rol] || a.nombre.localeCompare(b.nombre, "es"),
  );
}

/** Años cumplidos desde el contrato social. `hoy` se pasa para poder verificarlo. */
export function antiguedadEnAnios(fechaContrato: string | null, hoy: Date): number | null {
  if (!fechaContrato) return null;
  const m = fechaContrato.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const [, a, mes, d] = m;
  let anios = hoy.getFullYear() - +a;
  const mesActual = hoy.getMonth() + 1;
  if (mesActual < +mes || (mesActual === +mes && hoy.getDate() < +d)) anios--;
  return anios >= 0 ? anios : null;
}

export function domicilioLegible(s: Sociedad): string {
  const partes = [s.localidad, s.provincia].filter((p) => p && p.trim());
  return partes.length ? partes.join(", ") : "";
}

/** "202606" → "junio de 2026", para poder decir de cuándo es el dato. */
export function periodoLegible(periodo: string | null): string {
  if (!periodo || !/^\d{6}$/.test(periodo)) return "";
  const meses = [
    "enero", "febrero", "marzo", "abril", "mayo", "junio",
    "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
  ];
  const mes = meses[+periodo.slice(4, 6) - 1];
  return mes ? `${mes} de ${periodo.slice(0, 4)}` : "";
}

export type MotivoSinPersonas =
  | "esPersonaFisica"
  | "noEstaLaSociedad"
  | "sociedadDeOtraProvincia"
  | "sinRegistro";

export interface BloqueSociedad {
  sociedad: Sociedad | null;
  personas: Persona[];
  /** Por qué no hay personas. Null cuando sí las hay. */
  motivoSinPersonas: MotivoSinPersonas | null;
  /** Texto que explica la ausencia sin dar a entender que la sociedad no tiene socios. */
  explicacion: string;
}

const EN_CABA = /CIUDAD AUTONOMA|CAPITAL FEDERAL|C\.A\.B\.A/i;

const ACLARACION_ACCIONISTAS =
  "Son las personas registradas: socios, directorio y apoderados. Los accionistas de una " +
  "sociedad anónima no son información pública en ningún registro abierto.";

export function armarBloqueSociedad(
  cuit: string,
  sociedad: Sociedad | null,
  personas: Persona[],
  hoy: Date = new Date(),
): BloqueSociedad {
  void hoy;
  if (tipoDeCuit(cuit) === "persona") {
    return {
      sociedad,
      personas: [],
      motivoSinPersonas: "esPersonaFisica",
      explicacion:
        "Este CUIT es de una persona física, no de una sociedad. Estos registros son de " +
        "sociedades, y no hay padrón público de personas físicas desde que se dio de baja el " +
        "de la AFIP.",
    };
  }

  if (personas.length > 0) {
    return { sociedad, personas: ordenarPersonas(personas), motivoSinPersonas: null,
      explicacion: ACLARACION_ACCIONISTAS };
  }

  if (!sociedad) {
    return {
      sociedad: null,
      personas: [],
      motivoSinPersonas: "noEstaLaSociedad",
      explicacion:
        "Este CUIT no figura en el Registro Nacional de Sociedades. Puede ser una sociedad " +
        "muy nueva, o no ser una sociedad. No quiere decir que la empresa no exista.",
    };
  }

  const enCaba = EN_CABA.test(`${sociedad.provincia ?? ""} ${sociedad.localidad ?? ""}`);
  if (!enCaba) {
    const donde = sociedad.provincia ? `de ${sociedad.provincia}` : "de otra provincia";
    return {
      sociedad,
      personas: [],
      motivoSinPersonas: "sociedadDeOtraProvincia",
      explicacion:
        `No hay personas cargadas porque esta sociedad está inscripta ${donde}, y el único ` +
        "registro con datos abiertos de socios y autoridades es el de la Ciudad de Buenos " +
        "Aires. Que no aparezcan acá no significa que la sociedad no tenga socios.",
    };
  }

  return {
    sociedad,
    personas: [],
    motivoSinPersonas: "sinRegistro",
    explicacion:
      "La sociedad figura en el registro, pero sin personas asociadas en la última " +
      "publicación de la Inspección General de Justicia. " + ACLARACION_ACCIONISTAS,
  };
}
