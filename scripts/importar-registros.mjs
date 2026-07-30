/*
 * Carga en Supabase las tablas `sociedades` y `sociedad_personas` desde los datasets
 * oficiales de datos.jus.gob.ar.
 *
 *   node scripts/importar-registros.mjs
 *   node scripts/importar-registros.mjs --provincias "BUENOS AIRES,CORDOBA,SANTA FE"
 *   node scripts/importar-registros.mjs --solo-descargar
 *
 * Necesita SUPABASE_SERVICE_ROLE_KEY en .env.local: con la anon key, RLS bloquea la escritura
 * (las tablas son de solo lectura para la app) y el importador del panel de Supabase no toma
 * archivos de este tamaño. La service_role key no pasa por RLS, así que se usa solo acá, en
 * la máquina del usuario, nunca en la app.
 *
 * Los archivos son grandes (~1,3 GB descomprimidos), así que se leen en streaming: nunca
 * entra el archivo entero en memoria.
 */

import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";
import os from "node:os";
import { createRequire } from "node:module";
import { pipeline } from "node:stream/promises";
import {
  quitarBom,
  filasDeCsv,
  sociedadDesdeFila,
  entidadIgjDesdeFila,
  personaIgjDesdeFila,
  clavePersona,
} from "../src/lib/registros/parseo.ts";

const require = createRequire(import.meta.url);

const CKAN_JUS = "https://datos.jus.gob.ar/api/3/action/package_show?id=";
const DATASET_RNS = "registro-nacional-de-sociedades";
const DATASET_IGJ = "entidades-constituidas-en-la-inspeccion-general-de-justicia-igj";
const LOTE = 1000;

const args = process.argv.slice(2);
const provinciasArg = valorDe("--provincias");
const PROVINCIAS = provinciasArg
  ? provinciasArg.split(",").map((p) => p.trim().toUpperCase()).filter(Boolean)
  : null;
const SOLO_DESCARGAR = args.includes("--solo-descargar");
/* Hace todo el trabajo (descarga, parseo, deduplicación, conteos) sin escribir en la base:
   sirve para verificar el parseo contra los archivos reales sin necesitar credenciales. */
const SIMULAR = args.includes("--simular");
const TRABAJO = path.join(os.tmpdir(), "registros-argentina");

function valorDe(flag) {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : null;
}

function log(...m) {
  console.log(...m);
}

// ---------- Credenciales ----------

function leerEnv() {
  const env = { ...process.env };
  const archivo = path.join(process.cwd(), ".env.local");
  if (fs.existsSync(archivo)) {
    for (const linea of fs.readFileSync(archivo, "utf8").split(/\r?\n/)) {
      const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
      if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
  return env;
}

// ---------- Descarga ----------

async function urlDelRecurso(dataset, patron) {
  const r = await fetch(CKAN_JUS + dataset);
  if (!r.ok) throw new Error(`No pude consultar el catálogo de ${dataset} (${r.status})`);
  const { result } = await r.json();
  const recursos = result.resources.filter((x) => /zip/i.test(x.format) && patron.test(x.name));
  if (!recursos.length) throw new Error(`No encontré un ZIP que cumpla ${patron} en ${dataset}`);
  // El nombre trae el año y el semestre; el más nuevo alfabéticamente es el último.
  recursos.sort((a, b) => b.name.localeCompare(a.name));
  return { url: recursos[0].url, nombre: recursos[0].name };
}

async function bajar(url, destino) {
  if (fs.existsSync(destino) && fs.statSync(destino).size > 0) {
    log(`  ya estaba descargado (${mb(fs.statSync(destino).size)})`);
    return;
  }
  const r = await fetch(url);
  if (!r.ok) throw new Error(`Falló la descarga (${r.status}): ${url}`);
  await pipeline(r.body, fs.createWriteStream(destino));
  log(`  descargado ${mb(fs.statSync(destino).size)}`);
}

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

/* Descomprimir sin dependencias nuevas: PowerShell en Windows, unzip en el resto. */
function descomprimir(zip, destino) {
  const { execFileSync } = require("node:child_process");
  fs.mkdirSync(destino, { recursive: true });
  if (process.platform === "win32") {
    execFileSync("powershell", [
      "-NoProfile", "-Command",
      `Expand-Archive -Path '${zip}' -DestinationPath '${destino}' -Force`,
    ], { stdio: "inherit" });
  } else {
    execFileSync("unzip", ["-o", zip, "-d", destino], { stdio: "inherit" });
  }
}

/** Del ZIP salen varios CSV (uno por corte mensual): interesa el más nuevo de cada tipo. */
function csvMasNuevo(dir, patron) {
  const archivos = fs.readdirSync(dir).filter((f) => patron.test(f)).sort();
  if (!archivos.length) throw new Error(`No encontré ningún CSV que cumpla ${patron} en ${dir}`);
  return path.join(dir, archivos[archivos.length - 1]);
}

function periodoDe(nombre) {
  const m = path.basename(nombre).match(/(\d{6})/);
  return m ? m[1] : null;
}

/**
 * Filas del CSV, sin el header y con las que vienen partidas por un salto de línea dentro de
 * un campo entrecomillado ya unidas. En streaming: el archivo entero nunca entra en memoria.
 */
async function* lineas(archivo) {
  const rl = readline.createInterface({
    input: fs.createReadStream(archivo, { encoding: "utf8" }),
    crlfDelay: Infinity,
  });
  async function* sinHeader() {
    let primera = true;
    for await (const linea of rl) {
      if (primera) {
        primera = false;
        continue;
      }
      yield linea;
    }
  }
  for await (const fila of filasDeCsv(sinHeader())) yield quitarBom(fila);
}

// ---------- Escritura ----------

function clienteSupabase(env) {
  const { createClient } = require("@supabase/supabase-js");
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const key = env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url) throw new Error("Falta NEXT_PUBLIC_SUPABASE_URL en .env.local");
  if (!key) {
    throw new Error(
      "Falta SUPABASE_SERVICE_ROLE_KEY en .env.local.\n" +
        "Está en el panel de Supabase → Project Settings → API → service_role.\n" +
        "Es una clave de administrador: va solo en .env.local (que está en .gitignore), nunca en el código.",
    );
  }
  return createClient(url, key, { auth: { persistSession: false } });
}

async function subirEnLotes(sb, tabla, filas, conflicto) {
  let subidas = 0;
  for (let i = 0; i < filas.length; i += LOTE) {
    const lote = filas.slice(i, i + LOTE);
    const { error } = await sb.from(tabla).upsert(lote, { onConflict: conflicto, count: "exact" });
    if (error) throw new Error(`Error subiendo a ${tabla}: ${error.message}`);
    subidas += lote.length;
    if (subidas % 50000 === 0 || subidas === filas.length) {
      log(`    ${tabla}: ${subidas.toLocaleString("es")} / ${filas.length.toLocaleString("es")}`);
    }
  }
  return subidas;
}

// ---------- Proceso ----------

async function main() {
  fs.mkdirSync(TRABAJO, { recursive: true });
  log("Carpeta de trabajo:", TRABAJO);
  if (PROVINCIAS) log("Filtrando por provincias:", PROVINCIAS.join(", "));

  log("\n[1/5] Buscando los datasets oficiales…");
  const rns = await urlDelRecurso(DATASET_RNS, /semestre/i);
  const igj = await urlDelRecurso(DATASET_IGJ, /semestre/i);
  log("  nacional:", rns.nombre);
  log("  IGJ     :", igj.nombre);

  log("\n[2/5] Descargando…");
  const zipRns = path.join(TRABAJO, "rns.zip");
  const zipIgj = path.join(TRABAJO, "igj.zip");
  await bajar(rns.url, zipRns);
  await bajar(igj.url, zipIgj);
  descomprimir(zipRns, path.join(TRABAJO, "rns"));
  descomprimir(zipIgj, path.join(TRABAJO, "igj"));

  const csvRns = csvMasNuevo(path.join(TRABAJO, "rns"), /^registro-nacional-sociedades-\d+\.csv$/i);
  const csvEnt = csvMasNuevo(path.join(TRABAJO, "igj"), /^igj-entidades-\d+\.csv$/i);
  const csvAut = csvMasNuevo(path.join(TRABAJO, "igj"), /^igj-autoridades-\d+\.csv$/i);
  const periodo = periodoDe(csvRns);
  log("  período del dato:", periodo ?? "desconocido");

  if (SOLO_DESCARGAR) {
    log("\n--solo-descargar: no se toca la base.");
    return;
  }

  const sb = SIMULAR ? null : clienteSupabase(leerEnv());

  log("\n[3/5] Leyendo el Registro Nacional de Sociedades…");
  const sociedades = new Map();
  let filasRns = 0;
  for await (const linea of lineas(csvRns)) {
    filasRns++;
    const s = sociedadDesdeFila(linea);
    if (!s || sociedades.has(s.cuit)) continue;
    if (PROVINCIAS && !PROVINCIAS.includes(s.provincia.toUpperCase())) continue;
    sociedades.set(s.cuit, {
      cuit: s.cuit,
      razon_social: s.razonSocial,
      tipo_societario: s.tipoSocietario || null,
      fecha_contrato: s.fechaContrato,
      provincia: s.provincia || null,
      localidad: s.localidad || null,
      actividad: s.actividad || null,
      periodo_fuente: periodo,
    });
  }
  log(`  ${filasRns.toLocaleString("es")} filas → ${sociedades.size.toLocaleString("es")} sociedades`);

  log("\n[4/5] Leyendo la IGJ (personas)…");
  const cuitPorCorrelativo = new Map();
  for await (const linea of lineas(csvEnt)) {
    const e = entidadIgjDesdeFila(linea);
    // Solo sirven las entidades cuyo CUIT está en el registro nacional: es la única forma de
    // llegar desde el CUIT del cheque hasta las personas.
    if (e && sociedades.has(e.cuit)) cuitPorCorrelativo.set(e.correlativo, e.cuit);
  }
  log(`  ${cuitPorCorrelativo.size.toLocaleString("es")} sociedades de IGJ cruzan por CUIT`);

  const vistas = new Set();
  const personas = [];
  let filasAut = 0;
  for await (const linea of lineas(csvAut)) {
    filasAut++;
    const p = personaIgjDesdeFila(linea);
    if (!p) continue;
    const cuit = cuitPorCorrelativo.get(p.correlativo);
    if (!cuit) continue;
    // Sin documento no se puede deduplicar ni identificar a la persona.
    if (!p.numeroDocumento) continue;
    const clave = clavePersona(cuit, p.rol, p.numeroDocumento);
    if (vistas.has(clave)) continue;
    vistas.add(clave);
    personas.push({
      cuit,
      nombre: p.nombre,
      rol: p.rol,
      tipo_documento: p.tipoDocumento || null,
      numero_documento: p.numeroDocumento,
    });
  }
  log(`  ${filasAut.toLocaleString("es")} filas → ${personas.length.toLocaleString("es")} personas únicas`);

  const conPersonas = new Set(personas.map((p) => p.cuit)).size;
  log(`  ${conPersonas.toLocaleString("es")} sociedades llegan hasta sus personas` +
      ` (${(conPersonas / sociedades.size * 100).toFixed(1)}% de las cargadas)`);

  if (SIMULAR) {
    log("\n--simular: no se escribió nada en la base.");
    log(`  sociedades a cargar        : ${sociedades.size.toLocaleString("es")}`);
    log(`  personas a cargar          : ${personas.length.toLocaleString("es")}`);
    return;
  }

  log("\n[5/5] Subiendo a Supabase…");
  await subirEnLotes(sb, "sociedades", [...sociedades.values()], "cuit");
  await subirEnLotes(sb, "sociedad_personas", personas, "cuit,rol,numero_documento");

  const { data, error } = await sb.rpc("tamano_registros");
  if (!error && data) {
    log("\nEn la base:");
    for (const f of data) log(`  ${f.tabla}: ${Number(f.filas).toLocaleString("es")} filas · ${f.tamano}`);
  }
  log("\nListo.");
}

main().catch((e) => {
  console.error("\nFALLÓ:", e.message);
  process.exit(1);
});
