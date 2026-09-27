/*
 * Verificación en navegador real del módulo de ofertas unificado (televisores + flyer), contra
 * SPEC-ofertas.md, más lo que cubría la verificación del flyer (SPEC-flyer.md): arte, PNG de
 * verdad, rechazos del servidor. Usa el banco de pruebas /login/preview-ofertas, con una base en
 * memoria: no toca Supabase.
 *
 * Uso:
 *   1) npm run dev              (en otra terminal)
 *   2) npm run verificar:ofertas
 *
 * Variables opcionales: URL_BASE (por defecto http://localhost:3000), NAVEGADOR, VERBOSE=1.
 * Las capturas y los PNG descargados quedan en verificacion/capturas/ (ignorada por git).
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const URL_BASE = process.env.URL_BASE || "http://localhost:3000";
const URL = `${URL_BASE}/login/preview-ofertas`;
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

function medidasPNG(buf) {
  const firma = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  const esPNG = firma.every((b, i) => buf[i] === b) && buf.toString("ascii", 12, 16) === "IHDR";
  if (!esPNG) return null;
  return { ancho: buf.readUInt32BE(16), alto: buf.readUInt32BE(20), bytes: buf.length };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const exe = NAVEGADORES.find((p) => fs.existsSync(p));
  if (!exe) {
    console.error("No encontré Edge ni Chrome. Pasá la ruta en NAVEGADOR=...");
    process.exit(2);
  }

  const browser = await chromium.launch({ executablePath: exe, headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();

  const errores = [];
  const escuchar = (p, nombre) => {
    p.on("pageerror", (e) => errores.push(`[${nombre}] ${e}`));
    p.on("console", (m) => {
      if (m.type() === "error") errores.push(`[${nombre}] ${m.text()}`);
    });
  };
  escuchar(page, "escritorio");

  const t = (sel, p = page) => p.locator(`[data-test="${sel}"]`);
  const pausa = (ms = 250, p = page) => p.waitForTimeout(ms);
  const nombres = async (sel, p = page) => (await t(sel, p).allInnerTexts()).map((x) => x.split("\n")[0].trim());
  const desborde = (p) => p.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  // El arte de la previa lo dibuja sólo el cliente (mide el ancho): esperarlo es esperar la hidratación.
  const listo = (p = page) => p.waitForSelector('[data-test="flyer-previa"] > div', { timeout: 30_000 });
  const textoPrevia = async (p = page) => (await t("flyer-previa", p).innerText()).replace(/\s+/g, " ");
  // Capturas con caret: "initial": si no, Playwright le cambia el estilo a los inputs y, antes de
  // hidratar, React lo toma como una diferencia con el HTML del servidor.
  const captura = (p, nombre, extra = {}) => p.screenshot({ path: path.join(OUT, nombre), fullPage: true, caret: "initial", ...extra });

  // ---------- R1 / R5: un solo módulo con tres pestañas ----------
  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-test="tab-flyer"]');
  await pausa(600);
  const h1 = (await page.locator("h1").first().innerText()).trim();
  check("R1", "El módulo se llama «Ofertas: televisores y flyer»", h1 === "Ofertas: televisores y flyer", h1);
  check("R5a", "Tiene las pestañas Ofertas, Televisores y Flyer",
    (await t("tab-ofertas").count()) + (await t("tab-televisores").count()) + (await t("tab-flyer").count()) === 3);
  // La sección de la lista: la de Televisores también es una <section> y va primero en el DOM.
  const seccionLista = () => page.locator("section", { hasText: "Placas (" });
  const lista = (await seccionLista().innerText()).replace(/\s+/g, " ");
  check("R2", "La lista de ofertas es la de siempre (las 7 placas) y marca las que van al flyer",
    lista.includes("Placas (7)") && (lista.match(/en el flyer/g) ?? []).length === 3, lista.slice(0, 200));
  await captura(page, "ofertas-lista-desktop.png");

  // R3 / R7: la casilla sólo aparece en las ofertas con precio.
  await page.getByPlaceholder("Asado de tira").fill("Pechito de cerdo");
  await page.getByPlaceholder("8990", { exact: true }).fill("7990");
  check("R3a", "Al cargar una oferta está la casilla «Va en el flyer»", (await t("form-en-flyer").count()) === 1);
  await page.locator("select").first().selectOption("imagen");
  check("R7a", "Un cartel ya diseñado no tiene la casilla (no se puede dibujar en el flyer)", (await t("form-en-flyer").count()) === 0);
  await page.locator("select").first().selectOption("oferta");
  await t("form-en-flyer").check();
  await page.getByRole("button", { name: "Crear placa" }).click();
  await pausa(400);
  const lista2 = (await seccionLista().innerText()).replace(/\s+/g, " ");
  check("R3b", "La oferta nueva se crea marcada para el flyer", lista2.includes("Placas (8)") && /Pechito de cerdo.*en el flyer/.test(lista2), lista2.slice(0, 300));

  // ---------- Televisores ----------
  await t("tab-televisores").click();
  await pausa(200);
  const tvs = await page.locator("body").innerText();
  check("R5b", "La pestaña Televisores muestra las pantallas", ["Carnicería 1", "Carnicería 2", "Acceso"].every((x) => tvs.includes(x)));

  // ---------- R4 / R8: el flyer se arma con las marcadas vigentes ----------
  await t("tab-flyer").click();
  await listo();
  await pausa(300);
  check("R4a", "Entran las marcadas y vigentes, en el orden del flyer (la nueva al final)",
    (await nombres("fila-flyer")).join() === "Vacío,Asado de tira,Pechito de cerdo", (await nombres("fila-flyer")).join());
  check("R4b", "La vencida (Matambre) no entra y se avisa aparte", (await t("aviso-no-vigentes").innerText()).includes("Matambre"));
  check("R7b", "Para sumar aparecen las vigentes sin marcar; ni el cartel ya diseñado ni el institucional",
    (await nombres("fila-disponible")).join() === "Nalga,Pollo entero", (await nombres("fila-disponible")).join());
  const previa = await textoPrevia();
  check("R8a", "La previa muestra las ofertas con el formato de precio del cartel",
    /VAC[IÍ]O/i.test(previa) && /ASADO DE TIRA/i.test(previa) && previa.includes("12.500") && previa.includes("8.990"), previa.slice(0, 200));
  check("R8b", "…el precio anterior y el % OFF calculado (11.500 → 8.990 = 22%)", previa.includes("11.500") && previa.includes("22%"), previa.slice(0, 300));
  check("R8c", "La previa muestra los datos del local en el pie", previa.includes("Alvear"), previa.slice(-200));
  const caja = await t("flyer-previa").boundingBox();
  check("R8d", "La previa de redes respeta 1080×1350", Math.abs(caja.height / caja.width - 1350 / 1080) < 0.02, (caja.height / caja.width).toFixed(3));

  await t("sumar-al-flyer").first().click();
  await pausa(300);
  check("R4c", "Sumar Nalga la agrega al final del flyer", (await nombres("fila-flyer")).at(-1) === "Nalga" && !(await nombres("fila-disponible")).includes("Nalga"));
  await page.getByRole("button", { name: "Subir Asado de tira" }).click();
  await pausa(300);
  check("R8e", "Subir el asado lo pone primero en el flyer", (await nombres("fila-flyer"))[0] === "Asado de tira", (await nombres("fila-flyer")).join());
  check("R8f", "…y la previa sigue ese orden", (await textoPrevia()).search(/ASADO/i) < (await textoPrevia()).search(/VAC[IÍ]O/i));
  await page.getByRole("button", { name: "Sacar Vacío del flyer" }).click();
  await pausa(300);
  check("R8g", "Sacar el vacío lo quita del flyer y vuelve a «para sumar»",
    !(await nombres("fila-flyer")).includes("Vacío") && (await nombres("fila-disponible")).includes("Vacío"));

  // R9: el encabezado se edita y se ve en la previa.
  await t("flyer-titulo").fill("Finde largo");
  await t("flyer-titulo").blur();
  await t("flyer-seccion").fill("Carnicería");
  await t("flyer-seccion").blur();
  await pausa(300);
  check("R9a", "Cambiar el título se ve en la previa", /FINDE LARGO/i.test(await textoPrevia()));
  const franja = await t("flyer-previa").locator("div >> nth=2").evaluate((el) => getComputedStyle(el).backgroundColor).catch(() => "");
  check("R9b", "No aparece ningún error al guardar el encabezado", (await t("flyer-error").count()) === 0, franja);

  // R11: con más de 6 marcadas, avisa cuáles quedan afuera.
  for (const nombre of ["Vacío", "Pollo entero"]) {
    await page.locator('[data-test="fila-disponible"]', { hasText: nombre }).locator('[data-test="sumar-al-flyer"]').click();
    await pausa(250);
  }
  await t("tab-ofertas").click();
  for (const [nombre, precio] of [["Bondiola", "10990"], ["Carré", "9990"]]) {
    await page.getByPlaceholder("Asado de tira").fill(nombre);
    await page.getByPlaceholder("8990", { exact: true }).fill(precio);
    await t("form-en-flyer").check();
    await page.getByRole("button", { name: "Crear placa" }).click();
    await pausa(400);
  }
  await t("tab-flyer").click();
  await listo();
  await pausa(300);
  // Marcadas y vigentes: Asado, Pechito, Nalga, Vacío, Pollo, Bondiola y Carré (el Matambre venció).
  check("R11a", "Con 7 marcadas vigentes entran 6", (await t("fila-flyer").count()) === 6, await t("fila-flyer").count());
  check("R11b", "…y avisa cuál queda afuera (la última, Carré)", /Quedan afuera: Carré\./.test(await t("aviso-afuera").innerText()), await t("aviso-afuera").innerText());
  await captura(page, "ofertas-flyer-desktop.png");

  // Editar desde el flyer lleva a la oferta.
  await page.locator('[data-test="fila-flyer"]', { hasText: "Nalga" }).getByRole("button", { name: "Editar" }).click();
  await pausa(300);
  check("R8h", "«Editar» desde el flyer abre la oferta en la pestaña Ofertas",
    (await page.getByRole("heading", { name: "Editar placa" }).count()) === 1 && (await page.getByPlaceholder("Asado de tira").inputValue()) === "Nalga");
  await page.getByRole("button", { name: "Cancelar" }).click();

  // ---------- Formatos y descargas (SPEC-flyer R1.5, R2.3, R3.5) ----------
  await t("tab-flyer").click();
  await listo();
  await t("formato-story").click();
  await pausa(200);
  const cajaStory = await t("flyer-previa").boundingBox();
  check("R8i", "Cambiar a estado/TV cambia la previa a 1080×1920", Math.abs(cajaStory.height / cajaStory.width - 1920 / 1080) < 0.02, (cajaStory.height / cajaStory.width).toFixed(3));

  const bajar = async (formato) => {
    const [descarga] = await Promise.all([page.waitForEvent("download", { timeout: 60_000 }), t(`btn-descargar-${formato}`).click()]);
    const destino = path.join(OUT, `ofertas-flyer-${formato}.png`);
    await descarga.saveAs(destino);
    return { nombre: descarga.suggestedFilename(), buf: fs.readFileSync(destino) };
  };
  const redes = await bajar("redes");
  const mRedes = medidasPNG(redes.buf);
  check("R14a", "Se descarga un PNG de 1080×1350 con las 6 ofertas", mRedes?.ancho === 1080 && mRedes?.alto === 1350 && mRedes.bytes > 20_000, JSON.stringify(mRedes));
  check("R14b", "…llamado flyer-redes-AAAA-MM-DD.png", /^flyer-redes-\d{4}-\d{2}-\d{2}\.png$/.test(redes.nombre), redes.nombre);
  const story = await bajar("story");
  const mStory = medidasPNG(story.buf);
  check("R14c", "Y el de estado/TV de 1080×1920", mStory?.ancho === 1080 && mStory?.alto === 1920 && mStory.bytes > 20_000, JSON.stringify(mStory));

  // Por fuera de la página: un 400 pedido desde el navegador queda en la consola como error.
  const pedir = async (cuerpo) => {
    const r = await ctx.request.post(`${URL_BASE}/login/preview-flyer/imagen`, { data: cuerpo });
    const tipo = r.headers()["content-type"] || "";
    return { status: r.status(), texto: tipo.includes("json") ? JSON.stringify(await r.json()) : "" };
  };
  const vacio = await pedir({ formato: "redes", flyer: { titulo: "x", seccion: "", vigencia: "", productos: [], pie: {} } });
  check("R14d", "El servidor rechaza un flyer sin productos con 400", vacio.status === 400 && vacio.texto.includes("producto"), JSON.stringify(vacio));
  const malo = await pedir({ formato: "a4", flyer: { productos: [] } });
  check("R14e", "…y un formato inventado", malo.status === 400, JSON.stringify(malo));
  const rSin = await ctx.request.post(`${URL_BASE}/api/flyer`, { data: { formato: "redes", flyer: { productos: [] } }, maxRedirects: 0 });
  const sinSesion = { status: rSin.status(), tipo: rSin.headers()["content-type"] || "" };
  check("R14f", "Sin sesión, /api/flyer no devuelve ninguna imagen", !sinSesion.tipo.includes("image/png"), JSON.stringify(sinSesion));

  // ---------- R6: /flyer sigue existiendo como atajo ----------
  const rFlyer = await ctx.request.get(`${URL_BASE}/flyer`, { maxRedirects: 0 });
  check("R6", "/flyer no da error: redirige (sin sesión, al login)", [302, 303, 307, 308].includes(rFlyer.status()), `${rFlyer.status()} → ${rFlyer.headers()["location"]}`);

  // ---------- Sin ofertas en el flyer ----------
  const vacia = await ctx.newPage();
  escuchar(vacia, "flyer vacío");
  await vacia.goto(`${URL}?vista=flyer`, { waitUntil: "domcontentloaded" });
  await listo(vacia);
  for (const nombre of ["Vacío", "Asado de tira"]) {
    await vacia.getByRole("button", { name: `Sacar ${nombre} del flyer` }).click();
    await pausa(300, vacia);
  }
  check("R4d", "Sin ofertas en el flyer lo dice y no deja descargar",
    (await t("sin-productos", vacia).count()) === 1 && (await t("btn-descargar-redes", vacia).isDisabled()));
  await vacia.close();

  // ---------- R9 / R10: el flyer que estaba guardado en el navegador ----------
  const conViejo = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await conViejo.addInitScript(() => {
    if (!sessionStorage.getItem("sembrado")) {
      sessionStorage.setItem("sembrado", "1");
      localStorage.setItem("flyer-el-nuevo-rural-v1", JSON.stringify({
        titulo: "Ofertas del finde", seccion: "Carnicería", vigencia: "Hasta el domingo",
        productos: [{ nombre: "Costilla" }, { nombre: "Chorizo" }],
        pie: { direccion: "Alvear 637", telefono: "351 555 1234", horarios: "8 a 22", instagram: "@rural" },
      }));
    }
  });
  const pv = await conViejo.newPage();
  escuchar(pv, "flyer viejo");
  await pv.goto(`${URL}?vista=flyer`, { waitUntil: "domcontentloaded" });
  await listo(pv);
  await pausa(300, pv);
  const aviso = await t("aviso-flyer-viejo", pv).innerText().catch(() => "");
  check("R10", "Avisa del flyer viejo y lista sus productos para marcarlos a mano (no los sube solos al TV)",
    aviso.includes("Costilla") && aviso.includes("Chorizo") && !(await nombres("fila-flyer", pv)).includes("Costilla"), aviso.replace(/\s+/g, " "));
  await t("traer-flyer-viejo", pv).click();
  await pausa(400, pv);
  check("R9c", "«Traer» pasa el título y los datos del local al flyer",
    (await t("flyer-titulo", pv).inputValue()) === "Ofertas del finde" && (await t("flyer-telefono", pv).inputValue()) === "351 555 1234");
  check("R9d", "…y el aviso no vuelve a aparecer", (await t("aviso-flyer-viejo", pv).count()) === 0 && (await pv.evaluate(() => localStorage.getItem("flyer-el-nuevo-rural-v1"))) === null);
  await conViejo.close();

  // ---------- Celular ----------
  const movil = await ctx.newPage();
  escuchar(movil, "celular");
  await movil.setViewportSize({ width: 390, height: 844 });
  await movil.goto(URL, { waitUntil: "domcontentloaded" });
  await movil.waitForSelector('[data-test="tab-flyer"]');
  await pausa(600, movil);
  check("R14g", "En el celular la pestaña Ofertas no se desborda", (await desborde(movil)) <= 1, `${await desborde(movil)}px`);
  await captura(movil, "ofertas-lista-movil.png");
  await t("tab-televisores", movil).click();
  await pausa(200, movil);
  check("R14h", "…ni la de Televisores", (await desborde(movil)) <= 1, `${await desborde(movil)}px`);
  await t("tab-flyer", movil).click();
  await listo(movil);
  await pausa(300, movil);
  const cajaMovil = await t("flyer-previa", movil).boundingBox();
  check("R14i", "…ni la del Flyer, y la previa entra en el ancho del teléfono",
    (await desborde(movil)) <= 1 && cajaMovil.x >= 0 && cajaMovil.x + cajaMovil.width <= 390, `${await desborde(movil)}px ${JSON.stringify(cajaMovil)}`);
  await captura(movil, "ofertas-flyer-movil.png");

  check("R16", "Sin errores de JavaScript en consola", errores.length === 0, errores.join(" | ").slice(0, 600));

  // El informe va antes de cerrar: en esta máquina el close() de Edge headless tarda minutos.
  browser.close().catch(() => {});

  const fallidos = results.filter((r) => !r.ok);
  console.log("\n=== Verificación de ofertas (televisores + flyer) ===\n");
  results.forEach((r) => console.log(`${r.ok ? "OK  " : "FALLA"} ${r.id.padEnd(6)} ${r.desc}${r.detail ? `  [${r.detail}]` : ""}`));
  console.log(`\n${results.length - fallidos.length}/${results.length} checks OK`);
  console.log(`Capturas en ${OUT}\n`);
  process.exit(fallidos.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
