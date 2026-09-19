/*
 * Verificación en navegador real de las cobranzas de la Municipalidad, contra los requisitos
 * de SPEC-municipalidad.md. Usa el Edge o Chrome ya instalado en Windows.
 *
 * Uso:
 *   1) npm run dev              (en otra terminal)
 *   2) npm run verificar:municipalidad
 *
 * Variables opcionales: URL_BASE (por defecto http://localhost:3000), NAVEGADOR, VERBOSE=1.
 * Las capturas quedan en verificacion/capturas/ (ignorada por git).
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const URL_BASE = process.env.URL_BASE || "http://localhost:3000";
const URL = `${URL_BASE}/login/preview-municipalidad`;
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

  const t = (sel) => page.locator(`[data-test="${sel}"]`);
  const texto = async (sel) => (await t(sel).first().innerText()).trim();
  const teDebe = async () => num(await texto("kpi-te-debe"));
  const filaFactura = (numero) => page.locator('[data-test="fila-factura"]', { hasText: numero });
  const pausa = (ms = 250) => page.waitForTimeout(ms);

  /*
   * Con las solapas por día (R3.9) lo que está cerrado no está en el DOM. Los checks de filas y
   * totales necesitan todo abierto, y cada día nuevo (cargar una factura con fecha de hoy, o
   * cambiar de filtro) arranca cerrado, así que se vuelve a llamar después de cada cambio.
   */
  const abrirDias = async (p = page, sel = "cabecera-dia") => {
    for (let i = 0; i < 20; i++) {
      const cerradas = p.locator(`[data-test="${sel}"][aria-expanded="false"]`);
      if ((await cerradas.count()) === 0) return;
      await cerradas.first().click();
      await p.waitForTimeout(40);
    }
    throw new Error("Quedaron solapas cerradas después de 20 clicks");
  };

  // `networkidle` no resuelve con el HMR de Turbopack: se espera a que aparezca la tabla.
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-test="fila-factura"]');

  // ---------- R2.2: resumen ----------
  check("R2.2a", `Te debe = ${plata(370000)}`, (await teDebe()) === 370000, await texto("kpi-te-debe"));
  const kpiPend = await page.locator('[data-test="kpi-pendientes"]').locator("..").innerText();
  check("R2.2b", "3 facturas pendientes, la más vieja con 40 días", kpiPend.includes("3") && kpiPend.includes("40 día"), kpiPend.replace(/\s+/g, " "));
  const kpiCob = await page.locator('[data-test="kpi-cobrado"]').locator("..").innerText();
  check("R2.2c", `Cobrado ${plata(550000)} aclarando ${plata(20000)} de retenciones`,
    kpiCob.includes(plata(550000)) && kpiCob.includes(plata(20000)), kpiCob.replace(/\s+/g, " "));
  check("R2.2d", `Cobros sin aplicar ${plata(50000)}`, num(await texto("kpi-sin-aplicar")) === 50000, await texto("kpi-sin-aplicar"));

  // ---------- R3.9 / R3.10: solapas por día de entrega ----------
  const cabeceras = t("cabecera-dia");
  const expandidas = () => cabeceras.evaluateAll((els) => els.map((e) => e.getAttribute("aria-expanded")).join());
  check("R3.9a", "Las 3 pendientes se agrupan en 2 días de entrega", (await cabeceras.count()) === 2, await cabeceras.count());
  const cab0 = (await cabeceras.first().innerText()).replace(/\s+/g, " ");
  check("R3.9b", `El día más nuevo dice cuántas facturas tiene y su saldo (${plata(270000)})`,
    cab0.includes("2 facturas") && cab0.includes(plata(270000)), cab0);
  check("R3.10a", "Al entrar sólo está abierto el día más reciente", (await expandidas()) === "true,false", await expandidas());
  check("R3.10b", "Lo cerrado no ocupa lugar: se ven 2 filas de 3 facturas", (await t("fila-factura").count()) === 2, await t("fila-factura").count());
  check("R3.11a", "El total de la pantalla sigue siendo el de las 3 pendientes", num(await texto("total-saldo")) === 420000, await texto("total-saldo"));
  // En la computadora va la tabla y nada más: las tarjetas de teléfono duplicaban cada fila.
  check("R6.5h", "En desktop no se ven además las tarjetas de móvil",
    (await t("tarjeta-factura").count()) > 0 && !(await t("tarjeta-factura").first().isVisible()),
    `${await t("tarjeta-factura").count()} tarjetas en el DOM`);
  await page.screenshot({ path: path.join(OUT, "municipalidad-dias-desktop.png"), fullPage: true });

  await t("buscar-factura").fill("belgrano");
  await pausa(150);
  check("R3.10c", "Buscando, el resultado no queda tapado por una solapa cerrada",
    (await t("fila-factura").count()) === 1 && (await t("fila-factura").innerText()).includes("0001-00000102"),
    await t("fila-factura").count());
  await t("buscar-factura").fill("");
  await pausa(150);
  await cabeceras.nth(1).click();
  check("R3.10d", "Abrir a mano el día más viejo suma su factura", (await t("fila-factura").count()) === 3, await t("fila-factura").count());
  await cabeceras.first().click();
  check("R3.10e", "Cerrar el día más nuevo esconde sus 2 facturas", (await t("fila-factura").count()) === 1, await t("fila-factura").count());
  await abrirDias();

  // ---------- R3.3 / R3.4 / R3.5: tabla, filtro y totales ----------
  check("R3.4a", "Por defecto muestra sólo las pendientes (3)", (await t("fila-factura").count()) === 3, await t("fila-factura").count());
  check("R3.5", `Total de saldo de las pendientes = ${plata(420000)}`, num(await texto("total-saldo")) === 420000, await texto("total-saldo"));
  check("R6.4", "Cuadra: te debe = Σ saldos − cobros sin aplicar",
    (await teDebe()) === num(await texto("total-saldo")) - num(await texto("kpi-sin-aplicar")));

  const estadoParcial = await filaFactura("0001-00000102").locator('[data-test="factura-estado"]').innerText();
  check("R3.3a", "La factura cobrada a medias figura Parcial", estadoParcial.includes("Parcial"), estadoParcial);
  const sinNumero = await t("fila-factura").first().innerText();
  check("R3.3b", "La factura sin número lo muestra y va arriba (más nueva primero)", sinNumero.includes("sin número"), sinNumero.replace(/\s+/g, " ").slice(0, 80));

  await page.screenshot({ path: path.join(OUT, "municipalidad-facturas-desktop.png"), fullPage: true });

  await t("filtro-todas").click();
  await abrirDias();
  check("R3.4b", "Filtro Todas muestra las 4", (await t("fila-factura").count()) === 4);
  await t("filtro-cobradas").click();
  await abrirDias();
  check("R3.4c", "Filtro Cobradas muestra sólo la 101", (await t("fila-factura").count()) === 1 && (await t("fila-factura").innerText()).includes("0001-00000101"));
  await t("filtro-todas").click();
  await t("buscar-factura").fill("belgrano");
  check("R3.4d", "El buscador encuentra por lugar de entrega", (await t("fila-factura").count()) === 1 && (await t("fila-factura").innerText()).includes("0001-00000102"));
  await t("buscar-factura").fill("");
  await t("filtro-pendientes").click();
  await abrirDias();

  // ---------- R3.1 / R3.2: cargar factura ----------
  await t("btn-nueva-factura").click();
  await t("factura-guardar").click();
  await pausa(150);
  check("R3.1a", "No deja guardar una factura sin monto", (await t("factura-error").count()) === 1);

  await t("factura-numero").fill("0001-00000103");
  await t("factura-monto").fill("60000");
  await t("factura-guardar").click();
  await pausa(150);
  check("R3.2", "Avisa que el número de factura ya existe y no la guarda",
    (await t("factura-error").count()) === 1 && (await texto("factura-error")).includes("Ya hay") && (await teDebe()) === 370000,
    (await t("factura-error").count()) ? await texto("factura-error") : "sin error");

  await t("factura-numero").fill("0001-00000104");
  await t("factura-orden").fill("OC 70/2026");
  await t("factura-lugar").fill("Escuela Rivadavia");
  await t("factura-detalle").fill("Módulos septiembre");
  await t("factura-guardar").click();
  await pausa();
  await abrirDias();
  check("R3.1b", `Cargar una factura de ${plata(60000)} sube la deuda a ${plata(430000)}`,
    (await teDebe()) === 430000 && (await t("form-factura").count()) === 0, await texto("kpi-te-debe"));
  check("R3.1c", "La factura nueva aparece con sus datos",
    (await filaFactura("0001-00000104").count()) === 1 && (await filaFactura("0001-00000104").innerText()).includes("Escuela Rivadavia"));

  // ---------- R3.6: editar (ponerle número a la que no tenía) ----------
  await page.locator('[data-test="fila-factura"]', { hasText: "sin número" }).locator('[data-test="btn-editar-factura"]').click();
  await t("factura-numero").fill("0001-00000105");
  await t("factura-guardar").click();
  await pausa();
  await abrirDias();
  check("R3.6", "Editar le agrega el número a la factura sin número, sin tocar la deuda",
    (await filaFactura("0001-00000105").count()) === 1 && (await page.locator('[data-test="fila-factura"]', { hasText: "sin número" }).count()) === 0 && (await teDebe()) === 430000);

  // ---------- R3.7 / R4.1 / R4.4: cobrar una factura ----------
  await filaFactura("0001-00000103").locator('[data-test="btn-cobrar"]').click();
  await page.waitForSelector('[data-test="modal-cobro"]');
  check("R3.7a", `El cobro abre con el saldo precargado (${plata(180000)})`, Number(await t("cobro-monto").inputValue()) === 180000, await t("cobro-monto").inputValue());
  const tildadas = await page.locator('[data-test="cobro-factura-check"]:checked').count();
  check("R3.7b", "…y con esa factura ya tildada", tildadas === 1 && (await t("cobro-factura").first().innerText()).includes("0001-00000103"));

  await t("cobro-monto").fill("175000");
  await t("cobro-retenciones").fill("5000");
  check("R4.1", `Muestra el total del cobro = cobrado + retenciones (${plata(180000)})`, num(await texto("cobro-total")) === 180000, await texto("cobro-total"));

  await t("cobro-factura-monto").first().fill("999999");
  await t("cobro-guardar").click();
  await pausa(150);
  check("R4.4a", "No deja aplicar más que el saldo de la factura", (await t("cobro-error").count()) === 1,
    (await t("cobro-error").count()) ? await texto("cobro-error") : "sin error");
  await page.screenshot({ path: path.join(OUT, "municipalidad-modal-cobro-desktop.png") });

  await t("cobro-factura-monto").first().fill("180000");
  await t("cobro-comprobante").fill("OP 1400");
  await t("cobro-guardar").click();
  await pausa();
  await abrirDias();
  check("R4.1b", `El cobro cancela la factura: te debe baja a ${plata(250000)}`,
    (await t("modal-cobro").count()) === 0 && (await teDebe()) === 250000, await texto("kpi-te-debe"));
  check("R3.3c", "La factura cobrada sale de la lista de pendientes", (await filaFactura("0001-00000103").count()) === 0);

  // ---------- R4.6 / R4.3: aplicar lo que quedó sin aplicar ----------
  check("R4.6a", `Avisa que hay ${plata(50000)} sin aplicar`, (await texto("aviso-sin-aplicar")).includes(plata(50000)));
  await t("btn-repartir-todo").click();
  await pausa();
  await abrirDias();
  const saldo102 = num(await filaFactura("0001-00000102").locator('[data-test="factura-saldo"]').innerText());
  check("R4.3a", `FIFO: los ${plata(50000)} van a la más vieja (102 queda debiendo ${plata(100000)})`, saldo102 === 100000, saldo102);
  check("R4.6b", "Ya no queda nada sin aplicar y la deuda no cambia",
    (await t("kpi-sin-aplicar").count()) === 0 && (await t("aviso-sin-aplicar").count()) === 0 && (await teDebe()) === 250000);

  // ---------- R4.5: tabla de cobros y deshacer ----------
  await t("tab-cobros").click();
  await page.waitForSelector('[data-test="fila-cobro"]');
  check("R4.5a", "La pestaña Cobros lista los 3 cobros", (await t("fila-cobro").count()) === 3);
  const filaOP1400 = page.locator('[data-test="fila-cobro"]', { hasText: "OP 1400" });
  check("R4.5b", "El cobro nuevo muestra retenciones y la factura que cancela",
    (await filaOP1400.innerText()).includes(plata(5000)) && (await filaOP1400.innerText()).includes("0001-00000103"),
    (await filaOP1400.innerText()).replace(/\s+/g, " "));
  // OP 1301 ya cubría $100.000 de la 102 y "Aplicar a las más viejas" le sumó $50.000 a la misma
  // factura. En la base son dos filas: la pantalla tiene que mostrarlas como una sola.
  const chips1301 = await page.locator('[data-test="fila-cobro"]', { hasText: "OP 1301" }).locator('[data-test="chip-aplicacion"]').allInnerTexts();
  check("R4.5d", `Dos aplicaciones del mismo cobro a la misma factura se ven como una (${plata(150000)})`,
    chips1301.length === 1 && chips1301[0].includes(plata(150000)), chips1301.join(" | "));
  await page.screenshot({ path: path.join(OUT, "municipalidad-cobros-desktop.png"), fullPage: true });

  await filaOP1400.locator('[data-test="btn-desimputar"]').click();
  await pausa();
  check("R4.5c", `Deshacer la aplicación deja ${plata(180000)} sin aplicar y el cobro con botón Aplicar`,
    num(await texto("kpi-sin-aplicar")) === 180000 && (await filaOP1400.locator('[data-test="btn-aplicar-cobro"]').count()) === 1,
    (await t("kpi-sin-aplicar").count()) ? await texto("kpi-sin-aplicar") : "no hay sin aplicar");

  await filaOP1400.locator('[data-test="btn-aplicar-cobro"]').click();
  await pausa();
  // Pendientes por antigüedad: 102 (saldo 100.000), 103 (180.000), 105, 104 → 100.000 a la 102 y 80.000 a la 103.
  const chipsOP = await filaOP1400.locator('[data-test="chip-aplicacion"]').allInnerTexts();
  check("R4.6c", "Aplicar reparte el cobro de la factura más vieja a la más nueva",
    chipsOP.length === 2 && chipsOP.some((c) => c.includes("0001-00000102") && c.includes(plata(100000))) && chipsOP.some((c) => c.includes("0001-00000103") && c.includes(plata(80000))),
    chipsOP.join(" | "));
  check("R6.4b", "La deuda no cambia al re-aplicar", (await teDebe()) === 250000, await texto("kpi-te-debe"));

  // ---------- R4.2 / R4.3: cobro general repartido en el modal ----------
  await t("btn-nuevo-cobro").click();
  await page.waitForSelector('[data-test="modal-cobro"]');
  check("R4.2a", "El cobro general arranca sin facturas tildadas", (await page.locator('[data-test="cobro-factura-check"]:checked').count()) === 0);
  await t("cobro-monto").fill("150000");
  await t("cobro-repartir").click();
  const montos = await page.locator('[data-test="cobro-factura-monto"]').evaluateAll((els) => els.map((e) => Number(e.value)));
  // Pendientes: 103 (saldo 100.000), 105 (90.000), 104 (60.000) → 100.000 + 50.000.
  check("R4.3b", "Repartir automático llena de la más vieja a la más nueva sin pasarse", montos.join() === "100000,50000", montos.join());

  await page.locator('[data-test="cobro-factura-check"]').nth(1).uncheck();
  check("R4.4b", `Al destildar avisa que quedan ${plata(50000)} sin aplicar`, (await texto("cobro-restante")).includes(plata(50000)), await texto("cobro-restante"));
  await t("cobro-guardar").click();
  await pausa();
  check("R4.4c", `El sobrante queda sin aplicar (${plata(50000)}) y la deuda baja a ${plata(100000)}`,
    (await teDebe()) === 100000 && num(await texto("kpi-sin-aplicar")) === 50000, `${await texto("kpi-te-debe")} / ${await texto("kpi-sin-aplicar")}`);

  // ---------- R4.7 / R3.8: eliminar ----------
  const cobrosAntes = await t("fila-cobro").count();
  await page.locator('[data-test="fila-cobro"]', { hasText: "OP 1301" }).locator('[data-test="btn-eliminar-cobro"]').click();
  await page.getByRole("button", { name: "Cancelar" }).last().click();
  check("R4.7a", "Cancelar la confirmación no borra el cobro", (await t("fila-cobro").count()) === cobrosAntes);
  await page.locator('[data-test="fila-cobro"]', { hasText: "OP 1301" }).locator('[data-test="btn-eliminar-cobro"]').click();
  await page.getByRole("button", { name: "Confirmar" }).click();
  await pausa();
  check("R4.7b", `Eliminar el cobro de ${plata(150000)} (con confirmación) sube la deuda a ${plata(250000)}`,
    (await t("fila-cobro").count()) === cobrosAntes - 1 && (await teDebe()) === 250000, await texto("kpi-te-debe"));

  await t("tab-facturas").click();
  await t("filtro-todas").click();
  await abrirDias();
  await filaFactura("0001-00000104").locator('[data-test="btn-eliminar-factura"]').click();
  await page.getByRole("button", { name: "Confirmar" }).click();
  await pausa();
  check("R3.8", `Eliminar la factura de ${plata(60000)} baja la deuda a ${plata(190000)}`,
    (await filaFactura("0001-00000104").count()) === 0 && (await teDebe()) === 190000, await texto("kpi-te-debe"));

  await t("filtro-pendientes").click();
  await abrirDias();
  check("R6.4c", "Al final sigue cuadrando: te debe = Σ saldos − sin aplicar",
    (await teDebe()) === num(await texto("total-saldo")) - ((await t("kpi-sin-aplicar").count()) ? num(await texto("kpi-sin-aplicar")) : 0),
    `${await teDebe()} = ${await texto("total-saldo")} − ${(await t("kpi-sin-aplicar").count()) ? await texto("kpi-sin-aplicar") : 0}`);

  // ---------- R6.5: móvil ----------
  const mobile = await ctx.newPage();
  mobile.on("pageerror", (e) => errores.push(String(e)));
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(URL, { waitUntil: "domcontentloaded" });
  await mobile.waitForSelector('[data-test="tarjeta-factura"]');
  const desborde = () => mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

  check("R6.5a", "En móvil la página no se desborda a lo ancho", (await desborde()) <= 1, `${await desborde()}px`);

  // R6.5g: las solapas por día también en tarjetas, y sin desbordar el encabezado.
  const cabsMovil = mobile.locator('[data-test="tarjeta-cabecera-dia"]');
  const cajaCab = await cabsMovil.first().boundingBox();
  check("R6.5g", "En móvil hay 2 solapas por día, con sólo la más nueva abierta y sin desbordar",
    (await cabsMovil.count()) === 2 &&
      (await cabsMovil.evaluateAll((els) => els.map((e) => e.getAttribute("aria-expanded")).join())) === "true,false" &&
      (await mobile.locator('[data-test="tarjeta-factura"]').count()) === 2 &&
      !!cajaCab && cajaCab.x >= 0 && cajaCab.x + cajaCab.width <= 390,
    JSON.stringify(cajaCab));
  await mobile.screenshot({ path: path.join(OUT, "municipalidad-dias-movil.png"), fullPage: true });
  await abrirDias(mobile, "tarjeta-cabecera-dia");

  const tarjetas = mobile.locator('[data-test="tarjeta-factura"]');
  check("R6.5e", "En móvil las facturas se ven como tarjetas, no como tabla",
    (await tarjetas.count()) === 3 && !(await mobile.locator('[data-test="fila-factura"]').first().isVisible()), `${await tarjetas.count()} tarjetas`);
  const saldoBox = await tarjetas.first().locator('[data-test="tarjeta-factura-saldo"]').boundingBox();
  const cobrarBox = await tarjetas.first().locator('[data-test="tarjeta-btn-cobrar"]').boundingBox();
  check("R6.5f", "El saldo y el botón Cobrar quedan dentro del ancho del teléfono",
    saldoBox && cobrarBox && saldoBox.x + saldoBox.width <= 390 && cobrarBox.x + cobrarBox.width <= 390,
    JSON.stringify({ saldoBox, cobrarBox }));
  await mobile.screenshot({ path: path.join(OUT, "municipalidad-facturas-movil.png"), fullPage: true });

  await mobile.locator('[data-test="btn-nueva-factura"]').click();
  check("R6.5b", "El formulario de factura entra en móvil", (await desborde()) <= 1, `${await desborde()}px`);
  await mobile.screenshot({ path: path.join(OUT, "municipalidad-form-factura-movil.png"), fullPage: true });
  await mobile.getByRole("button", { name: "Cancelar" }).first().click();

  await mobile.locator('[data-test="tarjeta-btn-cobrar"]').first().click();
  await mobile.waitForSelector('[data-test="modal-cobro"]');
  const modalBox = await mobile.locator('[data-test="modal-cobro"]').boundingBox();
  check("R6.5c", "El modal de cobro entra en el ancho del teléfono",
    (await desborde()) <= 1 && modalBox && modalBox.x >= 0 && modalBox.x + modalBox.width <= 390, JSON.stringify(modalBox));
  await mobile.screenshot({ path: path.join(OUT, "municipalidad-modal-cobro-movil.png") });
  await mobile.locator('[data-test="modal-cobro"]').getByRole("button", { name: "Cancelar" }).click();

  await mobile.locator('[data-test="tab-cobros"]').click();
  check("R6.5d", "La pestaña Cobros no desborda en móvil y muestra tarjetas",
    (await desborde()) <= 1 && (await mobile.locator('[data-test="tarjeta-cobro"]').count()) === 2 && (await mobile.locator('[data-test="tarjeta-cobro"]').first().isVisible()),
    `${await desborde()}px`);
  await mobile.screenshot({ path: path.join(OUT, "municipalidad-cobros-movil.png"), fullPage: true });

  check("R6.2", "Sin errores de JavaScript en consola", errores.length === 0, errores.join(" | ").slice(0, 300));

  // El informe va antes de cerrar: en esta máquina el close() de Edge headless tarda minutos.
  browser.close().catch(() => {});

  const fallidos = results.filter((r) => !r.ok);
  console.log("\n=== Verificación de cobranzas de la Municipalidad ===\n");
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
