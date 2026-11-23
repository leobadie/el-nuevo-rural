/*
 * Verificación en navegador real de "Pagar con transferencia" (SPEC-transferencia-proveedor.md),
 * sobre el banco /login/preview-proveedores (datos en memoria, sin Supabase).
 *
 * Uso:
 *   1) npm run dev              (en otra terminal)
 *   2) npm run verificar:transferencia
 *
 * Datos del banco: Italiana debe R-0001 $100.000 y R-0002 $50.000 y tiene $60.000 a cuenta.
 * Las capturas quedan en verificacion/capturas/ (ignorada por git).
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
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);

const results = [];
function check(id, desc, ok, detail) {
  results.push({ id, desc, ok: !!ok, detail: detail === undefined ? "" : String(detail) });
  if (process.env.VERBOSE) console.log((ok ? "  OK   " : "  FALLA ") + id);
}
const num = (txt) => parseFloat(String(txt).replace(/[^\d,-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
const desborde = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const texto = async (p, sel) => (await p.locator(sel).first().innerText()).trim();

async function abrirItaliana(p) {
  await p.goto(URL, { waitUntil: "domcontentloaded" });
  await p.waitForSelector('[data-test="fila-cuenta"]');
  await p.locator('[data-test="fila-cuenta"]', { hasText: "Italiana" }).click();
  await p.waitForSelector('[data-test="ficha-saldo"]');
}

async function cargarEntrega(p, monto, comprobante) {
  await p.locator('[data-test="abrir-nueva-entrega"]').click();
  await p.locator('[data-test="entrega-monto"]').fill(String(monto));
  await p.locator('[data-test="entrega-comprobante"]').fill(comprobante);
  await p.locator('[data-test="guardar-entrega"]').click();
  await p.waitForSelector('[data-test="guardar-entrega"]', { state: "detached" });
}

function filaEntrega(p, comp) {
  return p.locator('[data-test="fila-entrega"]', { hasText: comp });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const exe = NAVEGADORES.find((p) => fs.existsSync(p));
  if (!exe) {
    console.error("No encontré Edge ni Chrome. Pasá la ruta en NAVEGADOR=...");
    process.exit(2);
  }
  const browser = await chromium.launch({ executablePath: exe, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errores.push(m.text());
  });

  await abrirItaliana(page);
  const movsAntes = Number(await texto(page, '[data-test="preview-cant-movs"]'));
  const egresosAntes = Number(await texto(page, '[data-test="preview-total-egresos"]'));

  // ---------- 1, 7: botón, modal y aviso de saldo a cuenta ----------
  await page.locator('[data-test="abrir-transferencia"]').click();
  await page.waitForSelector('[data-test="modal-transferencia"]');
  check("1", "El botón abre el modal de Pagar con transferencia", true);
  check("7", "Avisa que el proveedor ya tiene $60.000 a cuenta",
    (await texto(page, '[data-test="aviso-transferencia-acuenta"]')).includes("60.000"));
  check("3", "Lista las dos boletas pendientes con lo que deben",
    (await page.locator('[data-test="transf-boleta"]').count()) === 2);

  // ---------- 2: validación ----------
  await page.locator('[data-test="transf-confirmar"]').click();
  check("2", "Sin importe no registra y avisa", (await texto(page, '[data-test="transf-error"]')).includes("importe"));
  check("2b", "Y no creó ningún egreso", Number(await texto(page, '[data-test="preview-cant-movs"]')) === movsAntes);

  // ---------- 4, 5: sin marcar, cubre las dos y sobra ----------
  await page.locator('[data-test="transf-monto"]').fill("170000");
  check("2c", "Al escribir el importe se va el aviso de error", (await page.locator('[data-test="transf-error"]').count()) === 0);
  const textoModal = (await texto(page, '[data-test="modal-transferencia"]')).replace(/\s+/g, " ");
  check("7b", "Los textos no se pegan ('$60.000 a cuenta', 'un egreso en')",
    textoModal.includes("$60.000 a cuenta") && textoModal.includes("un egreso en Movimientos"), textoModal.slice(0, 120));
  const lineas = await page.locator('[data-test="transf-linea"]').allInnerTexts();
  check("4a", "Sin marcar: $100.000 a R-0001 y $50.000 a R-0002, las dos quedan pagadas",
    lineas.length === 2 && lineas[0].includes("R-0001") && num(lineas[0].split("→")[0]) === 100000 && lineas[1].includes("R-0002") && lineas.every((l) => l.includes("queda pagada")),
    lineas.join(" | "));
  check("5a", "Muestra que sobran $20.000 a cuenta", (await texto(page, '[data-test="transf-a-cuenta"]')).includes("20.000"));
  await page.screenshot({ path: path.join(OUT, "transferencia-modal-desktop.png"), fullPage: true });
  await page.locator('[data-test="transf-confirmar"]').click();
  await page.waitForSelector('[data-test="modal-transferencia"]', { state: "detached" });

  // ---------- 6: un solo egreso ----------
  check("6a", "Creó exactamente un egreso",
    Number(await texto(page, '[data-test="preview-cant-movs"]')) === movsAntes + 1);
  check("6b", "El total de egresos subió exactamente $170.000",
    Number(await texto(page, '[data-test="preview-total-egresos"]')) === egresosAntes + 170000);
  const ultimo = await texto(page, '[data-test="preview-ultimo-mov"]');
  check("6c", "Con medio Transferencia y la descripción con las boletas",
    ultimo.startsWith("Transferencia 170000") && ultimo.includes("Pago a Italiana — transferencia — R-0001, R-0002"), ultimo);
  check("4b", "Las dos boletas quedan Pagadas",
    (await filaEntrega(page, "R-0001").innerText()).includes("Pagada") && (await filaEntrega(page, "R-0002").innerText()).includes("Pagada"));
  check("4c", "A cuenta: los $60.000 de antes más los $20.000 que sobraron",
    num(await texto(page, '[data-test="ficha-acuenta"]')) === 80000, await texto(page, '[data-test="ficha-acuenta"]'));

  // ---------- 4: con una boleta marcada ----------
  await cargarEntrega(page, 30000, "R-0003");
  await cargarEntrega(page, 40000, "R-0004");
  await page.locator('[data-test="abrir-transferencia"]').click();
  await page.waitForSelector('[data-test="modal-transferencia"]');
  await page.locator('[data-test="transf-boleta"]', { hasText: "R-0004" }).locator("input").check();
  check("5b", "Muestra el total de lo marcado ($40.000)", (await texto(page, '[data-test="transf-marcado"]')).includes("40.000"));
  await page.locator('[data-test="transf-monto"]').fill("35000");
  await page.locator('[data-test="transf-operacion"]').fill("998877");
  const lineas2 = await page.locator('[data-test="transf-linea"]').allInnerTexts();
  check("4d", "Marcada R-0004: los $35.000 van sólo ahí y queda debiendo $5.000",
    lineas2.length === 1 && lineas2[0].includes("R-0004") && lineas2[0].includes("5.000"), lineas2.join(" | "));
  await page.locator('[data-test="transf-confirmar"]').click();
  await page.waitForSelector('[data-test="modal-transferencia"]', { state: "detached" });
  check("4e", "R-0004 queda Parcial debiendo $5.000",
    num(await filaEntrega(page, "R-0004").locator('[data-test="entrega-saldo"]').innerText()) === 5000 && (await filaEntrega(page, "R-0004").innerText()).includes("Parcial"));
  check("4f", "R-0003 (no marcada) sigue Impaga", (await filaEntrega(page, "R-0003").innerText()).includes("Impaga"));
  const ultimo2 = await texto(page, '[data-test="preview-ultimo-mov"]');
  check("6d", "La descripción lleva el N° de operación", ultimo2.includes("transferencia N° 998877 — R-0004"), ultimo2);
  await page.screenshot({ path: path.join(OUT, "transferencia-ficha-desktop.png"), fullPage: true });

  // ---------- 9: el Pagar de cada boleta sigue igual ----------
  await filaEntrega(page, "R-0003").locator('[data-test="btn-pagar"]').click();
  await page.waitForSelector('[data-test="modal-pago"]');
  check("9", "El botón Pagar de una boleta sigue abriendo su modal de siempre", (await page.locator('[data-test="modo-nuevo"]').count()) === 1);
  await page.locator('[data-test="modal-pago"] button', { hasText: "Cancelar" }).click();

  // ---------- 11: celular ----------
  const mobile = await ctx.newPage();
  mobile.on("pageerror", (e) => errores.push(String(e)));
  await mobile.setViewportSize({ width: 390, height: 844 });
  await abrirItaliana(mobile);
  check("11a", "La ficha con el botón nuevo no desborda en celular", (await desborde(mobile)) <= 1, `${await desborde(mobile)}px`);
  await mobile.locator('[data-test="abrir-transferencia"]').click();
  await mobile.waitForSelector('[data-test="modal-transferencia"]');
  await mobile.locator('[data-test="transf-monto"]').fill("120000");
  await mobile.locator('[data-test="transf-boleta"]').first().locator("input").check();
  check("11b", "El modal no desborda en celular", (await desborde(mobile)) <= 1, `${await desborde(mobile)}px`);
  await mobile.screenshot({ path: path.join(OUT, "transferencia-modal-movil.png") });

  check("12", "Sin errores de JavaScript en consola", errores.length === 0, errores.join(" | ").slice(0, 300));

  browser.close().catch(() => {});
  const fallidos = results.filter((r) => !r.ok);
  console.log("\n=== Verificación de Pagar con transferencia ===\n");
  results.forEach((r) => console.log(`${r.ok ? "OK  " : "FALLA"} ${r.id.padEnd(5)} ${r.desc}${r.detail ? `  [${r.detail}]` : ""}`));
  console.log(`\n${results.length - fallidos.length}/${results.length} checks OK`);
  console.log(`Capturas en ${OUT}\n`);
  process.exit(fallidos.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
