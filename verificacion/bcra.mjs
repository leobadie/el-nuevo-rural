/*
 * Verificación en navegador real de la pestaña Verificación, contra SPEC-verificacion.md.
 *
 * Uso:
 *   1) npm run dev          (en otra terminal)
 *   2) npm run verificar:bcra
 *
 * IMPORTANTE: los checks marcados [API] hacen consultas REALES a la API pública del BCRA.
 * Si el BCRA está caído o no hay internet, esos fallan aunque la app esté bien; el reporte
 * los separa del resto para que se distinga un problema propio de uno ajeno.
 *
 * El CUIT usado es el de YPF S.A. (30-54668997-9), información pública, elegido porque es
 * una empresa grande con deuda bancaria informada y estable en el tiempo.
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const URL_BASE = process.env.URL_BASE || "http://localhost:3000";
const URL = `${URL_BASE}/login/preview-verificacion`;
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "capturas");

const NAVEGADORES = [
  process.env.NAVEGADOR,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);

const CUIT_EMPRESA = "30-54668997-9"; // YPF S.A., dato público
const CUIT_INVALIDO = "30-54668997-8"; // el mismo con el verificador cambiado

const results = [];
function check(id, desc, ok, detail, api = false) {
  results.push({ id, desc, ok: !!ok, detail: detail === undefined ? "" : String(detail), api });
}
function checkApi(id, desc, ok, detail) {
  check(id, desc, ok, detail, true);
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

  /*
   * El 404 de la API del BCRA es la forma en que dice "sin registros" (ver DT2 del SPEC),
   * pero el navegador igual lo escribe en la consola. Se descarta para no confundirlo con
   * un error de la app.
   */
  const errores = [];
  function registrarConsola(m) {
    if (m.type() !== "error") return;
    const url = m.location()?.url || "";
    if (url.includes("api.bcra.gob.ar")) return;
    if (/Failed to load resource/.test(m.text()) && /404/.test(m.text()) && !url) return;
    errores.push(m.text());
  }
  page.on("console", registrarConsola);
  page.on("pageerror", (e) => errores.push("pageerror: " + e.message));

  const resp = await page.goto(URL, { waitUntil: "networkidle", timeout: 90000 });
  check("HTTP", "La página de prueba responde 200", resp.status() === 200, "status " + resp.status());
  if (resp.status() !== 200) {
    console.error(`\nNo pude cargar ${URL}. ¿Está corriendo 'npm run dev'?\n`);
    await browser.close();
    process.exit(2);
  }

  // ---------- V2: validación del CUIT ----------
  await page.locator('[data-testid="input-cuit"]').fill("123");
  await page.locator('[data-testid="btn-consultar"]').click();
  await page.waitForTimeout(400);
  const errCorto = await page.locator('[data-testid="error-cuit"]').textContent().catch(() => "");
  check("V2.2", "Rechaza un CUIT con menos de 11 dígitos e indica el problema",
    /11 dígitos/.test(errCorto || ""), (errCorto || "sin mensaje").trim());
  check("V2.4", "Con el CUIT inválido no muestra resultados",
    (await page.locator('[data-testid="resultado-cuit"]').count()) === 0);

  await page.locator('[data-testid="input-cuit"]').fill(CUIT_INVALIDO);
  await page.locator('[data-testid="btn-consultar"]').click();
  await page.waitForTimeout(400);
  const errDv = await page.locator('[data-testid="error-cuit"]').textContent().catch(() => "");
  check("V2.3", "Rechaza un CUIT con dígito verificador incorrecto",
    /último dígito/.test(errDv || ""), (errDv || "sin mensaje").trim());

  // ---------- V3/V4/V5: consulta real ----------
  await page.locator('[data-testid="input-cuit"]').fill(CUIT_EMPRESA);
  await page.locator('[data-testid="btn-consultar"]').click();
  // La consulta sale a internet: se espera al resultado, no a un tiempo fijo.
  let apiOk = true;
  try {
    await page.locator('[data-testid="resultado-cuit"]').waitFor({ timeout: 45000 });
  } catch {
    apiOk = false;
  }
  checkApi("V2.1", "Acepta el CUIT con guiones y consulta", apiOk,
    apiOk ? `consultó ${CUIT_EMPRESA}` : "no llegó respuesta del BCRA en 45s");

  if (apiOk) {
    const denominacion = (await page.locator('[data-testid="denominacion"]').textContent()).trim();
    checkApi("V3.1", "Muestra la denominación que informa el BCRA",
      /YPF/i.test(denominacion), denominacion);

    const cuitFormateado = await page.locator('[data-testid="resultado-cuit"]').textContent();
    check("V2.5", "Muestra el CUIT formateado con guiones",
      cuitFormateado.includes("30-54668997-9"));

    const errorDeudas = await page.locator('[data-testid="error-deudas"]').count();
    checkApi("V3.2", "Lista las entidades con su situación (sin error)", errorDeudas === 0,
      errorDeudas ? (await page.locator('[data-testid="error-deudas"]').textContent()).trim() : "sin errores");

    const situaciones = await page.evaluate(() =>
      [...document.querySelectorAll("[data-situacion]")].map((s) => ({
        nivel: s.dataset.situacion,
        texto: s.textContent.trim(),
      })));
    checkApi("V3.3", "Traduce el número de situación a su significado",
      situaciones.length > 0 && situaciones.every((s) => /·/.test(s.texto) || s.texto === "Sin clasificar"),
      situaciones.slice(0, 3).map((s) => s.texto).join(" | "));

    const periodo = await page.locator('[data-testid="periodo"]').textContent().catch(() => "");
    checkApi("V3.5", "Muestra el período informado en palabras",
      /\d{4}/.test(periodo || ""), (periodo || "ausente").trim());

    const textoResultado = await page.locator('[data-testid="resultado-cuit"]').textContent();
    checkApi("V3.4", "Muestra deuda total y peor situación",
      /Deuda total/.test(textoResultado) && /Peor situación/.test(textoResultado));

    // Los importes del BCRA vienen en miles: una empresa grande tiene que dar miles de millones.
    const montos = await page.evaluate(() => {
      const filas = [...document.querySelectorAll("table tbody tr")];
      return filas
        .map((f) => f.children[2]?.textContent?.trim() || "")
        .filter((t) => t.startsWith("$"));
    });
    const mayorMonto = Math.max(
      0,
      ...montos.map((m) => Number(m.replace(/[^\d]/g, "")) || 0),
    );
    checkApi("MONTOS", "Los importes se convierten de miles de pesos a pesos",
      mayorMonto > 1_000_000_000,
      `mayor monto mostrado: ${montos[0] ?? "ninguno"} (${mayorMonto})`);

    const sinRechazos = await page.locator('[data-testid="sin-rechazados"]').count();
    const conRechazos = await page.locator('[data-testid="cantidad-rechazos"]').count();
    const errRechazos = await page.locator('[data-testid="error-rechazados"]').count();
    checkApi("V4.3", "Sin cheques rechazados lo dice explícitamente (no como error)",
      errRechazos === 0 && (sinRechazos === 1 || conRechazos === 1),
      sinRechazos ? (await page.locator('[data-testid="sin-rechazados"]').textContent()).trim() : `panel con datos=${conRechazos}`);

    const evolucion = await page.locator('[data-testid="evolucion"]').count();
    const sinHistorico = await page.locator('[data-testid="sin-historico"]').count();
    checkApi("V5.1", "Muestra la evolución mes a mes o avisa que no hay",
      evolucion === 1 || sinHistorico === 1,
      evolucion ? `${await page.locator('[data-testid="evolucion"] > div').count()} períodos` : "sin histórico");

    /*
     * La evolución mostraba doce meses seguidos de "5 · Irrecuperable" por la misma deuda
     * de $35.000, o sea el mismo error que se corrigió en el veredicto pero repetido mes a
     * mes. Cada período que tenga situación irregular tiene que decir cuánta plata es.
     */
    if (evolucion === 1) {
      const tarjetasIrregulares = await page
        .locator('[data-testid="evolucion"] > div')
        .filter({ hasText: /Irrecuperable|Riesgo (medio|alto)/ })
        .count();
      const conMonto = await page.locator('[data-testid="evolucion-irregular"]').count();
      checkApi("V5.3", "Cada mes con situación irregular dice cuánta plata representa",
        tarjetasIrregulares === 0 || conMonto >= tarjetasIrregulares,
        `${tarjetasIrregulares} meses irregulares, ${conMonto} con el monto a la vista`
        + (conMonto ? ` → "${(await page.locator('[data-testid="evolucion-irregular"]').first().textContent()).trim()}"` : ""));
    }

    const veredictoTxt = (await page.locator('[data-testid="veredicto"]').textContent()).trim();
    checkApi("VEREDICTO", "Da un veredicto legible del riesgo", veredictoTxt.length > 10,
      veredictoTxt.slice(0, 90));

    /*
     * Caso real que motivó esto: YPF tiene una deuda mínima en situación 5 con una empresa
     * de telepeaje y el resto (más de un billón de pesos) en situación 1. Tomar la peor
     * situación sin mirar el monto lo mostraba como "atrasos importantes", que llevaría a
     * rechazar a un cliente bueno. El veredicto tiene que ponderar por plata.
     */
    const irregular = await page.locator('[data-testid="deuda-irregular"]').count();
    if (irregular === 1) {
      const txtIrregular = (await page.locator('[data-testid="deuda-irregular"]').textContent()).trim();
      checkApi("PONDERADO", "Dice cuánta plata representa la peor situación, no solo el nivel",
        /%/.test(txtIrregular) && /\$/.test(txtIrregular),
        txtIrregular.replace(/\s+/g, " ").slice(0, 120));
      const marginal = /menos del 1%|[0-9]%/.test(txtIrregular);
      checkApi("MATIZ", "Con una deuda irregular marginal, el veredicto lo aclara en vez de alarmar",
        !marginal || /puntual|resto normal|resto está/i.test(veredictoTxt),
        veredictoTxt.replace(/\s+/g, " ").slice(0, 120));
    } else {
      checkApi("PONDERADO", "Dice cuánta plata representa la peor situación", true,
        "este CUIT no tiene deuda irregular: no aplica");
      checkApi("MATIZ", "Con una deuda irregular marginal, el veredicto lo aclara", true,
        "no aplica");
    }

    // Las entidades peores tienen que aparecer arriba, no perdidas entre 30 filas.
    const situacionesEnOrden = await page.evaluate(() =>
      [...document.querySelectorAll("table tbody tr")]
        .map((f) => Number(f.querySelector("[data-situacion]")?.dataset.situacion ?? 0))
        .filter((n) => n > 0));
    const ordenado = situacionesEnOrden.every((s, i, arr) => i === 0 || arr[i - 1] >= s);
    checkApi("ORDEN", "La tabla ordena las peores situaciones primero", ordenado,
      situacionesEnOrden.slice(0, 8).join(" "));
  }

  await page.screenshot({ path: path.join(OUT, "05-verificacion-cuit.png"), fullPage: true });

  // ---------- V6: cheque denunciado ----------
  await page.locator('[data-testid="panel-denunciados"] summary').click();
  let bancosOk = true;
  try {
    // Las <option> de un select cerrado no son "visibles": se espera por cantidad, no por visibilidad.
    await page.waitForFunction(
      () => document.querySelectorAll('[data-testid="select-banco"] option').length > 20,
      null,
      { timeout: 45000 },
    );
  } catch {
    bancosOk = false;
  }
  const cantBancos = await page.locator('[data-testid="select-banco"] option').count();
  checkApi("V6.1", "Trae la lista de bancos desde la API", bancosOk && cantBancos > 20,
    `${cantBancos} opciones en el selector`);

  await page.locator('[data-testid="btn-verificar-cheque"]').click();
  await page.waitForTimeout(400);
  const errSinBanco = await page.locator('[data-testid="error-cheque"]').textContent().catch(() => "");
  check("V8.2b", "Sin banco elegido, avisa en vez de consultar",
    /banco/i.test(errSinBanco || ""), (errSinBanco || "sin mensaje").trim());

  if (bancosOk) {
    // Banco de la Nación Argentina y un número cualquiera: no debería estar denunciado.
    const valorNacion = await page.evaluate(() => {
      const opt = [...document.querySelectorAll('[data-testid="select-banco"] option')]
        .find((o) => /NACION ARGENTINA/i.test(o.textContent));
      return opt ? opt.value : null;
    });
    if (valorNacion) {
      await page.locator('[data-testid="select-banco"]').selectOption(valorNacion);
      await page.locator('[data-testid="input-nro-cheque"]').fill("12345678");
      await page.locator('[data-testid="btn-verificar-cheque"]').click();
      let chequeOk = true;
      try {
        await page.locator('[data-testid="resultado-cheque"]').waitFor({ timeout: 45000 });
      } catch {
        chequeOk = false;
      }
      const resultadoCheque = chequeOk
        ? (await page.locator('[data-testid="resultado-cheque"]').textContent()).trim()
        : "";
      checkApi("V6.2", "Responde si el cheque está denunciado", chequeOk,
        resultadoCheque.slice(0, 80));
      checkApi("V6.3", "Muestra la fecha de procesamiento del dato",
        /dato del \d{2}\/\d{2}\/\d{4}/.test(resultadoCheque),
        (resultadoCheque.match(/dato del [^ ]+/) || ["no aparece"])[0]);
      const denunciado = await page.locator('[data-testid="resultado-cheque"]').getAttribute("data-denunciado").catch(() => null);
      checkApi("V6.4", "Marca claramente el estado del cheque", denunciado === "0" || denunciado === "1",
        denunciado === "1" ? "figura denunciado" : "no figura denunciado");
    } else {
      checkApi("V6.2", "Responde si el cheque está denunciado", false, "no encontré el Banco Nación en la lista");
    }
  }

  await page.screenshot({ path: path.join(OUT, "06-verificacion-cheque.png"), fullPage: true });

  // ---------- V7.3: llegada con el CUIT precargado ----------
  const page2 = await ctx.newPage();
  await page2.goto(URL, { waitUntil: "networkidle" });
  await page2.locator('[data-testid="btn-simular-verificar-librador"]').click();
  let precargaOk = true;
  try {
    await page2.locator('[data-testid="resultado-cuit"]').waitFor({ timeout: 45000 });
  } catch {
    precargaOk = false;
  }
  const valorPrecargado = await page2.locator('[data-testid="input-cuit"]').inputValue();
  checkApi("V7.3", "Al llegar con un CUIT precargado, consulta solo",
    precargaOk && valorPrecargado.replace(/\D/g, "") === "30546689979",
    `input="${valorPrecargado}" resultado=${precargaOk}`);
  await page2.close();

  // ---------- V9.2: sin scroll horizontal ----------
  const dsk = await page.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  check("V9.2a", "Desktop 1280px: la página no scrollea en horizontal", dsk.sw <= dsk.cw + 1, JSON.stringify(dsk));

  const mob = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, deviceScaleFactor: 2 });
  const mpage = await mob.newPage();
  mpage.on("console", registrarConsola);
  mpage.on("pageerror", (e) => errores.push("móvil pageerror: " + e.message));
  await mpage.goto(URL, { waitUntil: "networkidle", timeout: 90000 });
  await mpage.locator('[data-testid="input-cuit"]').fill(CUIT_EMPRESA);
  await mpage.locator('[data-testid="btn-consultar"]').click();
  try {
    await mpage.locator('[data-testid="resultado-cuit"]').waitFor({ timeout: 45000 });
  } catch {
    /* si la API no responde, igual se mide el layout */
  }
  await mpage.waitForTimeout(500);
  const mb = await mpage.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth }));
  check("V9.2b", "Móvil 390px: la página no scrollea en horizontal", mb.sw <= mb.cw + 1, JSON.stringify(mb));

  /*
   * Que la página no scrollee no alcanza: en 390px la tabla es más ancha que la pantalla y
   * el monto queda cortado a mitad de camino. Eso está bien SOLO si la caja de la tabla se
   * puede arrastrar para verlo. Si no, el importe es un dato inalcanzable.
   */
  const tabla = await mpage.evaluate(() => {
    const caja = [...document.querySelectorAll("div")].find(
      (d) => getComputedStyle(d).overflowX === "auto" && d.querySelector("table"),
    );
    if (!caja) return { hay: false };
    const antes = caja.scrollLeft;
    caja.scrollLeft = 9999;
    const despues = caja.scrollLeft;
    caja.scrollLeft = antes;
    return {
      hay: true,
      desborda: caja.scrollWidth > caja.clientWidth + 1,
      sePuedeArrastrar: despues > 0,
    };
  });
  check("V9.2c", "Móvil: la tabla ancha se puede arrastrar para ver el monto completo",
    tabla.hay && (!tabla.desborda || tabla.sePuedeArrastrar),
    JSON.stringify(tabla));

  await mpage.screenshot({ path: path.join(OUT, "07-verificacion-movil.png"), fullPage: true });

  check("CONSOLA", "Sin errores de consola ni excepciones",
    errores.length === 0, errores.slice(0, 3).join(" || ") || "ninguno");

  await browser.close();

  const fallan = results.filter((r) => !r.ok);
  const fallanApi = fallan.filter((r) => r.api);
  const fallanApp = fallan.filter((r) => !r.api);
  console.log("\n============== VERIFICACIÓN BCRA ==============");
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.api ? "[API] " : "      "}${r.id.padEnd(9)} ${r.desc}`);
    if (r.detail) console.log(`                        → ${r.detail}`);
  }
  console.log("-----------------------------------------------");
  console.log(`TOTAL: ${results.length}   PASS: ${results.length - fallan.length}   FAIL: ${fallan.length}`);
  if (fallanApi.length) console.log(`De los fallos, ${fallanApi.length} dependen de la API del BCRA.`);
  console.log(`Capturas en: ${OUT}`);
  console.log("===============================================\n");
  process.exit(fallanApp.length === 0 && fallanApi.length === 0 ? 0 : 1);
})().catch((e) => { console.error("ERROR FATAL:", e); process.exit(2); });
