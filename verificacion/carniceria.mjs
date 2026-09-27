/*
 * Verificación en navegador real de la carnicería, contra los requisitos de SPEC-carniceria.md.
 * Usa el Edge o Chrome ya instalado en Windows y el banco de pruebas /login/preview-carniceria
 * (datos en memoria: no toca Supabase).
 *
 * Uso:
 *   1) npm run dev                (en otra terminal)
 *   2) npm run verificar:carniceria
 *
 * Variables opcionales: URL_BASE (por defecto http://localhost:3000), NAVEGADOR, VERBOSE=1.
 * Las capturas quedan en verificacion/capturas/ (ignorada por git).
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const URL_BASE = process.env.URL_BASE || "http://localhost:3000";
const URL = `${URL_BASE}/login/preview-carniceria`;
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
  if (process.env.VERBOSE) console.log((ok ? "  OK   " : "  FALLA ") + id + " " + desc);
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
  const escucharErrores = (p, nombre) => {
    p.on("pageerror", (e) => errores.push(`[${nombre}] ${e}`));
    p.on("console", (m) => {
      if (m.type() === "error") errores.push(`[${nombre}] ${m.text()}`);
    });
  };
  escucharErrores(page, "escritorio");

  const t = (sel, p = page) => p.locator(`[data-test="${sel}"]`);
  const texto = async (sel, p = page) => (await t(sel, p).first().innerText()).replace(/\s+/g, " ").trim();
  const pausa = (ms = 250, p = page) => p.waitForTimeout(ms);
  const menu = (n, p = page) => texto(`menu-${n}`, p);
  const principal = (p = page) => texto("resultado-principal", p);
  const abrir = async (n, p = page) => {
    await t(`menu-${n}`, p).click();
    await t(n === 0 ? "datos-generales" : `modulo-${n}`, p).waitFor();
  };
  /** Carga un dato en una calculadora: escribe y confirma con Enter, como el usuario. */
  const cargar = async (clave, valor, p = page) => {
    const input = t(`input-${clave}`, p);
    await input.fill(String(valor));
    await input.press("Enter");
    await pausa(200, p);
  };
  const origen = (clave, p = page) => t(`campo-${clave}`, p).getAttribute("data-origen");
  // Las capturas van con caret: "initial": por defecto Playwright le pone caret-color a los
  // inputs y, si la captura cae antes de que React hidrate, eso da un aviso de hidratación falso.
  const desborde = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  // `networkidle` no resuelve con el HMR de Turbopack: se espera a que aparezca el menú.
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-test="menu-16"]');

  // ---------- R1 / R2: la sección y sus 16 módulos ----------
  check("R2a", "Están los 16 módulos y los datos generales en el menú",
    (await page.locator('[data-test^="menu-"]').count()) === 17, await page.locator('[data-test^="menu-"]').count());
  check("R2b", "Arranca en el módulo 1 con resultado, frase y consejo",
    (await t("modulo-1").count()) === 1 && (await texto("frase")).startsWith("La factura dice") && (await t("consejo").count()) === 1);

  // ---------- R3: con los datos de ejemplo da lo mismo que el PDF ----------
  const esperadoPDF = {
    1: "14.083 $/kg", 2: "2,09 kg", 3: "$ 280.120", 4: "9,3 %", 5: "23,1 %", 6: "7.003 $/kg",
    7: "$ 3.460", 8: "3.428 $/kg", 9: "290 $/kg", 13: "131,2 kg", 14: "$ 486.920", 15: "$ 421.200",
  };
  for (const [n, esperado] of Object.entries(esperadoPDF)) {
    const m = await menu(n);
    check(`R3.${n}`, `Módulo ${n} da ${esperado}, como el PDF`, m.endsWith(esperado), m);
  }
  check("R3.frase1", "La frase del módulo 1 es la del Excel",
    (await texto("frase")) === "La factura dice 110 kilos a 10.600 pesos. A la balanza del mostrador llegan 82,4: cada kilo que vendés te cuesta 14.083 pesos, un 32,9 % más que el de la factura.",
    await texto("frase"));
  check("R3.amarillo", "Los datos sin cargar avisan que son de ejemplo", (await t("chip-ejemplo").count()) === 6, await t("chip-ejemplo").count());
  await page.screenshot({ path: path.join(OUT, "carniceria-modulo1-desktop.png"), fullPage: true, caret: "initial" });

  // ---------- R4 / R8: cargar un dato recalcula y se encadena ----------
  await cargar("m1.hueso", 20);
  check("R4a", "Cargar 20 kg de hueso recalcula el costo real al momento (14.433)", (await principal()) === "14.433 $/kg", await principal());
  check("R4b", "El menú también se actualiza", (await menu(1)).endsWith("14.433 $/kg"), await menu(1));
  check("R4c", "El dato queda marcado como cargado por vos", (await origen("m1.hueso")) === "manual", await origen("m1.hueso"));
  check("R4d", "Se ve «Guardado»", (await texto("estado-guardado")).includes("Guardado"), await texto("estado-guardado"));

  await abrir(5);
  check("R8a", "El módulo 5 toma el costo del módulo 1 solo", (await origen("m5.costo")) === "auto" && (await t("input-m5.costo").inputValue()).startsWith("14.432,8"),
    `${await origen("m5.costo")} ${await t("input-m5.costo").inputValue()}`);
  check("R8b", "Y dice de dónde sale", (await texto("campo-m5.costo")).includes("sale de módulo 1"), await texto("campo-m5.costo"));
  await cargar("m5.costo", 15000);
  check("R8c", "Se puede pisar a mano", (await origen("m5.costo")) === "manual");
  await t("volver-m5.costo").click();
  await pausa();
  check("R8d", "…y volver al automático", (await origen("m5.costo")) === "auto" && (await t("input-m5.costo").inputValue()).startsWith("14.432,8"),
    await t("input-m5.costo").inputValue());

  await abrir(1);
  await t("volver-m1.hueso").click();
  await pausa();
  check("R4e", "Volver al ejemplo deja el hueso en 18 y el costo en 14.083",
    (await t("input-m1.hueso").inputValue()) === "18" && (await principal()) === "14.083 $/kg", `${await t("input-m1.hueso").inputValue()} → ${await principal()}`);

  await cargar("m1.hueso", "abc");
  check("R4f", "Un número mal escrito queda en rojo y no cambia la cuenta",
    (await t("input-m1.hueso").getAttribute("aria-invalid")) === "true" && (await principal()) === "14.083 $/kg");
  await t("input-m1.hueso").fill("18");
  await t("input-m1.hueso").press("Enter");
  await pausa();

  // ---------- R10: escandallo y prorrateo con la misma lista de cortes ----------
  await abrir(3);
  check("R10a", "El escandallo tiene los 19 cortes más la grasa y el hueso", (await t("fila-corte").count()) === 21, await t("fila-corte").count());
  check("R10b", "Totales del Excel: 107,4 kg y $ 1.446.120",
    (await texto("total-kilos")) === "107,4" && (await texto("total-plata")) === "$ 1.446.120", `${await texto("total-kilos")} / ${await texto("total-plata")}`);
  const precioLomo = page.locator('[data-test="fila-corte"]', { hasText: "Lomo" }).filter({ hasNotText: "Bola" }).locator('[data-test="precio-corte"]');
  await precioLomo.fill("30.000");
  await precioLomo.press("Enter");
  await pausa();
  check("R10c", "Subir el lomo a 30.000 suma 2,1 × 1.300 = 2.730 a lo que deja la media res", (await principal()) === "$ 282.850", await principal());

  await abrir(4);
  const filaProrrateo = (nombre) => page.locator('[data-test="fila-prorrateo"]', { hasText: nombre });
  check("R10d", "El prorrateo usa el precio nuevo del lomo", (await filaProrrateo("Lomo").filter({ hasNotText: "Bola" }).innerText()).includes("30.000"),
    await filaProrrateo("Lomo").filter({ hasNotText: "Bola" }).innerText());
  await filaProrrateo("Vacío").locator('[data-test="fijo-corte"]').check();
  await pausa();
  check("R10e", "Un corte que se deja fijo mantiene su precio", (await filaProrrateo("Vacío").locator('[data-test="precio-nuevo"]').innerText()).includes("21.200"),
    await filaProrrateo("Vacío").locator('[data-test="precio-nuevo"]').innerText());
  check("R10f", "La frase del módulo 4 nombra los cortes fijos", (await texto("frase")).startsWith("Con el asado, el vacío y la picada quietos"), await texto("frase"));
  await filaProrrateo("Vacío").locator('[data-test="fijo-corte"]').uncheck();
  await pausa();

  // El lomo vuelve a su precio: los módulos 11, 12 y 16 se comparan después contra el PDF.
  await abrir(3);
  await precioLomo.fill("28700");
  await precioLomo.press("Enter");
  await pausa();
  check("R10h", "Con el lomo de vuelta a 28.700 se recupera el número del PDF", (await principal()) === "$ 280.120", await principal());

  // Grasa y hueso se editan también desde su fila de la tabla (son m3.grasa y m3.hueso).
  await t("kilos-grasa").fill("8");
  await t("kilos-grasa").press("Enter");
  await pausa();
  check("R10i", "Un kilo más de grasa al grasero (800) suma $ 800", (await principal()) === "$ 280.920" && (await origen("m3.grasa")) === "manual",
    `${await principal()} ${await origen("m3.grasa")}`);
  await t("kilos-hueso").fill("20");
  await t("kilos-hueso").press("Enter");
  await pausa();
  check("R10j", "Cambiar el hueso desde la tabla mueve el total de kilos (y no la plata)",
    (await texto("total-kilos")) === "110,4" && (await principal()) === "$ 280.920" && (await t("input-m3.hueso").inputValue()) === "20",
    `${await texto("total-kilos")} ${await principal()}`);
  await t("volver-m3.grasa").click();
  await t("volver-m3.hueso").click();
  await pausa();
  check("R10k", "Vuelven al módulo 1", (await principal()) === "$ 280.120" && (await origen("m3.hueso")) === "auto", await principal());
  await t("editar-cortes").click();
  await t("nuevo-corte").fill("Entraña");
  await t("agregar-corte").click();
  await pausa();
  await t("editar-cortes").click();
  check("R10g", "Se puede agregar un corte a la lista", (await t("fila-corte").count()) === 22 && (await page.locator('[data-test="fila-corte"]', { hasText: "Entraña" }).count()) === 1,
    await t("fila-corte").count());
  await page.screenshot({ path: path.join(OUT, "carniceria-escandallo-desktop.png"), fullPage: true, caret: "initial" });

  // ---------- R7 / R11: gastos fijos de la app y la luz ----------
  await abrir(10);
  check("R7a", "Aparecen los gastos fijos activos de Ingresos y Egresos", (await t("fila-gasto").count()) === 5, await t("fila-gasto").count());
  check("R11a", "Avisa que la luz puede estar dos veces (módulo 9 y la factura de EPEC)", (await t("aviso-luz").count()) === 1 && (await texto("aviso-luz")).includes("EPEC"));
  await page.locator('[data-test="fila-gasto"]', { hasText: "EPEC" }).locator('[data-test="incluir-gasto"]').uncheck();
  await pausa();
  check("R11b", "Destildando la factura de luz desaparece el aviso", (await t("aviso-luz").count()) === 0);
  check("R7b", "Un gasto destildado no suma: 10 % de 2.400.000", (await texto("total-gastos")) === "$ 240.000", await texto("total-gastos"));

  // Con los gastos del Excel (alquiler, impuestos, servicios y bolsas, sueldos aparte) al 100 %,
  // los módulos 10 a 12 tienen que dar lo del PDF.
  await cargar("m10.pct", 100);
  await cargar("m10.sueldos", 1700000);
  await cargar("m10.otros", 250000);
  check("R7c", "Módulo 10 con los gastos del Excel: 2.321 $/kg", (await principal()) === "2.321 $/kg", await principal());
  check("R3.10", "Módulo 11 encadenado: 20,3 medias", (await menu(11)).endsWith("20,3 medias"), await menu(11));
  check("R3.12", "Módulo 12 encadenado: 4.910 $/hora", (await menu(12)).endsWith("4.910 $/hora"), await menu(12));
  // El Excel pasa al 16 el gasto por kilo y la comisión ya redondeados (2.321 y 1,3 %) y da
  // 53.870; encadenado sin redondear da 53.970. Con los redondeos cargados a mano da el del PDF.
  check("R3.16a", "Módulo 16 encadenado sin redondear: $ 53.970", (await menu(16)).endsWith("$ 53.970"), await menu(16));
  await abrir(16);
  await cargar("m16.gasto_kg", 2321);
  await cargar("m16.comision", "1,3");
  check("R3.16b", "Con los números redondeados del Excel, el 16 da $ 53.870 como el PDF", (await principal()) === "$ 53.870", await principal());
  await t("volver-m16.gasto_kg").click();
  await t("volver-m16.comision").click();
  await pausa();

  // ---------- R5 / R6: historial de medias reses ----------
  await t("tab-medias").click();
  await t("sin-medias").waitFor();
  check("R5a", "Sin medias reses cargadas lo dice", (await t("sin-medias").count()) === 1);

  const llenar = async (datos) => {
    for (const [k, v] of Object.entries(datos)) await t(`f-${k}`).fill(String(v));
  };
  await t("abrir-form-media").click();
  await llenar({ abastecedor: "Frigorífico Río", kg_factura: 110, precio_kg: "10.600", kg_balanza: 109, dias_camara: 2, hueso_kg: 18, grasa_kg: 7, merma_kg: "2,6", precio_grasero: 800 });
  check("R5b", "Antes de guardar muestra lo que va a dar (14.083 el kilo)", (await texto("vista-previa")).includes("$ 14.083"), await texto("vista-previa"));
  await t("guardar-media").click();
  await pausa(300);
  check("R5c", "Se guarda y aparece en la lista con su costo real", (await t("fila-media").count()) === 1 && (await texto("costo-real-media")) === "$ 14.083", await texto("costo-real-media"));
  check("R5d", "El formulario deja el abastecedor y el precio para cargar la siguiente",
    (await t("f-abastecedor").inputValue()) === "Frigorífico Río" && (await t("f-kg_factura").inputValue()) === "");

  await llenar({ abastecedor: "Don Pedro", kg_factura: 120, precio_kg: "11.000", kg_balanza: "117,5" });
  await t("guardar-media").click();
  await pausa(300);
  check("R5e", "Una media res sin desposte también se guarda", (await t("fila-media").count()) === 2);

  await llenar({ kg_factura: 100, precio_kg: 1000, hueso_kg: 5 });
  await t("guardar-media").click();
  await pausa(200);
  check("R5f", "Si falta parte del desposte lo pide", (await texto("error-media")).includes("hueso, grasa y merma"), await texto("error-media"));
  await llenar({ hueso_kg: 60, grasa_kg: 30, merma_kg: 20 });
  await t("guardar-media").click();
  await pausa(200);
  check("R5g", "El desposte no puede pesar más que la media res", (await texto("error-media")).includes("no pueden pesar tanto"), await texto("error-media"));
  await page.getByRole("button", { name: "Cerrar" }).click();

  check("R6a", "Resumen mes a mes", (await page.locator('[data-test="tabla-por-mes"] [data-test="fila-resumen"]').count()) === 1);
  const porAbastecedor = page.locator('[data-test="tabla-por-abastecedor"] [data-test="fila-resumen"]');
  check("R6b", "Resumen por abastecedor: Don Pedro y Frigorífico Río", (await porAbastecedor.count()) === 2, await porAbastecedor.count());
  const donPedro = (await porAbastecedor.filter({ hasText: "Don Pedro" }).innerText()).replace(/\s+/g, " ");
  check("R6c", "La romana de Don Pedro: 2,5 kg sobre 120 = 2,08 % y $ 27.500", donPedro.includes("2,08 %") && donPedro.includes("$ 27.500"), donPedro);
  const resumen30 = await texto("resumen-30");
  check("R6d", "Resumen de los últimos 30 días: 2 medias, costo real 14.083", resumen30.includes("2") && resumen30.includes("14.083 $/kg"), resumen30);
  await page.screenshot({ path: path.join(OUT, "carniceria-medias-desktop.png"), fullPage: true, caret: "initial" });

  // Editar y borrar
  await page.locator('[data-test="fila-media"]', { hasText: "Don Pedro" }).locator('[data-test="editar-media"]').click();
  await t("f-precio_kg").fill("11.500");
  await t("guardar-media").click();
  await pausa(300);
  check("R5h", "Editar una media res cambia su precio", (await page.locator('[data-test="fila-media"]', { hasText: "Don Pedro" }).innerText()).includes("11.500"));
  await page.locator('[data-test="fila-media"]', { hasText: "Don Pedro" }).locator('[data-test="eliminar-media"]').click();
  await page.getByRole("button", { name: "Confirmar" }).click();
  await pausa(300);
  check("R5i", "Eliminar pide confirmación y la saca", (await t("fila-media").count()) === 1);

  await t("especie-cerdo").click();
  check("R5j", "El cerdo tiene su propio historial", (await t("sin-medias").count()) === 1);
  await t("especie-vaca").click();

  // ---------- R9: los módulos 1 y 2 toman el historial ----------
  await t("tab-calculadoras").click();
  await abrir(1);
  check("R9a", "El módulo 1 ahora usa la media res cargada", (await origen("m1.hueso")) === "auto" && (await texto("campo-m1.hueso")).includes("historial"),
    `${await origen("m1.hueso")} ${await texto("campo-m1.hueso")}`);
  check("R9b", "Lo avisa arriba de las calculadoras", (await texto("aviso-historial")).includes("la media res de vaca"), await texto("aviso-historial"));
  await abrir(2);
  check("R9c", "El módulo 2 toma factura y balanza de la misma media res (1 kg de romana + oreo = 2,09)", (await principal()) === "2,09 kg", await principal());
  await abrir(0);
  check("R9d", "Las medias por mes salen del historial", (await origen("gen.medias_mes")) === "auto" && (await t("input-gen.medias_mes").inputValue()) === "1",
    await t("input-gen.medias_mes").inputValue());

  // ---------- Si falla el guardado, la pantalla deshace el cambio ----------
  const conFalla = await ctx.newPage();
  escucharErrores(conFalla, "con falla");
  await conFalla.goto(`${URL}?fallar=1`, { waitUntil: "domcontentloaded" });
  await conFalla.waitForSelector('[data-test="menu-16"]');
  await cargar("m1.hueso", 20, conFalla);
  await pausa(300, conFalla);
  check("R4g", "Si no se puede guardar, avisa y vuelve al valor anterior",
    (await t("error-guardado", conFalla).count()) === 1 && (await principal(conFalla)) === "14.083 $/kg" && (await origen("m1.hueso", conFalla)) === "ejemplo",
    `${await principal(conFalla)} ${await origen("m1.hueso", conFalla)}`);
  await conFalla.close();

  // ---------- R15: celular ----------
  const mobile = await ctx.newPage();
  escucharErrores(mobile, "celular");
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(URL, { waitUntil: "domcontentloaded" });
  await mobile.waitForSelector('[data-test="menu-16"]');
  check("R15a", "En el celular la página no se desborda a lo ancho", (await desborde(mobile)) <= 1, `${await desborde(mobile)}px`);
  await mobile.screenshot({ path: path.join(OUT, "carniceria-menu-movil.png"), fullPage: true, caret: "initial" });
  for (const n of [1, 3, 4, 7, 10, 16]) {
    await abrir(n, mobile);
    check(`R15.${n}`, `Módulo ${n} entra en el ancho del teléfono`, (await desborde(mobile)) <= 1, `${await desborde(mobile)}px`);
    if (n === 1 || n === 3 || n === 10) await t(`modulo-${n}`, mobile).screenshot({ path: path.join(OUT, `carniceria-modulo${n}-movil.png`), caret: "initial" });
  }
  const inputMovil = t("input-m16.kilos", mobile);
  check("R15b", "Los campos piden el teclado numérico", (await inputMovil.getAttribute("inputmode")) === "decimal");

  await t("tab-medias", mobile).click();
  await t("abrir-form-media", mobile).click();
  check("R15c", "El formulario de media res entra en el teléfono", (await desborde(mobile)) <= 1, `${await desborde(mobile)}px`);
  await llenarEn(mobile, { abastecedor: "Frigorífico Río", kg_factura: 110, precio_kg: "10.600", kg_balanza: 109, hueso_kg: 18, grasa_kg: 7, merma_kg: "2,6", precio_grasero: 800 });
  await t("guardar-media", mobile).click();
  await pausa(300, mobile);
  check("R15d", "Con una media res cargada, la lista y los resúmenes no desbordan", (await t("fila-media", mobile).count()) === 1 && (await desborde(mobile)) <= 1, `${await desborde(mobile)}px`);
  await mobile.screenshot({ path: path.join(OUT, "carniceria-medias-movil.png"), fullPage: true, caret: "initial" });

  check("R16", "Sin errores de JavaScript en consola", errores.length === 0, process.env.VERBOSE ? errores.join(" | ") : errores.join(" | ").slice(0, 400));

  // El informe va antes de cerrar: en esta máquina el close() de Edge headless tarda minutos.
  browser.close().catch(() => {});

  const fallidos = results.filter((r) => !r.ok);
  console.log("\n=== Verificación de la carnicería ===\n");
  results.forEach((r) => {
    console.log(`${r.ok ? "OK  " : "FALLA"} ${r.id.padEnd(8)} ${r.desc}${r.detail ? `  [${r.detail}]` : ""}`);
  });
  console.log(`\n${results.length - fallidos.length}/${results.length} checks OK`);
  console.log(`Capturas en ${OUT}\n`);
  process.exit(fallidos.length === 0 ? 0 : 1);
}

async function llenarEn(p, datos) {
  for (const [k, v] of Object.entries(datos)) await p.locator(`[data-test="f-${k}"]`).fill(String(v));
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
