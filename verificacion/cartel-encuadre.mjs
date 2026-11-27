/*
 * Verificación en navegador real del encuadre automático de los videos
 * (SPEC-cartel-encuadre-auto.md, punto 11), en el banco de pruebas (base en memoria).
 *
 * Uso:
 *   1) npm run dev              (en otra terminal)
 *   2) npm run verificar:cartel-encuadre
 *
 * Los videos de prueba se fabrican en el navegador a partir de la muestra de 360×640,
 * con Mediabunny (la misma librería que adapta los videos al subirlos):
 *   - "celular": 360×780, la forma de un celular parado (0,46) → recorta 18 % en tele parada.
 *   - "acostado": la muestra girada, 640×360 → recortaría 68 % en tele parada.
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const BASE = process.env.URL_BASE || "http://localhost:3000";
const MUESTRA = path.join(process.cwd(), "verificacion", "muestras", "video-h264.mp4");
const MEDIABUNNY = path.join(process.cwd(), "node_modules", "mediabunny", "dist", "bundles", "mediabunny.min.mjs");
const SALIDA = path.join(process.cwd(), "verificacion", "capturas", "cartel-encuadre");
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

/** Convierte la muestra en el navegador y devuelve los bytes del MP4. */
async function fabricar(page, opciones) {
  const muestra = fs.readFileSync(MUESTRA).toString("base64");
  const libreria = fs.readFileSync(MEDIABUNNY, "utf8");
  const b64 = await page.evaluate(
    async ({ muestra, libreria, opciones }) => {
      const url = URL.createObjectURL(new Blob([libreria], { type: "text/javascript" }));
      const mb = await import(url);
      const bytes = Uint8Array.from(atob(muestra), (c) => c.charCodeAt(0));
      const input = new mb.Input({ source: new mb.BlobSource(new Blob([bytes])), formats: mb.ALL_FORMATS });
      const target = new mb.BufferTarget();
      const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target });
      const conv = await mb.Conversion.init({ input, output, video: { codec: "avc", ...opciones }, audio: { discard: true } });
      if (!conv.isValid) throw new Error("conversión inválida: " + JSON.stringify(conv.discardedTracks));
      await conv.execute();
      const out = new Uint8Array(target.buffer);
      let s = "";
      for (let i = 0; i < out.length; i += 0x8000) s += String.fromCharCode(...out.subarray(i, i + 0x8000));
      return btoa(s);
    },
    { muestra, libreria, opciones },
  );
  return Buffer.from(b64, "base64");
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "cartel-encuadre-"));
const CELULAR = path.join(tmp, "celular.mp4");
const ACOSTADO = path.join(tmp, "acostado.mp4");

try {
  for (const [nombre, viewport] of [
    ["desktop", { width: 1280, height: 900 }],
    ["movil", { width: 390, height: 844 }],
  ]) {
    const ctx = await browser.newContext({ viewport });
    const a = await ctx.newPage();
    const resp = await a.goto(`${BASE}/login/preview-ofertas`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    if (resp?.status() === 404) throw new Error("el banco de pruebas solo existe en desarrollo");

    if (!fs.existsSync(CELULAR)) {
      // En una página aparte que no carga Mediabunny: en la del admin quedaría
      // cargada dos veces y Next lo marca como "Issue".
      const taller = await ctx.newPage();
      await taller.goto(`${BASE}/login`, { waitUntil: "domcontentloaded", timeout: 60_000 });
      fs.writeFileSync(CELULAR, await fabricar(taller, { width: 360, height: 780, fit: "fill" }));
      fs.writeFileSync(ACOSTADO, await fabricar(taller, { rotate: 90 }));
      await taller.close();
    }
    const avisos = [];
    a.on("console", (m) => {
      if (m.type() === "error" || m.type() === "warning") avisos.push(m.text());
    });

    const tipo = 'select:has(option[value="video"])';
    await a.waitForSelector(tipo, { timeout: 30_000 });
    const elegirVideo = async () => {
      for (let i = 0; i < 20 && !(await a.$('[data-test="subir-video"]')); i++) {
        await a.selectOption(tipo, "video");
        await a.waitForTimeout(500);
      }
      await a.waitForSelector('[data-test="subir-video"]', { state: "attached", timeout: 5_000 });
    };
    await elegirVideo();

    const encuadre = () => a.getAttribute('[data-test="video-encuadre"] [aria-pressed="true"]', "data-valor");
    const linea = async () => ((await a.$('[data-test="encuadre-sugerido"]')) ? (await a.textContent('[data-test="encuadre-sugerido"]')).trim() : null);
    const clips = (n) => a.waitForFunction((n) => document.querySelectorAll('[data-test="clip"]').length === n, n, { timeout: 30_000 });
    const previa = a.locator(".cartel-marco:visible").first();
    const ajuste = () => previa.locator(".pl-video video").evaluate((v) => getComputedStyle(v).objectFit);
    const tele = (n) => a.locator(`button:has-text("${n}")`).first();

    // 1) Video de celular parado, sección Carnicería (va a teles paradas): llenar.
    await a.fill('input[list="secciones-cartel"]', "Carnicería");
    ok((await encuadre()) === "entero", `${nombre}: sin video, el encuadre arranca en "entero"`, await encuadre());
    await a.setInputFiles('[data-test="subir-video"]', CELULAR);
    await clips(1);
    ok((await encuadre()) === "llenar", `${nombre}: un video de celular parado elige "llenar" solo`, await encuadre());
    ok((await linea()) === "Elegido solo: el video tiene casi la forma de la tele, recorta 18 %.", `${nombre}: …y explica por qué`, await linea());
    await a.waitForTimeout(800);
    ok((await ajuste()) === "cover", `${nombre}: la previa parada llena la pantalla`, await ajuste());
    await a.locator('[data-test="video-encuadre"]').scrollIntoViewIfNeeded();
    await a.screenshot({ path: path.join(SALIDA, `celular-llenar-${nombre}.png`) });
    await previa.screenshot({ path: path.join(SALIDA, `previa-parada-llena-${nombre}.png`) });

    // 2) Previa como tele acostada: llenar se comería el 74 %, se ve entero (punto 8).
    await a.click('[data-test="previa-orientacion"] [data-valor="acostado"]');
    await a.waitForTimeout(800);
    ok((await ajuste()) === "contain", `${nombre}: en tele acostada el mismo video se ve entero`, await ajuste());
    await previa.screenshot({ path: path.join(SALIDA, `previa-acostada-entera-${nombre}.png`) });
    await a.click('[data-test="previa-orientacion"] [data-valor="parado"]');

    // 3) Se suma un video acostado: manda el peor, entero.
    await a.setInputFiles('[data-test="subir-video"]', ACOSTADO);
    await clips(2);
    ok((await encuadre()) === "entero", `${nombre}: con un video acostado sumado pasa a "entero"`, await encuadre());
    ok(
      (await linea()) === "Elegido solo: la forma del video es muy distinta a la de la tele (recortaría 68 %).",
      `${nombre}: …y explica por qué`,
      await linea(),
    );

    // 4) Elegido a mano: se respeta aunque cambien teles o videos, y no se explica.
    await a.click('[data-test="video-encuadre"] [data-valor="llenar"]');
    ok((await linea()) === null, `${nombre}: elegido a mano, no aparece la línea de "elegido solo"`, String(await linea()));
    await a.locator('[data-test="clip"]').nth(1).locator('[data-test="clip-quitar"]').click();
    await clips(1);
    await tele("Acceso").click();
    ok((await encuadre()) === "llenar", `${nombre}: tocado a mano, no cambia al sacar un video ni al elegir teles`, await encuadre());
    await tele("Acceso").click();

    // 5) Guardar en "entero" a mano y volver a abrir: no se toca.
    await a.click('[data-test="video-encuadre"] [data-valor="entero"]');
    await a.fill('input[placeholder="Video de la parrilla"]', "ZZ encuadre guardado");
    await a.click('button:has-text("Crear placa")');
    const lista = a.locator('section:has(h2:has-text("Placas ("))');
    await lista.locator("text=ZZ encuadre guardado").first().waitFor({ timeout: 10_000 });
    // El botón "Editar" de la fila de esa placa.
    await lista.locator(`xpath=.//*[normalize-space(text())="ZZ encuadre guardado"]/ancestor::*[.//button[normalize-space(.)="Editar"]][1]//button[normalize-space(.)="Editar"]`).first().click();
    await a.waitForSelector('[data-test="video-encuadre"]', { timeout: 5_000 });
    ok((await encuadre()) === "entero", `${nombre}: abrir una placa guardada no le cambia el encuadre`, await encuadre());
    ok((await linea()) === null, `${nombre}: …ni muestra "elegido solo"`, String(await linea()));

    // 6) Video acostado que va solo a una tele acostada (Acceso): llenar.
    await a.click('button:has-text("Nueva")');
    await elegirVideo();
    await a.setInputFiles('[data-test="subir-video"]', ACOSTADO);
    await clips(1);
    ok((await encuadre()) === "entero", `${nombre}: video acostado sin teles elegidas (hay paradas): "entero"`, await encuadre());
    await tele("Acceso").click();
    ok((await encuadre()) === "llenar", `${nombre}: al elegir solo Acceso (acostada) pasa a "llenar"`, await encuadre());
    ok((await linea()) === "Elegido solo: el video tiene la misma forma que la tele, no recorta nada.", `${nombre}: …y explica por qué`, await linea());
    await tele("Carnicería 1").click();
    ok((await encuadre()) === "entero", `${nombre}: sumando Carnicería 1 (parada) vuelve a "entero"`, await encuadre());

    ok(avisos.length === 0, `${nombre}: sin errores ni avisos en la consola`, avisos.join(" | ").slice(0, 300) || "ninguno");
    const ancho = await a.evaluate(() => document.documentElement.scrollWidth);
    ok(ancho <= viewport.width, `${nombre}: sin scroll horizontal`, `${ancho}px`);
    await a.locator('[data-test="video-encuadre"]').scrollIntoViewIfNeeded();
    await a.screenshot({ path: path.join(SALIDA, `acostado-entero-${nombre}.png`) });
    await ctx.close();
  }
} catch (e) {
  console.log(`FAIL  la prueba se cortó: ${e.message}`);
  fallos++;
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

await browser.close();
console.log(fallos === 0 ? "\nTodo bien." : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
