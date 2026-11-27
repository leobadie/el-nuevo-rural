/*
 * Verificación en navegador real de SPEC-boletas-nuevas-arriba.md, sobre el banco
 * /login/preview-proveedores (datos en memoria, sin Supabase).
 *
 * Uso:
 *   1) npm run dev              (en otra terminal)
 *   2) npm run verificar:boletas-orden
 *
 * Italiana trae R-0001 (hace 10 días, $100.000) y R-0002 (hace 3 días, $50.000). Se suma R-MEDIO
 * (hace 5 días) y se mira el orden en la ficha, en las ventanas y que el reparto siga siendo FIFO.
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.URL_BASE || "http://localhost:3000";
const URL = `${BASE}/login/preview-proveedores`;
const SALIDA = path.join(process.cwd(), "verificacion", "capturas", "boletas-orden");
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
const hace = (n) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
const num = (t) => parseFloat(String(t).replace(/[^\d,-]/g, "").replace(/\./g, "").replace(",", ".")) || 0;
const comps = (textos) => textos.map((t) => (t.match(/R-[A-Z0-9]+/) || ["?"])[0]);

const browser = await chromium.launch({ executablePath: NAVEGADORES.find((p) => fs.existsSync(p)), headless: true });
try {
  for (const [nombre, viewport] of [
    ["desktop", { width: 1280, height: 900 }],
    ["movil", { width: 390, height: 844 }],
  ]) {
    const ctx = await browser.newContext({ viewport });
    const p = await ctx.newPage();
    const errores = [];
    p.on("pageerror", (e) => errores.push(String(e)));
    p.on("console", (m) => m.type() === "error" && errores.push(m.text()));
    await p.goto(URL, { waitUntil: "domcontentloaded", timeout: 60_000 });
    await p.waitForSelector('[data-test="fila-cuenta"]', { timeout: 30_000 });
    // En dev la fila se pinta antes de que React hidrate y un clic temprano se pierde: se reintenta.
    for (let i = 0; ; i++) {
      await p.locator('[data-test="fila-cuenta"]', { hasText: "Italiana" }).click();
      try {
        await p.waitForSelector('[data-test="ficha-saldo"]', { timeout: 3000 });
        break;
      } catch (e) {
        if (i >= 5) throw e;
      }
    }

    // Una boleta del medio, cargada última: tiene que quedar entre las otras dos (1, 2).
    await p.locator('[data-test="abrir-nueva-entrega"]').click();
    await p.locator('[data-test="entrega-fecha"]').fill(hace(5));
    await p.locator('[data-test="entrega-monto"]').fill("20000");
    await p.locator('[data-test="entrega-comprobante"]').fill("R-MEDIO");
    await p.locator('[data-test="guardar-entrega"]').click();
    await p.waitForSelector('[data-test="guardar-entrega"]', { state: "detached" });

    const filas = comps(await p.locator('[data-test="fila-entrega"]').allInnerTexts());
    ok(filas.join(",") === "R-0002,R-MEDIO,R-0001", `${nombre}: Entregas de la más nueva a la más vieja`, filas.join(", "));

    // Desplegable de boleta de la nota de crédito (4).
    await p.locator('[data-test="abrir-nueva-nota"]').click();
    const opcNota = comps(
      (await p.locator('[data-test="nota-boleta"] option').allInnerTexts()).filter((t) => /R-/.test(t)),
    );
    ok(opcNota.join(",") === "R-0002,R-MEDIO,R-0001", `${nombre}: boletas de la nota de crédito, nuevas arriba`, opcNota.join(", "));
    // Dos notas a favor, una vieja y una nueva, para ver la tabla de notas (3).
    for (const [fecha, monto, comp] of [[hace(8), "1000", "NC-VIEJA"], [hace(1), "2000", "NC-NUEVA"]]) {
      if (!(await p.$('[data-test="form-nota"]'))) await p.locator('[data-test="abrir-nueva-nota"]').click();
      await p.locator('[data-test="nota-fecha"]').fill(fecha);
      await p.locator('[data-test="nota-monto"]').fill(monto);
      await p.locator('[data-test="nota-comprobante"]').fill(comp);
      await p.locator('[data-test="nota-boleta"]').selectOption("");
      await p.locator('[data-test="guardar-nota"]').click();
      await p.waitForSelector('[data-test="form-nota"]', { state: "detached" });
    }
    const notas = (await p.locator('[data-test="fila-nota"]').allInnerTexts()).map((t) => (t.match(/NC-[A-Z]+/) || ["?"])[0]);
    ok(notas.join(",") === "NC-NUEVA,NC-VIEJA", `${nombre}: Notas de crédito, la más nueva arriba`, notas.join(", "));

    // Casillas de "Pagar con transferencia" (4) y reparto FIFO sin marcar nada (5).
    await p.locator('[data-test="abrir-transferencia"]').click();
    await p.waitForSelector('[data-test="modal-transferencia"]');
    const casillas = comps(await p.locator('[data-test="transf-boleta"]').allInnerTexts());
    ok(casillas.join(",") === "R-0002,R-MEDIO,R-0001", `${nombre}: casillas de la transferencia, nuevas arriba`, casillas.join(", "));
    await p.locator('[data-test="transf-monto"]').fill("1000");
    const lineas = await p.locator('[data-test="transf-linea"]').allInnerTexts();
    ok(lineas.length > 0 && lineas.every((l) => !/R-0002|R-MEDIO/.test(l)) && lineas.some((l) => /R-0001/.test(l)),
      `${nombre}: la plata sigue yendo primero a la boleta más vieja`, lineas.join(" | "));
    await p.screenshot({ path: path.join(SALIDA, `transferencia-${nombre}.png`) });
    await p.locator('[data-test="transf-confirmar"]').click();
    await p.waitForSelector('[data-test="modal-transferencia"]', { state: "detached" });
    const r1 = p.locator('[data-test="fila-entrega"]', { hasText: "R-0001" });
    // R-0001 ya tenía $60.000 a cuenta del banco, más estos $1.000… o lo que el banco ya aplicó:
    // lo que importa es que bajó R-0001 y no las nuevas.
    const saldoNueva = num(await p.locator('[data-test="fila-entrega"]', { hasText: "R-0002" }).locator('[data-test="entrega-saldo"]').innerText());
    ok(saldoNueva === 50000, `${nombre}: R-0002 (la más nueva) no recibió nada`, saldoNueva);
    ok((await r1.innerText()).length > 0, `${nombre}: R-0001 sigue en la lista`);

    // Pagos: el de hoy arriba (3).
    const pagos = await p.locator('[data-test="fila-pago"]').allInnerTexts();
    const fechas = pagos.map((t) => (t.match(/\d{2}\/\d{2}\/\d{2,4}/) || [""])[0]);
    const iso = fechas.map((f) => { const [d, m, a] = f.split("/"); return `${a.length === 2 ? "20" + a : a}-${m}-${d}`; });
    ok(pagos.length >= 2 && iso.every((f, i) => i === 0 || iso[i - 1] >= f), `${nombre}: Pagos del más nuevo al más viejo`, fechas.join(", "));

    ok(errores.length === 0, `${nombre}: sin errores en la consola`, errores.join(" | ").slice(0, 300) || "ninguno");
    const ancho = await p.evaluate(() => document.documentElement.scrollWidth);
    ok(ancho <= viewport.width, `${nombre}: sin scroll horizontal`, `${ancho}px`);
    await p.locator('[data-test="fila-entrega"]').first().scrollIntoViewIfNeeded();
    await p.screenshot({ path: path.join(SALIDA, `ficha-${nombre}.png`), fullPage: nombre === "desktop" });
    await ctx.close();
  }
} catch (e) {
  console.log(`FAIL  la prueba se cortó: ${e.message}`);
  fallos++;
}
await browser.close();
console.log(fallos === 0 ? "\nTodo bien." : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
