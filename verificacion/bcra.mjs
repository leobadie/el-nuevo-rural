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
  /*
   * El BCRA corta a las 10 consultas por minuto y su 429 viene sin header CORS, así que el
   * navegador lo escribe como un error de CORS con la URL de la página, no la de la API.
   * Eso no es un defecto de la app: se anota aparte y se avisa, porque si aparece quiere
   * decir que los checks que dependen de la API se corrieron contra un BCRA que ya frenó.
   */
  const limitados = [];
  function registrarConsola(m) {
    if (m.type() !== "error") return;
    const url = m.location()?.url || "";
    const texto = m.text();
    if (url.includes("api.bcra.gob.ar")) return;
    if (texto.includes("api.bcra.gob.ar") && /CORS|Access-Control/.test(texto)) {
      limitados.push(texto);
      return;
    }
    if (/Failed to load resource/.test(texto) && /404/.test(texto) && !url) return;
    errores.push(texto);
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
      await page.locator('[data-testid="input-nro-cuenta"]').fill("02240032194");
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
        /denuncias del BCRA al \d{2}\/\d{2}\/\d{4}/.test(resultadoCheque),
        (resultadoCheque.match(/al \d{2}\/\d{2}\/\d{4}/) || ["no aparece"])[0]);
      const nivelLimpio = await page.locator('[data-testid="resultado-cheque"]').getAttribute("data-nivel").catch(() => null);
      checkApi("V6.5d", "Un número sin ninguna denuncia da CHEQUE LIMPIO",
        nivelLimpio === "limpio" && /cheque limpio/i.test(resultadoCheque), `nivel=${nivelLimpio}`);
      check("V6.7b", "Sin denuncias de otras cuentas no hay nota al pie que distraiga",
        (await page.locator('[data-testid="nota-denuncia"]').count()) === 0, "");

      const nivel = async () =>
        page.locator('[data-testid="resultado-cheque"]').getAttribute("data-nivel").catch(() => null);
      const texto = async () =>
        (await page.locator('[data-testid="resultado-cheque"]').textContent().catch(() => "")).trim();

      // V6.4: sin la cuenta no se consulta, porque la respuesta no serviría.
      await page.locator('[data-testid="input-nro-cheque"]').fill("456");
      await page.locator('[data-testid="input-nro-cuenta"]').fill("");
      await page.locator('[data-testid="btn-verificar-cheque"]').click();
      await page.waitForTimeout(400);
      const errSinCuenta = await page.locator('[data-testid="error-cheque"]').textContent().catch(() => "");
      const hayResultado = await page.locator('[data-testid="resultado-cheque"]').count();
      check("V6.4a", "Sin el número de cuenta no consulta y lo pide",
        /cuenta/i.test(errSinCuenta || "") && hayResultado === 0,
        (errSinCuenta || "sin mensaje").trim().slice(0, 80));
      check("V6.4b", "El aviso explica dónde está la cuenta en el cheque",
        /impreso abajo|línea de números/i.test(errSinCuenta || ""), "");
      /* El veredicto anterior era del cheque 12345678: si sobreviviera, se leería como la
         respuesta al 456 que está escrito ahora. */
      check("V6.4c", "Al cortar la consulta no queda en pantalla el veredicto del cheque anterior",
        hayResultado === 0, `resultados visibles: ${hayResultado}`);

      // Lo mismo al editar los campos: el resultado deja de corresponder a lo que se ve.
      await page.locator('[data-testid="input-nro-cuenta"]').fill("02240032194");
      await page.locator('[data-testid="btn-verificar-cheque"]').click();
      await page.locator('[data-testid="resultado-cheque"]').waitFor({ timeout: 45000 }).catch(() => {});
      const habia = await page.locator('[data-testid="resultado-cheque"]').count();
      await page.locator('[data-testid="input-nro-cheque"]').fill("4567");
      await page.waitForTimeout(200);
      check("V6.4d", "Cambiar el número de cheque descarta el veredicto anterior",
        habia === 1 && (await page.locator('[data-testid="resultado-cheque"]').count()) === 0,
        `antes=${habia}`);
      await page.locator('[data-testid="input-nro-cheque"]').fill("456");
      await page.locator('[data-testid="input-nro-cuenta"]').fill("");

      /* Las cuentas que realmente denunciaron el 456 se traen de la API, no del DOM: la
         pantalla ya no las lista, justamente porque no son el cheque consultado. */
      let denunciasReales = [];
      try {
        const r = await fetch(`https://api.bcra.gob.ar/cheques/v1.0/denunciados/${valorNacion}/456`);
        if (r.ok) denunciasReales = (await r.json()).results?.detalles ?? [];
      } catch {
        /* si falla, los checks que dependen de esto quedan en rojo con su motivo */
      }
      checkApi("DATOS", "La API informa denuncias del cheque 456 para cruzar",
        denunciasReales.length > 1, `${denunciasReales.length} denuncias`);

      if (denunciasReales.length > 1) {
        const cuentaDenunciada = String(denunciasReales[0].numeroCuenta);
        const cuentaLimpia = "9999999999";

        await page.locator('[data-testid="input-nro-cuenta"]').fill(cuentaLimpia);
        await page.locator('[data-testid="btn-verificar-cheque"]').click();
        let ok456 = true;
        try {
          await page.locator('[data-testid="resultado-cheque"]').waitFor({ timeout: 45000 });
        } catch {
          ok456 = false;
        }
        const limpio = await texto();
        checkApi("V6.5b", "Una cuenta que no denunció da CHEQUE LIMPIO",
          ok456 && (await nivel()) === "otrasCuentas" && /cheque limpio/i.test(limpio),
          `nivel=${await nivel()}`);
        check("V6.6a", "No lista las denuncias de otras cuentas",
          (await page.locator('[data-testid="lista-denuncias"]').count()) === 0,
          `${denunciasReales.length} denuncias existen y ninguna se lista`);
        check("V6.6b", "Las menciona en una sola línea al pie",
          /otras chequeras/.test(
            (await page.locator('[data-testid="nota-denuncia"]').textContent().catch(() => "")) || "",
          ),
          ((await page.locator('[data-testid="nota-denuncia"]').textContent().catch(() => "")) || "").slice(0, 70));
        check("V6.7a", "El veredicto nombra el cheque, la cuenta y el banco",
          limpio.includes(cuentaLimpia) && /N° 456/.test(limpio) && /NACION/.test(limpio), "");
        await page.screenshot({ path: path.join(OUT, "06b-cheque-limpio.png"), fullPage: true });

        await page.locator('[data-testid="input-nro-cuenta"]').fill(cuentaDenunciada);
        await page.waitForTimeout(250);
        const rojo = await texto();
        checkApi("V6.5a", "La cuenta que sí denunció da DENUNCIADO",
          (await nivel()) === "denunciado" && /no lo aceptes/i.test(rojo),
          `cuenta ${cuentaDenunciada} → nivel=${await nivel()}`);
        check("V6.5c", "Muestra la causal de esa denuncia",
          /Denunciado por (titular|tercero)/.test(rojo),
          (rojo.match(/Causal: [^.]+\./) || ["no aparece"])[0]);
        check("V6.6c", "Solo muestra la denuncia que es este cheque",
          (await page.locator('[data-testid="lista-denuncias"] > div').count()) === 1,
          `de ${denunciasReales.length} denuncias, 1 en pantalla`);

        await page.locator('[data-testid="input-nro-cuenta"]').fill(cuentaDenunciada.slice(2));
        await page.waitForTimeout(250);
        check("V6.9", "Si solo coincide el final de la cuenta, avisa en vez de dar por limpio",
          (await nivel()) === "posible", `${cuentaDenunciada.slice(2)} → nivel=${await nivel()}`);

        await page.locator('[data-testid="input-nro-cuenta"]').fill(
          cuentaDenunciada.replace(/(\d\d)(\d)/, "$1-$2"),
        );
        await page.waitForTimeout(250);
        check("V6.8", "La cuenta con guiones se compara igual que sin ellos",
          (await nivel()) === "denunciado", `nivel=${await nivel()}`);
      }
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

  // ---------- R1-R4: quién está detrás del CUIT ----------
  const caso = (cuit) => `[data-testid="caso-${cuit}"]`;
  const textoCaso = async (cuit) =>
    (await page.locator(caso(cuit)).textContent().catch(() => "")).trim();

  const conPersonas = await textoCaso("30707512292");
  check("R1.1", "Muestra tipo societario, domicilio y actividad de la sociedad",
    /SOCIEDAD ANONIMA/.test(conPersonas) && /CAPITAL FEDERAL/.test(conPersonas) &&
      /COMBUSTIBLES/.test(conPersonas),
    (await page.locator(`${caso("30707512292")} [data-testid="datos-sociedad"]`).textContent().catch(() => "")).slice(0, 90));
  check("R1.2", "Muestra la antigüedad en años",
    /\d+ años de antigüedad/.test(conPersonas),
    (conPersonas.match(/\d+ años de antigüedad/) || ["no aparece"])[0]);
  check("R1.4", "Dice de qué fuente y de qué fecha es el dato",
    /Registro Nacional de Sociedades/.test(conPersonas) && /dato de \w+ de \d{4}/.test(conPersonas),
    (conPersonas.match(/dato de [\w ]+ de \d{4}/) || ["no aparece"])[0]);

  const roles = await page.locator(`${caso("30707512292")} [data-testid="tabla-personas"] tbody tr`).evaluateAll(
    (filas) => filas.map((f) => f.getAttribute("data-rol")),
  );
  check("R2.1", "Lista las personas con su rol", roles.length === 4, `${roles.length} personas`);
  check("R2.2", "Socios primero, después autoridades, después representantes",
    roles.join("") === "SSAR", roles.join(""));
  check("R3.2", "Con personas, igual aclara qué no es público (accionistas)",
    /accionistas/i.test(
      (await page.locator(`${caso("30707512292")} [data-testid="aclaracion-personas"]`).textContent().catch(() => "")) || "",
    ), "");

  const cordoba = await textoCaso("30712345670");
  const motivoCordoba = await page.locator(`${caso("30712345670")} [data-testid="sin-personas"]`)
    .getAttribute("data-motivo").catch(() => null);
  check("R1.3", "Una sociedad del interior igual muestra sus datos de empresa",
    /CEREALERA DEL CENTRO/.test(cordoba) && /RIO CUARTO/.test(cordoba), "");
  check("R3.1a", "Sin personas por ser de otra provincia, lo dice con ese motivo",
    motivoCordoba === "sociedadDeOtraProvincia", `motivo=${motivoCordoba}`);
  check("R3.1b", "Y aclara que eso NO significa que no tenga socios",
    /no significa que la sociedad no tenga socios/i.test(cordoba) && /CORDOBA/.test(cordoba),
    (cordoba.match(/No hay personas cargadas[^.]*\./) || ["no aparece"])[0].slice(0, 95));
  check("R3.3", "Nunca presenta la ausencia como un resultado limpio",
    !/sin socios|no tiene socios|ningún socio/i.test(cordoba), "");

  const noFigura = await textoCaso("30999999994");
  check("R1.3b", "Un CUIT que no figura lo dice sin romper nada",
    /no figura en el Registro Nacional de Sociedades/i.test(noFigura) &&
      /no quiere decir que la empresa no exista/i.test(noFigura), "");

  const persona = await textoCaso("20123456783");
  const motivoPersona = await page.locator(`${caso("20123456783")} [data-testid="sin-personas"]`)
    .getAttribute("data-motivo").catch(() => null);
  check("R4.1", "Con un CUIL de persona física explica que no hay padrón público",
    motivoPersona === "esPersonaFisica" && /no hay padrón público de personas físicas/i.test(persona),
    `motivo=${motivoPersona}`);

  await page.screenshot({ path: path.join(OUT, "08-quien-esta-detras.png"), fullPage: true });

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

  /* El panel de denuncias arranca cerrado, así que medir la página sin abrirlo no dice nada
     sobre él: los números de cuenta son largos y es justo donde el ancho puede desbordar. */
  await mpage.locator('[data-testid="panel-denunciados"] summary').click();
  let listaMovilOk = true;
  try {
    await mpage.waitForFunction(
      () => document.querySelectorAll('[data-testid="select-banco"] option').length > 20,
      null, { timeout: 45000 },
    );
    const valorNacionMovil = await mpage.evaluate(() => {
      const opt = [...document.querySelectorAll('[data-testid="select-banco"] option')]
        .find((o) => /NACION ARGENTINA/i.test(o.textContent));
      return opt ? opt.value : null;
    });
    await mpage.locator('[data-testid="select-banco"]').selectOption(valorNacionMovil);
    await mpage.locator('[data-testid="input-nro-cheque"]').fill("456");
    await mpage.locator('[data-testid="input-nro-cuenta"]').fill("02240032194");
    await mpage.locator('[data-testid="btn-verificar-cheque"]').click();
    await mpage.locator('[data-testid="resultado-cheque"]').waitFor({ timeout: 45000 });
  } catch {
    listaMovilOk = false;
  }
  await mpage.waitForTimeout(300);
  const mb2 = await mpage.evaluate(() => ({
    sw: document.documentElement.scrollWidth,
    cw: document.documentElement.clientWidth,
  }));
  checkApi("V9.2d", "Móvil: con el resultado de denuncias abierto tampoco scrollea en horizontal",
    listaMovilOk && mb2.sw <= mb2.cw + 1, JSON.stringify({ ...mb2, listaMovilOk }));

  await mpage.screenshot({ path: path.join(OUT, "07-verificacion-movil.png"), fullPage: true });
  await mpage.locator('[data-testid="resultado-cheque"]').scrollIntoViewIfNeeded().catch(() => {});
  await mpage.screenshot({ path: path.join(OUT, "07b-denuncias-movil.png") });

  check("CONSOLA", "Sin errores de consola ni excepciones",
    errores.length === 0, errores.slice(0, 3).join(" || ") || "ninguno");

  await browser.close();

  if (limitados.length) {
    console.log(
      `\nAVISO: el BCRA frenó ${limitados.length} consulta(s) por su límite de 10 por minuto ` +
      `(responde 429 sin header CORS, por eso figura como error de CORS).\n` +
      `Los checks marcados [API] pueden haber corrido con datos incompletos. ` +
      `Esperá un minuto sin consultar y volvé a correr la verificación.`,
    );
  }

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
