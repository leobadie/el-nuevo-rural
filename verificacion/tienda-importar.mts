// Pruebas del lector de Excel (src/lib/tienda/xlsx.ts) y de la preparación de filas
// (src/lib/tienda/importar.ts). Correr: npm run verificar:tienda-importar
//
// Arma .xlsx en memoria (con y sin compresión) y, si existe, lee también el Excel real del
// usuario (XLSX_REAL o la ruta de Descargas) y controla los números conocidos de la hoja.
import assert from "node:assert/strict";
import fs from "node:fs";
import { leerHoja, hojasDelLibro, ErrorXlsx } from "../src/lib/tienda/xlsx.ts";
import { prepararFilas, precioACentavos, esPesable, slug, limpiarTexto, HOJA_XRP } from "../src/lib/tienda/importar.ts";

let n = 0;
async function caso(nombre: string, fn: () => void | Promise<void>) {
  await fn();
  n++;
  console.log(`ok  ${nombre}`);
}

// ---------------------------------------------------------------- zip / xlsx de prueba

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[i] = c >>> 0;
  }
  return t;
})();
function crc32(d: Uint8Array) {
  let c = 0xffffffff;
  for (const b of d) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
async function deflar(d: Uint8Array) {
  const s = new Blob([d as BlobPart]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}

async function zip(archivos: Record<string, string>, comprimir: boolean): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const partes: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [nombre, texto] of Object.entries(archivos)) {
    const plano = enc.encode(texto);
    const datos = comprimir ? await deflar(plano) : plano;
    const nom = enc.encode(nombre);
    const crc = crc32(plano);
    const local = new Uint8Array(30 + nom.length);
    const dl = new DataView(local.buffer);
    dl.setUint32(0, 0x04034b50, true);
    dl.setUint16(4, 20, true);
    dl.setUint16(8, comprimir ? 8 : 0, true);
    dl.setUint32(14, crc, true);
    dl.setUint32(18, datos.length, true);
    dl.setUint32(22, plano.length, true);
    dl.setUint16(26, nom.length, true);
    local.set(nom, 30);
    const cen = new Uint8Array(46 + nom.length);
    const dc = new DataView(cen.buffer);
    dc.setUint32(0, 0x02014b50, true);
    dc.setUint16(4, 20, true);
    dc.setUint16(6, 20, true);
    dc.setUint16(10, comprimir ? 8 : 0, true);
    dc.setUint32(16, crc, true);
    dc.setUint32(20, datos.length, true);
    dc.setUint32(24, plano.length, true);
    dc.setUint16(28, nom.length, true);
    dc.setUint32(42, offset, true);
    cen.set(nom, 46);
    partes.push(local, datos);
    central.push(cen);
    offset += local.length + datos.length;
  }
  const tamCentral = central.reduce((a, c) => a + c.length, 0);
  const eocd = new Uint8Array(22);
  const de = new DataView(eocd.buffer);
  de.setUint32(0, 0x06054b50, true);
  de.setUint16(8, central.length, true);
  de.setUint16(10, central.length, true);
  de.setUint32(12, tamCentral, true);
  de.setUint32(16, offset, true);
  const todo = [...partes, ...central, eocd];
  const out = new Uint8Array(todo.reduce((a, c) => a + c.length, 0));
  let p = 0;
  for (const c of todo) {
    out.set(c, p);
    p += c.length;
  }
  return out;
}

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const letra = (i: number) => String.fromCharCode(65 + i);

/** Arma un libro. Las celdas numéricas van como número; el resto como texto en línea o compartido. */
async function libro(hojas: Record<string, (string | number)[][]>, { comprimir = true, compartidos = false } = {}) {
  const ss: string[] = [];
  const archivos: Record<string, string> = {};
  const nombres = Object.keys(hojas);
  archivos["xl/workbook.xml"] =
    `<?xml version="1.0"?><workbook xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>` +
    nombres.map((h, i) => `<sheet name="${esc(h)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join("") +
    `</sheets></workbook>`;
  archivos["xl/_rels/workbook.xml.rels"] =
    `<?xml version="1.0"?><Relationships>` +
    nombres.map((_, i) => `<Relationship Id="rId${i + 1}" Target="worksheets/sheet${i + 1}.xml" Type="x"/>`).join("") +
    `</Relationships>`;
  nombres.forEach((h, i) => {
    const filas = hojas[h]
      .map((fila, r) => {
        const celdas = fila
          .map((v, c) => {
            const ref = `${letra(c)}${r + 1}`;
            if (v === "") return "";
            if (typeof v === "number") return `<c r="${ref}"><v>${v}</v></c>`;
            if (compartidos) {
              ss.push(v);
              return `<c r="${ref}" t="s"><v>${ss.length - 1}</v></c>`;
            }
            return `<c r="${ref}" t="inlineStr"><is><t>${esc(v)}</t></is></c>`;
          })
          .join("");
        return `<row r="${r + 1}">${celdas}</row>`;
      })
      .join("");
    archivos[`xl/worksheets/sheet${i + 1}.xml`] = `<?xml version="1.0"?><worksheet><sheetData>${filas}</sheetData></worksheet>`;
  });
  if (compartidos) archivos["xl/sharedStrings.xml"] = `<sst>${ss.map((s) => `<si><t>${esc(s)}</t></si>`).join("")}</sst>`;
  return zip(archivos, comprimir);
}

const ENC = ["Código", "Código de barras", "Producto", "Marca", "Presentación", "Categoría", "Precio", "Se vende por", "En oferta"];
const HOJA: (string | number)[][] = [
  ENC,
  ["283", "7790272001029", "Aceite de girasol", "Natura", "1x1500 cc", "Almac&#233;n", 7600, "unidad", "No"],
  ["23281", "7790086414794", "ACEITE DE GIRASOL", "Don Jose", "1x5 Lts", "Almacén", 18490, "unidad", "No"],
  ["2371", "7100", "Molleja", "", "1x1 Kgr", "Carnicer&#237;a", 35000, "kg", "No"],
  ["1241", "7790070433091", "Arroz largo fino estuche", "Gallo Oro", "1x1 Kgr", "Almacén", 3600, "kg", "No"],
  ["19867", "7790950141030", "Amargo Patagonico cero", "Terma", "1x1.35 Lts", "Bebidas sin alcohol", 159.9, "unidad", "No"],
  ["", "", "", "", "", "", "", "", ""],
  ["", "1", "Sin código", "", "", "Almacén", 100, "unidad", "No"],
  ["900", "1", "", "", "", "Almacén", 100, "unidad", "No"],
  ["901", "1", "Precio cero", "", "", "Almacén", 0, "unidad", "No"],
  ["902", "1", "Unidad rara", "", "", "Almacén", 100, "docena", "No"],
  ["283", "1", "Aceite repetido", "", "", "Almacén", 999, "unidad", "No"],
  ["5", "", "Cigarrillos box", "Marca", "1x20 Un", "Cigarrillos", "4.500,50", "unidad", "No"],
];

// ---------------------------------------------------------------- lector

for (const [titulo, opciones] of [
  ["comprimido, texto en línea", { comprimir: true, compartidos: false }],
  ["sin comprimir, strings compartidos", { comprimir: false, compartidos: true }],
] as const) {
  await caso(`lee la hoja (${titulo})`, async () => {
    const x = await libro({ Leeme: [["hola"]], [HOJA_XRP]: HOJA }, opciones);
    const h = await leerHoja(x, HOJA_XRP);
    assert.equal(h.nombre, HOJA_XRP);
    assert.equal(h.filas.length, HOJA.length);
    assert.deepEqual(h.filas[1].slice(0, 3), ["283", "7790272001029", "Aceite de girasol"]);
    assert.equal(h.filas[5][6], "159.9");
    assert.equal(h.filas[6].length, 0, "la fila vacía queda vacía");
  });
}

await caso("el nombre de la hoja no distingue mayúsculas", async () => {
  const x = await libro({ "PRODUCTOS WEB": HOJA });
  assert.equal((await leerHoja(x, HOJA_XRP)).nombre, "PRODUCTOS WEB");
});

await caso("hoja faltante: error que lista las hojas que hay", async () => {
  const x = await libro({ "Catálogo completo": HOJA, Leeme: [["x"]] });
  await assert.rejects(leerHoja(x, HOJA_XRP), (e: unknown) => {
    assert.ok(e instanceof ErrorXlsx);
    assert.match((e as Error).message, /"Catálogo completo", "Leeme"/);
    return true;
  });
  assert.deepEqual(await hojasDelLibro(x), ["Catálogo completo", "Leeme"]);
});

await caso("un archivo que no es Excel da un error claro", async () => {
  await assert.rejects(leerHoja(new TextEncoder().encode("esto no es un zip"), HOJA_XRP), ErrorXlsx);
});

await caso("celdas salteadas quedan en su columna", async () => {
  const x = await libro({ H: [["a", "", "c"]] });
  assert.deepEqual((await leerHoja(x, "H")).filas[0], ["a", "", "c"]);
});

// ---------------------------------------------------------------- preparación

await caso("precios: Excel, a mano y basura", () => {
  assert.equal(precioACentavos("7600"), 760000);
  assert.equal(precioACentavos("159.9"), 15990);
  assert.equal(precioACentavos("4.500,50"), 450050);
  assert.equal(precioACentavos("$ 7.600"), 760000);
  assert.equal(precioACentavos("0"), null);
  assert.equal(precioACentavos("-5"), null);
  assert.equal(precioACentavos("abc"), null);
  assert.equal(precioACentavos(""), null);
});

await caso("pesable = kg con PLU; kg con EAN es paquete", () => {
  assert.equal(esPesable("kg", "7100"), true);
  assert.equal(esPesable("kg", null), true);
  assert.equal(esPesable("kg", "7790070433091"), false);
  assert.equal(esPesable("unidad", "7100"), false);
});

await caso("acentos doble escapados y slugs", () => {
  assert.equal(limpiarTexto("Almac&#233;n"), "Almacén");
  assert.equal(limpiarTexto("  Bebidas   sin alcohol "), "Bebidas sin alcohol");
  assert.equal(slug("Fiambres y quesos"), "fiambres-y-quesos");
  assert.equal(slug("Carnicería"), "carniceria");
  assert.equal(slug("Galletitas y snacks"), "galletitas-y-snacks");
});

await caso("prepara la hoja: buenas, malas y repetidas", async () => {
  const h = await leerHoja(await libro({ [HOJA_XRP]: HOJA }), HOJA_XRP);
  const p = prepararFilas(h.filas);
  assert.deepEqual(
    p.filas.map((f) => f.codigo_xrp),
    ["283", "23281", "2371", "1241", "19867", "5"],
  );
  assert.deepEqual(
    p.problemas.map((x) => [x.fila, x.motivo.split(" ")[0]]),
    [[8, "Sin"], [9, "Sin"], [10, "Precio"], [11, '"Se'], [12, "Código"]],
  );
  const molleja = p.filas.find((f) => f.codigo_xrp === "2371")!;
  assert.equal(molleja.fraccionable, true);
  assert.equal(molleja.categoria_xrp, "Carnicería");
  assert.equal(molleja.categoria_slug, "carniceria");
  assert.equal(molleja.marca, null);
  const arroz = p.filas.find((f) => f.codigo_xrp === "1241")!;
  assert.equal(arroz.se_vende_por, "kg");
  assert.equal(arroz.fraccionable, false);
  const aceite = p.filas.find((f) => f.codigo_xrp === "283")!;
  assert.equal(aceite.categoria_xrp, "Almacén");
  assert.equal(aceite.contenido_cantidad, 1500);
  assert.equal(aceite.contenido_unidad, "ml");
  assert.equal(aceite.busqueda, "aceite de girasol natura 1x1500 cc");
  assert.equal(p.filas.find((f) => f.codigo_xrp === "19867")!.precio_centavos, 15990);
  assert.equal(p.filas.find((f) => f.codigo_xrp === "5")!.precio_centavos, 450050);
  assert.deepEqual(p.resumen, { total: 6, porKg: 2, pesables: 1, paquetesKg: 1, categorias: 4 });
});

await caso("sin encabezado o sin columnas obligatorias no importa nada", () => {
  assert.equal(prepararFilas([["a", "b"], ["1", "2"]]).filas.length, 0);
  const sinPrecio = prepararFilas([["Código", "Producto", "Se vende por"], ["1", "X", "kg"]]);
  assert.equal(sinPrecio.filas.length, 0);
  assert.match(sinPrecio.problemas[0].motivo, /precio/);
});

// ---------------------------------------------------------------- el Excel real

const REAL = process.env.XLSX_REAL ?? "C:/Users/Usuario/Downloads/Productos_El_Nuevo_Rural_web.xlsx";
if (fs.existsSync(REAL)) {
  await caso(`Excel real (${REAL}): números conocidos del 15/11/2026`, async () => {
    const h = await leerHoja(fs.readFileSync(REAL), HOJA_XRP);
    const p = prepararFilas(h.filas);
    assert.equal(p.problemas.length, 0, JSON.stringify(p.problemas.slice(0, 3)));
    assert.equal(p.resumen.total, 2219);
    assert.equal(p.resumen.porKg, 237);
    assert.equal(p.resumen.pesables, 188);
    assert.equal(p.resumen.paquetesKg, 49);
    assert.equal(p.resumen.categorias, 17);
    const cats = new Set(p.filas.map((f) => f.categoria_xrp));
    assert.ok(cats.has("Almacén") && cats.has("Carnicería") && cats.has("Perfumería"), [...cats].join(","));
    assert.ok(!p.filas.some((f) => /&#\d+;/.test(f.nombre_xrp + f.categoria_xrp + (f.marca ?? ""))), "quedaron entidades sin decodificar");
    console.log(`    (${p.resumen.total} productos, ${p.resumen.pesables} pesables, ${p.resumen.paquetesKg} paquetes por kg, ${p.resumen.categorias} categorías)`);
  });
} else {
  console.log(`--  Excel real: no está en ${REAL}; corré con XLSX_REAL=<ruta> para probarlo`);
}

console.log(`\n${n} casos, todos bien`);
