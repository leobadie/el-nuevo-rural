/*
 * Verificación en navegador real del calendario de cheques, contra los requisitos
 * R1-R8 de SPEC.md. Usa el Edge o Chrome ya instalado en Windows (no descarga navegadores).
 *
 * Uso:
 *   1) npm run dev          (en otra terminal)
 *   2) npm run verificar:calendario
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
const URL = `${URL_BASE}/login/preview-calendario`;
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "capturas");

const NAVEGADORES = [
  process.env.NAVEGADOR,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);

const MESES = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];

const results = [];
function check(id, desc, ok, detail) {
  results.push({ id, desc, ok: !!ok, detail: detail === undefined ? "" : String(detail) });
}

// Localiza el panel de sugerencias por su título exacto (su abuelo es el panel).
function botonesDeSugerencias() {
  const titulo = [...document.querySelectorAll("div")].find(
    (d) => d.textContent.trim() === "Próximos días con margen para emitir");
  if (!titulo) return null;
  return [...titulo.parentElement.parentElement.querySelectorAll("button")].map((b) => b.textContent.trim());
}

// El número de día es el primer hijo de la celda; el badge de cantidad tiene hermano previo.
function celdasDelMes() {
  const spans = [...document.querySelectorAll("span")].filter(
    (s) => /^\d{1,2}$/.test(s.textContent.trim()) && s.style.fontWeight && s.previousElementSibling === null);
  return spans.map((s) => {
    const celda = s.closest("div").parentElement;
    return {
      dia: s.textContent.trim(),
      texto: celda.textContent.trim(),
      tieneMonto: /\$/.test(celda.textContent),
      bg: getComputedStyle(celda).backgroundColor,
    };
  });
}

(async () => {
  const executablePath = NAVEGADORES.find((p) => fs.existsSync(p));
  if (!executablePath) {
    console.error("No encontré Edge ni Chrome. Pasá la ruta en la variable NAVEGADOR.");
    process.exit(2);
  }
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ executablePath, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();

  const errores = [];
  page.on("console", (m) => { if (m.type() === "error") errores.push(m.text()); });
  page.on("pageerror", (e) => errores.push("pageerror: " + e.message));

  const resp = await page.goto(URL, { waitUntil: "networkidle", timeout: 90000 });
  check("HTTP", "La página de prueba responde 200", resp.status() === 200, "status " + resp.status());
  if (resp.status() !== 200) {
    console.error(`\nNo pude cargar ${URL}. ¿Está corriendo 'npm run dev'?\n`);
    await browser.close();
    process.exit(2);
  }

  const hoy = new Date();
  const tituloEsperado = `${MESES[hoy.getMonth()]} ${hoy.getFullYear()}`;
  const diaHoy = String(hoy.getDate());
  const diasDelMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();

  // ---------- R2.1 encabezados lunes→domingo ----------
  const heads = await page.evaluate(() => {
    const grid = [...document.querySelectorAll("div")].find(
      (d) => getComputedStyle(d).gridTemplateColumns.split(" ").length === 7 &&
             d.children.length === 7 &&
             [...d.children].every((c) => c.textContent.trim().length === 1));
    return grid ? [...grid.children].map((c) => c.textContent.trim()) : null;
  });
  check("R2.1", "Encabezados L M M J V S D (lunes a domingo)",
    JSON.stringify(heads) === JSON.stringify(["L","M","M","J","V","S","D"]), JSON.stringify(heads));

  // ---------- R5 navegación y totales ----------
  check("R5.2", `Título muestra "${tituloEsperado}"`,
    (await page.locator(`text=${tituloEsperado}`).count()) > 0);
  const bAnt = await page.locator('button[aria-label="Mes anterior"]').count();
  const bSig = await page.locator('button[aria-label="Mes siguiente"]').count();
  const bHoy = await page.locator("button", { hasText: /^Hoy$/ }).count();
  check("R5.1", "Botones ‹ › y Hoy presentes", bAnt === 1 && bSig === 1 && bHoy >= 1,
    `anterior=${bAnt} siguiente=${bSig} hoy=${bHoy}`);
  const totalTxt = (await page.locator("text=/cheques en el mes/").first().textContent()).trim();
  check("R5.3", "Cabecera con totales del mes (cantidad y monto)",
    /\d+\s+cheques en el mes/.test(totalTxt) && /\$/.test(totalTxt), totalTxt);

  // ---------- R3.2 cheques sin fecha de cobro ----------
  const avisos = await page.locator("text=/no tiene[n]? fecha de cobro/").count();
  check("R3.2", "Avisa aparte los cheques sin fecha de cobro", avisos === 1, `avisos=${avisos}`);

  // ---------- R4.1 / R4.5 topes y leyenda ----------
  const nInputs = await page.locator('input[type="number"]').count();
  check("R4.1", "Dos campos de tope (monto y cantidad)", nInputs === 2, `inputs=${nInputs}`);
  const leyenda = await Promise.all([
    page.locator("text=Libre (sin cheques)").count(),
    page.locator("text=Sin margen (tope alcanzado)").count(),
    page.locator("text=Con cheques (sin tope definido)").count(),
  ]);
  check("R4.5", "Leyenda que explica los colores", leyenda.every((c) => c > 0), JSON.stringify(leyenda));

  // ---------- R2.2 / R2.3 / R2.4 / R2.5 grilla ----------
  const hoyStyle = await page.evaluate((d) => {
    const span = [...document.querySelectorAll("span")].find(
      (s) => s.textContent.trim() === d && s.style.fontWeight && s.previousElementSibling === null);
    if (!span) return null;
    const celda = span.closest("div").parentElement;
    return { color: getComputedStyle(span).color, outline: getComputedStyle(celda).outline };
  }, diaHoy);
  check("R2.5", "El día de hoy se distingue con borde y color",
    hoyStyle && /217,\s*119,\s*87/.test(hoyStyle.color) && /217,\s*119,\s*87/.test(hoyStyle.outline),
    JSON.stringify(hoyStyle));

  const celdas = await page.evaluate(celdasDelMes);
  check("R2.2", "La grilla tiene solo los días del mes (otros meses vacíos)",
    celdas.length === diasDelMes, `celdas=${celdas.length} díasDelMes=${diasDelMes}`);
  check("R2.3", "Días con cheques muestran cantidad y monto",
    celdas.some((c) => c.tieneMonto), `${celdas.filter((c) => c.tieneMonto).length} días con monto`);
  check("R2.4", "Días sin cheques no muestran monto",
    celdas.filter((c) => !c.tieneMonto).every((c) => !/\$/.test(c.texto)));

  // ---------- R7 sugerencias ----------
  const cbChecked = await page.locator('input[type="checkbox"]').first().isChecked();
  check("R7.3", "Checkbox 'Solo días hábiles' activado por defecto", cbChecked === true);
  const sugerencias = await page.evaluate(botonesDeSugerencias);
  check("R7.1", "Panel con próximos días para emitir",
    sugerencias && sugerencias.length > 0, `${(sugerencias || []).length} sugerencias`);
  check("R7.4", "Hasta 12 sugerencias",
    sugerencias && sugerencias.length <= 12, `${(sugerencias || []).length} sugerencias`);
  const finesDeSemana = (sugerencias || []).map((t) => t.slice(0, 10)).filter((f) => {
    const [d, m, y] = f.split("/").map(Number);
    if (!d || !m || !y) return false;
    const dow = new Date(y, m - 1, d).getDay();
    return dow === 0 || dow === 6;
  });
  check("R7.3b", "Con 'solo hábiles' ninguna sugerencia cae sábado o domingo",
    finesDeSemana.length === 0, `${finesDeSemana.length} en fin de semana`);

  await page.screenshot({ path: path.join(OUT, "01-desktop-sin-topes.png"), fullPage: true });

  // ---------- R4.3 / R4.4 semáforo con topes ----------
  await page.locator('input[type="number"]').nth(0).fill("5000000");
  await page.locator('input[type="number"]').nth(1).fill("2");
  await page.waitForTimeout(600);
  const semaforo = await page.evaluate(celdasDelMes);
  const rojos = semaforo.filter((c) => /253,\s*237,\s*236/.test(c.bg));
  const amarillos = semaforo.filter((c) => /254,\s*246,\s*231/.test(c.bg));
  const verdes = semaforo.filter((c) => /232,\s*248,\s*239/.test(c.bg));
  check("R4.4", "Semáforo pinta verde / amarillo / rojo según el uso del tope",
    rojos.length > 0 && amarillos.length > 0 && verdes.length > 0,
    `rojos=[${rojos.map((c) => c.dia)}] amarillos=[${amarillos.map((c) => c.dia)}] verdes=${verdes.length}`);
  check("R4.3", "Muestra el % de uso del tope en los días con cheques",
    semaforo.some((c) => /% del tope/.test(c.texto)));

  // ---------- R6 detalle del día ----------
  const diaConCheques = semaforo.find((c) => c.tieneMonto);
  await page.locator("span").filter({ hasText: new RegExp(`^${diaConCheques.dia}$`) }).first().click();
  await page.waitForTimeout(400);
  check("R6.1", `Click en un día con cheques (${diaConCheques.dia}) abre el detalle`,
    (await page.locator("th", { hasText: "N° cheque" }).count()) > 0);
  const cols = await page.locator("th").allTextContents();
  check("R6.2", "El detalle lista N° cheque, proveedor, importe y estado",
    ["N° cheque", "Proveedor", "Importe", "Estado"].every((c) => cols.includes(c)), cols.join(", "));
  check("R6.3", "El detalle muestra el margen restante del día",
    (await page.locator("text=/Margen restante/").count()) > 0);

  await page.screenshot({ path: path.join(OUT, "02-desktop-con-topes-y-detalle.png"), fullPage: true });

  await page.locator("span").filter({ hasText: new RegExp(`^${diaConCheques.dia}$`) }).first().click();
  await page.waitForTimeout(400);
  check("R6.4", "Click en el mismo día cierra el detalle",
    (await page.locator("th", { hasText: "N° cheque" }).count()) === 0);

  // ---------- R5.1b navegación de mes ----------
  await page.locator('button[aria-label="Mes siguiente"]').click();
  await page.waitForTimeout(400);
  const sig = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
  const okSig = (await page.locator(`text=${MESES[sig.getMonth()]} ${sig.getFullYear()}`).count()) > 0;
  await page.locator("button", { hasText: /^Hoy$/ }).click();
  await page.waitForTimeout(400);
  const okVuelta = (await page.locator(`text=${tituloEsperado}`).count()) > 0;
  check("R5.1b", "Mes siguiente y botón Hoy funcionan", okSig && okVuelta,
    `siguiente=${okSig} volvióAHoy=${okVuelta}`);

  // ---------- R4.6 persistencia ----------
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(600);
  const v1 = await page.locator('input[type="number"]').nth(0).inputValue();
  const v2 = await page.locator('input[type="number"]').nth(1).inputValue();
  check("R4.6", "Los topes persisten al recargar la página",
    v1 === "5000000" && v2 === "2", `monto="${v1}" cantidad="${v2}"`);

  // ---------- R8.2 sin scroll horizontal ----------
  const dsk = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  check("R8.2a", "Desktop 1280px: la página no scrollea en horizontal", dsk.sw <= dsk.cw + 1, JSON.stringify(dsk));

  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2 });
  const mpage = await mob.newPage();
  mpage.on("pageerror", (e) => errores.push("móvil pageerror: " + e.message));
  await mpage.goto(URL, { waitUntil: "networkidle", timeout: 90000 });
  await mpage.locator('input[type="number"]').nth(0).fill("5000000");
  await mpage.locator('input[type="number"]').nth(1).fill("2");
  await mpage.waitForTimeout(600);
  const mb = await mpage.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  check("R8.2b", "Móvil 390px: la página no scrollea en horizontal", mb.sw <= mb.cw + 1, JSON.stringify(mb));
  const gridScroll = await mpage.evaluate(() => {
    const c = [...document.querySelectorAll("div")].find(
      (d) => getComputedStyle(d).overflowX === "auto" && d.scrollWidth > d.clientWidth);
    return c ? { sw: c.scrollWidth, cw: c.clientWidth } : null;
  });
  check("R8.2c", "Móvil: la grilla scrollea dentro de su propio contenedor",
    gridScroll !== null, JSON.stringify(gridScroll));
  await mpage.screenshot({ path: path.join(OUT, "03-movil-390.png"), fullPage: true });

  check("CONSOLA", "Sin errores de consola ni excepciones (incluye hidratación)",
    errores.length === 0, errores.slice(0, 3).join(" || ") || "ninguno");

  await browser.close();

  const fallan = results.filter((r) => !r.ok);
  console.log("\n=============== VERIFICACIÓN CALENDARIO ===============");
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.id.padEnd(7)} ${r.desc}`);
    if (r.detail) console.log(`                 → ${r.detail}`);
  }
  console.log("-------------------------------------------------------");
  console.log(`TOTAL: ${results.length}   PASS: ${results.length - fallan.length}   FAIL: ${fallan.length}`);
  console.log(`Capturas en: ${OUT}`);
  console.log("=======================================================\n");
  process.exit(fallan.length === 0 ? 0 : 1);
})().catch((e) => { console.error("ERROR FATAL:", e); process.exit(2); });
