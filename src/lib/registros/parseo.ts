/*
 * Lectura de los CSV del Registro Nacional de Sociedades y de la IGJ.
 *
 * Los tres archivos son CSV con comillas bien puestas: los campos con comas van entrecomillados
 * ("PERON, JUAN TTE.GRAL.", "ALDAZABAL, PABLO MANUEL"). Partir por comas sin mirar las
 * comillas corre todas las columnas y da el CUIT equivocado, así que hay que respetarlas.
 *
 * Verificado sobre los archivos reales de 202606: con este parseo, las 2.331.970 filas de
 * autoridades quedan con sus 8 campos exactos, y de las 1.070.756 de entidades fallan 2. Esas
 * dos son en realidad UNA razón social con un salto de línea adentro del campo
 * ("SIC-SERVICIOS INTEGRALES DE CONSTRUCCION Y \n DISEÑO"), que es CSV válido y hay que
 * juntar antes de parsear: de ahí filasDeCsv().
 *
 * Los tres archivos empiezan con BOM.
 */

/** Los archivos vienen con BOM: sin sacarlo, la primera columna del header no matchea. */
export function quitarBom(texto: string): string {
  return texto.charCodeAt(0) === 0xfeff ? texto.slice(1) : texto;
}

/** CSV con comillas: el separador dentro de comillas no parte el campo. */
export function partirCsv(linea: string): string[] {
  const campos: string[] = [];
  let actual = "";
  let entreComillas = false;
  for (let i = 0; i < linea.length; i++) {
    const c = linea[i];
    if (c === '"') {
      // Dos comillas seguidas dentro de un campo son una comilla literal.
      if (entreComillas && linea[i + 1] === '"') {
        actual += '"';
        i++;
      } else {
        entreComillas = !entreComillas;
      }
    } else if (c === "," && !entreComillas) {
      campos.push(actual);
      actual = "";
    } else {
      actual += c;
    }
  }
  campos.push(actual);
  return campos;
}

/** Una comilla sin cerrar al final de la línea significa que el campo sigue en la siguiente. */
export function comillasAbiertas(linea: string): boolean {
  let n = 0;
  for (let i = 0; i < linea.length; i++) {
    if (linea[i] !== '"') continue;
    if (linea[i + 1] === '"') i++; // comilla escapada, no abre ni cierra
    else n++;
  }
  return n % 2 === 1;
}

/**
 * Junta las líneas partidas por un salto dentro de un campo entrecomillado y devuelve filas
 * completas. Sin esto, una razón social con un enter adentro se lee como dos filas rotas y el
 * registro se pierde entero.
 */
export async function* filasDeCsv(
  lineas: AsyncIterable<string> | Iterable<string>,
): AsyncGenerator<string> {
  let pendiente = "";
  for await (const cruda of lineas) {
    const linea = pendiente ? `${pendiente}\n${cruda}` : cruda;
    if (comillasAbiertas(linea)) {
      pendiente = linea;
      continue;
    }
    pendiente = "";
    if (linea.trim()) yield linea;
  }
  if (pendiente.trim()) yield pendiente;
}

export interface FilaSociedad {
  cuit: string;
  razonSocial: string;
  tipoSocietario: string;
  fechaContrato: string | null;
  provincia: string;
  localidad: string;
  actividad: string;
}

/** Las fechas vienen como `1912-04-30-10:43`: fecha y hora pegadas con un guion. */
export function fechaDeRegistro(valor: string): string | null {
  const m = (valor || "").match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const [, a, mes, d] = m;
  if (+mes < 1 || +mes > 12 || +d < 1 || +d > 31) return null;
  return `${a}-${mes}-${d}`;
}

/** Columnas del Registro Nacional de Sociedades (27). */
const RNS = {
  cuit: 0,
  razonSocial: 1,
  fechaContrato: 2,
  tipoSocietario: 3,
  provinciaLegal: 14,
  localidadLegal: 15,
  provinciaFiscal: 6,
  localidadFiscal: 7,
  actividad: 23,
} as const;

export function sociedadDesdeFila(linea: string): FilaSociedad | null {
  const c = partirCsv(linea);
  const cuit = (c[RNS.cuit] || "").trim();
  if (!/^\d{11}$/.test(cuit)) return null;
  // El domicilio legal es el que identifica dónde está inscripta; si falta, sirve el fiscal.
  const provincia = (c[RNS.provinciaLegal] || c[RNS.provinciaFiscal] || "").trim();
  const localidad = (c[RNS.localidadLegal] || c[RNS.localidadFiscal] || "").trim();
  return {
    cuit,
    razonSocial: (c[RNS.razonSocial] || "").trim(),
    tipoSocietario: (c[RNS.tipoSocietario] || "").trim(),
    fechaContrato: fechaDeRegistro(c[RNS.fechaContrato] || ""),
    provincia,
    localidad,
    actividad: (c[RNS.actividad] || "").trim(),
  };
}

export interface FilaEntidadIgj {
  correlativo: string;
  razonSocial: string;
  cuit: string;
}

/** IGJ entidades: correlativo, tipo, descripción, razón social, baja x3, CUIT. */
export function entidadIgjDesdeFila(linea: string): FilaEntidadIgj | null {
  const c = partirCsv(linea);
  const cuit = (c[7] || "").trim();
  if (!/^\d{11}$/.test(cuit)) return null;
  return { correlativo: (c[0] || "").trim(), razonSocial: (c[3] || "").trim(), cuit };
}

export type RolPersona = "S" | "A" | "R";

export interface FilaPersonaIgj {
  correlativo: string;
  nombre: string;
  rol: RolPersona;
  tipoDocumento: string;
  numeroDocumento: string;
}

/** IGJ autoridades: correlativo, nombre, rol, descripción, doc x3, género. */
export function personaIgjDesdeFila(linea: string): FilaPersonaIgj | null {
  const c = partirCsv(linea);
  const rol = (c[2] || "").trim().toUpperCase();
  if (rol !== "S" && rol !== "A" && rol !== "R") return null;
  const nombre = limpiarNombre(c[1] || "");
  if (!nombre) return null;
  return {
    correlativo: (c[0] || "").trim(),
    nombre,
    rol,
    tipoDocumento: (c[5] || "").trim(),
    numeroDocumento: (c[6] || "").trim(),
  };
}

/**
 * Los nombres vienen de varias formas: "APELLIDO NOMBRE", "NOMBRE, APELLIDO", con comillas
 * sueltas y con espacios de más. No se reordena (no hay forma segura de saber qué parte es el
 * apellido), solo se limpia para que se lea igual siempre.
 */
export function limpiarNombre(valor: string): string {
  return valor
    .replace(/"/g, "")
    .replace(/\s*,\s*/g, ", ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Clave de deduplicación: la misma persona aparece con el nombre escrito de varias formas. */
export function clavePersona(correlativo: string, rol: string, documento: string): string {
  return `${correlativo}|${rol}|${documento}`;
}
