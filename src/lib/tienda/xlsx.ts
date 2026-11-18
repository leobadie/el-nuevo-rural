// Lector mínimo de .xlsx, sin dependencias: un .xlsx es un zip con XML adentro.
// Usa DecompressionStream("deflate-raw"), que está en los navegadores actuales y en Node 18+.
// Alcanza para el export de XRP (texto, números, strings compartidos o en línea); no lee
// fórmulas ni formatos. Lo prueba verificacion/tienda-importar.mts.

export type Hoja = { nombre: string; filas: string[][] };

export class ErrorXlsx extends Error {}

// ---------------------------------------------------------------- zip

type Entrada = { nombre: string; metodo: number; comprimido: number; offsetLocal: number };

function leerEntradas(buf: Uint8Array): Map<string, Entrada> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  // Fin del directorio central: firma 0x06054b50, buscada desde el final.
  let fin = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) {
      fin = i;
      break;
    }
  }
  if (fin < 0) throw new ErrorXlsx("El archivo no es un Excel (.xlsx) válido.");
  const cantidad = dv.getUint16(fin + 10, true);
  let p = dv.getUint32(fin + 16, true);
  const dec = new TextDecoder();
  const entradas = new Map<string, Entrada>();
  for (let i = 0; i < cantidad; i++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new ErrorXlsx("El Excel está dañado (directorio).");
    const metodo = dv.getUint16(p + 10, true);
    const comprimido = dv.getUint32(p + 20, true);
    const largoNombre = dv.getUint16(p + 28, true);
    const largoExtra = dv.getUint16(p + 30, true);
    const largoComent = dv.getUint16(p + 32, true);
    const offsetLocal = dv.getUint32(p + 42, true);
    const nombre = dec.decode(buf.subarray(p + 46, p + 46 + largoNombre));
    entradas.set(nombre.replace(/^\/+/, ""), { nombre, metodo, comprimido, offsetLocal });
    p += 46 + largoNombre + largoExtra + largoComent;
  }
  return entradas;
}

async function descomprimir(datos: Uint8Array): Promise<Uint8Array> {
  const flujo = new Blob([datos as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(flujo).arrayBuffer());
}

async function leerArchivo(buf: Uint8Array, e: Entrada): Promise<string> {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const o = e.offsetLocal;
  if (dv.getUint32(o, true) !== 0x04034b50) throw new ErrorXlsx("El Excel está dañado (archivo interno).");
  const inicio = o + 30 + dv.getUint16(o + 26, true) + dv.getUint16(o + 28, true);
  const datos = buf.subarray(inicio, inicio + e.comprimido);
  let plano: Uint8Array;
  if (e.metodo === 0) plano = datos;
  else if (e.metodo === 8) plano = await descomprimir(datos);
  else throw new ErrorXlsx(`El Excel usa una compresión que no se puede leer (método ${e.metodo}).`);
  return new TextDecoder().decode(plano);
}

// ---------------------------------------------------------------- XML

/** Entidades XML, incluidas las numéricas (&#243; y &#xF3;). */
export function decodificarEntidades(s: string): string {
  return s
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

const textoDe = (xml: string) =>
  [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodificarEntidades(m[1])).join("");

const atributo = (tag: string, nombre: string) => {
  const m = tag.match(new RegExp(`\\s${nombre}="([^"]*)"`));
  return m ? decodificarEntidades(m[1]) : null;
};

/** "AB" → 27 (base 1). */
function columna(ref: string): number {
  let n = 0;
  for (const c of ref.replace(/\d+/g, "")) n = n * 26 + (c.charCodeAt(0) - 64);
  return n;
}

function leerFilas(xml: string, compartidos: string[]): string[][] {
  const filas: string[][] = [];
  for (const r of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const numero = Number(atributo(r[1], "r")) || filas.length + 1;
    const fila: string[] = [];
    for (const c of (r[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const ref = atributo(c[1], "r");
      const tipo = atributo(c[1], "t");
      const cuerpo = c[2] ?? "";
      let valor = "";
      if (tipo === "inlineStr") valor = textoDe(cuerpo);
      else {
        const v = cuerpo.match(/<v>([\s\S]*?)<\/v>/);
        if (v) valor = tipo === "s" ? (compartidos[Number(v[1])] ?? "") : decodificarEntidades(v[1]);
      }
      const col = ref ? columna(ref) - 1 : fila.length;
      fila[col] = valor;
    }
    // Rellenar huecos para que cada fila sea un array denso.
    for (let i = 0; i < fila.length; i++) if (fila[i] === undefined) fila[i] = "";
    filas[numero - 1] = fila;
  }
  for (let i = 0; i < filas.length; i++) if (!filas[i]) filas[i] = [];
  return filas;
}

// ---------------------------------------------------------------- API

/** Nombres de las hojas, en orden. */
export async function hojasDelLibro(datos: ArrayBuffer | Uint8Array): Promise<string[]> {
  const { libro } = await abrir(datos);
  return libro.map((h) => h.nombre);
}

async function abrir(datos: ArrayBuffer | Uint8Array) {
  const buf = datos instanceof Uint8Array ? datos : new Uint8Array(datos);
  const entradas = leerEntradas(buf);
  const leer = async (ruta: string) => {
    const e = entradas.get(ruta.replace(/^\/+/, ""));
    return e ? leerArchivo(buf, e) : null;
  };
  const wb = await leer("xl/workbook.xml");
  if (!wb) throw new ErrorXlsx("El archivo no es un Excel (.xlsx): falta el libro.");
  const rels = (await leer("xl/_rels/workbook.xml.rels")) ?? "";
  const destinos = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = atributo(m[0], "Id");
    const target = atributo(m[0], "Target");
    if (id && target) destinos.set(id, target.startsWith("/") ? target.slice(1) : `xl/${target}`);
  }
  const libro = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => ({
    nombre: atributo(m[0], "name") ?? "",
    ruta: destinos.get(atributo(m[0], "r:id") ?? "") ?? "",
  }));
  return { libro, leer };
}

/** Lee una hoja por nombre. Si no existe, ErrorXlsx con la lista de hojas que hay. */
export async function leerHoja(datos: ArrayBuffer | Uint8Array, nombreHoja: string): Promise<Hoja> {
  const { libro, leer } = await abrir(datos);
  const hoja = libro.find((h) => h.nombre.trim().toLowerCase() === nombreHoja.trim().toLowerCase());
  if (!hoja) {
    throw new ErrorXlsx(
      `El Excel no tiene la hoja "${nombreHoja}". Hojas que tiene: ${libro.map((h) => `"${h.nombre}"`).join(", ") || "ninguna"}.`,
    );
  }
  const xml = await leer(hoja.ruta);
  if (!xml) throw new ErrorXlsx(`No se pudo leer la hoja "${hoja.nombre}".`);
  const ss = (await leer("xl/sharedStrings.xml")) ?? "";
  const compartidos = [...ss.matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textoDe(m[1]));
  return { nombre: hoja.nombre, filas: leerFilas(xml, compartidos) };
}
