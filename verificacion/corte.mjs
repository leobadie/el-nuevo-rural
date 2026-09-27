/*
 * Verificación en navegador real del aviso de corte de registros de Ingresos y Egresos
 * (SPEC-corte-registros.md, puntos 6, 7 y 10), sobre el banco /login/preview-corte.
 *
 * Uso:
 *   1) npm run dev              (en otra terminal)
 *   2) npm run verificar:corte-navegador
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const URL_BASE = process.env.URL_BASE || "http://localhost:3000";
const URL = `${URL_BASE}/login/preview-corte`;
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
  const exe = NAVEGADORES.find((p) => fs.existsSync(p));
  const browser = await chromium.launch({ executablePath: exe, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errores.push(m.text()));

  const admin = (sel) => page.locator(`[data-test="caso-admin"] [data-test="${sel}"]`);
  const comun = (sel) => page.locator(`[data-test="caso-comun"] [data-test="${sel}"]`);
  const texto = async (loc) => (await loc.innerText()).replace(/\s+/g, " ").trim();
  const captura = (p, nombre) => p.screenshot({ path: path.join(OUT, nombre), fullPage: true, caret: "initial" });

  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-test="caso-admin"] [data-test="aviso-corte-registros"]');
  await page.waitForTimeout(600);

  // SPEC 6: el aviso dice desde cuándo y cuánto quedó guardado.
  const t = await texto(admin("texto-corte-registros"));
  check("R6a", "Dice desde cuándo arrancan los registros (27/09/2026)", t.includes("arrancan el 27/09/2026"), t);
  check("R6b", "…y cuánto quedó guardado, sin borrar", t.includes("799 movimientos, 18 ventas XRP, 6 pedidos y 35 entregas de proveedores") && t.includes("no se borró"), t);
  check("R6c", "Un usuario común ve el aviso pero no puede cambiarlo",
    (await comun("aviso-corte-registros").count()) === 1 && (await comun("btn-cambiar-corte-registros").count()) === 0);
  await captura(page, "corte-aviso-desktop.png");

  // SPEC 7: cambiar la fecha.
  await admin("btn-cambiar-corte-registros").click();
  check("R7a", "Al cambiar propone la fecha actual del corte", (await admin("corte-registros-fecha").inputValue()) === "2026-09-27", await admin("corte-registros-fecha").inputValue());
  await admin("corte-registros-fecha").fill("2026-09-01");
  await admin("corte-registros-guardar").click();
  await page.waitForTimeout(300);
  const corte1 = await texto(admin("corte-actual"));
  check("R7b", "Mover el corte al 01/09 guarda las 00:00 de ese día en hora de Argentina",
    corte1.includes("2026-09-01T03:00:00.000Z") && (await texto(admin("texto-corte-registros"))).includes("arrancan el 01/09/2026"), corte1);

  // SPEC 7: quitar el corte.
  await admin("btn-cambiar-corte-registros").click();
  await admin("corte-registros-quitar").click();
  await page.waitForTimeout(300);
  check("R7c", "Quitar el corte vuelve a mostrar todo", (await texto(admin("corte-actual"))).includes("ninguno") && (await texto(admin("texto-corte-registros"))).includes("Se ven todos los registros"));
  check("R7d", "Sin corte, el admin lo puede volver a poner", (await texto(admin("btn-cambiar-corte-registros"))) === "Poner fecha de corte");
  await admin("btn-cambiar-corte-registros").click();
  check("R7e", "…y no deja elegir una fecha futura", (await admin("corte-registros-fecha").getAttribute("max")) !== null);

  // Si falla el guardado, lo dice y no cambia nada.
  const conFalla = await ctx.newPage();
  conFalla.on("pageerror", (e) => errores.push(String(e)));
  await conFalla.goto(`${URL}?fallar=1`, { waitUntil: "domcontentloaded" });
  await conFalla.waitForSelector('[data-test="caso-admin"] [data-test="aviso-corte-registros"]');
  await conFalla.waitForTimeout(600);
  await conFalla.locator('[data-test="caso-admin"] [data-test="btn-cambiar-corte-registros"]').click();
  await conFalla.locator('[data-test="caso-admin"] [data-test="corte-registros-quitar"]').click();
  await conFalla.waitForTimeout(300);
  check("R7f", "Si no se puede guardar, avisa y el corte sigue igual",
    (await conFalla.locator('[data-test="error-corte-registros"]').count()) === 1 && (await texto(conFalla.locator('[data-test="corte-actual"]'))).includes("2026-09-27"));
  await conFalla.close();

  // Celular.
  const movil = await ctx.newPage();
  await movil.setViewportSize({ width: 390, height: 844 });
  await movil.goto(URL, { waitUntil: "domcontentloaded" });
  await movil.waitForSelector('[data-test="aviso-corte-registros"]');
  await movil.waitForTimeout(600);
  await movil.locator('[data-test="caso-admin"] [data-test="btn-cambiar-corte-registros"]').click();
  const desborde = await movil.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("R10", "En el celular el aviso, con la fecha abierta, no se desborda", desborde <= 1, `${desborde}px`);
  await captura(movil, "corte-aviso-movil.png");

  check("R16", "Sin errores de JavaScript en consola", errores.length === 0, errores.join(" | ").slice(0, 400));

  browser.close().catch(() => {});
  const fallidos = results.filter((r) => !r.ok);
  console.log("\n=== Verificación del corte de registros ===\n");
  results.forEach((r) => console.log(`${r.ok ? "OK  " : "FALLA"} ${r.id.padEnd(5)} ${r.desc}${r.detail ? `  [${r.detail}]` : ""}`));
  console.log(`\n${results.length - fallidos.length}/${results.length} checks OK\n`);
  process.exit(fallidos.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
