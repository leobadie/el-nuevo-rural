/*
 * Verificación en navegador real de la rotación y el movimiento del cartel,
 * contra los puntos 6 y 14-17 de SPEC-cartel-tv-en-vivo.md. Usa el Edge o
 * Chrome ya instalado en Windows.
 *
 * Uso:
 *   1) npm run dev              (en otra terminal)
 *   2) npm run verificar:cartel-en-vivo
 *
 * Variables opcionales:
 *   URL_BASE   por defecto http://localhost:3000
 *   NAVEGADOR  ruta a un ejecutable de Chromium/Edge/Chrome
 *
 * No crea placas: recorre las que ya están cargadas con ?fijo=N, porque una
 * placa de prueba se vería en los televisores del local. Si falta algún tipo
 * (con foto, sin foto, imagen) ese check sale SKIP, no PASS. Lo único que crea
 * es una pantalla apartada (zz-prueba-claude-giro) para probar el giro del
 * admin; ningún TV la abre y se borra al terminar.
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

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

const BASE = process.env.URL_BASE || "http://localhost:3000";
const SALIDA = path.join(process.cwd(), "verificacion", "capturas", "cartel-en-vivo");
fs.mkdirSync(SALIDA, { recursive: true });

const NAVEGADORES = [
  process.env.NAVEGADOR,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
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

const executablePath = NAVEGADORES.find((p) => fs.existsSync(p));
if (!executablePath) {
  console.error("No encontré Edge ni Chrome. Pasá la ruta en NAVEGADOR.");
  process.exit(2);
}

const lanzado = await chromium.launch({ executablePath, headless: true });

// La verificación abre direcciones de televisores reales: si mandara latidos,
// el admin mostraría "conectado" un TV que está apagado (y pisaría el latido
// verdadero, porque hay una fila por pantalla). Se cortan en todos los contextos.
const browser = {
  newContext: async (opciones) => {
    const ctx = await lanzado.newContext(opciones);
    await ctx.route(/\/rest\/v1\/rpc\/cartel_latido/, (r) => r.abort());
    return ctx;
  },
  close: () => lanzado.close(),
};

/** Abre una dirección y espera el lienzo. networkidle no resuelve con Turbopack. */
async function abrir(page, ruta) {
  await page.goto(`${BASE}${ruta}`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  await page.waitForSelector(".cartel-marco", { timeout: 30_000 });
  // Sin esto la captura sale con el hueco de la foto, que todavía está bajando.
  await page
    .waitForFunction(() => [...document.images].every((img) => img.complete), null, { timeout: 15_000 })
    .catch(() => {});
}

/** Caja del lienzo ya girado, tal como se ve en pantalla. */
const caja = (page) =>
  page.$eval(".cartel-marco", (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x, y: r.y, w: r.width, h: r.height };
  });

const animacion = (page, selector) =>
  page.$eval(selector, (el) => getComputedStyle(el).animationName).catch(() => null);

try {
  // ---- 6. Pantalla vertical en un TV apaisado ---------------------------
  const tv = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const p = await tv.newPage();

  await abrir(p, "/cartel/tv/acceso?fijo=0");
  let c = await caja(p);
  ok(c.h > c.w, "sin ?rotar el lienzo es vertical (como hoy)", `${Math.round(c.w)}x${Math.round(c.h)}`);
  ok(Math.abs(c.h - 1080) < 2, "sin ?rotar ocupa todo el alto", `alto ${Math.round(c.h)}`);
  await p.screenshot({ path: path.join(SALIDA, "tv-1920x1080-sin-rotar.png") });

  for (const grados of [90, 270]) {
    await abrir(p, `/cartel/tv/acceso?fijo=0&rotar=${grados}`);
    c = await caja(p);
    ok(
      Math.abs(c.w - 1920) < 2 && Math.abs(c.h - 1080) < 2,
      `?rotar=${grados} llena la pantalla apaisada`,
      `${Math.round(c.w)}x${Math.round(c.h)} en (${Math.round(c.x)}, ${Math.round(c.y)})`,
    );
    ok(Math.abs(c.x) < 2 && Math.abs(c.y) < 2, `?rotar=${grados} queda centrado, sin salirse`);

    // Qué esquina del lienzo quedó arriba: con 90 la franja (que en el diseño
    // va arriba) tiene que terminar a la derecha; con 270, a la izquierda.
    const franja = await p.$eval(".cartel-marco > *", (el) => {
      const r = el.getBoundingClientRect();
      return r.x + r.width / 2;
    });
    ok(
      grados === 90 ? franja > 960 : franja < 960,
      `?rotar=${grados} gira hacia el lado correcto`,
      `el encabezado quedó en x=${Math.round(franja)}`,
    );
    await p.screenshot({ path: path.join(SALIDA, `tv-1920x1080-rotar-${grados}.png`) });
  }

  await abrir(p, "/cartel/tv/acceso?fijo=0&rotar=45");
  c = await caja(p);
  ok(c.h > c.w, "un ?rotar inválido se ignora y no tuerce la pantalla", `${Math.round(c.w)}x${Math.round(c.h)}`);

  // ---- 14-17. Movimiento ------------------------------------------------
  // /cartel muestra todas las placas vigentes: se recorren para encontrar una
  // de cada tipo. Sin ?fijo hay animación; con ?fijo es modo captura.
  const vertical = await browser.newContext({ viewport: { width: 1080, height: 1920 } });
  const v = await vertical.newPage();

  await abrir(v, "/cartel?fijo=0");
  const total = Number(await v.$eval(".cartel-marco", (el) => el.dataset.total));
  const tipos = {};
  for (let i = 0; i < total; i++) {
    await abrir(v, `/cartel?fijo=${i}`);
    const tipo = await v.evaluate(() =>
      document.querySelector(".pl-imagen")
        ? "imagen"
        : document.querySelector(".of-foto")
          ? "conFoto"
          : document.querySelector(".of-sin-foto")
            ? "sinFoto"
            : "otro",
    );
    if (tipos[tipo] == null) tipos[tipo] = i;
  }
  console.log(`      placas vigentes: ${total}; tipos encontrados: ${JSON.stringify(tipos)}`);

  // Modo captura: nada se mueve, así los PNG del generador salen como siempre.
  await abrir(v, "/cartel?fijo=0");
  const enCaptura = await v.$$eval(".cartel-marco *", (els) =>
    els.map((el) => getComputedStyle(el).animationName).filter((n) => n && n !== "none"),
  );
  ok(enCaptura.length === 0, "en modo captura (?fijo) no hay ninguna animación", enCaptura.join(", "));

  // Para ver la placa animada hay que salir de ?fijo; se avanza hasta el tipo
  // buscado mirando qué hay en pantalla.
  async function irATipo(selector, maxMs) {
    await abrir(v, "/cartel");
    const limite = Date.now() + maxMs;
    while (Date.now() < limite) {
      if (await v.$(`${selector}`)) return true;
      await v.waitForTimeout(250);
    }
    return false;
  }
  const vuelta = 70_000;

  if (tipos.conFoto != null && (await irATipo(".of-foto", vuelta))) {
    ok((await animacion(v, ".of-foto img")) === "cartel-zoom", "la foto de la oferta hace zoom lento");
    const dur = await v.$eval(".of-foto img", (el) => getComputedStyle(el).animationDuration);
    const placaMs = Number(await v.$eval(".cartel-marco", (el) => el.dataset.duracion));
    ok(Math.abs(parseFloat(dur) * 1000 - placaMs) < 5, "el zoom dura lo mismo que la placa", `${dur} vs ${placaMs}ms`);
    ok((await animacion(v, ".of-precio")) === "cartel-golpe", "el precio entra con un golpe");
    await v.waitForTimeout(1500);
    await v.screenshot({ path: path.join(SALIDA, "placa-con-foto.png") });
  } else skip("animación de oferta con foto", "no hay ninguna placa vigente con foto");

  if (tipos.sinFoto != null && (await irATipo(".of-sin-foto", vuelta))) {
    ok((await animacion(v, ".of-precio")) === "cartel-golpe", "sin foto, el precio también entra con golpe");
    await v.waitForTimeout(1500);
    await v.screenshot({ path: path.join(SALIDA, "placa-sin-foto.png") });
  } else skip("animación de oferta sin foto", "no hay ninguna placa vigente sin foto");

  if (tipos.imagen != null && (await irATipo(".pl-imagen", vuelta))) {
    ok((await animacion(v, ".pl-imagen")) === "cartel-fundido", "el cartel ya diseñado solo entra con fundido");
    ok((await animacion(v, ".pl-imagen img")) === "none", "el cartel ya diseñado no hace zoom");
  } else skip("cartel ya diseñado sin zoom", "no hay ninguna placa vigente de tipo imagen");

  // Salida: antes del cambio la placa se desvanece, y después entra otra.
  if (total >= 2) {
    // Se registra desde adentro de la página, en el instante de cada cambio:
    // leerlo desde afuera con idas y vueltas puede caer justo en el medio.
    await abrir(v, "/cartel");
    const r = await v.evaluate(
      () =>
        new Promise((resolve, reject) => {
          const marco = () => document.querySelector(".cartel-marco");
          let alSalir = null;
          const obs = new MutationObserver(() => {
            const m = marco();
            if (!m) return;
            if (alSalir == null && m.classList.contains("cartel-saliendo")) {
              alSalir = { placa: m.dataset.placa, t: performance.now() };
            } else if (alSalir != null && m.dataset.placa !== alSalir.placa) {
              obs.disconnect();
              resolve({
                salio: alSalir.placa,
                entro: m.dataset.placa,
                ms: Math.round(performance.now() - alSalir.t),
                escondida: m.classList.contains("cartel-saliendo"),
              });
            }
          });
          obs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["class", "data-placa"] });
          setTimeout(() => reject(new Error("no hubo cambio de placa en 65 s")), 65_000);
        }),
    );
    ok(r.salio !== r.entro, "la placa sale antes de que entre la siguiente", `salida de ${r.ms} ms`);
    ok(r.ms >= 300 && r.ms <= 700, "la salida dura lo previsto (450 ms)", `${r.ms} ms`);
    ok(!r.escondida, "la placa nueva entra visible, no se queda escondida");
  } else skip("salida entre placas", "hay una sola placa vigente");

  // ---- Que el TV no se duerma y pase a pantalla completa ----------------
  {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const t = await ctx.newPage();
    const video = await t.request.get(`${BASE}/cartel/despierto.webm`, { maxRedirects: 0 });
    ok(
      video.status() === 200 && (video.headers()["content-type"] ?? "").includes("webm"),
      "el video que mantiene despierto al TV se baja sin sesión",
      `${video.status()} ${video.headers()["content-type"] ?? ""}`,
    );
    await abrir(t, "/cartel/tv/acceso?rotar=270");
    const antes = await t.$eval(".cartel-despierto", (v) => v.currentTime);
    await t.waitForTimeout(1500);
    const estado = await t.$eval(".cartel-despierto", (v) => ({ t: v.currentTime, pausado: v.paused, loop: v.loop }));
    ok(!estado.pausado && estado.t !== antes && estado.loop, "el video mínimo se reproduce en loop", JSON.stringify(estado));
    const tam = await t.$eval(".cartel-despierto", (v) => v.getBoundingClientRect().width);
    ok(tam <= 4, "y no se ve (4 px)", `${tam}px`);

    await t.keyboard.press("Enter");
    await t.waitForTimeout(500);
    ok(await t.evaluate(() => !!document.fullscreenElement), "un botón del control pone la página en pantalla completa");

    await abrir(t, "/cartel/tv/acceso?fijo=0");
    ok(!(await t.$(".cartel-despierto")), "en modo captura no va el video (no tiene que salir en los PNG)");

    // ---- Actualización sola (solo contra un deploy: en desarrollo no hay versión)
    await abrir(t, "/cartel/tv/acceso");
    const version = await t.$eval(".cartel-marco", (el) => el.dataset.version ?? "");
    if (!version || version === "local") {
      skip("se recarga sola con una versión nueva", "en desarrollo no hay versión de deploy; correr con URL_BASE de producción");
    } else {
      // Se adelanta el reloj y se hace creer al TV que el servidor ya tiene otra versión.
      await ctx.clock.install();
      await abrir(t, "/cartel/tv/acceso");
      await t.route(/\/cartel\/tv\/acceso$/, async (route) => {
        const resp = await route.fetch();
        const html = (await resp.text()).replace(/data-version="[^"]+"/, 'data-version="zz-nueva"');
        await route.fulfill({ response: resp, body: html });
      });
      const recarga = t.waitForEvent("load", { timeout: 30_000 }).then(() => true).catch(() => false);
      await ctx.clock.fastForward("10:30");
      ok(await recarga, "con una versión nueva publicada, la página se recarga sola", `tenía ${version}`);
      // Soltar todas: la página recargada sigue pidiendo y una intercepción viva
      // revienta al cerrar el contexto.
      await t.unrouteAll({ behavior: "ignoreErrors" });
    }
    await ctx.close();
  }

  // ---- Giro elegido en el admin (migración 028) --------------------------
  {
    const env = leerEnv();
    const admin = env.SUPABASE_SERVICE_ROLE_KEY
      ? createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
      : null;
    const { error: sin028 } = admin
      ? await admin.from("cartel_pantallas").select("rotacion").limit(1)
      : { error: { message: "sin service_role key" } };
    if (sin028) {
      skip("giro elegido en el admin", `falta la migración 028 (${sin028.message})`);
    } else {
      // Pantalla propia y apartada: solo se ve en su dirección, ningún TV real la abre.
      const slug = "zz-prueba-claude-giro";
      await admin.from("cartel_pantallas").delete().eq("slug", slug);
      await admin.from("cartel_pantallas").insert({ slug, nombre: "ZZPRUEBA giro", activa: true, orden: 9201, rotacion: 270 });
      try {
        const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
        const g = await ctx.newPage();
        await abrir(g, `/cartel/tv/${slug}?fijo=0`);
        ok(!!(await g.$(".cartel-rotado-270")), "sin ?rotar, la pantalla usa el giro guardado en el admin");
        await abrir(g, `/cartel/tv/${slug}?fijo=0&rotar=90`);
        ok(!!(await g.$(".cartel-rotado-90")), "?rotar en la dirección tiene prioridad sobre el admin");
        await ctx.close();
      } finally {
        await admin.from("cartel_pantallas").delete().eq("slug", slug);
      }
    }
  }

  // ---- 8. Estado de los televisores en el admin -------------------------
  // En el banco de pruebas (base en memoria): carniceria-1 latió hace 2 min,
  // carniceria-2 hace una hora y acceso nunca.
  for (const [nombre, viewport] of [
    ["desktop", { width: 1280, height: 900 }],
    ["movil", { width: 390, height: 844 }],
  ]) {
    const ctx = await browser.newContext({ viewport });
    const a = await ctx.newPage();
    const resp = await a.goto(`${BASE}/login/preview-ofertas?vista=televisores`, {
      waitUntil: "domcontentloaded",
      timeout: 60_000,
    });
    // El banco solo existe en desarrollo: contra producción da 404 a propósito.
    if (resp?.status() === 404) {
      skip(`${nombre}: estado de los televisores en el admin`, "el banco de pruebas no existe en producción");
      await ctx.close();
      continue;
    }
    // Hasta que el panel lee los latidos todos figuran "nunca".
    await a.waitForSelector('[data-latidos="leidos"] [data-estado-tv]', { timeout: 30_000 });
    const estados = await a.$$eval("[data-estado-tv]", (els) => els.map((el) => [el.dataset.estadoTv, el.textContent]));
    const de = (txt) => estados.find(([, t]) => t.includes(txt)) ?? [];
    ok(
      JSON.stringify(estados.map(([e]) => e)) === JSON.stringify(["conectado", "sin-senal", "nunca"]),
      `${nombre}: los tres estados del televisor`,
      estados.map(([e]) => e).join(", "),
    );
    ok(/webOS · Chrome 87/.test(de("Conectado")[1] ?? ""), `${nombre}: muestra el navegador del TV`, de("Conectado")[1]);
    ok(/Sin señal desde las \d\d:\d\d/.test(de("Sin señal")[1] ?? ""), `${nombre}: dice desde qué hora no hay señal`, de("Sin señal")[1]);
    const ancho = await a.evaluate(() => document.documentElement.scrollWidth);
    ok(ancho <= viewport.width, `${nombre}: sin scroll horizontal`, `${ancho}px`);
    await a.screenshot({ path: path.join(SALIDA, `admin-televisores-${nombre}.png`), fullPage: true });
    await ctx.close();
  }

  // ---- Capturas pedidas: móvil y escritorio -----------------------------
  const movil = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const m = await movil.newPage();
  await abrir(m, "/cartel/tv/acceso?fijo=0");
  c = await caja(m);
  ok(c.w <= 390 && c.h <= 844, "en el celular entra entero, sin scroll", `${Math.round(c.w)}x${Math.round(c.h)}`);
  await m.screenshot({ path: path.join(SALIDA, "movil-390.png") });
} catch (e) {
  console.log(`FAIL  la verificación se cortó: ${e.message}`);
  fallos++;
}

console.log(`\n${fallos === 0 ? "OK" : "FALLÓ"}: ${fallos} fallos, ${salteados} salteados. Capturas en ${SALIDA}`);
// El cierre de Edge headless tarda minutos en esta máquina: el informe va antes.
await browser.close();
process.exit(fallos === 0 ? 0 : 1);
