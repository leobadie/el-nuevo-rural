/*
 * Verificación en navegador real de las notas de crédito de proveedores (SPEC-notas-credito.md),
 * sobre el banco /login/preview-proveedores (datos en memoria, sin Supabase). Usa el Edge o
 * Chrome ya instalado en Windows.
 *
 * Uso:
 *   1) npm run dev              (en otra terminal)
 *   2) npm run verificar:notas-credito
 *
 * Datos del banco al arrancar: Italiana debe R-0001 $100.000 y R-0002 $50.000 y tiene un pago de
 * $60.000 sin aplicar; Katy debe $12.000 de una boleta de $20.000.
 *
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

async function texto(page, sel) {
  return (await page.locator(sel).first().innerText()).trim();
}

/** Abre el formulario de NC y lo llena. `boleta` es un texto del <option> (p. ej. "R-0001"), o null. */
async function cargarNota(page, { proveedor, monto, comprobante, detalle, boleta }) {
  await page.locator('[data-test="abrir-nueva-nota"]').click();
  await page.waitForSelector('[data-test="form-nota"]');
  if (proveedor) await page.locator('[data-test="nota-proveedor"]').selectOption({ label: proveedor });
  await page.locator('[data-test="nota-monto"]').fill(String(monto));
  if (comprobante) await page.locator('[data-test="nota-comprobante"]').fill(comprobante);
  if (detalle) await page.locator('[data-test="nota-detalle"]').fill(detalle);
  if (boleta) {
    const opciones = await page.locator('[data-test="nota-boleta"] option').allInnerTexts();
    const label = opciones.find((o) => o.includes(boleta));
    await page.locator('[data-test="nota-boleta"]').selectOption({ label });
  }
}

async function filaCuenta(page, nombre) {
  return page.locator('[data-test="fila-cuenta"]', { hasText: nombre });
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

  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-test="fila-cuenta"]');

  const movsAntes = await texto(page, '[data-test="preview-cant-movs"]');
  const egresosAntes = await texto(page, '[data-test="preview-total-egresos"]');

  // ---------- 12-14: cargar desde la lista, aplicada a una boleta ----------
  await cargarNota(page, { proveedor: "Katy (verdulería)", monto: 5000, comprobante: "NC-0001", detalle: "Verdura podrida", boleta: "debe" });
  const vista1 = await texto(page, '[data-test="nota-vista"]');
  check("14a", "Antes de guardar dice cuánto se aplica a la boleta y que no toca la caja",
    vista1.includes("5.000") && vista1.includes("queda debiendo") && vista1.includes("No se crea ningún egreso"), vista1);
  await page.screenshot({ path: path.join(OUT, "notas-form-desktop.png"), fullPage: true });
  await page.locator('[data-test="guardar-nota"]').click();
  await page.waitForSelector('[data-test="form-nota"]', { state: "detached" });

  let katy = await filaCuenta(page, "Katy");
  check("8a", "Katy: $20.000 − $8.000 pagados − $5.000 de NC = $7.000",
    num(await katy.locator('[data-test="cuenta-saldo"]').innerText()) === 7000, await katy.locator('[data-test="cuenta-saldo"]').innerText());
  check("16", "La lista muestra la columna de notas de crédito",
    num(await katy.locator('[data-test="cuenta-notas"]').innerText()) === 5000, await katy.locator('[data-test="cuenta-notas"]').innerText());

  // ---------- 15: NC mayor que el saldo de la boleta ----------
  await cargarNota(page, { proveedor: "Katy (verdulería)", monto: 10000, comprobante: "NC-0002", boleta: "debe" });
  const vista2 = await texto(page, '[data-test="nota-vista"]');
  check("15a", "NC mayor que la boleta: se aplica el saldo ($7.000) y quedan $3.000 a favor",
    vista2.includes("7.000") && vista2.includes("3.000") && vista2.includes("a favor"), vista2);
  await page.locator('[data-test="guardar-nota"]').click();
  await page.waitForSelector('[data-test="form-nota"]', { state: "detached" });
  katy = await filaCuenta(page, "Katy");
  const katyTxt = (await katy.innerText()).replace(/\s+/g, " ");
  check("15b", "Katy queda con $3.000 a favor (saldo −$3.000, a cuenta $3.000)",
    num(await katy.locator('[data-test="cuenta-saldo"]').innerText()) === -3000 && katyTxt.includes("3.000"), katyTxt);

  // ---------- 13: validación ----------
  await page.locator('[data-test="abrir-nueva-nota"]').click();
  await page.locator('[data-test="nota-proveedor"]').selectOption({ label: "Italiana" });
  await page.locator('[data-test="guardar-nota"]').click();
  check("15c", "Sin importe no guarda y avisa",
    (await page.locator('[data-test="nota-error"]').innerText()).includes("mayor a cero"));
  await page.locator('[data-test="nota-monto"]').fill("-50");
  await page.locator('[data-test="guardar-nota"]').click();
  check("15d", "Con importe negativo tampoco",
    (await page.locator('[data-test="nota-error"]').innerText()).includes("mayor a cero"));
  await page.locator('[data-test="form-nota"] button').first().click(); // la X

  // ---------- 17: ficha de Italiana, NC a favor ----------
  await (await filaCuenta(page, "Italiana")).click();
  await page.waitForSelector('[data-test="ficha-saldo"]');
  await cargarNota(page, { monto: 25000, comprobante: "NC-0100", detalle: "Devolución fiambre" });
  const vista3 = await texto(page, '[data-test="nota-vista"]');
  check("14b", "Sin boleta elegida queda todo a favor", vista3.includes("25.000") && vista3.includes("a favor"), vista3);
  await page.locator('[data-test="guardar-nota"]').click();
  await page.waitForSelector('[data-test="form-nota"]', { state: "detached" });

  check("17a", "Tarjeta NOTAS DE CRÉDITO con $25.000", num(await texto(page, '[data-test="ficha-notas"]')) === 25000);
  check("8b", "Saldo de Italiana: $150.000 − $60.000 − $25.000 = $65.000", num(await texto(page, '[data-test="ficha-saldo"]')) === 65000,
    await texto(page, '[data-test="ficha-saldo"]'));
  check("10", "A cuenta suma el pago y la NC sin aplicar ($85.000)", num(await texto(page, '[data-test="ficha-acuenta"]')) === 85000,
    await texto(page, '[data-test="ficha-acuenta"]'));
  check("17b", "La NC aparece en la tabla con $25.000 sin aplicar",
    num(await texto(page, '[data-test="nota-disponible"]')) === 25000);
  const franja = await texto(page, '[data-test="aviso-acuenta"]');
  check("20a", "La franja de saldo a cuenta menciona las notas de crédito", franja.includes("notas de crédito"), franja.replace(/\s+/g, " "));

  // ---------- 21: aviso en el modal de Pagar ----------
  await page.locator('[data-test="fila-entrega"]', { hasText: "R-0001" }).locator('[data-test="btn-pagar"]').click();
  await page.waitForSelector('[data-test="modal-pago"]');
  check("21", "El modal de Pagar avisa que hay NC sin aplicar",
    (await page.locator('[data-test="aviso-notas-pagar"]').count()) === 1 && (await texto(page, '[data-test="aviso-notas-pagar"]')).includes("25.000"));
  await page.locator('[data-test="modal-pago"] button', { hasText: "Cancelar" }).click();

  // ---------- 17: Aplicar automático, deshacer ----------
  await page.locator('[data-test="btn-nota-auto"]').click();
  await page.waitForSelector('[data-test="entrega-acreditado"]');
  // Nuevas arriba (SPEC-boletas-nuevas-arriba.md): R-0001, la más vieja, es la última fila.
  const filasEnt = page.locator('[data-test="fila-entrega"]');
  check("18o", "La boleta más vieja (R-0001) es la última fila", (await filasEnt.last().innerText()).includes("R-0001"));
  check("18", "La boleta más vieja (R-0001) muestra la NC aplicada debajo de lo pagado",
    (await filasEnt.last().innerText()).includes("R-0001") && num(await filasEnt.last().locator('[data-test="entrega-acreditado"]').innerText()) === 25000);
  check("9", "R-0001 queda Parcial con saldo $75.000",
    num(await filasEnt.last().locator('[data-test="entrega-saldo"]').innerText()) === 75000 && (await filasEnt.last().innerText()).includes("Parcial"));
  check("19a", "La aplicación figura en la lista y se puede deshacer", (await page.locator('[data-test="fila-aplicacion-nota"]').count()) === 1);
  check("8c", "Aplicar no cambia el saldo del proveedor ($65.000)", num(await texto(page, '[data-test="ficha-saldo"]')) === 65000);
  await page.screenshot({ path: path.join(OUT, "notas-ficha-aplicada-desktop.png"), fullPage: true });

  await page.locator('[data-test="btn-desaplicar-nota"]').click();
  await page.waitForSelector('[data-test="fila-aplicacion-nota"]', { state: "detached" });
  check("19b", "Deshacer vuelve la NC a quedar a favor", num(await texto(page, '[data-test="nota-disponible"]')) === 25000);

  // ---------- 17: Elegir boleta y monto ----------
  await page.locator('[data-test="btn-nota-elegir"]').click();
  const opcionesElegir = await page.locator('[data-test="aplicar-entrega"] option').allInnerTexts();
  await page.locator('[data-test="aplicar-entrega"]').selectOption({ label: opcionesElegir.find((o) => o.includes("R-0002")) });
  await page.locator('[data-test="aplicar-monto"]').fill("30000");
  await page.locator('[data-test="aplicar-confirmar"]').click();
  check("17c", "No deja aplicar más de lo que queda en la NC",
    (await page.locator('[data-test="aplicar-error"]').innerText()).includes("25.000"), await page.locator('[data-test="aplicar-error"]').innerText());
  await page.locator('[data-test="aplicar-monto"]').fill("10000");
  await page.locator('[data-test="aplicar-confirmar"]').click();
  await page.waitForSelector('[data-test="aplicar-confirmar"]', { state: "detached" });
  const r2 = page.locator('[data-test="fila-entrega"]', { hasText: "R-0002" });
  check("17d", "Elegir: $10.000 a R-0002, que queda debiendo $40.000",
    num(await r2.locator('[data-test="entrega-saldo"]').innerText()) === 40000);

  // ---------- 20: repartir pago y NC juntos ----------
  await page.locator('[data-test="btn-aplicar-todo"]').click();
  await page.waitForSelector('[data-test="aviso-acuenta"]', { state: "detached" });
  const saldosEnt = (await page.locator('[data-test="entrega-saldo"]').allInnerTexts()).map(num).reverse(); // nuevas arriba: se da vuelta para leer R-0001, R-0002
  check("20b", "Reparte el pago ($60.000) y lo que queda de la NC ($15.000) sin pasarse",
    saldosEnt.join() === "25000,40000", saldosEnt.join(" / "));
  check("7a", "Cierra: Σ saldos de boletas = saldo del proveedor y no queda nada a cuenta",
    saldosEnt.reduce((a, b) => a + b, 0) === num(await texto(page, '[data-test="ficha-saldo"]')) && num(await texto(page, '[data-test="ficha-acuenta"]')) === 0);

  // ---------- 7: nada de esto tocó Movimientos ----------
  check("7b", "El total de egresos de Movimientos no cambió",
    (await texto(page, '[data-test="preview-total-egresos"]')) === egresosAntes && (await texto(page, '[data-test="preview-cant-movs"]')) === movsAntes,
    `${egresosAntes} → ${await texto(page, '[data-test="preview-total-egresos"]')}`);
  check("7c", "Se cargaron 3 notas de crédito", (await texto(page, '[data-test="preview-cant-notas"]')) === "3");

  // ---------- 17: borrar (admin) ----------
  await page.locator('[data-test="btn-borrar-nota"]').click();
  await page.waitForSelector('[data-test="fila-nota"]', { state: "detached" });
  check("17e", "Borrar la NC saca sus aplicaciones y la deuda vuelve a $90.000",
    num(await texto(page, '[data-test="ficha-saldo"]')) === 90000 && (await page.locator('[data-test="fila-aplicacion-nota"]').count()) === 0,
    await texto(page, '[data-test="ficha-saldo"]'));

  // ---------- 23: móvil ----------
  const mobile = await ctx.newPage();
  mobile.on("pageerror", (e) => errores.push(String(e)));
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(URL, { waitUntil: "domcontentloaded" });
  await mobile.waitForSelector('[data-test="fila-cuenta"]');
  await cargarNota(mobile, { proveedor: "Italiana", monto: 12000, comprobante: "NC-0200", boleta: "R-0001" });
  check("23a", "El formulario de NC no desborda en móvil", (await desborde(mobile)) <= 1, `${await desborde(mobile)}px`);
  await mobile.screenshot({ path: path.join(OUT, "notas-form-movil.png"), fullPage: true });
  await mobile.locator('[data-test="guardar-nota"]').click();
  await mobile.waitForSelector('[data-test="form-nota"]', { state: "detached" });
  check("23b", "La lista con la columna nueva no desborda en móvil", (await desborde(mobile)) <= 1, `${await desborde(mobile)}px`);
  await mobile.screenshot({ path: path.join(OUT, "notas-lista-movil.png"), fullPage: true });
  await (await filaCuenta(mobile, "Italiana")).click();
  await mobile.waitForSelector('[data-test="fila-nota"]');
  check("23c", "La ficha con la tabla de notas no desborda en móvil", (await desborde(mobile)) <= 1, `${await desborde(mobile)}px`);
  await mobile.screenshot({ path: path.join(OUT, "notas-ficha-movil.png"), fullPage: true });

  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-test="fila-cuenta"]');
  await cargarNota(page, { proveedor: "Italiana", monto: 12000, comprobante: "NC-0200", detalle: "Devolución", boleta: "R-0001" });
  await page.locator('[data-test="guardar-nota"]').click();
  await page.waitForSelector('[data-test="form-nota"]', { state: "detached" });
  await page.screenshot({ path: path.join(OUT, "notas-lista-desktop.png"), fullPage: true });
  await (await filaCuenta(page, "Italiana")).click();
  await page.waitForSelector('[data-test="fila-nota"]');
  await page.screenshot({ path: path.join(OUT, "notas-ficha-desktop.png"), fullPage: true });

  check("25", "Sin errores de JavaScript en consola", errores.length === 0, errores.join(" | ").slice(0, 300));

  // Informe antes de cerrar: el close de Edge headless tarda minutos en esta máquina.
  browser.close().catch(() => {});
  const fallidos = results.filter((r) => !r.ok);
  console.log("\n=== Verificación de notas de crédito de proveedores ===\n");
  results.forEach((r) => {
    console.log(`${r.ok ? "OK  " : "FALLA"} ${r.id.padEnd(5)} ${r.desc}${r.detail ? `  [${r.detail}]` : ""}`);
  });
  console.log(`\n${results.length - fallidos.length}/${results.length} checks OK`);
  console.log(`Capturas en ${OUT}\n`);
  process.exit(fallidos.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
