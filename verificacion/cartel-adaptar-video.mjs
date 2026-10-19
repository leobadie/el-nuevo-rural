/*
 * Verificación en navegador real de adaptar los videos a las teles al subirlos
 * (SPEC-cartel-convertir-video.md).
 *
 * Uso:
 *   1) npm run dev              (en otra terminal)
 *   2) npm run verificar:cartel-adaptar-video
 *
 * Parte A — en el banco de pruebas (base en memoria): un video de 1080×2336 a
 *   60 fps y nivel 5 (como el que dejó en negro a Carnicería 1) se adapta solo
 *   antes de subir; Cancelar no sube nada; uno ya apto se sube tal cual.
 *   El video de muestra se fabrica en el momento, dentro del navegador.
 * Parte B — en la tele, contra la base real (pantalla apartada): un video que
 *   no avanza ni da error se saltea en segundos, no en ~45.
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

const BASE = process.env.URL_BASE || "http://localhost:3000";
const APTO = path.join(process.cwd(), "verificacion", "muestras", "video-h264.mp4");
const SALIDA = path.join(process.cwd(), "verificacion", "capturas", "cartel-adaptar-video");
fs.mkdirSync(SALIDA, { recursive: true });
const MEDIABUNNY = path.join(process.cwd(), "node_modules", "mediabunny", "dist", "bundles", "mediabunny.mjs");

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

/** Lee del MP4 el tamaño, el nivel H.264 y si tiene audio (en Node, sin navegador). */
function fichaMp4(buf) {
  const b = Buffer.from(buf);
  const i = b.indexOf(Buffer.from("avcC"));
  // La entrada avc1 de la pista (dentro de stsd), no la marca "avc1" del encabezado ftyp.
  const e = b.indexOf(Buffer.from("avc1"), b.indexOf(Buffer.from("stsd")));
  return {
    nivel: i >= 0 ? b[i + 7] / 10 : null,
    // Después del tipo vienen 24 bytes reservados y luego ancho y alto.
    ancho: e >= 0 ? b.readUInt16BE(e + 4 + 24) : null,
    alto: e >= 0 ? b.readUInt16BE(e + 4 + 26) : null,
    audio: b.indexOf(Buffer.from("mp4a")) >= 0,
    moovPrimero: b.indexOf(Buffer.from("moov")) < b.indexOf(Buffer.from("mdat")),
  };
}

const executablePath = NAVEGADORES.find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath, headless: true });
const env = leerEnv();
const admin = env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;
const SLUG = "zz-prueba-claude-adaptar";
const MARCA = "ZZPRUEBA adaptar";

async function limpiarBase() {
  if (!admin) return;
  await admin.from("cartel_placas").delete().like("titulo", `${MARCA}%`);
  await admin.from("cartel_pantallas").delete().eq("slug", SLUG);
}

/** Fabrica en el navegador un MP4 H.264 del tamaño y fps pedidos. */
async function fabricarVideo(ancho, alto, fps, segundos) {
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  await p.route("https://fabrica.local/**", (r) =>
    r.request().url().endsWith(".mjs")
      ? r.fulfill({ body: fs.readFileSync(MEDIABUNNY), contentType: "text/javascript" })
      : r.fulfill({ body: "<!doctype html><title>fabrica</title>", contentType: "text/html" }),
  );
  await p.goto("https://fabrica.local/");
  const b64 = await p.evaluate(
    async ([ancho, alto, fps, segundos]) => {
      const mb = await import("https://fabrica.local/mediabunny.mjs");
      const out = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: new mb.BufferTarget() });
      const c = new OffscreenCanvas(ancho, alto);
      const g = c.getContext("2d");
      const src = new mb.CanvasSource(c, { codec: "avc", bitrate: 20_000_000 });
      out.addVideoTrack(src, { frameRate: fps });
      await out.start();
      for (let f = 0; f < fps * segundos; f++) {
        // Arriba rojo y abajo azul: así se puede comprobar para qué lado quedó girada la copia.
        g.fillStyle = "#e00000";
        g.fillRect(0, 0, ancho, alto / 2);
        g.fillStyle = "#0000e0";
        g.fillRect(0, alto / 2, ancho, alto / 2);
        g.fillStyle = "#fff";
        g.font = `${Math.round(ancho / 4)}px sans-serif`;
        g.fillText(String(f), ancho / 4, alto / 2);
        await src.add(f / fps, 1 / fps);
      }
      await out.finalize();
      const bytes = new Uint8Array(out.target.buffer);
      let s = "";
      for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
      return btoa(s);
    },
    [ancho, alto, fps, segundos],
  );
  await ctx.close();
  const archivo = path.join(os.tmpdir(), `cartel-${ancho}x${alto}-${fps}.mp4`);
  fs.writeFileSync(archivo, Buffer.from(b64, "base64"));
  return archivo;
}

/** Abre el banco con el editor de video listo. */
async function abrirEditor(viewport) {
  const ctx = await browser.newContext({ viewport });
  const a = await ctx.newPage();
  const resp = await a.goto(`${BASE}/login/preview-ofertas`, { waitUntil: "domcontentloaded", timeout: 60_000 });
  if (resp?.status() === 404) return { ctx, a: null };
  const tipo = 'select:has(option[value="video"])';
  await a.waitForSelector(tipo, { timeout: 30_000 });
  for (let i = 0; i < 20 && !(await a.$('[data-test="subir-video"]')); i++) {
    await a.selectOption(tipo, "video");
    await a.waitForTimeout(500);
  }
  await a.waitForSelector('[data-test="subir-video"]', { state: "attached", timeout: 5_000 });
  return { ctx, a };
}

try {
  // ======================================================================
  // Parte A — adaptar al subir
  // ======================================================================
  const noApto = await fabricarVideo(1080, 2336, 60, 3);
  const ficha0 = fichaMp4(fs.readFileSync(noApto));
  ok(ficha0.ancho === 1080 && ficha0.alto === 2336 && ficha0.nivel >= 5, "el video de muestra es como el del celular (1080×2336, nivel ≥ 5)", JSON.stringify(ficha0));

  for (const [nombre, viewport] of [
    ["desktop", { width: 1280, height: 900 }],
    ["movil", { width: 390, height: 844 }],
  ]) {
    const { ctx, a } = await abrirEditor(viewport);
    if (!a) {
      skip(`${nombre}: adaptar`, "el banco de pruebas solo existe en desarrollo");
      await ctx.close();
      continue;
    }

    await a.setInputFiles('[data-test="subir-video"]', noApto);
    const vioAvance = await a.waitForSelector('[data-test="adaptando"]', { timeout: 20_000 }).then(() => true).catch(() => false);
    ok(vioAvance, `${nombre}: un video no apto muestra "Adaptando el video para las teles…"`);
    // Del editor, no de la página: en el celular queda muy abajo.
    if (vioAvance) await a.locator('[data-test="editor-video"]').screenshot({ path: path.join(SALIDA, `adaptando-${nombre}.png`) }).catch(() => {});

    const vioGirado = await a
      .waitForSelector('[data-test="adaptando-etapa"]:has-text("teles paradas")', { timeout: 120_000 })
      .then(() => true)
      .catch(() => false);
    ok(vioGirado, `${nombre}: con teles paradas, prepara también la versión girada ("…teles paradas")`);
    await a.waitForSelector('[data-test="recortador-video"]', { timeout: 120_000 });
    const aviso = await a.textContent('[data-test="aviso-video"]').catch(() => null);
    ok(/Lo adaptamos/.test(aviso ?? "") && /1080×2336 → 886×1920/.test(aviso ?? ""), `${nombre}: avisa qué se cambió (1080×2336 → 886×1920)`, aviso ?? "sin aviso");
    ok(/nivel 5(\.\d)?/.test(aviso ?? "") && /60 cuadros/.test(aviso ?? ""), `${nombre}: …y por qué (nivel 5, 60 cuadros)`);

    // El archivo que quedó en la placa: se lee desde la página (es un blob local del banco).
    const subido = await a.evaluate(async () => {
      const v = [...document.querySelectorAll('video[data-test="recortador-video"]')].pop();
      if (!v) return null;
      if (v.readyState < 1) await new Promise((r) => v.addEventListener("loadedmetadata", r, { once: true }));
      const buf = await (await fetch(v.currentSrc || v.src)).arrayBuffer();
      return { bytes: Array.from(new Uint8Array(buf)), ancho: v.videoWidth, alto: v.videoHeight };
    });
    if (!subido) {
      ok(false, `${nombre}: se encuentra el video subido en el editor`);
    } else {
      const f = fichaMp4(Uint8Array.from(subido.bytes));
      ok(f.ancho === 886 && f.alto === 1920, `${nombre}: el resultado mide 886×1920`, `${f.ancho}×${f.alto}`);
      ok(f.nivel != null && f.nivel <= 4.1, `${nombre}: H.264 nivel ≤ 4.1 (lo que decodifica la tele)`, String(f.nivel));
      ok(!f.audio, `${nombre}: sin audio`);
      ok(f.moovPrimero, `${nombre}: con el índice al principio (arranca sin bajar todo)`);
      ok(subido.ancho === 886 && subido.alto === 1920, `${nombre}: el navegador lo reproduce`, `${subido.ancho}×${subido.alto}`);
      if (nombre === "desktop") fs.writeFileSync(path.join(os.tmpdir(), "cartel-adaptado.mp4"), Buffer.from(subido.bytes));
    }

    // La versión girada para las teles paradas (giro 270, como las del local).
    const girada = await a.evaluate(async () => {
      const clip = [...document.querySelectorAll('[data-test="clip"]')].pop();
      const url = JSON.parse(clip?.dataset.girados || "{}")["270"];
      if (!url) return null;
      const buf = await (await fetch(url)).arrayBuffer();
      // Qué color queda a la izquierda y a la derecha del cuadro.
      const v = document.createElement("video");
      v.muted = true;
      v.src = url;
      await new Promise((r) => v.addEventListener("loadeddata", r, { once: true }));
      v.currentTime = 0.5;
      await new Promise((r) => v.addEventListener("seeked", r, { once: true }));
      // El cuadro puede no estar dibujado todavía justo después de "seeked".
      await new Promise((r) => setTimeout(r, 500));
      const c = document.createElement("canvas");
      c.width = v.videoWidth;
      c.height = v.videoHeight;
      const g = c.getContext("2d");
      g.drawImage(v, 0, 0);
      const color = (fx, fy) => {
        const [r, , b] = g.getImageData(Math.round(c.width * fx), Math.round(c.height * fy), 1, 1).data;
        if (r < 60 && b < 60) return "negro";
        return r > b ? "rojo" : "azul";
      };
      return { bytes: Array.from(new Uint8Array(buf)), izquierda: color(0.1, 0.5), derecha: color(0.9, 0.5) };
    });
    if (!girada) {
      ok(false, `${nombre}: el clip tiene versión girada para 270`);
    } else {
      const f = fichaMp4(Uint8Array.from(girada.bytes));
      ok(f.ancho === 1920 && f.alto === 886, `${nombre}: la versión girada mide 1920×886 (acostada)`, `${f.ancho}×${f.alto}`);
      ok(f.nivel != null && f.nivel <= 4.1 && !f.audio, `${nombre}: …H.264 nivel ≤ 4.1 y sin audio`, `nivel ${f.nivel}`);
      // Con 270 el borde de arriba del video (rojo) queda a la izquierda, igual que la placa girada por CSS.
      ok(girada.izquierda === "rojo" && girada.derecha === "azul", `${nombre}: …girada para el mismo lado que la placa (arriba → izquierda)`, `${girada.izquierda} | ${girada.derecha}`);
      if (nombre === "desktop") fs.writeFileSync(path.join(os.tmpdir(), "cartel-girado270.mp4"), Buffer.from(girada.bytes));
    }
    await a.locator('[data-test="editor-video"]').screenshot({ path: path.join(SALIDA, `adaptado-${nombre}.png`) });

    if (nombre === "desktop") {
      // Cancelar a mitad: no se sube nada.
      const clipsAntes = (await a.$$('[data-test="clip"]')).length;
      await a.setInputFiles('[data-test="subir-video"]', noApto);
      await a.waitForSelector('[data-test="adaptando-cancelar"]', { timeout: 20_000 });
      await a.click('[data-test="adaptando-cancelar"]');
      const cancelado = await a.waitForSelector("text=/Cancelado: el video no se subió/", { timeout: 20_000 }).then(() => true).catch(() => false);
      ok(cancelado, "Cancelar avisa que no se subió");
      ok((await a.$$('[data-test="clip"]')).length === clipsAntes, "…y no agrega ningún clip", `${clipsAntes} → ${(await a.$$('[data-test="clip"]')).length}`);
      ok(!(await a.$('[data-test="adaptando"]')), "…y la barra de avance desaparece");

      // Un video ya apto se sube tal cual.
      await a.setInputFiles('[data-test="subir-video"]', APTO);
      await a.waitForFunction((n) => document.querySelectorAll('[data-test="clip"]').length > n, clipsAntes, { timeout: 30_000 });
      const avisoApto = await a.textContent('[data-test="aviso-video"]').catch(() => "");
      ok(!/Lo adaptamos/.test(avisoApto ?? ""), "un video ya apto se sube sin adaptar", (avisoApto ?? "").slice(0, 80));
    }
    await ctx.close();
  }

  // ======================================================================
  // Parte B — la tele saltea un video que no avanza
  // ======================================================================
  if (!admin) {
    skip("Parte B (la tele)", "sin service_role key");
  } else {
    await limpiarBase();
    await admin.from("cartel_pantallas").insert({ slug: SLUG, nombre: "ZZPRUEBA adaptar", seccion: "ZZPrueba", orden: 9501 });
    const colgado = `${env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/cartel/zz-prueba-colgado.mp4`;
    const { data: creadas, error: eAlta } = await admin
      .from("cartel_placas")
      .insert([
        { titulo: `${MARCA} colgado`, tipo: "video", clips: [{ url: colgado, desde: 0, hasta: 15, duracion: 15 }], duracion_seg: 15, orden: 9501, activa: true },
        { titulo: `${MARCA} oferta`, tipo: "oferta", precio: 1, duracion_seg: 4, orden: 9502, activa: true },
      ])
      .select("id, titulo");
    ok(!eAlta && creadas?.length === 2, "se crean las placas de prueba", eAlta?.message);
    await admin.from("cartel_placa_pantalla").insert(creadas.map((p) => ({ placa_id: p.id, pantalla_slug: SLUG })));
    const idColgado = creadas.find((p) => p.titulo.endsWith("colgado")).id;

    const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 } });
    await ctx.route(/\/rest\/v1\/rpc\/cartel_latido/, (r) => r.abort());
    // El video nunca contesta ni da error: como una tele que no lo puede decodificar.
    await ctx.route(/zz-prueba-colgado\.mp4/, () => {});
    const t = await ctx.newPage();
    await t.addInitScript(() => {
      window.__placas = [];
      new MutationObserver(() => {
        const actual = document.querySelector(".cartel-marco")?.dataset.placa;
        const ult = window.__placas[window.__placas.length - 1];
        if (actual && ult?.id !== actual) window.__placas.push({ id: actual, t: performance.now() });
      }).observe(document, { subtree: true, attributes: true, childList: true });
    });
    await t.goto(`${BASE}/cartel/tv/${SLUG}`, { waitUntil: "load", timeout: 60_000 });
    await t.waitForFunction(
      (id) => {
        const i = window.__placas.findIndex((p) => p.id === id);
        return i >= 0 && window.__placas.length > i + 1;
      },
      idColgado,
      { timeout: 90_000, polling: 300 },
    ).catch(() => {});
    const reg = await t.evaluate(() => window.__placas);
    const i = reg.findIndex((p) => p.id === idColgado);
    const dura = i >= 0 && reg[i + 1] ? Math.round(reg[i + 1].t - reg[i].t) : null;
    ok(dura != null && dura < 12_000, "un video que no avanza ni da error se saltea en segundos (antes ~45 s)", dura == null ? "no se salteó" : `${dura} ms`);
    await ctx.close();
  }

  // ======================================================================
  // Parte C — la tele parada usa la versión girada, en la capa sin girar
  // ======================================================================
  const adaptado = path.join(os.tmpdir(), "cartel-adaptado.mp4");
  const girado = path.join(os.tmpdir(), "cartel-girado270.mp4");
  if (!admin || !fs.existsSync(adaptado) || !fs.existsSync(girado)) {
    skip("Parte C (tele parada)", "faltan la base o los videos de la parte A");
  } else {
    await limpiarBase();
    const subir = async (nombre, archivo) => {
      await admin.storage.from("cartel").upload(nombre, fs.readFileSync(archivo), { contentType: "video/mp4", upsert: true });
      return admin.storage.from("cartel").getPublicUrl(nombre).data.publicUrl;
    };
    const urlParado = await subir("zz-prueba-adaptar.mp4", adaptado);
    const urlGirado = await subir("zz-prueba-adaptar-girado270.mp4", girado);
    await admin.from("cartel_pantallas").insert({ slug: SLUG, nombre: "ZZPRUEBA adaptar", seccion: "ZZPrueba", orden: 9501, rotacion: 270 });
    const { data: creadas } = await admin
      .from("cartel_placas")
      .insert([
        {
          titulo: `${MARCA} girado`, tipo: "video", duracion_seg: 3, orden: 9501, activa: true,
          clips: [{ url: urlParado, girados: { 270: urlGirado }, desde: 0, hasta: 3, duracion: 3 }],
        },
      ])
      .select("id");
    await admin.from("cartel_placa_pantalla").insert(creadas.map((p) => ({ placa_id: p.id, pantalla_slug: SLUG })));

    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    await ctx.route(/\/rest\/v1\/rpc\/cartel_latido/, (r) => r.abort());
    const t = await ctx.newPage();
    await t.goto(`${BASE}/cartel/tv/${SLUG}`, { waitUntil: "load", timeout: 60_000 });
    const enCapa = await t.waitForSelector(".cartel-capa-video video", { timeout: 30_000 }).then(() => true).catch(() => false);
    ok(enCapa, "tele parada: el video va en la capa sin girar");
    if (enCapa) {
      const info = await t.$eval(".cartel-capa-video video", (v) => {
        const r = v.getBoundingClientRect();
        const capa = v.closest(".cartel-capa-video");
        return {
          src: v.currentSrc || v.src,
          girado: v.dataset.girado,
          rect: `${Math.round(r.left)},${Math.round(r.top)} ${Math.round(r.width)}×${Math.round(r.height)}`,
          // La capa no puede tener ningún giro encima: es lo que la tele ignora.
          sinGiro: getComputedStyle(capa).transform === "none" && getComputedStyle(capa.parentElement).transform === "none",
          fondoPlaca: getComputedStyle(document.querySelector(".cartel-marco")).backgroundColor,
        };
      });
      ok(/girado270/.test(info.src) && info.girado === "270", "…con la versión girada 270", info.src.split("/").pop());
      ok(info.rect === "0,0 1920×1080", "…ocupando toda la pantalla", info.rect);
      ok(info.sinGiro, "…sin ningún giro por CSS");
      ok(/rgba\(0, 0, 0, 0\)|transparent/.test(info.fondoPlaca), "…y la placa de encima transparente para dejarlo ver", info.fondoPlaca);
      await t.screenshot({ path: path.join(SALIDA, "tele-parada-girado.png") });
    }
    // Una tele acostada (sin giro) sigue usando el video normal, dentro de la placa.
    await t.goto(`${BASE}/cartel/tv/${SLUG}?rotar=0`, { waitUntil: "load", timeout: 60_000 });
    await t.waitForSelector(".cartel-marco video:not(.cartel-despierto)", { timeout: 30_000 });
    const normal = await t.$eval(".cartel-marco video:not(.cartel-despierto)", (v) => ({ src: v.currentSrc || v.src, enCapa: !!document.querySelector(".cartel-capa-video video") }));
    ok(!/girado/.test(normal.src) && !normal.enCapa, "tele sin giro: usa el video normal, dentro de la placa", normal.src.split("/").pop());
    await ctx.close();
    await admin.storage.from("cartel").remove(["zz-prueba-adaptar.mp4", "zz-prueba-adaptar-girado270.mp4"]);
  }
} finally {
  await limpiarBase();
  await browser.close();
}

console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} CHECK(S) FALLARON`}${salteados ? ` (${salteados} salteado(s))` : ""}`);
process.exit(fallos === 0 ? 0 : 1);
