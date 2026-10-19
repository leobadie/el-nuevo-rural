/*
 * Verificación en navegador real de vincular las teles por código
 * (SPEC-cartel-vincular.md).
 *
 * Uso:
 *   1) npm run dev              (en otra terminal)
 *   2) npm run verificar:cartel-vincular
 *
 * Parte A — el admin, en el banco de pruebas (base en memoria): teles esperando,
 *   vincular, errores, desktop y celular.
 * Parte B — la tele, contra la base real. Necesita la migración 031. Usa dos
 *   pantallas de prueba apartadas (zz-prueba-claude-vinc-*) que ningún TV abre;
 *   todo se borra al terminar.
 * Parte C — /tv sin internet. Solo con PROBAR_SIN_INTERNET=1 y la versión
 *   compilada (en `npm run dev` el service worker no aplica):
 *     npm run build && npx next start -p 3100
 *     URL_BASE=http://localhost:3100 PROBAR_SIN_INTERNET=1 npm run verificar:cartel-vincular
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

const BASE = process.env.URL_BASE || "http://localhost:3000";
const SALIDA = path.join(process.cwd(), "verificacion", "capturas", "cartel-vincular");
fs.mkdirSync(SALIDA, { recursive: true });

const NAVEGADORES = [
  process.env.NAVEGADOR,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);

let fallos = 0;
let salteados = 0;
function ok(cond, desc, detalle = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${desc}${detalle !== "" ? `  → ${detalle}` : ""}`);
  if (!cond) fallos++;
}
function skip(desc, motivo) {
  console.log(`SKIP  ${desc}  → ${motivo}`);
  salteados++;
}

function leerEnv() {
  const env = { ...process.env };
  const archivo = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(archivo)) return env;
  for (const linea of fs.readFileSync(archivo, "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = leerEnv();
const admin = env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;
const S1 = "zz-prueba-claude-vinc-1";
const S2 = "zz-prueba-claude-vinc-2";
const MARCA = "ZZPRUEBA vincular";

async function limpiarBase() {
  if (!admin) return;
  await admin.from("cartel_dispositivos").delete().in("pantalla_slug", [S1, S2]);
  await admin.from("cartel_pantallas").delete().in("slug", [S1, S2]);
}

const executablePath = NAVEGADORES.find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath, headless: true });

/** Espera hasta que la condición dé true, o se cumple el tiempo. */
async function esperar(fn, ms) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (await fn().catch(() => false)) return true;
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
}

try {
  // ======================================================================
  // Parte A — admin en el banco de pruebas
  // ======================================================================
  for (const [nombre, viewport] of [
    ["desktop", { width: 1280, height: 900 }],
    ["movil", { width: 390, height: 844 }],
  ]) {
    const ctx = await browser.newContext({ viewport });
    const a = await ctx.newPage();
    const errores = [];
    a.on("pageerror", (e) => errores.push(e.message));
    a.on("console", (m) => m.type() === "error" && /hydrat/i.test(m.text()) && errores.push(m.text()));
    const resp = await a.goto(`${BASE}/login/preview-ofertas?vista=televisores`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    if (resp?.status() === 404) {
      skip(`${nombre}: admin`, "el banco de pruebas solo existe en desarrollo");
      await ctx.close();
      continue;
    }
    await a.waitForSelector('[data-test="vincular"]', { timeout: 30_000 });
    await a.waitForTimeout(800);

    const esperandoTxt = await a.$$eval('[data-test="tele-esperando"]', (els) => els.map((e) => e.textContent));
    ok(
      esperandoTxt.length === 2 && /4821/.test(esperandoTxt[0]) && /3075/.test(esperandoTxt[1]),
      `${nombre}: lista las teles esperando, la más reciente primero`,
      esperandoTxt.join(" | "),
    );
    const vinculadas = await a.$$eval('[data-test="tele-vinculada"]', (els) => els.map((e) => e.textContent));
    ok(vinculadas.length === 1 && /1258/.test(vinculadas[0]), `${nombre}: muestra la tele ya vinculada en su pantalla`, vinculadas.join(" | "));
    const ayuda = await a.textContent('[data-test="vincular"]');
    ok(/localhost:\d+\/tv|\/tv/.test(ayuda ?? ""), `${nombre}: dice qué dirección abrir en la tele`);

    await a.screenshot({ path: path.join(SALIDA, `admin-${nombre}.png`), fullPage: true });

    // Código que no existe.
    await a.fill('[data-test="codigo"]', "0000");
    await a.selectOption('[data-test="destino"]', "carniceria-2");
    await a.click('[data-test="vincular-boton"]');
    const errorClaro = await a.waitForSelector("text=/código 0000/", { timeout: 5_000 }).then(() => true).catch(() => false);
    ok(errorClaro, `${nombre}: un código que no existe da un error claro`);

    // Tocar una tele esperando completa el código; vincular la pasa a su pantalla.
    await a.click('[data-test="tele-esperando"] >> text=4821');
    ok((await a.inputValue('[data-test="codigo"]')) === "4821", `${nombre}: tocar una tele esperando completa el código`);
    await a.selectOption('[data-test="destino"]', "carniceria-2");
    await a.click('[data-test="vincular-boton"]');
    const aviso = await a.waitForSelector("text=/la tele 4821 es Carnicería 2/", { timeout: 5_000 }).then(() => true).catch(() => false);
    ok(aviso, `${nombre}: confirma la vinculación`);
    const vincOk = await esperar(
      async () => (await a.$$eval('[data-test="tele-vinculada"]', (els) => els.map((e) => e.textContent))).some((t) => /4821/.test(t)),
      8_000,
    );
    ok(vincOk, `${nombre}: la tele 4821 aparece en Carnicería 2`);
    const quedan = await a.$$('[data-test="tele-esperando"]');
    ok(quedan.length === 1, `${nombre}: y sale de la lista de espera`, `${quedan.length}`);

    // Sin scroll horizontal en el celular.
    const ancho = await a.evaluate(() => document.documentElement.scrollWidth);
    ok(ancho <= viewport.width, `${nombre}: no hay scroll horizontal`, `${ancho}px`);
    ok(errores.length === 0, `${nombre}: sin errores en la página`, errores.join(" | ").slice(0, 200));

    await a.screenshot({ path: path.join(SALIDA, `admin-${nombre}-vinculada.png`), fullPage: true });
    await ctx.close();
  }

  // ======================================================================
  // Parte B — la tele contra la base real
  // ======================================================================
  const { error: sin031 } = admin ? await admin.from("cartel_dispositivos").select("codigo").limit(1) : { error: { message: "sin service_role key" } };
  if (sin031) {
    skip("Parte B (la tele contra la base)", `falta la migración 031: ${sin031.message}`);
  } else {
    await limpiarBase();
    const { error: eAlta } = await admin.from("cartel_pantallas").insert([
      { slug: S1, nombre: "ZZ Prueba Uno", seccion: "Carnicería", activa: true, orden: 900 },
      { slug: S2, nombre: "ZZ Prueba Dos", seccion: "Pollería", activa: true, orden: 901 },
    ]);
    ok(!eAlta, "se crearon las pantallas de prueba", eAlta?.message);

    for (const [forma, viewport] of [
      ["acostada", { width: 1920, height: 1080 }],
      ["parada", { width: 1080, height: 1920 }],
    ]) {
      const ctx = await browser.newContext({ viewport });
      const p = await ctx.newPage();
      await p.goto(`${BASE}/tv`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      const hayCodigo = await esperar(async () => /^[01234578]{4}$/.test(await p.getAttribute(".tv-vincular", "data-codigo")), 20_000);
      const codigo = await p.getAttribute(".tv-vincular", "data-codigo");
      ok(hayCodigo, `tele ${forma}: /tv muestra un código de 4 cifras`, codigo);
      await p.screenshot({ path: path.join(SALIDA, `tv-codigo-${forma}.png`) });

      if (forma === "parada") {
        // La segunda tele solo prueba la pantalla del código; se libera.
        await admin.from("cartel_dispositivos").delete().eq("codigo", codigo);
        await ctx.close();
        continue;
      }

      // Vincular desde el "admin".
      const { error: eV } = await admin.rpc("cartel_vincular", { p_codigo: codigo, p_slug: S1 });
      ok(!eV, "se vincula con el código", eV?.message);
      const llego = await esperar(async () => p.url().endsWith(`/cartel/tv/${S1}`), 15_000);
      ok(llego, "la tele pasa sola a su pantalla, sin tocar nada", p.url());
      const nombreVisible = await p
        .waitForSelector('[data-test="identificar"]', { timeout: 20_000 })
        .then((el) => el.textContent())
        .catch(() => null);
      ok(/ZZ Prueba Uno/.test(nombreVisible ?? ""), "al llegar muestra su nombre en grande", nombreVisible ?? "no apareció");
      await p.screenshot({ path: path.join(SALIDA, "tv-identificar.png") });
      const guardada = await p.evaluate(() => localStorage.getItem("cartel_tv_pantalla"));
      ok(guardada === S1, "recuerda su pantalla en el navegador", guardada);

      // Volver a abrir /tv va directo a la pantalla.
      await p.goto(`${BASE}/tv`, { waitUntil: "domcontentloaded" });
      const directo = await esperar(async () => p.url().endsWith(`/cartel/tv/${S1}`), 15_000);
      ok(directo, "abrir /tv de nuevo (como al prender la tele) va directo a su pantalla", p.url());

      // Mover desde el admin.
      await admin.from("cartel_dispositivos").update({ pantalla_slug: S2 }).eq("codigo", codigo);
      const movida = await esperar(async () => p.url().endsWith(`/cartel/tv/${S2}`), 25_000);
      ok(movida, "moverla desde el admin la cambia de pantalla en menos de 20 s", p.url());

      // Identificar a pedido.
      await p.waitForSelector(".cartel-marco", { timeout: 20_000 });
      ok(!(await p.$('[data-test="identificar"]')), "sin pedirlo, no muestra el nombre");
      await admin.rpc("cartel_identificar", { p_slug: S2 });
      const identifico = await p
        .waitForSelector('[data-test="identificar"]', { timeout: 20_000 })
        .then((el) => el.textContent())
        .catch(() => null);
      ok(/ZZ Prueba Dos/.test(identifico ?? ""), "Identificar muestra el nombre en menos de 15 s", identifico ?? "no apareció");

      // Desvincular.
      await admin.from("cartel_dispositivos").delete().eq("codigo", codigo);
      const volvio = await esperar(async () => p.url().endsWith("/tv"), 25_000);
      ok(volvio, "desvincularla la devuelve a /tv", p.url());
      const nuevo = await esperar(async () => /^[01234578]{4}$/.test(await p.getAttribute(".tv-vincular", "data-codigo")), 20_000);
      const codigo2 = await p.getAttribute(".tv-vincular", "data-codigo");
      ok(nuevo, "…con un código nuevo", codigo2);
      await admin.from("cartel_dispositivos").delete().eq("codigo", codigo2);
      await ctx.close();
    }

    // Una tele cargada a mano (sin clave) también responde a Identificar.
    {
      const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
      const p = await ctx.newPage();
      await p.goto(`${BASE}/cartel/tv/${S1}`, { waitUntil: "domcontentloaded" });
      await p.waitForSelector(".cartel-marco", { timeout: 30_000 });
      await admin.rpc("cartel_identificar", { p_slug: S1 });
      const vio = await p.waitForSelector('[data-test="identificar"]', { timeout: 20_000 }).then(() => true).catch(() => false);
      ok(vio, "una tele cargada a mano con /cartel/tv/<slug> también muestra el nombre");
      ok(p.url().endsWith(`/cartel/tv/${S1}`), "…y no se mueve de su dirección", p.url());
      await ctx.close();
    }
  }

  // ======================================================================
  // Parte C — /tv sin internet (versión compilada)
  // ======================================================================
  if (!process.env.PROBAR_SIN_INTERNET) {
    skip("Parte C (/tv sin internet)", "correr con PROBAR_SIN_INTERNET=1 contra la versión compilada");
  } else if (sin031) {
    skip("Parte C (/tv sin internet)", "falta la migración 031");
  } else {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const p = await ctx.newPage();
    await p.goto(`${BASE}/tv`, { waitUntil: "domcontentloaded" });
    await esperar(async () => /^\d{4}$/.test(await p.getAttribute(".tv-vincular", "data-codigo")), 20_000);
    const codigo = await p.getAttribute(".tv-vincular", "data-codigo");
    await admin.rpc("cartel_vincular", { p_codigo: codigo, p_slug: S1 });
    await esperar(async () => p.url().endsWith(`/cartel/tv/${S1}`), 15_000);
    await p.waitForSelector(".cartel-marco", { timeout: 30_000 });
    // Que el service worker termine de guardar todo (precarga a los 10 s).
    await p.waitForTimeout(12_000);
    await ctx.setOffline(true);
    const r = await p.goto(`${BASE}/tv`, { waitUntil: "domcontentloaded" }).catch((e) => e);
    const arranco = await esperar(async () => p.url().endsWith(`/cartel/tv/${S1}`) && !!(await p.$(".cartel-marco")), 20_000);
    ok(arranco, "sin internet, /tv abre y lleva a la pantalla guardada", r instanceof Error ? r.message.slice(0, 80) : p.url());
    await p.screenshot({ path: path.join(SALIDA, "tv-sin-internet.png") });
    await ctx.setOffline(false);
    await admin.from("cartel_dispositivos").delete().eq("codigo", codigo);
    await ctx.close();
  }
} finally {
  await limpiarBase();
  await browser.close();
}

console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} CHECK(S) FALLARON`}${salteados ? ` (${salteados} salteado(s))` : ""}`);
console.log(`Capturas en ${SALIDA}`);
process.exit(fallos === 0 ? 0 : 1);
