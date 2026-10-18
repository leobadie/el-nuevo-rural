/*
 * Verificación en navegador real de que el televisor arranca sin internet y no
 * vuelve a bajar lo que ya tiene (SPEC-cartel-tv-en-vivo.md, puntos 10-13;
 * SPEC-cartel-videos.md, punto 15).
 *
 * Uso (con la versión compilada: en `npm run dev` Next pide código sobre la
 * marcha y por la recarga en caliente, y sin internet eso falla aunque el TV
 * real ande bien):
 *   1) npm run build && npx next start -p 3100     (en otra terminal)
 *   2) URL_BASE=http://localhost:3100 npm run verificar:cartel-sin-internet
 *   o directamente contra producción con URL_BASE=https://el-nuevo-rural.vercel.app
 *
 * No escribe nada en la base. Corta los latidos: abre la dirección de un TV
 * real y no tiene que marcarlo como conectado.
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.URL_BASE || "http://localhost:3000";
const TV = "/cartel/tv/polleria-1";
const SALIDA = path.join(process.cwd(), "verificacion", "capturas", "cartel-en-vivo");
fs.mkdirSync(SALIDA, { recursive: true });

const NAVEGADORES = [
  process.env.NAVEGADOR,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);

let fallos = 0;
function ok(cond, desc, detalle = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${desc}${detalle !== "" ? `  → ${detalle}` : ""}`);
  if (!cond) fallos++;
}

const executablePath = NAVEGADORES.find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath, headless: true });
const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
// Abarca también lo que pide el service worker.
await ctx.route(/\/rest\/v1\/rpc\/cartel_latido/, (r) => r.abort());
const p = await ctx.newPage();

async function abrir(accion) {
  await accion();
  await p.waitForSelector(".cartel-marco", { timeout: 30_000 });
  await p
    .waitForFunction(() => [...document.images].every((img) => img.complete), null, { timeout: 15_000 })
    .catch(() => {});
}

/** Fecha de la copia guardada de la página del TV. */
const fechaGuardada = () =>
  p.evaluate(async (url) => {
    for (const nombre of await caches.keys()) {
      const r = await (await caches.open(nombre)).match(url);
      if (r) return r.headers.get("date");
    }
    return null;
  }, `${BASE}${TV}`);

try {
  // ---- Primera visita con internet -------------------------------------
  // "load" y no "domcontentloaded": en desarrollo Next navega dos veces al abrir
  // (pasa igual sin service worker) y la segunda destruye lo que se evalúe antes.
  await abrir(() => p.goto(`${BASE}${TV}`, { waitUntil: "load", timeout: 60_000 }));
  await p.waitForTimeout(2000);
  const controlado = await p
    .waitForFunction(() => !!navigator.serviceWorker?.controller, null, { timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  ok(controlado, "el service worker se instala y toma el control en la primera visita");

  // Lo de la primera visita se guarda por mensaje: se le da un momento.
  await p.waitForFunction(
    async (url) => {
      for (const nombre of await caches.keys()) if (await (await caches.open(nombre)).match(url)) return true;
      return false;
    },
    `${BASE}${TV}`,
    { timeout: 30_000, polling: 500 },
  );
  const resumen = await p.evaluate(async () => {
    const r = {};
    for (const nombre of await caches.keys()) r[nombre] = (await (await caches.open(nombre)).keys()).length;
    return r;
  });
  ok(Object.keys(resumen).length > 0, "la página y sus archivos quedan guardados en el TV", JSON.stringify(resumen));

  // Una recarga con internet ya pasa entera por el service worker.
  await abrir(() => p.reload({ waitUntil: "domcontentloaded" }));
  const fotosOnline = await p.$$eval("img", (imgs) => imgs.map((i) => i.src));
  await p.waitForTimeout(3000);

  // ---- Sin internet ------------------------------------------------------
  await ctx.setOffline(true);
  let cargo = true;
  await abrir(() => p.reload({ waitUntil: "domcontentloaded" })).catch(() => (cargo = false));
  ok(cargo, "sin internet, la página del TV vuelve a abrir");
  if (cargo) {
    const placa = await p.$eval(".cartel-marco", (el) => el.dataset.placa).catch(() => null);
    ok(!!placa, "y muestra una placa", placa ?? "");
    const fotos = await p.$$eval("img", (imgs) =>
      imgs.map((i) => ({ src: i.src.slice(-50), ok: i.complete && i.naturalWidth > 0 })),
    );
    ok(fotos.length > 0 && fotos.every((f) => f.ok), "con sus fotos (salen de lo guardado)", JSON.stringify(fotos));
    ok(fotosOnline.length === fotos.length, "las mismas fotos que con internet", `${fotosOnline.length} vs ${fotos.length}`);

    // El video pide de a pedazos: tiene que salir de lo guardado igual.
    await p.waitForTimeout(1500);
    const video = await p.$eval(".cartel-despierto", (v) => ({ t: v.currentTime, pausado: v.paused, error: v.error?.code ?? null }));
    ok(!video.pausado && video.t > 0 && video.error == null, "el video que mantiene despierto al TV anda sin internet", JSON.stringify(video));

    // La rotación de placas sigue aunque los refrescos fallen.
    const total = Number(await p.$eval(".cartel-marco", (el) => el.dataset.total));
    if (total >= 2) {
      const primera = await p.$eval(".cartel-marco", (el) => el.dataset.placa);
      const cambio = await p
        .waitForFunction((id) => document.querySelector(".cartel-marco")?.dataset.placa !== id, primera, { timeout: 65_000 })
        .then(() => true)
        .catch(() => false);
      ok(cambio, "sin internet las placas siguen rotando");
    }
    await p.screenshot({ path: path.join(SALIDA, "sin-internet.png") });
  }

  // ---- Con internet manda lo nuevo ---------------------------------------
  await ctx.setOffline(false);
  const antes = await fechaGuardada();
  await p.waitForTimeout(1500);
  await abrir(() => p.reload({ waitUntil: "domcontentloaded" }));
  await p.waitForTimeout(1000);
  const despues = await fechaGuardada();
  ok(
    !!antes && !!despues && Date.parse(despues) > Date.parse(antes),
    "con internet se usa la página nueva y se actualiza la copia",
    `${antes} → ${despues}`,
  );

  // ---- No se mete en el resto del sistema --------------------------------
  await p.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  ok(!(await p.evaluate(() => !!navigator.serviceWorker?.controller)), "el resto del sistema (login, admin) no queda bajo el service worker");
} catch (e) {
  console.log(`FAIL  la verificación se cortó: ${e.message}`);
  fallos++;
}

console.log(`\n${fallos === 0 ? "OK" : "FALLÓ"}: ${fallos} fallos. Captura en ${SALIDA}`);
await browser.close();
process.exit(fallos === 0 ? 0 : 1);
