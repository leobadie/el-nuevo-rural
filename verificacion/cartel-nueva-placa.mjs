/*
 * Verificación en navegador real de que "Nueva" y "Editar" llevan al
 * formulario de placa. En el celular el formulario queda debajo de toda la
 * lista y, sin esto, los botones parecían no hacer nada (reportado el 19/10/2026).
 *
 * Uso:
 *   1) npm run dev              (en otra terminal)
 *   2) npm run verificar:cartel-nueva-placa
 *
 * Corre en el banco de pruebas (base en memoria): no toca la base real.
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.URL_BASE || "http://localhost:3000";
const SALIDA = path.join(process.cwd(), "verificacion", "capturas", "cartel-nueva-placa");
fs.mkdirSync(SALIDA, { recursive: true });

const NAVEGADORES = [
  process.env.NAVEGADOR,
  "C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Microsoft\Edge\Application\msedge.exe",
  "C:\Program Files\Google\Chrome\Application\chrome.exe",
].filter(Boolean);

let fallos = 0;
function ok(cond, desc, detalle = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${desc}${detalle !== "" ? `  → ${detalle}` : ""}`);
  if (!cond) fallos++;
}

const browser = await chromium.launch({ executablePath: NAVEGADORES.find((p) => fs.existsSync(p)), headless: true });

/** Dónde queda el borde de arriba del formulario respecto de la pantalla. */
const topFormulario = (page) =>
  page.$eval('[data-test="formulario-placa"]', (el) => Math.round(el.getBoundingClientRect().top));

try {
  for (const [nombre, viewport] of [
    ["movil", { width: 390, height: 844 }],
    ["desktop", { width: 1280, height: 900 }],
  ]) {
    const ctx = await browser.newContext({ viewport, hasTouch: nombre === "movil", isMobile: nombre === "movil" });
    const page = await ctx.newPage();
    await page.goto(`${BASE}/login/preview-ofertas`, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await page.waitForSelector('[data-test="nueva-placa"]', { timeout: 30_000 });
    await page.waitForTimeout(1500);

    const antes = await topFormulario(page);
    if (nombre === "movil") ok(antes > viewport.height, "movil: al abrir, el formulario está fuera de la pantalla (el problema)", `${antes}px`);

    await page.click('[data-test="nueva-placa"]');
    await page.waitForTimeout(1200);
    const despues = await topFormulario(page);
    ok(despues >= 0 && despues < viewport.height * 0.3, `${nombre}: tocar "Nueva" deja el formulario a la vista`, `${despues}px`);
    const titulo = await page.$eval('[data-test="formulario-placa"] h2', (h) => h.textContent);
    ok(titulo === "Nueva placa", `${nombre}: el formulario dice "Nueva placa"`, titulo);
    await page.screenshot({ path: path.join(SALIDA, `nueva-${nombre}.png`) });

    // Editar la última placa de la lista: también tiene que llevar al formulario.
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(400);
    const editar = page.locator("button", { hasText: /^Editar$/ }).first();
    await editar.scrollIntoViewIfNeeded();
    await editar.click();
    await page.waitForTimeout(1200);
    const trasEditar = await topFormulario(page);
    const tituloEd = await page.$eval('[data-test="formulario-placa"] h2', (h) => h.textContent);
    ok(tituloEd === "Editar placa" && trasEditar >= 0 && trasEditar < viewport.height * 0.3, `${nombre}: "Editar" también lleva al formulario`, `${tituloEd} · ${trasEditar}px`);

    // En la compu el formulario está al lado: "Nueva" no tiene que mover la página.
    if (nombre === "desktop") {
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(400);
      await page.click('[data-test="nueva-placa"]');
      await page.waitForTimeout(800);
      const y = await page.evaluate(() => window.scrollY);
      ok(y === 0, "desktop: con el formulario ya a la vista, la página no salta", `scrollY ${y}`);
    }
    await ctx.close();
  }
} finally {
  await browser.close();
}

console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} CHECK(S) FALLARON`}`);
process.exit(fallos === 0 ? 0 : 1);
