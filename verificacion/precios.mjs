/*
 * Verificación en navegador real de la calculadora de precios (SPEC-precios.md, punto 9), sobre
 * el banco /login/preview-precios.
 *
 * Uso:
 *   1) npm run dev              (en otra terminal)
 *   2) npm run verificar:precios
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const URL_BASE = process.env.URL_BASE || "http://localhost:3000";
const URL = `${URL_BASE}/login/preview-precios`;
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "capturas");
const NAVEGADORES = [
  process.env.NAVEGADOR,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);

const results = [];
const check = (id, desc, ok, detail) => results.push({ id, desc, ok: !!ok, detail: detail === undefined ? "" : String(detail) });

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: NAVEGADORES.find((p) => fs.existsSync(p)), headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errores.push(m.text()));

  const t = (sel, p = page) => p.locator(`[data-test="${sel}"]`);
  const texto = async (sel, p = page) => (await t(sel, p).innerText()).replace(/\s+/g, " ").trim();
  const pausa = (ms = 150, p = page) => p.waitForTimeout(ms);
  const captura = (p, nombre) => p.screenshot({ path: path.join(OUT, nombre), fullPage: true, caret: "initial" });

  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-test="costo"]');
  await pausa(600);

  check("R6a", "Sin costo no muestra números: pide el costo", (await texto("falta")).includes("costo"), await texto("falta"));

  // ---------- De costo a precio ----------
  await t("costo").fill("1000");
  await pausa();
  check("R3a", "$ 1.000 neto, 21%, 40%, a $10: góndola $ 2.020", (await texto("precio-gondola")) === "$ 2.020", await texto("precio-gondola"));
  check("R3b", "…dice el precio exacto antes de redondear ($ 2.016,67)", (await texto("precio-exacto")).includes("2.016,67"), await texto("precio-exacto"));
  check("R3c", "…y el margen real con el redondeo (40,1%)", (await texto("margen-real")) === "40,1%", await texto("margen-real"));
  check("R3d", "…el recargo sobre el costo", (await texto("recargo")).startsWith("66,9"), await texto("recargo"));
  await captura(page, "precios-desktop.png");

  await t("redondeo-0").click();
  await pausa();
  check("R4a", "Sin redondear: $ 2.016,67 y 40% justo", (await texto("precio-gondola")) === "$ 2.016,67" && (await texto("margen-real")) === "40%", `${await texto("precio-gondola")} ${await texto("margen-real")}`);
  check("R3e", "Ganancia neta $ 666,67", (await texto("ganancia")) === "$ 666,67", await texto("ganancia"));

  await t("iva-10.5").click();
  await pausa();
  check("R2a", "Carne al 10,5%: $ 1.841,67", (await texto("precio-gondola")) === "$ 1.841,67", await texto("precio-gondola"));
  const botonCarne = await texto("iva-10.5");
  check("R2b", "El botón del 10,5% dice carnes y despojos (bovinos, ovinos, porcinos, aves)", botonCarne.includes("despojos") && botonCarne.includes("ovinos"), botonCarne);

  await t("iva-21").click();
  await t("margen-30").click();
  await pausa();
  check("R2c", "Atajo de 30%: $ 1.000 / 0,70 × 1,21 = $ 1.728,57", (await texto("precio-gondola")) === "$ 1.728,57", await texto("precio-gondola"));

  await t("margen-40").click();
  await t("costo").fill("1210");
  await t("incluye-iva").check();
  await pausa();
  check("R2d", "Cargar $ 1.210 con IVA da lo mismo que $ 1.000 neto", (await texto("precio-gondola")) === "$ 2.016,67", await texto("precio-gondola"));
  await t("incluye-iva").uncheck();
  await t("costo").fill("1.000");
  await t("otros").fill("30");
  await pausa();
  check("R2e", "Una percepción de $ 30 que no se recupera sube el precio ($ 1.030 / 0,6 × 1,21)", (await texto("precio-gondola")) === "$ 2.077,17", await texto("precio-gondola"));
  await t("otros").fill("");

  await t("margen").fill("100");
  await pausa();
  check("R6b", "Margen de 100%: explica que no se puede", (await texto("falta")).includes("menos de 100%"), await texto("falta"));
  await t("margen").fill("40");

  // ---------- De precio a margen ----------
  await t("modo-margen").click();
  await pausa();
  check("R5a", "Sin precio de góndola lo pide", (await texto("falta")).includes("precio de góndola"));
  await t("gondola").fill("1.400");
  await pausa();
  check("R5b", "Sumarle 40% al costo con IVA ($ 1.400) deja sólo 13,6%", (await texto("margen-resultado")) === "13,6%", await texto("margen-resultado"));
  await t("gondola").fill("1100");
  await pausa();
  check("R5c", "Un precio que no cubre el costo lo avisa", (await t("aviso-perdida").count()) === 1 && (await texto("margen-resultado")).startsWith("-"), await texto("margen-resultado"));
  await t("gondola").fill("2020");
  await pausa();
  check("R5d", "$ 2.020 deja 40,1%", (await texto("margen-resultado")) === "40,1%", await texto("margen-resultado"));

  // ---------- Celular ----------
  const movil = await ctx.newPage();
  movil.on("pageerror", (e) => errores.push(String(e)));
  await movil.setViewportSize({ width: 390, height: 844 });
  await movil.goto(URL, { waitUntil: "domcontentloaded" });
  await movil.waitForSelector('[data-test="costo"]');
  await pausa(600, movil);
  await t("costo", movil).fill("8990");
  await t("iva-10.5", movil).click();
  await pausa(200, movil);
  const desborde = await movil.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("R7a", "En el celular no se desborda", desborde <= 1, `${desborde}px`);
  check("R7b", "Los campos piden el teclado numérico", (await t("costo", movil).getAttribute("inputmode")) === "decimal");
  await captura(movil, "precios-movil.png");

  check("R16", "Sin errores de JavaScript en consola", errores.length === 0, errores.join(" | ").slice(0, 400));

  browser.close().catch(() => {});
  const fallidos = results.filter((r) => !r.ok);
  console.log("\n=== Verificación de la calculadora de precios ===\n");
  results.forEach((r) => console.log(`${r.ok ? "OK  " : "FALLA"} ${r.id.padEnd(5)} ${r.desc}${r.detail ? `  [${r.detail}]` : ""}`));
  console.log(`\n${results.length - fallidos.length}/${results.length} checks OK\n`);
  process.exit(fallidos.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
