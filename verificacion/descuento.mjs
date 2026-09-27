/*
 * Verificación en navegador real del descuento por boleta de proveedores
 * (SPEC-descuento-proveedores.md, punto 9), sobre el banco /login/preview-proveedores.
 *
 * Uso:
 *   1) npm run dev              (en otra terminal)
 *   2) npm run verificar:descuento
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const URL_BASE = process.env.URL_BASE || "http://localhost:3000";
const URL = `${URL_BASE}/login/preview-proveedores`;
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "capturas");
const NAVEGADORES = [
  process.env.NAVEGADOR,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);
const SANTA_RITA = "SANTA RITA SOTO (MAYORISTA)";

const results = [];
const check = (id, desc, ok, detail) => results.push({ id, desc, ok: !!ok, detail: detail === undefined ? "" : String(detail) });
const num = (txt) => parseFloat(String(txt).replace(/[^\d,-]/g, "").replace(",", ".")) || 0;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: NAVEGADORES.find((p) => fs.existsSync(p)), headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errores.push(m.text()));

  const t = (sel, p = page) => p.locator(`[data-test="${sel}"]`);
  const texto = async (loc) => (await loc.innerText()).replace(/\s+/g, " ").trim();
  const pausa = (ms = 250, p = page) => p.waitForTimeout(ms);
  const captura = (p, nombre) => p.screenshot({ path: path.join(OUT, nombre), fullPage: true, caret: "initial" });

  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-test="fila-cuenta"]');
  await pausa(600);

  // ---------- Configurar el 5% desde el formulario (Santa Rita no tiene entregas todavía) ----------
  await t("abrir-nueva-entrega").click();
  await t("entrega-proveedor").selectOption(SANTA_RITA);
  await pausa();
  check("R1a", "Un proveedor sin descuento lo dice y no muestra la casilla",
    (await texto(t("descuento-proveedor-texto"))).includes("Sin descuento") && (await t("entrega-aplicar-descuento").count()) === 0);
  await t("btn-descuento-proveedor").click();
  await t("descuento-proveedor-input").fill("150");
  await t("descuento-proveedor-guardar").click();
  await pausa();
  check("R7a", "Un % fuera de rango no se guarda", (await t("descuento-proveedor-error").count()) === 1);
  await t("descuento-proveedor-input").fill("5");
  await t("descuento-proveedor-guardar").click();
  await pausa();
  check("R1b", "Se configura el 5% desde el formulario de carga (sin tener que tener entregas)", (await texto(t("descuento-proveedor-texto"))).includes("5%"));

  // ---------- Boleta con descuento ----------
  check("R2", "Aparece la casilla «Aplicar 5% de descuento», destildada",
    (await t("entrega-aplicar-descuento").count()) === 1 && !(await t("entrega-aplicar-descuento").isChecked()) && (await texto(page.locator("label", { has: t("entrega-aplicar-descuento") }))).includes("Aplicar 5% de descuento"));
  await t("entrega-monto").fill("100000");
  await t("entrega-comprobante").fill("A-0001");
  check("R3a", "El campo se llama «Importe de la boleta»", (await texto(page.locator("label", { has: t("entrega-monto") }))).startsWith("Importe de la boleta"));
  await t("entrega-aplicar-descuento").check();
  await pausa();
  const vista = await texto(t("entrega-vista-descuento"));
  check("R3b", "Antes de guardar muestra la cuenta: boleta − 5% = debés $ 95.000", vista.includes("100.000") && vista.includes("5%") && vista.includes("95.000"), vista);
  await captura(page, "descuento-formulario-desktop.png");
  await t("guardar-entrega").click();
  await pausa(400);
  const fila = page.locator('[data-test="fila-cuenta"]', { hasText: "SANTA RITA" });
  check("R4a", "El proveedor queda debiendo $ 95.000, no $ 100.000", num(await texto(fila.locator('[data-test="cuenta-saldo"]'))) === 95000, await texto(fila.locator('[data-test="cuenta-saldo"]')));

  // ---------- En la ficha ----------
  await fila.click();
  await page.waitForSelector('[data-test="fila-entrega"]');
  const monto1 = await texto(t("entrega-monto-fila").first());
  check("R5", "La entrega muestra lo que se debe y, abajo, la boleta y el %", monto1.includes("95.000") && monto1.includes("boleta") && monto1.includes("100.000") && monto1.includes("−5%"), monto1);
  check("R1c", "La ficha del proveedor también muestra el descuento configurado", (await texto(t("descuento-proveedor-texto"))).includes("5%"));

  // Una boleta sin la casilla: no se descuenta.
  await t("abrir-nueva-entrega").click();
  await t("entrega-monto").fill("50000");
  await t("entrega-comprobante").fill("A-0002");
  await t("guardar-entrega").click();
  await pausa(400);
  check("R2b", "Sin tildar la casilla, la boleta entra entera (95.000 + 50.000 = 145.000)", num(await texto(t("ficha-saldo"))) === 145000, await texto(t("ficha-saldo")));

  // Pagar la boleta con descuento: con $ 95.000 queda saldada.
  const filaDesc = page.locator('[data-test="fila-entrega"]', { hasText: "A-0001" });
  await filaDesc.locator('[data-test="btn-pagar"]').click();
  await page.waitForSelector('[data-test="modal-pago"]');
  await t("pago-monto").fill("95000");
  await t("pago-confirmar").click();
  await pausa(400);
  check("R4b", "Pagar $ 95.000 salda la boleta de $ 100.000 con 5%", num(await texto(filaDesc.locator('[data-test="entrega-saldo"]'))) === 0 && num(await texto(t("ficha-saldo"))) === 50000,
    `${await texto(filaDesc.locator('[data-test="entrega-saldo"]'))} / ficha ${await texto(t("ficha-saldo"))}`);
  await captura(page, "descuento-ficha-desktop.png");

  // Quitar el descuento del proveedor: las boletas nuevas ya no muestran la casilla.
  await t("btn-descuento-proveedor").click();
  await t("descuento-proveedor-quitar").click();
  await pausa();
  await t("abrir-nueva-entrega").click();
  check("R1d", "Quitando el descuento, desaparece la casilla (lo ya cargado no cambia)",
    (await t("entrega-aplicar-descuento").count()) === 0 && (await texto(t("entrega-monto-fila").first())).includes("boleta"));

  // ---------- Celular ----------
  const movil = await ctx.newPage();
  movil.on("pageerror", (e) => errores.push(String(e)));
  await movil.setViewportSize({ width: 390, height: 844 });
  await movil.goto(URL, { waitUntil: "domcontentloaded" });
  await movil.waitForSelector('[data-test="fila-cuenta"]');
  await pausa(600, movil);
  await t("abrir-nueva-entrega", movil).click();
  await t("entrega-proveedor", movil).selectOption(SANTA_RITA);
  await t("btn-descuento-proveedor", movil).click();
  await t("descuento-proveedor-input", movil).fill("5");
  await t("descuento-proveedor-guardar", movil).click();
  await t("entrega-monto", movil).fill("100000");
  await t("entrega-aplicar-descuento", movil).check();
  await pausa(300, movil);
  const desborde = await movil.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("R9", "En el celular el formulario con el descuento no se desborda", desborde <= 1, `${desborde}px`);
  await captura(movil, "descuento-formulario-movil.png");

  check("R16", "Sin errores de JavaScript en consola", errores.length === 0, errores.join(" | ").slice(0, 400));

  browser.close().catch(() => {});
  const fallidos = results.filter((r) => !r.ok);
  console.log("\n=== Verificación del descuento por boleta ===\n");
  results.forEach((r) => console.log(`${r.ok ? "OK  " : "FALLA"} ${r.id.padEnd(5)} ${r.desc}${r.detail ? `  [${r.detail}]` : ""}`));
  console.log(`\n${results.length - fallidos.length}/${results.length} checks OK\n`);
  process.exit(fallidos.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
