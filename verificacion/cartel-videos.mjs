/*
 * Verificación en navegador real de las placas de video (SPEC-cartel-videos.md,
 * puntos 1-5 y 10-14).
 *
 * Uso:
 *   1) npm run dev              (en otra terminal)
 *   2) npm run verificar:cartel-videos
 *
 * Parte A — el editor del admin, en el banco de pruebas (base en memoria): subir,
 *   frenar HEVC y archivos pesados, recortar, previa y guardar.
 * Parte B — la reproducción en el televisor, contra la base real. Necesita la
 *   migración 029. Todo lo que crea va a una pantalla de prueba apartada
 *   (zz-prueba-claude-video) que ningún TV abre, y se borra antes de cerrar el
 *   navegador (el cierre de Edge tarda minutos en esta máquina).
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

const BASE = process.env.URL_BASE || "http://localhost:3000";
const MUESTRAS = path.join(process.cwd(), "verificacion", "muestras");
const H264 = path.join(MUESTRAS, "video-h264.mp4");
const HEVC = path.join(MUESTRAS, "video-hevc-falso.mp4");
const SALIDA = path.join(process.cwd(), "verificacion", "capturas", "cartel-videos");
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

const executablePath = NAVEGADORES.find((p) => fs.existsSync(p));
const browser = await chromium.launch({ executablePath, headless: true });

/** Cambia un <input type=range> como lo haría una persona: React escucha "input". */
const moverDeslizador = (page, prueba, valor) =>
  page.$eval(
    `[data-test="${prueba}"]`,
    (el, v) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
      setter.call(el, String(v));
      el.dispatchEvent(new Event("input", { bubbles: true }));
    },
    valor,
  );

const env = leerEnv();
const admin = env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } })
  : null;
const SLUG = "zz-prueba-claude-video";
const ARCHIVO = "zz-prueba-claude-video.mp4";
const MARCA = "ZZPRUEBA video";

async function limpiarBase() {
  if (!admin) return;
  await admin.from("cartel_placas").delete().like("titulo", `${MARCA}%`);
  await admin.from("cartel_pantallas").delete().eq("slug", SLUG);
  await admin.storage.from("cartel").remove([ARCHIVO]);
}

try {
  // ======================================================================
  // Parte A — editor del admin (banco de pruebas, base en memoria)
  // ======================================================================
  for (const [nombre, viewport] of [
    ["desktop", { width: 1280, height: 900 }],
    ["movil", { width: 390, height: 844 }],
  ]) {
    const ctx = await browser.newContext({ viewport });
    const a = await ctx.newPage();
    const resp = await a.goto(`${BASE}/login/preview-ofertas`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    if (resp?.status() === 404) {
      skip(`${nombre}: editor de video`, "el banco de pruebas solo existe en desarrollo");
      await ctx.close();
      continue;
    }
    const tipo = 'select:has(option[value="video"])';
    await a.waitForSelector(tipo, { timeout: 30_000 });
    // Si se elige antes de que React tome la página, React vuelve a "oferta":
    // se reintenta hasta que aparece el editor.
    for (let i = 0; i < 20 && !(await a.$('[data-test="subir-video"]')); i++) {
      await a.selectOption(tipo, "video");
      await a.waitForTimeout(500);
    }
    await a.waitForSelector('[data-test="subir-video"]', { state: "attached", timeout: 5_000 });

    // HEVC: se frena antes de subir, con instrucciones.
    await a.setInputFiles('[data-test="subir-video"]', HEVC);
    const avisoHevc = await a.waitForSelector("text=/Más compatible/", { timeout: 10_000 }).then(() => true).catch(() => false);
    ok(avisoHevc, `${nombre}: un video HEVC (iPhone) se frena y explica cómo arreglarlo`);
    ok(!(await a.$('[data-test="recortador-video"]')), `${nombre}: …y no se sube`);

    // Más de 50 MB: se frena sin leerlo entero.
    // A disco y no en memoria: Playwright no pasa archivos de más de 50 MB así.
    const pesado = path.join(os.tmpdir(), "cartel-video-pesado.mp4");
    fs.writeFileSync(pesado, Buffer.alloc(51 * 1024 * 1024));
    await a.setInputFiles('[data-test="subir-video"]', pesado);
    fs.rmSync(pesado, { force: true });
    const avisoPeso = await a.waitForSelector("text=/el máximo es 50 MB/", { timeout: 10_000 }).then(() => true).catch(() => false);
    ok(avisoPeso, `${nombre}: un video de más de 50 MB se frena antes de subir`);

    // H.264: se sube y aparece el recortador con el video entero.
    await a.setInputFiles('[data-test="subir-video"]', H264);
    await a.waitForSelector('[data-test="recortador-video"]', { timeout: 20_000 });
    const durTexto = await a.textContent('[data-test="duracion-recorte"]');
    ok(/6,1 s/.test(durTexto ?? ""), `${nombre}: el H.264 se sube y se lee su duración`, durTexto?.trim());

    // Recorte del segundo 1 al 4.
    await moverDeslizador(a, "recorte-desde", 1);
    await moverDeslizador(a, "recorte-hasta", 4);
    const recorte = await a.textContent('[data-test="duracion-recorte"]');
    ok(/dura 3 s/.test(recorte ?? ""), `${nombre}: el recorte del 1 al 4 deja 3 s`, recorte?.trim());

    // Fin antes del inicio: el editor no lo permite.
    await moverDeslizador(a, "recorte-hasta", 0.5);
    const raro = await a.textContent('[data-test="duracion-recorte"]');
    ok(/dura 1 s/.test(raro ?? ""), `${nombre}: un fin antes del inicio queda en el mínimo de 1 s`, raro?.trim());
    await moverDeslizador(a, "recorte-hasta", 4);

    // La previa reproduce solo el tramo, sin franja ni pie.
    const previa = a.locator(".cartel-marco:visible").first();
    ok((await previa.locator(".cartel-header").count()) === 0, `${nombre}: la previa del video va sin franja ni pie`);
    const tiempos = [];
    for (let i = 0; i < 12; i++) {
      tiempos.push(await previa.locator("video").evaluate((v) => v.currentTime));
      await a.waitForTimeout(500);
    }
    const dentro = tiempos.every((t) => t >= 0.9 && t <= 4.3);
    const avanzo = Math.max(...tiempos) - Math.min(...tiempos) > 1.5;
    ok(dentro && avanzo, `${nombre}: la previa reproduce solo el tramo 1-4 y vuelve a empezar`, tiempos.map((t) => t.toFixed(1)).join(" "));

    await a.locator('[data-test="editor-video"]').scrollIntoViewIfNeeded();
    await a.screenshot({ path: path.join(SALIDA, `editor-video-${nombre}.png`) });

    // ---- Paso 3: encuadre y precio encima --------------------------------
    const videoPrevia = previa.locator(".pl-video video");
    const estilo = () => videoPrevia.evaluate((v) => ({ fit: getComputedStyle(v).objectFit, pos: getComputedStyle(v).objectPosition }));
    ok((await estilo()).fit === "contain", `${nombre}: por defecto el video se ve entero`, JSON.stringify(await estilo()));
    await a.click('[data-test="video-encuadre"] [data-valor="llenar"]');
    await a.click('[data-test="video-foco"] [data-valor="inicio"]');
    const lleno = await estilo();
    ok(lleno.fit === "cover" && lleno.pos === "0% 0%", `${nombre}: "llenar" desde arriba recorta y deja ver el principio`, JSON.stringify(lleno));

    ok((await previa.locator('[data-test="precio-encima"]').count()) === 0, `${nombre}: sin texto, no hay nada encima del video`);
    ok(!(await a.isVisible('input[placeholder="8990"]')), `${nombre}: …y no se piden precios`);
    await a.click('[data-test="video-texto"] [data-valor="abajo"]');
    await a.fill('input[placeholder="8990"]', "8990");
    await a.fill('input[placeholder="11500"]', "11500");
    const banda = previa.locator('[data-test="precio-encima"]');
    await banda.waitFor({ timeout: 5_000 });
    // La banda entra deslizándose (0,6 s): se mide quieta.
    await a.waitForTimeout(900);
    const textoBanda = await banda.textContent();
    ok(/8\.990/.test(textoBanda ?? "") && /22% OFF/.test(textoBanda ?? ""), `${nombre}: el precio y el % OFF aparecen encima del video`, textoBanda?.trim());
    const pegada = await a.evaluate(() => {
      const m = [...document.querySelectorAll(".cartel-marco")].find((x) => x.offsetParent && x.querySelector('[data-test="precio-encima"]'));
      const b = m.querySelector('[data-test="precio-encima"]').getBoundingClientRect();
      const r = m.getBoundingClientRect();
      return { abajo: Math.abs(b.bottom - r.bottom), arriba: Math.abs(b.top - r.top) };
    });
    ok(pegada.abajo < 2, `${nombre}: "abajo" va pegado al pie del video`, JSON.stringify(pegada));
    await a.click('[data-test="video-texto"] [data-valor="arriba"]');
    await a.waitForTimeout(300);
    const arriba = await a.evaluate(() => {
      const m = [...document.querySelectorAll(".cartel-marco")].find((x) => x.offsetParent && x.querySelector('[data-test="precio-encima"]'));
      return Math.abs(m.querySelector('[data-test="precio-encima"]').getBoundingClientRect().top - m.getBoundingClientRect().top);
    });
    ok(arriba < 2, `${nombre}: "arriba" va pegado al borde de arriba`, `${arriba}px`);

    // Previa como TV acostado.
    await a.click('[data-test="previa-orientacion"] [data-valor="acostado"]');
    const acostada = await previa.evaluate((m) => ({ w: m.getBoundingClientRect().width, h: m.getBoundingClientRect().height }));
    ok(acostada.w > acostada.h, `${nombre}: la previa se puede ver como TV acostado`, `${Math.round(acostada.w)}x${Math.round(acostada.h)}`);
    const bandaAcostada = await previa.evaluate((m) => m.querySelector('[data-test="precio-encima"]').getBoundingClientRect().height / m.getBoundingClientRect().height);
    ok(bandaAcostada < 0.6, `${nombre}: acostado, la banda no tapa más de la mitad`, `${Math.round(bandaAcostada * 100)}%`);
    const anchoAcostado = await a.evaluate(() => document.documentElement.scrollWidth);
    ok(anchoAcostado <= viewport.width, `${nombre}: la previa acostada entra sin scroll horizontal`, `${anchoAcostado}px`);
    await previa.scrollIntoViewIfNeeded();
    await a.waitForTimeout(1200);
    await a.screenshot({ path: path.join(SALIDA, `previa-acostada-${nombre}.png`) });
    await a.click('[data-test="previa-orientacion"] [data-valor="parado"]');
    await a.waitForTimeout(1200);
    await previa.screenshot({ path: path.join(SALIDA, `previa-parada-${nombre}.png`) });

    // Guardar.
    await a.fill('input[placeholder="Video de la parrilla"]', `${MARCA} admin`);
    await a.click('button:has-text("Crear placa")');
    // Dentro de la lista: el nombre también aparece en la banda de la previa.
    const lista = a.locator('section:has(h2:has-text("Placas ("))');
    const enLista = await lista
      .locator(`text=${MARCA} admin`)
      .first()
      .waitFor({ timeout: 10_000 })
      .then(() => true)
      .catch(() => false);
    ok(enLista, `${nombre}: la placa de video se guarda y aparece en la lista`);
    // La línea de detalle es la que sigue al título de la placa.
    const detalle = await lista
      .locator(`text=${MARCA} admin`)
      .first()
      .locator("xpath=following-sibling::div[1]")
      .textContent()
      .catch(() => "");
    ok(/3s/.test(detalle ?? ""), `${nombre}: la lista muestra la duración del recorte`, detalle?.trim());

    const ancho = await a.evaluate(() => document.documentElement.scrollWidth);
    ok(ancho <= viewport.width, `${nombre}: sin scroll horizontal`, `${ancho}px`);
    await a.screenshot({ path: path.join(SALIDA, `admin-video-${nombre}.png`), fullPage: true });
    await ctx.close();
  }

  // ======================================================================
  // Parte B — reproducción en el televisor (base real, pantalla apartada)
  // ======================================================================
  const { error: sin029 } = admin
    ? await admin.from("cartel_placas").select("clips").limit(1)
    : { error: { message: "sin service_role key" } };
  if (sin029) {
    skip("reproducción en el televisor", `falta la migración 029 (${sin029.message})`);
  } else {
    await limpiarBase();
    const { error: eSubida } = await admin.storage
      .from("cartel")
      .upload(ARCHIVO, fs.readFileSync(H264), { contentType: "video/mp4", cacheControl: "31536000" });
    ok(!eSubida, "se sube el video de muestra", eSubida?.message);
    const url = admin.storage.from("cartel").getPublicUrl(ARCHIVO).data.publicUrl;

    await admin.from("cartel_pantallas").insert({ slug: SLUG, nombre: "ZZPRUEBA video", seccion: "ZZPrueba", orden: 9401 });
    const clip = (desde, hasta, u = url) => ({ url: u, desde, hasta, duracion: 6.1 });
    const { data: creadas, error: eAlta } = await admin
      .from("cartel_placas")
      .insert([
        { titulo: `${MARCA} 1-3.5`, tipo: "video", clips: [clip(1, 3.5)], duracion_seg: 3, orden: 9401, activa: true },
        { titulo: `${MARCA} roto`, tipo: "video", clips: [clip(0, 3, url.replace(ARCHIVO, "no-existe.mp4"))], duracion_seg: 3, orden: 9402, activa: true },
        { titulo: `${MARCA} dos tramos`, tipo: "video", clips: [clip(0, 1.5), clip(4, 5.5)], duracion_seg: 3, orden: 9403, activa: true },
        { titulo: `${MARCA} oferta`, tipo: "oferta", precio: 1, duracion_seg: 3, orden: 9404, activa: true },
      ])
      .select("id, titulo");
    ok(!eAlta && creadas?.length === 4, "se crean las placas de prueba", eAlta?.message);
    const id = (t) => creadas.find((p) => p.titulo === `${MARCA} ${t}`).id;
    // Solo en la pantalla apartada: ningún televisor real las ve.
    await admin.from("cartel_placa_pantalla").insert(creadas.map((p) => ({ placa_id: p.id, pantalla_slug: SLUG })));

    // La base rechaza un video sin tramos.
    const { error: eSinClips } = await admin.from("cartel_placas").insert({ titulo: `${MARCA} vacío`, tipo: "video", clips: [], duracion_seg: 3 });
    ok(!!eSinClips, "la base rechaza una placa de video sin tramos", eSinClips?.message ?? "¡LA ACEPTÓ!");
    const { error: eNull } = await admin.from("cartel_placas").insert({ titulo: `${MARCA} null`, tipo: "video", duracion_seg: 3 });
    ok(!!eNull, "…y una sin clips (NULL)", eNull?.message ?? "¡LA ACEPTÓ!");

    const ctx = await browser.newContext({ viewport: { width: 1080, height: 1920 } });
    await ctx.route(/\/rest\/v1\/rpc\/cartel_latido/, (r) => r.abort());
    const t = await ctx.newPage();

    // Registro, desde adentro de la página, de qué placa hay y cuándo cambia.
    await t.addInitScript(() => {
      window.__placas = [];
      const mirar = () => {
        const m = document.querySelector(".cartel-marco");
        const actual = m?.dataset.placa;
        const ult = window.__placas[window.__placas.length - 1];
        if (actual && ult?.id !== actual) {
          const v = m.querySelector("video:not(.cartel-despierto)");
          window.__placas.push({ id: actual, t: performance.now(), header: !!m.querySelector(".cartel-header") });
          if (v) {
            const reg = window.__placas[window.__placas.length - 1];
            reg.tiempos = [];
            reg.tramos = [];
            const id = setInterval(() => {
              if (!v.isConnected) return clearInterval(id);
              reg.tiempos.push(Math.round(v.currentTime * 10) / 10);
              reg.tramos.push(v.dataset.tramo);
            }, 200);
          }
        }
      };
      new MutationObserver(mirar).observe(document, { subtree: true, attributes: true, childList: true });
    });

    await t.goto(`${BASE}/cartel/tv/${SLUG}`, { waitUntil: "load", timeout: 60_000 });
    // Una vuelta entera: las placas de prueba duran ~3 s cada una, más las reales.
    await t.waitForFunction(
      (ids) => ids.every((i) => window.__placas.some((p) => p.id === i)) && window.__placas.length > ids.length + 1,
      [id("1-3.5"), id("roto"), id("dos tramos"), id("oferta")],
      { timeout: 120_000, polling: 500 },
    );
    const reg = await t.evaluate(() => window.__placas);
    const de = (titulo) => {
      const i = reg.findIndex((p) => p.id === id(titulo));
      return { ...reg[i], dura: reg[i + 1] ? reg[i + 1].t - reg[i].t : null };
    };

    const v1 = de("1-3.5");
    const primeros = (v1.tiempos ?? []).filter((x) => x > 0);
    ok(primeros.length > 0 && primeros[0] >= 0.9 && primeros[0] <= 1.8, "el video arranca en el segundo del recorte (1)", (v1.tiempos ?? []).join(" "));
    ok(Math.max(...(v1.tiempos ?? [0])) <= 3.8, "y no pasa del final del recorte (3,5)", `máximo ${Math.max(...(v1.tiempos ?? [0]))}`);
    ok(v1.dura >= 2300 && v1.dura <= 5500, "la placa dura lo del recorte (2,5 s + salida), no los 8 s fijos", `${Math.round(v1.dura)} ms`);
    ok(!v1.header, "el video va a pantalla completa, sin franja");

    const roto = de("roto");
    ok(roto.dura != null && roto.dura <= 4500, "un video que no carga se salta enseguida", `${Math.round(roto.dura ?? -1)} ms`);

    const dos = de("dos tramos");
    const tramos = [...new Set((dos.tramos ?? []).filter(Boolean))];
    ok(tramos.includes("0") && tramos.includes("1"), "una placa con dos tramos los reproduce uno detrás del otro", tramos.join(","));
    const tiemposDos = (dos.tiempos ?? []).filter((x, i) => dos.tramos[i] === "1" && x > 0);
    ok(tiemposDos.length > 0 && tiemposDos[0] >= 3.9 && tiemposDos[0] <= 4.8, "el segundo tramo arranca en su segundo (4)", tiemposDos.join(" "));
    ok(dos.dura >= 2500 && dos.dura <= 6500, "y la placa dura la suma de los tramos (3 s)", `${Math.round(dos.dura)} ms`);

    const of = de("oferta");
    ok(of.header, "después de un video, la oferta vuelve con su franja");

    // ---- Paso 3 en el TV: encuadre y precio encima (migración 030) --------
    const { error: sin030 } = await admin.from("cartel_placas").select("video_texto").limit(1);
    if (sin030) {
      skip("encuadre y precio encima en el televisor", `falta la migración 030 (${sin030.message})`);
    } else {
      const { data: conTexto, error: eTexto } = await admin
        .from("cartel_placas")
        .insert({
          titulo: `${MARCA} con precio`,
          tipo: "video",
          clips: [clip(0, 3)],
          duracion_seg: 3,
          orden: 9405,
          activa: true,
          seccion: "Carnicería",
          precio: 8990,
          precio_anterior: 11500,
          unidad: "el kilo",
          video_encuadre: "llenar",
          video_foco: "fin",
          video_texto: "arriba",
        })
        .select("id")
        .single();
      ok(!eTexto, "se guarda una placa de video con encuadre y precio encima", eTexto?.message);
      const { error: eMalo } = await admin.from("cartel_placas").insert({ titulo: `${MARCA} malo`, tipo: "video", clips: [clip(0, 3)], duracion_seg: 3, video_texto: "medio" });
      ok(!!eMalo, "la base rechaza una posición de texto inventada", eMalo?.message ?? "¡LA ACEPTÓ!");
      await admin.from("cartel_placa_pantalla").insert({ placa_id: conTexto.id, pantalla_slug: SLUG });

      for (const [forma, vp] of [
        ["parado", { width: 1080, height: 1920 }],
        ["acostado", { width: 1920, height: 1080 }],
      ]) {
        const c2 = await browser.newContext({ viewport: vp });
        await c2.route(/\/rest\/v1\/rpc\/cartel_latido/, (r) => r.abort());
        const q = await c2.newPage();
        await q.goto(`${BASE}/cartel/tv/${SLUG}?fijo=0`, { waitUntil: "load" });
        const n = Number(await q.$eval(".cartel-marco", (m) => m.dataset.total));
        let encontrada = false;
        for (let i = 0; i < n && !encontrada; i++) {
          await q.goto(`${BASE}/cartel/tv/${SLUG}?fijo=${i}`, { waitUntil: "load" });
          await q.waitForSelector(".cartel-marco");
          if ((await q.$eval(".cartel-marco", (m) => m.dataset.placa)) !== conTexto.id) continue;
          encontrada = true;
          await q.waitForTimeout(1500);
          const r = await q.evaluate(() => {
            const m = document.querySelector(".cartel-marco").getBoundingClientRect();
            const v = document.querySelector(".pl-video video");
            const b = document.querySelector('[data-test="precio-encima"]');
            const bb = b?.getBoundingClientRect();
            return {
              fit: getComputedStyle(v).objectFit,
              pos: getComputedStyle(v).objectPosition,
              texto: b?.textContent ?? "",
              arriba: bb ? Math.abs(bb.top - m.top) : null,
              alto: bb ? bb.height / m.height : null,
            };
          });
          ok(r.fit === "cover" && r.pos === "100% 100%", `${forma}: el video llena la pantalla mostrando el final`, `${r.fit} ${r.pos}`);
          ok(/8\.990/.test(r.texto) && /22% OFF/.test(r.texto) && /el kilo/.test(r.texto), `${forma}: el precio va encima del video`, r.texto);
          ok(r.arriba != null && r.arriba < 2, `${forma}: arriba, como se eligió`, `${r.arriba}px`);
          ok(r.alto != null && r.alto < (forma === "acostado" ? 0.6 : 0.4), `${forma}: la banda deja ver el video`, `${Math.round((r.alto ?? 1) * 100)}% del alto`);
          await q.screenshot({ path: path.join(SALIDA, `tv-video-precio-${forma}.png`) });
        }
        ok(encontrada, `${forma}: la placa con precio aparece en la pantalla de prueba`);
        await c2.close();
      }
    }

    // Modo captura: congelado en el primer cuadro del recorte.
    const indice = await t.evaluate(() => Number(document.querySelector(".cartel-marco").dataset.total));
    let quieto = null;
    for (let i = 0; i < indice && !quieto; i++) {
      await t.goto(`${BASE}/cartel/tv/${SLUG}?fijo=${i}`, { waitUntil: "load" });
      await t.waitForSelector(".cartel-marco");
      if ((await t.$eval(".cartel-marco", (m) => m.dataset.placa)) === id("1-3.5")) {
        await t.waitForTimeout(2500);
        quieto = await t.$eval(".pl-video video", (v) => ({ t: v.currentTime, pausado: v.paused }));
      }
    }
    ok(!!quieto && quieto.pausado && Math.abs(quieto.t - 1) < 0.3, "en modo captura el video queda quieto en el inicio del recorte", JSON.stringify(quieto));
    await t.screenshot({ path: path.join(SALIDA, "tv-video-captura.png") });

    // Apaisado.
    const ctxH = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    await ctxH.route(/\/rest\/v1\/rpc\/cartel_latido/, (r) => r.abort());
    const h = await ctxH.newPage();
    for (let i = 0; i < indice; i++) {
      await h.goto(`${BASE}/cartel/tv/${SLUG}?fijo=${i}`, { waitUntil: "load" });
      await h.waitForSelector(".cartel-marco");
      if ((await h.$eval(".cartel-marco", (m) => m.dataset.placa)) === id("1-3.5")) {
        await h.waitForTimeout(1500);
        const caja = await h.$eval(".pl-video video", (v) => v.getBoundingClientRect().height);
        ok(caja > 1000, "en un TV horizontal el video ocupa todo el alto", `${Math.round(caja)} px`);
        await h.screenshot({ path: path.join(SALIDA, "tv-video-apaisado.png") });
        break;
      }
    }
  }
} catch (e) {
  console.log(`FAIL  la verificación se cortó: ${e.message}`);
  fallos++;
} finally {
  // La base antes que el navegador: si la corrida se corta en el cierre de
  // Edge, no tienen que quedar placas de prueba.
  await limpiarBase();
  if (admin) {
    const { data: resto } = await admin.from("cartel_placas").select("id").like("titulo", `${MARCA}%`);
    console.log(`\nlimpieza: quedaron ${resto?.length ?? "?"} placa(s) de prueba`);
  }
}

console.log(`\n${fallos === 0 ? "OK" : "FALLÓ"}: ${fallos} fallos, ${salteados} salteados. Capturas en ${SALIDA}`);
await browser.close();
process.exit(fallos === 0 ? 0 : 1);
