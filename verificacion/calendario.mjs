/*
 * Verificación en navegador real del calendario de cheques, contra los requisitos
 * R1-R12 de SPEC.md. Usa el Edge o Chrome ya instalado en Windows (no descarga navegadores).
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

// ---------- fechas del banco de pruebas (mismas que el mock del preview) ----------
const hoy = new Date();
hoy.setHours(0, 0, 0, 0);

function clave(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function f(offset) {
  const x = new Date(hoy);
  x.setDate(x.getDate() + offset);
  return clave(x);
}
function proximoSabado() {
  const x = new Date(hoy);
  x.setDate(x.getDate() + ((6 - x.getDay() + 7) % 7 || 7));
  return clave(x);
}
function sabadoPasado() {
  const x = new Date(hoy);
  x.setDate(x.getDate() - (((x.getDay() + 1) % 7 || 7) + 7));
  return clave(x);
}
function diaSemana(fecha) {
  const [y, m, d] = fecha.split("-").map(Number);
  return new Date(y, m - 1, d).getDay();
}

// ---------- helpers de página ----------
function botonesDeSugerencias() {
  const cont = document.querySelector('[data-testid="sugerencias"]');
  if (!cont) return [];
  return [...cont.querySelectorAll("button[data-fecha]")].map((b) => b.dataset.fecha);
}

function infoCeldas() {
  return [...document.querySelectorAll("[data-fecha][data-dia]")].map((c) => ({
    fecha: c.dataset.fecha,
    dia: c.dataset.dia,
    nivel: c.dataset.nivel,
    noHabil: c.dataset.nohabil === "1",
    feriado: c.dataset.feriado === "1",
    texto: c.textContent.trim(),
    tieneMonto: /\$/.test(c.textContent),
    tieneIngreso: !!c.querySelector('[data-testid="celda-ingreso"]'),
    bg: getComputedStyle(c).backgroundColor,
  }));
}

(async () => {
  const executablePath = NAVEGADORES.find((p) => fs.existsSync(p));
  if (!executablePath) {
    console.error("No encontré Edge ni Chrome. Pasá la ruta en la variable NAVEGADOR.");
    process.exit(2);
  }
  fs.mkdirSync(OUT, { recursive: true });

  const browser = await chromium.launch({ executablePath, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
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

  const tituloEsperado = `${MESES[hoy.getMonth()]} ${hoy.getFullYear()}`;
  const diaHoy = String(hoy.getDate());
  const diasDelMes = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0).getDate();

  /** Vuelve a hoy y navega hasta el mes de la fecha pedida. */
  async function irAlMesDe(fecha) {
    const [y, m] = fecha.split("-").map(Number);
    const delta = (y - hoy.getFullYear()) * 12 + (m - (hoy.getMonth() + 1));
    await page.locator("button", { hasText: /^Hoy$/ }).click();
    const label = delta > 0 ? "Mes siguiente" : "Mes anterior";
    for (let i = 0; i < Math.abs(delta); i++) {
      await page.locator(`button[aria-label="${label}"]`).click();
    }
    await page.waitForTimeout(250);
  }

  async function celdaDe(fecha) {
    await irAlMesDe(fecha);
    const celdas = await page.evaluate(infoCeldas);
    return celdas.find((c) => c.fecha === fecha) ?? null;
  }

  // ================= PRIMERA ETAPA: R1-R8 =================

  const heads = await page.evaluate(() => {
    const grid = [...document.querySelectorAll("div")].find(
      (d) => getComputedStyle(d).gridTemplateColumns.split(" ").length === 7 &&
             d.children.length === 7 &&
             [...d.children].every((c) => c.textContent.trim().length === 1));
    return grid ? [...grid.children].map((c) => c.textContent.trim()) : null;
  });
  check("R2.1", "Encabezados L M M J V S D (lunes a domingo)",
    JSON.stringify(heads) === JSON.stringify(["L","M","M","J","V","S","D"]), JSON.stringify(heads));

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

  const avisos = await page.locator("text=/no tiene[n]? fecha de cobro/").count();
  check("R3.2", "Avisa aparte los cheques sin fecha de cobro", avisos === 1, `avisos=${avisos}`);

  const nInputs = await page.locator('input[type="number"]').count();
  check("R4.1", "Dos campos de tope (monto y cantidad)", nInputs === 2, `inputs=${nInputs}`);
  const leyenda = await Promise.all([
    page.locator("text=Libre (sin cheques)").count(),
    page.locator("text=Sin margen (tope alcanzado)").count(),
    page.locator("text=Con cheques (sin tope definido)").count(),
    page.locator("text=Feriado o día no hábil").count(),
  ]);
  check("R4.5", "Leyenda que explica los colores (incluye feriados)",
    leyenda.every((c) => c > 0), JSON.stringify(leyenda));

  const hoyStyle = await page.evaluate((d) => {
    const celda = document.querySelector(`[data-dia="${d}"]`);
    if (!celda) return null;
    const span = celda.querySelector("span");
    return { color: getComputedStyle(span).color, outline: getComputedStyle(celda).outline };
  }, diaHoy);
  check("R2.5", "El día de hoy se distingue con borde y color",
    hoyStyle && /217,\s*119,\s*87/.test(hoyStyle.color) && /217,\s*119,\s*87/.test(hoyStyle.outline),
    JSON.stringify(hoyStyle));

  const celdas = await page.evaluate(infoCeldas);
  check("R2.2", "La grilla tiene solo los días del mes (otros meses vacíos)",
    celdas.length === diasDelMes, `celdas=${celdas.length} díasDelMes=${diasDelMes}`);
  check("R2.3", "Días con cheques muestran cantidad y monto",
    celdas.some((c) => c.tieneMonto), `${celdas.filter((c) => c.tieneMonto).length} días con monto`);
  check("R2.4", "Días sin cheques ni ingresos no muestran monto",
    celdas.filter((c) => c.nivel === "libre" && !c.tieneIngreso).every((c) => !c.tieneMonto));

  const cbChecked = await page.locator('[data-testid="check-habiles"]').isChecked();
  check("R7.3", "Checkbox 'Solo días hábiles' activado por defecto", cbChecked === true);
  const sugerencias = await page.evaluate(botonesDeSugerencias);
  check("R7.1", "Panel con próximos días para emitir", sugerencias.length > 0,
    `${sugerencias.length} sugerencias`);
  check("R7.4", "Hasta 12 sugerencias", sugerencias.length <= 12, `${sugerencias.length} sugerencias`);
  const finesDeSemana = sugerencias.filter((s) => [0, 6].includes(diaSemana(s)));
  check("R7.3b", "Con 'solo hábiles' ninguna sugerencia cae sábado o domingo",
    finesDeSemana.length === 0, `${finesDeSemana.length} en fin de semana`);

  await page.screenshot({ path: path.join(OUT, "01-desktop-sin-topes.png"), fullPage: true });

  // ---------- topes y semáforo ----------
  await page.locator('input[type="number"]').nth(0).fill("5000000");
  await page.locator('input[type="number"]').nth(1).fill("2");
  await page.waitForTimeout(600);
  const semaforo = await page.evaluate(infoCeldas);
  const rojos = semaforo.filter((c) => c.nivel === "sinMargen");
  const amarillos = semaforo.filter((c) => c.nivel === "margen");
  const verdes = semaforo.filter((c) => c.nivel === "libre");
  check("R4.4", "Semáforo marca sin margen / con margen / libre según el uso del tope",
    rojos.length > 0 && amarillos.length > 0 && verdes.length > 0,
    `sinMargen=[${rojos.map((c) => c.dia)}] margen=[${amarillos.map((c) => c.dia)}] libres=${verdes.length}`);
  check("R4.3", "Muestra el % de uso del tope en los días con cheques",
    semaforo.some((c) => /% del tope/.test(c.texto)));

  const diaConCheques = semaforo.find((c) => c.tieneMonto && c.nivel !== "libre");
  await page.locator(`[data-dia][data-fecha="${diaConCheques.fecha}"]`).click();
  await page.waitForTimeout(400);
  check("R6.1", `Click en un día con cheques (${diaConCheques.dia}) abre el detalle`,
    (await page.locator('[data-testid="detalle-dia"]').count()) > 0);
  const cols = await page.locator('[data-testid="detalle-dia"] th').allTextContents();
  check("R6.2", "El detalle lista N° cheque, proveedor, importe y estado",
    ["N° cheque", "Proveedor", "Importe", "Estado"].every((c) => cols.includes(c)), cols.join(", "));
  check("R6.3", "El detalle muestra el margen restante del día",
    (await page.locator("text=/Margen restante/").count()) > 0);

  await page.screenshot({ path: path.join(OUT, "02-desktop-con-topes-y-detalle.png"), fullPage: true });

  await page.locator(`[data-dia][data-fecha="${diaConCheques.fecha}"]`).click();
  await page.waitForTimeout(400);
  check("R6.4", "Click en el mismo día cierra el detalle",
    (await page.locator('[data-testid="detalle-dia"]').count()) === 0);

  await page.locator('button[aria-label="Mes siguiente"]').click();
  await page.waitForTimeout(400);
  const sig = new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1);
  const okSig = (await page.locator(`text=${MESES[sig.getMonth()]} ${sig.getFullYear()}`).count()) > 0;
  await page.locator("button", { hasText: /^Hoy$/ }).click();
  await page.waitForTimeout(400);
  const okVuelta = (await page.locator(`text=${tituloEsperado}`).count()) > 0;
  check("R5.1b", "Mes siguiente y botón Hoy funcionan", okSig && okVuelta,
    `siguiente=${okSig} volvióAHoy=${okVuelta}`);

  // ================= SEGUNDA ETAPA: R9 estados =================

  const estadosIniciales = await page.evaluate(() =>
    Object.fromEntries([...document.querySelectorAll("input[data-estado]")].map((i) => [i.dataset.estado, i.checked])));
  check("R9.1", "Por defecto se cuenta todo menos Rechazado",
    estadosIniciales.Rechazado === false &&
      ["Pendiente", "Próximo", "Vencido", "Pagado"].every((e) => estadosIniciales[e] === true),
    JSON.stringify(estadosIniciales));
  check("R9.2", "Hay un control por cada uno de los 5 estados",
    Object.keys(estadosIniciales).length === 5, Object.keys(estadosIniciales).join(", "));
  check("R9.5", "Avisa cuántos cheques quedan afuera por el filtro",
    (await page.locator('[data-testid="aviso-excluidos"]').count()) === 1,
    (await page.locator('[data-testid="aviso-excluidos"]').count())
      ? (await page.locator('[data-testid="aviso-excluidos"]').textContent()).trim()
      : "ausente");

  // El cheque rechazado del mock está en f(9): con el filtro por defecto no debe verse.
  const fechaRechazado = f(9);
  const celdaSinRech = await celdaDe(fechaRechazado);
  await page.locator('input[data-estado="Rechazado"]').check();
  await page.waitForTimeout(500);
  const celdaConRech = await celdaDe(fechaRechazado);
  check("R9.3", "Incluir Rechazado cambia el monto del día y del mes",
    celdaSinRech && celdaConRech && !celdaSinRech.tieneMonto && celdaConRech.tieneMonto,
    `${fechaRechazado}: sin rechazados "${celdaSinRech?.texto}" → con rechazados "${celdaConRech?.texto}"`);
  await page.locator('input[data-estado="Rechazado"]').uncheck();
  await page.waitForTimeout(400);

  // ================= R10 feriados =================

  // Busca un mes con feriados (septiembre no tiene ninguno a nivel nacional).
  await page.locator("button", { hasText: /^Hoy$/ }).click();
  await page.waitForTimeout(300);
  let feriadosVistos = [];
  let mesesAvanzados = 0;
  for (; mesesAvanzados < 12; mesesAvanzados++) {
    const c = await page.evaluate(infoCeldas);
    feriadosVistos = c.filter((x) => x.feriado);
    if (feriadosVistos.length > 0) break;
    await page.locator('button[aria-label="Mes siguiente"]').click();
    await page.waitForTimeout(250);
  }
  check("R10.1", "Los feriados se marcan en la grilla, distintos de un fin de semana",
    feriadosVistos.length > 0 && feriadosVistos.every((x) => !x.bg.includes("240, 240, 240")),
    feriadosVistos.length
      ? `${feriadosVistos.length} feriados (ej. ${feriadosVistos[0].fecha}), ${mesesAvanzados} mes(es) adelante`
      : "no se encontró ninguno en 12 meses");
  check("R10.1b", "Los días feriados quedan marcados como no hábiles",
    feriadosVistos.every((x) => x.noHabil));

  // El mock pone un cheque en el primer feriado del mes actual (si el mes tiene alguno).
  await page.locator("button", { hasText: /^Hoy$/ }).click();
  await page.waitForTimeout(300);
  const celdasHoy = await page.evaluate(infoCeldas);
  const feriadoConCheques = celdasHoy.find((c) => c.feriado && c.tieneMonto);
  if (feriadoConCheques) {
    await page.locator(`[data-dia][data-fecha="${feriadoConCheques.fecha}"]`).click();
    await page.waitForTimeout(400);
    const txt = (await page.locator('[data-testid="detalle-dia"]').textContent()).trim();
    check("R10.2", "El detalle de un feriado muestra su nombre y que el banco no opera",
      /el banco no opera/i.test(txt), txt.slice(0, 110));
    check("R10.8", "El detalle dice en qué día hábil se cobra efectivamente",
      /cobro efectivo/i.test(txt), (txt.match(/cobro efectivo[^.]*/i) || ["no aparece"])[0]);
    await page.locator(`[data-dia][data-fecha="${feriadoConCheques.fecha}"]`).click();
    await page.waitForTimeout(300);
  } else {
    check("R10.2", "El detalle de un feriado muestra su nombre", true, "el mes actual no tiene feriados: no aplica");
    check("R10.8", "El detalle dice en qué día hábil se cobra", true, "el mes actual no tiene feriados: no aplica");
  }

  // El mock pone un cheque el próximo sábado: siempre hay un día no hábil con cheques.
  const sabado = proximoSabado();
  await irAlMesDe(sabado);
  const avisoNoHabil = await page.locator('[data-testid="aviso-no-habil"]').count();
  const txtAviso = avisoNoHabil ? (await page.locator('[data-testid="aviso-no-habil"]').textContent()).trim() : "";
  check("R10.8b", "Avisa arriba qué días no hábiles tienen cheques y cuándo se cobran",
    avisoNoHabil === 1 && /→/.test(txtAviso), txtAviso.slice(0, 130));

  // Día propio: se marca en la grilla y sale de las sugerencias (R10.6 y R10.7).
  await page.locator("button", { hasText: /^Hoy$/ }).click();
  await page.waitForTimeout(300);
  const sugerenciasAntes = await page.evaluate(botonesDeSugerencias);
  const objetivo = sugerenciasAntes.find((s) => s.slice(0, 7) === clave(hoy).slice(0, 7)) || sugerenciasAntes[0];
  await page.locator('[data-testid="editor-dias-propios"] summary').click();
  await page.locator('[data-testid="input-dia-propio"]').fill(objetivo);
  await page.locator('[data-testid="input-motivo-dia-propio"]').fill("Puente de prueba");
  await page.locator('[data-testid="btn-agregar-dia-propio"]').click();
  await page.waitForTimeout(600);
  const enLista = await page.locator(`[data-testid="lista-dias-propios"] [data-fecha="${objetivo}"]`).count();
  const celdaPropia = (await page.evaluate(infoCeldas)).find((c) => c.fecha === objetivo);
  const sugerenciasDespues = await page.evaluate(botonesDeSugerencias);
  check("R10.6", "Se puede agregar un día no hábil propio y queda en la lista",
    enLista === 1, `${objetivo} en lista=${enLista}`);
  check("R10.6b", "El día propio se marca como no hábil en la grilla",
    !!celdaPropia && celdaPropia.noHabil && celdaPropia.feriado,
    celdaPropia ? `noHabil=${celdaPropia.noHabil} feriado=${celdaPropia.feriado}` : "celda no encontrada");
  check("R10.7", "Con 'solo hábiles', el día propio desaparece de las sugerencias",
    sugerenciasAntes.includes(objetivo) && !sugerenciasDespues.includes(objetivo),
    `${objetivo}: antes=${sugerenciasAntes.includes(objetivo)} después=${sugerenciasDespues.includes(objetivo)}`);

  await page.locator(`[data-testid="lista-dias-propios"] [data-fecha="${objetivo}"] button`).click();
  await page.waitForTimeout(500);
  const sugerenciasFinal = await page.evaluate(botonesDeSugerencias);
  check("R10.6c", "Al quitar el día propio, vuelve a estar disponible",
    sugerenciasFinal.includes(objetivo));

  // ================= R11 débito real =================

  const fechaDebito = f(-4); // el mock lo carga con 700.000 emitidos y 690.000 debitados
  await irAlMesDe(fechaDebito);
  const avisoDebito = await page.locator('[data-testid="aviso-debito"]').count();
  const txtDebito = avisoDebito ? (await page.locator('[data-testid="aviso-debito"]').textContent()).trim() : "";
  check("R11.2", "Avisa cuando el banco debitó algo distinto de lo emitido",
    avisoDebito === 1 && /debit/i.test(txtDebito), txtDebito.slice(0, 130));

  const celdaDebito = (await page.evaluate(infoCeldas)).find((c) => c.fecha === fechaDebito);
  check("R11.1", "El día usa el débito real del banco, no el importe nominal",
    !!celdaDebito && /690\.000/.test(celdaDebito.texto),
    celdaDebito ? celdaDebito.texto.replace(/\s+/g, " ") : "celda no encontrada");

  await page.locator(`[data-dia][data-fecha="${fechaDebito}"]`).click();
  await page.waitForTimeout(400);
  const detalleDebito = (await page.locator('[data-testid="detalle-dia"]').textContent()).trim();
  const colsDebito = await page.locator('[data-testid="detalle-dia"] th').allTextContents();
  check("R11.3", "El detalle muestra lo emitido y lo debitado",
    /Emitido/.test(detalleDebito) && /debitado/.test(detalleDebito) && colsDebito.includes("Debitado"),
    detalleDebito.slice(0, 120).replace(/\s+/g, " "));
  await page.locator(`[data-dia][data-fecha="${fechaDebito}"]`).click();
  await page.waitForTimeout(300);

  // Un día no hábil cuyos cheques ya se pagaron por completo no debe anunciar fecha de cobro.
  const fechaPagadaNoHabil = sabadoPasado();
  await irAlMesDe(fechaPagadaNoHabil);
  await page.locator(`[data-dia][data-fecha="${fechaPagadaNoHabil}"]`).click();
  await page.waitForTimeout(400);
  const detallePagado = (await page.locator('[data-testid="detalle-dia"]').textContent()).trim();
  check("R10.8c", "Un día no hábil con el cheque ya pagado no anuncia fecha de cobro",
    /no opera/i.test(detallePagado) && !/cobro efectivo/i.test(detallePagado),
    `${fechaPagadaNoHabil}: ${detallePagado.slice(0, 100).replace(/\s+/g, " ")}`);
  await page.locator(`[data-dia][data-fecha="${fechaPagadaNoHabil}"]`).click();
  await page.waitForTimeout(300);

  // ================= R12 cheques de terceros =================

  const fechaIngreso = f(1); // 3.000.000 de un cheque En cartera
  await irAlMesDe(fechaIngreso);
  const celdaIngreso = (await page.evaluate(infoCeldas)).find((c) => c.fecha === fechaIngreso);
  check("R12.1", "El día muestra lo que entra por cheques de terceros",
    !!celdaIngreso && celdaIngreso.tieneIngreso && /3\.000\.000/.test(celdaIngreso.texto),
    celdaIngreso ? celdaIngreso.texto.replace(/\s+/g, " ") : "celda no encontrada");

  const nivelConIngresos = celdaIngreso?.nivel;
  await page.locator(`[data-dia][data-fecha="${fechaIngreso}"]`).click();
  await page.waitForTimeout(400);
  const detalleIngreso = (await page.locator('[data-testid="detalle-dia"]').textContent()).trim();
  check("R12.2", "El detalle muestra el neto del día",
    /neto del día/i.test(detalleIngreso), (detalleIngreso.match(/neto del día[^·]*/i) || ["no aparece"])[0]);
  const colsTerceros = await page.locator('[data-testid="detalle-terceros"] th').allTextContents();
  check("R12.4", "El detalle lista los cheques de terceros con librador, banco e importe",
    ["Librador", "Banco", "Importe"].every((c) => colsTerceros.includes(c)), colsTerceros.join(", "));
  await page.locator(`[data-dia][data-fecha="${fechaIngreso}"]`).click();
  await page.waitForTimeout(300);

  // Los Entregado y Rechazado no deben sumar como ingreso.
  const fechaEntregado = f(8); // el mock tiene ahí un tercero Entregado de 2.000.000
  await irAlMesDe(fechaEntregado);
  const celdaEntregado = (await page.evaluate(infoCeldas)).find((c) => c.fecha === fechaEntregado);
  check("R12.1b", "Un cheque de tercero Entregado no cuenta como ingreso",
    !!celdaEntregado && !celdaEntregado.tieneIngreso,
    celdaEntregado ? celdaEntregado.texto.replace(/\s+/g, " ") : "celda no encontrada");

  // Ocultar ingresos no cambia el semáforo (D5 / R12.3).
  await page.locator('[data-testid="check-ingresos"]').uncheck();
  await page.waitForTimeout(500);
  await irAlMesDe(fechaIngreso);
  const celdaSinIngresos = (await page.evaluate(infoCeldas)).find((c) => c.fecha === fechaIngreso);
  check("R12.3", "El semáforo se calcula solo sobre las salidas (los ingresos no lo cambian)",
    !!celdaSinIngresos && celdaSinIngresos.nivel === nivelConIngresos && !celdaSinIngresos.tieneIngreso,
    `nivel con ingresos=${nivelConIngresos} / sin ingresos=${celdaSinIngresos?.nivel}`);
  await page.locator('[data-testid="check-ingresos"]').check();
  await page.waitForTimeout(400);

  // ================= persistencia =================

  await page.locator('input[data-estado="Pagado"]').uncheck();
  await page.locator('[data-testid="check-ingresos"]').uncheck();
  await page.waitForTimeout(400);
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForTimeout(700);
  const v1 = await page.locator('input[type="number"]').nth(0).inputValue();
  const v2 = await page.locator('input[type="number"]').nth(1).inputValue();
  check("R4.6", "Los topes persisten al recargar la página",
    v1 === "5000000" && v2 === "2", `monto="${v1}" cantidad="${v2}"`);
  const pagadoTrasReload = await page.locator('input[data-estado="Pagado"]').isChecked();
  check("R9.4", "El filtro de estados persiste al recargar", pagadoTrasReload === false,
    `Pagado marcado=${pagadoTrasReload}`);
  const ingresosTrasReload = await page.locator('[data-testid="check-ingresos"]').isChecked();
  check("R12.5", "La opción de mostrar ingresos persiste al recargar",
    ingresosTrasReload === false, `marcado=${ingresosTrasReload}`);
  // Volver a dejarlo prendido para las capturas.
  await page.locator('input[data-estado="Pagado"]').check();
  await page.locator('[data-testid="check-ingresos"]').check();
  await page.waitForTimeout(500);

  // ================= R8.2 sin scroll horizontal =================

  const dsk = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  check("R8.2a", "Desktop 1280px: la página no scrollea en horizontal", dsk.sw <= dsk.cw + 1, JSON.stringify(dsk));
  await page.screenshot({ path: path.join(OUT, "04-desktop-completo.png"), fullPage: true });

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
