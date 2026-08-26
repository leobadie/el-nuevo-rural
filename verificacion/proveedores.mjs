/*
 * Verificación en navegador real de la cuenta corriente de proveedores, contra los
 * requisitos R2-R7 de SPEC-proveedores.md. Usa el Edge o Chrome ya instalado en Windows
 * (no descarga navegadores).
 *
 * Uso:
 *   1) npm run dev              (en otra terminal)
 *   2) npm run verificar:proveedores
 *
 * Variables opcionales:
 *   URL_BASE   por defecto http://localhost:3000
 *   NAVEGADOR  ruta a un ejecutable de Chromium/Edge/Chrome
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
}

const plata = (n) => "$" + Math.round(n).toLocaleString("es-AR");
const num = (txt) => parseFloat(String(txt).replace(/[^\d,-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;

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

  await page.goto(URL, { waitUntil: "networkidle" });

  // ---------- R3: lista de proveedores ----------
  const filas = page.locator('[data-test="fila-cuenta"]');
  const nombres = await filas.locator("td:first-child").allInnerTexts();
  const limpios = nombres.map((n) => n.split("·")[0].trim());

  check("R3.3", "Sólo aparecen proveedores con entregas o pagos (Miga no tiene nada)",
    !limpios.includes("Miga"), `listados: ${limpios.join(", ")}`);
  check("R3.1", "Aparecen los tres proveedores con movimiento",
    ["Italiana", "Pepsi", "Katy (verdulería)"].every((n) => limpios.includes(n)), limpios.join(", "));

  // Italiana 150.000 − 60.000 = 90.000 · Katy 20.000 − 8.000 = 12.000 · Pepsi 0
  check("R3.5", "Ordenado por saldo, la mayor deuda primero",
    limpios[0] === "Italiana" && limpios[1] === "Katy (verdulería)" && limpios[2] === "Pepsi",
    limpios.join(" > "));

  const deudaTotal = await page.locator('[data-test="deuda-total"]').innerText();
  check("R3.4", `Deuda total = ${plata(102000)}`, deudaTotal.trim() === plata(102000), deudaTotal);

  const saldos = await filas.locator('[data-test="cuenta-saldo"]').allInnerTexts();
  check("R2.1", "El egreso sin proveedor y el ingreso no ensucian el saldo de Italiana",
    num(saldos[0]) === 90000, `saldo Italiana: ${saldos[0]}`);

  // ---------- R8: corte de la cuenta corriente ----------
  // El banco de pruebas tiene un pago de $777.000 a Italiana cargado antes del corte.
  // Si contara, el saldo de Italiana sería negativo y la deuda total no daría $102.000.
  check("R8.1", "Un pago cargado antes del corte no cuenta en la cuenta corriente",
    num(saldos[0]) === 90000 && deudaTotal.trim() === plata(102000),
    `saldo ${saldos[0]}, deuda total ${deudaTotal}`);

  const aviso = await page.locator('[data-test="aviso-corte"]').innerText();
  check("R8.2", "La pantalla avisa desde cuándo arranca y cuántos pagos deja afuera",
    aviso.includes("arranca el") && aviso.includes("1 pago(s)"), aviso.replace(/\s+/g, " ").slice(0, 120));

  await page.screenshot({ path: path.join(OUT, "proveedores-lista-desktop.png"), fullPage: true });

  // ---------- R4: ficha del proveedor ----------
  await filas.first().click();
  await page.waitForSelector('[data-test="ficha-saldo"]');

  const saldoFicha = await page.locator('[data-test="ficha-saldo"]').innerText();
  const aCuenta = await page.locator('[data-test="ficha-acuenta"]').innerText();
  check("R4.1", "Se abre la ficha del proveedor", saldoFicha.length > 0);
  check("R2.2", `Un pago cargado en Movimientos figura a cuenta (${plata(60000)})`,
    num(aCuenta) === 60000, aCuenta);
  check("R7.4", "Cuadra: entregado − pagado = saldo",
    num(await page.locator('[data-test="ficha-entregado"]').innerText())
      - num(await page.locator('[data-test="ficha-pagado"]').innerText()) === num(saldoFicha),
    saldoFicha);

  const estados = await page.locator('[data-test="fila-entrega"]').allInnerTexts();
  check("R4.3", "Las dos entregas de Italiana arrancan impagas",
    estados.filter((t) => t.includes("Impaga")).length === 2, estados.length + " filas");

  await page.screenshot({ path: path.join(OUT, "proveedores-ficha-desktop.png"), fullPage: true });

  // ---------- R6.2: aplicar automático (FIFO) ----------
  await page.locator('[data-test="btn-aplicar-auto"]').first().click();
  await page.waitForTimeout(300);

  const saldosEntrega = await page.locator('[data-test="entrega-saldo"]').allInnerTexts();
  check("R6.2", `FIFO: los ${plata(60000)} van a la entrega más vieja, que queda debiendo ${plata(40000)}`,
    num(saldosEntrega[0]) === 40000 && num(saldosEntrega[1]) === 50000,
    saldosEntrega.join(" / "));
  check("R2.2b", "Ya no queda saldo a cuenta",
    num(await page.locator('[data-test="ficha-acuenta"]').innerText()) === 0);

  const chips = await page.locator('[data-test="fila-entrega"]').first().innerText();
  check("R4.3b", "La entrega pagada a medias queda en Parcial", chips.includes("Parcial"), chips.replace(/\n/g, " | "));

  // ---------- R5: pagar desde la ficha ----------
  await page.locator('[data-test="btn-pagar"]').first().click();
  await page.waitForSelector('[data-test="modal-pago"]');

  const montoPre = await page.locator('[data-test="pago-monto"]').inputValue();
  check("R5.1", `El monto viene precargado en el saldo pendiente (${plata(40000)})`,
    Number(montoPre) === 40000, montoPre);

  // R5.6 — no dejar imputar de más
  await page.locator('[data-test="pago-monto"]').fill("999999");
  await page.locator('[data-test="pago-confirmar"]').click();
  await page.waitForTimeout(200);
  const errPago = await page.locator('[data-test="pago-error"]').count();
  check("R5.6", "Rechaza pagar más que el saldo de la entrega", errPago === 1,
    errPago ? await page.locator('[data-test="pago-error"]').innerText() : "no mostró error");

  await page.locator('[data-test="pago-monto"]').fill("40000");
  await page.locator('[data-test="pago-confirmar"]').click();
  await page.waitForTimeout(400);

  const saldosPost = await page.locator('[data-test="entrega-saldo"]').allInnerTexts();
  check("R5.3", "El pago desde la ficha salda la entrega", num(saldosPost[0]) === 0, saldosPost.join(" / "));
  const primeraFila = await page.locator('[data-test="fila-entrega"]').first().innerText();
  check("R4.3c", "La entrega queda en Pagada", primeraFila.includes("Pagada"));
  check("R5.3b", `El saldo del proveedor baja a ${plata(50000)}`,
    num(await page.locator('[data-test="ficha-saldo"]').innerText()) === 50000,
    await page.locator('[data-test="ficha-saldo"]').innerText());

  const pagosFilas = await page.locator('[data-test="fila-pago"]').count();
  check("R5.4", "El pago se registró como movimiento y aparece en la lista de pagos", pagosFilas === 2, `${pagosFilas} pagos`);

  await page.screenshot({ path: path.join(OUT, "proveedores-ficha-pagada-desktop.png"), fullPage: true });

  // ---------- R4.7: deshacer una aplicación ----------
  const antes = num(await page.locator('[data-test="ficha-acuenta"]').innerText());
  await page.locator('[data-test="btn-desimputar"]').first().click();
  await page.waitForTimeout(300);
  const despues = num(await page.locator('[data-test="ficha-acuenta"]').innerText());
  check("R4.7", "Deshacer una aplicación devuelve la plata a cuenta", despues > antes, `${antes} → ${despues}`);

  // ---------- R4.2: cargar una entrega desde la ficha ----------
  const saldoAntes = num(await page.locator('[data-test="ficha-saldo"]').innerText());
  await page.locator('[data-test="abrir-nueva-entrega"]').click();
  await page.locator('[data-test="entrega-monto"]').fill("25000");
  await page.locator('[data-test="entrega-comprobante"]').fill("R-0003");
  await page.locator('[data-test="guardar-entrega"]').click();
  await page.waitForTimeout(400);
  const saldoDespues = num(await page.locator('[data-test="ficha-saldo"]').innerText());
  check("R4.2", "Cargar una entrega suma a la deuda", saldoDespues === saldoAntes + 25000, `${saldoAntes} → ${saldoDespues}`);

  // R4.2b — monto obligatorio
  await page.locator('[data-test="abrir-nueva-entrega"]').click();
  await page.locator('[data-test="guardar-entrega"]').click();
  await page.waitForTimeout(200);
  check("R4.2b", "No deja cargar una entrega sin monto",
    (await page.locator('[data-test="entrega-error"]').count()) === 1);

  // ---------- R8.3: mover el corte para atrás hace reaparecer los pagos viejos ----------
  await page.locator('[data-test="volver-lista"]').click();
  await page.waitForTimeout(200);

  const deudaAntesDelCambio = num(await page.locator('[data-test="deuda-total"]').innerText());
  await page.locator('[data-test="btn-cambiar-corte"]').click();
  await page.locator('[data-test="corte-fecha"]').fill("2020-01-01");
  await page.locator('[data-test="corte-guardar"]').click();
  await page.waitForTimeout(400);
  // Ojo: con el pago viejo contando, Italiana queda con saldo negativo y se va al final
  // del orden, así que hay que buscarla por nombre y no por posición.
  const filaItaliana = page.locator('[data-test="fila-cuenta"]', { hasText: "Italiana" });
  const saldoItalianaTrasCorte = num(await filaItaliana.locator('[data-test="cuenta-saldo"]').innerText());
  check("R8.3", "Correr el corte para atrás hace reaparecer el pago viejo (es un filtro, no un borrado)",
    saldoItalianaTrasCorte < 0, `saldo Italiana ahora ${saldoItalianaTrasCorte} (antes la deuda total era ${deudaAntesDelCambio})`);

  // Se deja como estaba para no arrastrar el cambio a los checks de móvil.
  await page.locator('[data-test="btn-cambiar-corte"]').click();
  await page.locator('[data-test="corte-fecha"]').fill(new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10));
  await page.locator('[data-test="corte-guardar"]').click();
  await page.waitForTimeout(300);

  // ---------- R7.2: móvil ----------
  const mobile = await ctx.newPage();
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(URL, { waitUntil: "networkidle" });
  await mobile.waitForSelector('[data-test="fila-cuenta"]');

  const desborde = await mobile.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("R7.2", "En móvil la página no se desborda a lo ancho", desborde <= 1, `${desborde}px de desborde`);
  await mobile.screenshot({ path: path.join(OUT, "proveedores-lista-movil.png"), fullPage: true });

  await mobile.locator('[data-test="fila-cuenta"]').first().click();
  await mobile.waitForSelector('[data-test="ficha-saldo"]');
  const desbordeFicha = await mobile.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  check("R7.2b", "La ficha tampoco se desborda en móvil", desbordeFicha <= 1, `${desbordeFicha}px de desborde`);
  await mobile.screenshot({ path: path.join(OUT, "proveedores-ficha-movil.png"), fullPage: true });

  check("R7.1", "Sin errores de JavaScript en consola", errores.length === 0, errores.join(" | ").slice(0, 300));

  await browser.close();

  // ---------- informe ----------
  const fallidos = results.filter((r) => !r.ok);
  console.log("\n=== Verificación de cuenta corriente de proveedores ===\n");
  results.forEach((r) => {
    console.log(`${r.ok ? "OK  " : "FALLA"} ${r.id.padEnd(7)} ${r.desc}${r.detail ? `  [${r.detail}]` : ""}`);
  });
  console.log(`\n${results.length - fallidos.length}/${results.length} checks OK`);
  console.log(`Capturas en ${OUT}\n`);
  process.exit(fallidos.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
