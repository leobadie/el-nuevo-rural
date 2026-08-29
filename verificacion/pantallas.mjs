/*
 * Verificación en navegador real de que cada televisor muestra lo suyo, contra
 * los requisitos 5-8 y 13 de SPEC-cartel-pantallas.md. Usa el Edge o Chrome ya
 * instalado en Windows (no descarga navegadores).
 *
 * Uso:
 *   1) npm run dev              (en otra terminal)
 *   2) npm run verificar:pantallas
 *
 * Variables opcionales:
 *   URL_BASE   por defecto http://localhost:3000
 *   NAVEGADOR  ruta a un ejecutable de Chromium/Edge/Chrome
 *
 * Crea tres placas de prueba con un título marcado, comprueba qué ve cada
 * pantalla y las borra al final, pasen o fallen los checks. Corre contra la base
 * de verdad: no dejar basura es parte del trabajo.
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

const BASE = process.env.URL_BASE || "http://localhost:3000";

/** Prefijo de las placas de prueba. Va con ZZ para que queden últimas al ordenar. */
const MARCA = "ZZPRUEBA";

const NAVEGADORES = [
  process.env.NAVEGADOR,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);

let fallos = 0;
function ok(cond, desc, detalle = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${desc}${detalle !== "" ? `  → ${detalle}` : ""}`);
  if (!cond) fallos++;
}

function leerEnv() {
  const env = { ...process.env };
  const archivo = path.join(process.cwd(), ".env.local");
  for (const linea of fs.readFileSync(archivo, "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = leerEnv();
if (!env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Falta SUPABASE_SERVICE_ROLE_KEY en .env.local.");
  process.exit(2);
}

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function limpiar() {
  await admin.from("cartel_placas").delete().like("titulo", `${MARCA}%`);
}

await limpiar();

const { data: creadas, error: eIns } = await admin
  .from("cartel_placas")
  .insert([
    { titulo: `${MARCA} corte`, seccion: "Carnicería", tipo: "oferta", precio: 1, duracion_seg: 3, orden: 9001, activa: true },
    { titulo: `${MARCA} chorizo`, seccion: "Embutidos", tipo: "oferta", precio: 2, duracion_seg: 3, orden: 9002, activa: true },
    { titulo: `${MARCA} general`, seccion: null, tipo: "aviso", duracion_seg: 3, orden: 9003, activa: true },
  ])
  .select();

if (eIns) {
  console.error("No se pudieron crear las placas de prueba:", eIns.message);
  console.error("¿Están aplicadas las migraciones 015 y 016?");
  process.exit(2);
}

const idDe = (fin) => creadas.find((p) => p.titulo.endsWith(fin)).id;

const executablePath = NAVEGADORES.find((p) => fs.existsSync(p));
if (!executablePath) {
  console.error("No encontré Chrome ni Edge. Pasá la ruta con la variable NAVEGADOR.");
  await limpiar();
  process.exit(2);
}

const browser = await chromium.launch({ executablePath, headless: true });

/**
 * Las placas de una pantalla, enumeradas con ?fijo=N.
 *
 * Se usa ?fijo en vez de esperar la rotación porque es determinista: con 5
 * placas de 3 a 10 segundos, muestrear a ciegas deja el resultado a suerte.
 */
async function placasDe(slug) {
  const page = await browser.newPage({ viewport: { width: 540, height: 960 } });
  try {
    await page.goto(`${BASE}/cartel/tv/${slug}`, { waitUntil: "networkidle" });
    const total = Number(await page.getAttribute("[data-total]", "data-total"));
    const titulos = [];
    for (let i = 0; i < total; i++) {
      await page.goto(`${BASE}/cartel/tv/${slug}?fijo=${i}`, { waitUntil: "networkidle" });
      titulos.push((await page.innerText("body")).replace(/\s+/g, " ").trim());
    }
    return titulos;
  } finally {
    await page.close();
  }
}

const tiene = (lista, texto) => lista.some((x) => x.includes(texto));

try {
  console.log("=== R6/R8 — Sin asignación explícita manda la sección de la pantalla ===");
  const carni = await placasDe("carniceria-1");
  const embu = await placasDe("embutidos-2");
  const acceso = await placasDe("acceso");

  ok(tiene(carni, `${MARCA} corte`), "carniceria-1 ve el corte de carnicería");
  ok(!tiene(carni, `${MARCA} chorizo`), "carniceria-1 NO ve el chorizo de embutidos");
  ok(tiene(carni, `${MARCA} general`), "carniceria-1 ve el aviso sin sección (sirve a todo el local)");
  ok(tiene(embu, `${MARCA} chorizo`), "embutidos-2 ve el chorizo");
  ok(!tiene(embu, `${MARCA} corte`), "embutidos-2 NO ve el corte de carnicería");
  ok(
    tiene(acceso, `${MARCA} corte`) && tiene(acceso, `${MARCA} chorizo`),
    "acceso, que no tiene sección, ve las dos",
  );

  console.log("\n=== R7 — La asignación explícita saca la placa del resto ===");
  const { error: eAsig } = await admin
    .from("cartel_placa_pantalla")
    .insert({ placa_id: idDe("general"), pantalla_slug: "acceso" });
  ok(!eAsig, "se pudo asignar el aviso al acceso", eAsig?.message);

  const carni2 = await placasDe("carniceria-1");
  const acceso2 = await placasDe("acceso");
  ok(!tiene(carni2, `${MARCA} general`), "asignado al acceso, el aviso desaparece de carnicería");
  ok(tiene(acceso2, `${MARCA} general`), "y sigue estando en el acceso");

  console.log("\n=== R13 — Un slug inexistente es 404, no la pantalla genérica ===");
  const page = await browser.newPage();
  const r = await page.goto(`${BASE}/cartel/tv/no-existe-${Date.now()}`, {
    waitUntil: "domcontentloaded",
  });
  ok(r.status() === 404, "un televisor mal tipeado devuelve 404", `devolvió ${r.status()}`);
  await page.close();
} finally {
  await browser.close();
  await limpiar();
  const { data: resto } = await admin.from("cartel_placas").select("titulo").like("titulo", `${MARCA}%`);
  console.log(`\nlimpieza: quedaron ${resto?.length ?? "?"} placa(s) de prueba`);
}

console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} CHECK(S) FALLARON`}`);
process.exit(fallos === 0 ? 0 : 1);
