/*
 * Verificación en navegador real de SPEC-cheque-a-proveedor.md sobre el banco de pruebas
 * /login/preview-proveedores (datos falsos en memoria, no toca la base).
 *
 * Uso:
 *   1) npm run dev              (en otra terminal)
 *   2) npm run verificar:cheque-a-proveedor
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

const results = [];
const check = (id, desc, ok, detail) => results.push({ id, desc, ok: !!ok, detail: detail === undefined ? "" : String(detail) });
/**
 * Abre la ficha de Italiana. En dev la fila se pinta antes de que React termine de hidratar y un
 * clic temprano se pierde sin error: se reintenta hasta que aparece la ficha.
 */
async function abrirItaliana(p) {
  for (let i = 0; i < 5; i++) {
    await p.locator('[data-test="fila-cuenta"]').filter({ hasText: "Italiana" }).first().click();
    try {
      await p.waitForSelector('[data-test="ficha-saldo"]', { timeout: 3000 });
      return;
    } catch {
      /* todavía sin hidratar: otro intento */
    }
  }
  throw new Error("No se abrió la ficha de Italiana");
}

const num = (txt) => parseFloat(String(txt).replace(/[^\d,-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const exe = NAVEGADORES.find((p) => fs.existsSync(p));
  const browser = await chromium.launch({ executablePath: exe, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errores.push(m.text()));
  const t = (sel) => page.locator(`[data-test="${sel}"]`);
  const texto = async (loc) => (await loc.innerText()).replace(/\s+/g, " ").trim();

  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-test="fila-cuenta"]');
  const egresos0 = num(await t("preview-total-egresos").innerText());
  const movs0 = num(await t("preview-cant-movs").innerText());
  check("R2", "Arranca con 3 cheques sin usar (5 cargados: uno rechazado y uno ya usado)",
    (await t("preview-cant-cheques").innerText()) === "5" && (await t("preview-cheques-libres").innerText()) === "3");

  // ---------- Desde Pagar, en la cuenta corriente (R4) ----------
  await abrirItaliana(page);
  // Entregas de Italiana: e1 $100.000 (vieja) y e2 $50.000 (nueva). Se paga la nueva.
  // Las boletas se muestran de la más nueva a la más vieja (SPEC-boletas-nuevas-arriba.md): se
  // busca la fila por comprobante y no por posición.
  await t("fila-entrega").filter({ hasText: "R-0002" }).locator('[data-test="btn-pagar"]').click();
  await page.waitForSelector('[data-test="modal-pago"]');
  check("R4a", "El modal Pagar ofrece \"Cheque ya cargado\"", (await t("modo-cheque").count()) === 1);

  // Un pago nuevo con cheque avisa que se va a crear otro cheque.
  await t("modo-nuevo").click();
  await t("pago-medio").selectOption("Cheque");
  check("R4b", "Pago nuevo con medio Cheque avisa que se crea un cheque y sugiere el ya cargado",
    (await texto(t("aviso-cheque-nuevo"))).includes("Cheque ya cargado"));

  await t("modo-cheque").click();
  const opciones = t("opcion-cheque");
  const ids = await opciones.evaluateAll((els) => els.map((e) => e.getAttribute("data-cheque-id")));
  check("R2b", "No se ofrecen el cheque rechazado (700) ni el ya usado (650)", !ids.includes("c3") && !ids.includes("c4") && ids.length === 3, ids.join(","));
  check("R3a", "Primero el cheque de \"italiana santander\" (el nombre no coincide exacto)", ids[0] === "c1", ids.join(","));
  await t("buscar-cheque").fill("300.000");
  check("R3b", "El buscador encuentra por importe con puntos", (await opciones.count()) === 1 && (await opciones.first().getAttribute("data-cheque-id")) === "c5");
  await t("buscar-cheque").fill("");
  await page.screenshot({ path: path.join(OUT, "cheque-elegir-desktop.png"), fullPage: false });

  await opciones.first().click();
  const lineas = await t("reparto-linea").allInnerTexts();
  check("R4c", "El reparto aplica primero a la entrega elegida ($50.000) y el resto a la más vieja ($70.000)",
    lineas.length === 2 && num(lineas[0].split("→")[0]) === 50000 && num(lineas[1].split("→")[0]) === 70000, lineas.join(" | "));
  check("R4d", "Avisa cuánto queda debiendo la entrega vieja", lineas[1]?.includes("queda debiendo"), lineas[1]);
  await page.screenshot({ path: path.join(OUT, "cheque-reparto-desktop.png"), fullPage: false });

  await t("pago-confirmar").click();
  await page.waitForSelector('[data-test="modal-pago"]', { state: "detached" });
  check("R4e", "Se carga UN egreso de $120.000",
    num(await t("preview-cant-movs").innerText()) === movs0 + 1 && num(await t("preview-total-egresos").innerText()) === egresos0 + 120000);
  check("R4f", "No se crea otro cheque (siguen 5) y el usado deja de estar libre (quedan 2)",
    (await t("preview-cant-cheques").innerText()) === "5" && (await t("preview-cheques-libres").innerText()) === "2");
  const estados = await t("fila-entrega").allInnerTexts();
  check("R4g", "La entrega nueva queda Pagada y la vieja Parcial",
    estados.some((e) => e.includes("R-0002") && e.includes("Pagada")) && estados.some((e) => e.includes("R-0001") && e.includes("Parcial")), estados.map((e) => e.replace(/\s+/g, " ").slice(0, 60)).join(" | "));
  await page.screenshot({ path: path.join(OUT, "cheque-ficha-despues-desktop.png"), fullPage: true });

  // ---------- Desde Control de Cheques: "Aplicar a deuda" (R5) ----------
  await t("preview-aplicar-800").click();
  await page.waitForSelector('[data-test="modal-aplicar-cheque"]');
  const prov = await t("aplicar-cheque-proveedor").inputValue();
  check("R5a", "Propone el proveedor parecido: \"SANTA RITA\" → \"SANTA RITA SOTO (MAYORISTA)\"", prov === "SANTA RITA SOTO (MAYORISTA)", prov);
  check("R5b", "Sin deuda, avisa que los $300.000 quedan a cuenta", (await texto(t("reparto-a-cuenta"))).includes("300.000"));
  await t("aplicar-cheque-proveedor").selectOption("Italiana");
  const lineas2 = await t("reparto-linea").allInnerTexts();
  check("R5c", "Cambiando a Italiana, cubre los $30.000 que faltan y el resto a cuenta",
    lineas2.length === 1 && num(lineas2[0].split("→")[0]) === 30000 && (await texto(t("reparto-a-cuenta"))).includes("270.000"), lineas2.join(" | "));
  await page.screenshot({ path: path.join(OUT, "cheque-aplicar-deuda-desktop.png"), fullPage: false });
  await t("aplicar-cheque-confirmar").click();
  await page.waitForSelector('[data-test="cheque-aplicado"]');
  check("R5d", "Confirma y avisa que quedó cargado", (await texto(t("cheque-aplicado"))).includes("N° 800"));
  check("R5e", "Tampoco crea otro cheque", (await t("preview-cant-cheques").innerText()) === "5" && (await t("preview-cheques-libres").innerText()) === "1");
  await t("aplicar-cheque-cerrar").click();

  await t("preview-aplicar-800").click();
  check("R5f", "Un cheque ya aplicado no se puede aplicar de nuevo", (await t("cheque-ya-usado").count()) === 1);
  await t("aplicar-cheque-cerrar").click();
  await t("preview-aplicar-700").click();
  check("R5g", "Un cheque rechazado tampoco", (await t("cheque-rechazado").count()) === 1);
  await t("aplicar-cheque-cerrar").click();

  // ---------- Móvil ----------
  const movil = await browser.newPage({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  movil.on("pageerror", (e) => errores.push(String(e)));
  await movil.goto(URL, { waitUntil: "domcontentloaded" });
  await movil.waitForSelector('[data-test="fila-cuenta"]');
  await abrirItaliana(movil);
  await movil.locator('[data-test="fila-entrega"]', { hasText: "R-0002" }).locator('[data-test="btn-pagar"]').click();
  await movil.locator('[data-test="modo-cheque"]').click();
  await movil.locator('[data-test="opcion-cheque"]').first().click();
  const desborde = await movil.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("M1", "El modal con el cheque elegido entra en el celular", desborde <= 1, `${desborde}px de desborde`);
  await movil.screenshot({ path: path.join(OUT, "cheque-reparto-movil.png") });
  await movil.locator('[data-test="pago-confirmar"]').click();
  await movil.locator('[data-test="preview-aplicar-800"]').click();
  await movil.waitForSelector('[data-test="modal-aplicar-cheque"]');
  const desborde2 = await movil.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("M2", "El modal \"Aplicar a deuda\" entra en el celular", desborde2 <= 1, `${desborde2}px de desborde`);
  await movil.screenshot({ path: path.join(OUT, "cheque-aplicar-deuda-movil.png") });

  check("E1", "Sin errores de JavaScript en consola", errores.length === 0, errores.join(" | ").slice(0, 300));

  browser.close().catch(() => {});
  const fallidos = results.filter((r) => !r.ok);
  console.log("\n=== Verificación: asignar un cheque ya cargado a un proveedor ===\n");
  results.forEach((r) => console.log(`${r.ok ? "OK  " : "FALLA"} ${r.id.padEnd(5)} ${r.desc}${r.detail ? `  [${r.detail}]` : ""}`));
  console.log(`\n${results.length - fallidos.length}/${results.length} checks OK`);
  console.log(`Capturas en ${OUT}\n`);
  process.exit(fallidos.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
