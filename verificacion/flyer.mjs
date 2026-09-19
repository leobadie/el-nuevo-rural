/*
 * Verificación en navegador real del flyer de ofertas, contra SPEC-flyer.md. Usa el Edge o
 * Chrome ya instalado en Windows.
 *
 * Uso:
 *   1) npm run dev              (en otra terminal)
 *   2) npm run verificar:flyer
 *
 * Variables opcionales: URL_BASE (por defecto http://localhost:3000), NAVEGADOR, VERBOSE=1.
 * Las capturas y los PNG descargados quedan en verificacion/capturas/ (ignorada por git).
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const URL_BASE = process.env.URL_BASE || "http://localhost:3000";
const URL = `${URL_BASE}/login/preview-flyer`;
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

/**
 * Las medidas reales de un PNG, leídas de su cabecera IHDR. Es la prueba de que la imagen
 * salió del tamaño que dice el SPEC, y no lo que la pantalla asegura que pidió.
 */
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
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => {
    if (m.type() === "error") errores.push(m.text());
  });

  const t = (sel) => page.locator(`[data-test="${sel}"]`);
  const pausa = (ms = 250) => page.waitForTimeout(ms);

  /*
   * El div de adentro de la previa sólo lo dibuja el cliente (necesita medir el ancho), así que
   * esperarlo es esperar a que React haya hidratado. Sin esto los primeros clicks caen sobre
   * botones que todavía no tienen listener y no pasa nada.
   */
  const listo = (p) => p.waitForSelector('[data-test="flyer-previa"] > div', { timeout: 30_000 });

  await page.goto(URL, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-test="btn-agregar-producto"]');
  await listo(page);

  // ---------- R3.2: cargar productos ----------
  check("R3.2a", "Arranca sin productos y lo dice", (await t("sin-productos").count()) === 1);
  const descargaApagada = await t("btn-descargar-redes").isDisabled();
  check("R2.4a", "Sin productos no deja descargar", descargaApagada);

  const cargar = async (i, nombre, precio, anterior, unidad) => {
    await t("btn-agregar-producto").click();
    // La fila aparece recién cuando React re-renderiza: sin esperarla el fill llega antes.
    await page.waitForFunction((n) => document.querySelectorAll('[data-test="fila-producto"]').length === n, i + 1, { timeout: 15_000 });
    await t("producto-nombre").nth(i).fill(nombre);
    await t("producto-precio").nth(i).fill(String(precio));
    if (anterior) await t("producto-anterior").nth(i).fill(String(anterior));
    await t("producto-unidad").nth(i).fill(unidad);
  };

  await cargar(0, "Asado", 8900, 11200, "el kilo");
  await cargar(1, "Pollo entero", 4250, null, "el kilo");
  await cargar(2, "Vacío", 9500, 10900, "el kilo");
  await pausa();
  check("R3.2b", "Quedan cargados los 3 productos", (await t("fila-producto").count()) === 3);

  // ---------- R1.1 / R3.4: la previa es el arte ----------
  const previa = t("flyer-previa");
  check("R3.4a", "La previa arranca en formato de redes", (await previa.getAttribute("data-formato")) === "redes");
  const textoPrevia = (await previa.innerText()).replace(/\s+/g, " ");
  check("R1.3a", "La previa muestra el precio con el formato del cartel", textoPrevia.includes("$ 8.900"), textoPrevia.slice(0, 120));
  check("R1.3b", "…el precio anterior tachado y el % OFF calculado", textoPrevia.includes("$ 11.200") && textoPrevia.includes("21% OFF"), textoPrevia.slice(0, 200));
  check("R1.3c", "El producto sin precio anterior no muestra ningún % OFF",
    (textoPrevia.match(/% OFF/g) || []).length === 2, (textoPrevia.match(/% OFF/g) || []).join());
  check("R1.6a", "La previa muestra los datos del local en el pie",
    textoPrevia.includes("Alvear N°637") && textoPrevia.includes("@elnuevorural.super"), textoPrevia.slice(-160));

  const cajaPrevia = await previa.boundingBox();
  const proporcion = cajaPrevia.height / cajaPrevia.width;
  check("R1.5a", "La previa de redes respeta la proporción 1080×1350", Math.abs(proporcion - 1350 / 1080) < 0.02, proporcion.toFixed(3));

  await t("flyer-seccion").fill("Carnicería");
  await pausa(150);
  const colorFranja = await t("flyer-franja").evaluate((el) => getComputedStyle(el).backgroundColor);
  check("R1.2a", "Poner la sección Carnicería pinta la franja de rojo", colorFranja === "rgb(166, 44, 44)", colorFranja);

  await page.screenshot({ path: path.join(OUT, "flyer-desktop.png"), fullPage: true });

  await t("formato-story").click();
  await pausa(200);
  const cajaStory = await previa.boundingBox();
  check("R1.5b", "Cambiar a estado/TV cambia la previa a 1080×1920",
    (await previa.getAttribute("data-formato")) === "story" && Math.abs(cajaStory.height / cajaStory.width - 1920 / 1080) < 0.02,
    (cajaStory.height / cajaStory.width).toFixed(3));

  // ---------- R2.3: el PNG de verdad ----------
  const bajar = async (formato) => {
    const [descarga] = await Promise.all([
      page.waitForEvent("download", { timeout: 60_000 }),
      t(`btn-descargar-${formato}`).click(),
    ]);
    const destino = path.join(OUT, `flyer-${formato}.png`);
    await descarga.saveAs(destino);
    return { nombre: descarga.suggestedFilename(), buf: fs.readFileSync(destino), destino };
  };

  const redes = await bajar("redes");
  const mRedes = medidasPNG(redes.buf);
  check("R2.3a", "El archivo descargado es un PNG de 1080×1350", mRedes && mRedes.ancho === 1080 && mRedes.alto === 1350, JSON.stringify(mRedes));
  check("R3.5a", "…y se llama flyer-redes-AAAA-MM-DD.png", /^flyer-redes-\d{4}-\d{2}-\d{2}\.png$/.test(redes.nombre), redes.nombre);

  const story = await bajar("story");
  const mStory = medidasPNG(story.buf);
  check("R2.3b", "El de estado/TV es un PNG de 1080×1920", mStory && mStory.ancho === 1080 && mStory.alto === 1920, JSON.stringify(mStory));
  check("R3.5b", "…y se llama flyer-story-AAAA-MM-DD.png", /^flyer-story-\d{4}-\d{2}-\d{2}\.png$/.test(story.nombre), story.nombre);
  check("R2.3c", "Los dos PNG tienen contenido de verdad, no una imagen vacía",
    mRedes && mStory && mRedes.bytes > 20_000 && mStory.bytes > 20_000, `${mRedes?.bytes} / ${mStory?.bytes} bytes`);

  // ---------- R2.4: el servidor rechaza lo que no puede dibujar ----------
  const pedir = (cuerpo) =>
    page.evaluate(async ({ url, cuerpo }) => {
      const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(cuerpo) });
      const tipo = r.headers.get("content-type") || "";
      return { status: r.status, tipo, texto: tipo.includes("json") ? JSON.stringify(await r.json()) : "" };
    }, { url: "/login/preview-flyer/imagen", cuerpo });

  const sinProductos = await pedir({ formato: "redes", flyer: { titulo: "x", seccion: "", vigencia: "", productos: [], pie: {} } });
  check("R2.4b", "Un flyer sin productos se rechaza con 400 y un motivo", sinProductos.status === 400 && sinProductos.texto.includes("producto"), JSON.stringify(sinProductos));
  const formatoMalo = await pedir({ formato: "a4", flyer: { productos: [] } });
  check("R2.4c", "Un formato inventado se rechaza con 400", formatoMalo.status === 400, JSON.stringify(formatoMalo));

  // ---------- R2.2: la ruta real pide sesión ----------
  const sinSesion = await page.evaluate(async () => {
    const r = await fetch("/api/flyer", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ formato: "redes", flyer: { productos: [] } }),
      redirect: "manual",
    });
    return { status: r.status, tipo: r.headers.get("content-type") || "", opaca: r.type };
  });
  check("R2.2a", "Sin sesión, /api/flyer no devuelve ninguna imagen",
    !sinSesion.tipo.includes("image/png"), JSON.stringify(sinSesion));

  // ---------- R3.7: lo cargado sobrevive a recargar ----------
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-test="fila-producto"]');
  await listo(page);
  await pausa(200);
  check("R3.7", "Al recargar la página los 3 productos siguen cargados",
    (await t("fila-producto").count()) === 3 && (await t("producto-nombre").first().inputValue()) === "Asado",
    `${await t("fila-producto").count()} productos`);

  // ---------- R1.7: seis productos entran ----------
  for (let i = 3; i < 6; i++) await cargar(i, `Producto ${i + 1}`, 1000 * (i + 1), null, "c/u");
  await pausa(300);
  check("R1.7a", "Se pueden cargar 6 productos", (await t("fila-producto").count()) === 6);
  check("R1.7b", "Al llegar a 6 no deja agregar más", await t("btn-agregar-producto").isDisabled());
  const seis = await bajar("redes");
  const mSeis = medidasPNG(seis.buf);
  fs.renameSync(seis.destino, path.join(OUT, "flyer-seis-productos.png"));
  check("R1.7c", "El flyer de 6 productos también sale de 1080×1350", mSeis && mSeis.ancho === 1080 && mSeis.alto === 1350, JSON.stringify(mSeis));

  // ---------- R1.7: una sola oferta llena el flyer ----------
  while ((await t("fila-producto").count()) > 1) {
    await t("btn-quitar-producto").last().click();
    await pausa(120);
  }
  check("R1.7d", "Se puede dejar una sola oferta", (await t("fila-producto").count()) === 1);
  await t("formato-story").click();
  await pausa(250);
  const una = await bajar("story");
  const mUna = medidasPNG(una.buf);
  fs.renameSync(una.destino, path.join(OUT, "flyer-una-oferta.png"));
  check("R1.7e", "El flyer de una sola oferta sale de 1080×1920", mUna && mUna.ancho === 1080 && mUna.alto === 1920, JSON.stringify(mUna));

  // ---------- R6/R3.8: móvil ----------
  const mobile = await ctx.newPage();
  mobile.on("pageerror", (e) => errores.push(String(e)));
  await mobile.setViewportSize({ width: 390, height: 844 });
  await mobile.goto(URL, { waitUntil: "domcontentloaded" });
  await mobile.waitForSelector('[data-test="flyer-previa"]');
  await listo(mobile);
  await mobile.waitForTimeout(400);
  const desborde = () => mobile.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("R3.8a", "En móvil la pantalla no se desborda a lo ancho", (await desborde()) <= 1, `${await desborde()}px`);
  const cajaMovil = await mobile.locator('[data-test="flyer-previa"]').boundingBox();
  check("R3.8b", "La previa entra en el ancho del teléfono",
    cajaMovil && cajaMovil.x >= 0 && cajaMovil.x + cajaMovil.width <= 390, JSON.stringify(cajaMovil));
  await mobile.screenshot({ path: path.join(OUT, "flyer-movil.png"), fullPage: true });

  /*
   * Los 400 de R2.4 los provoca esta misma prueba a propósito, y el navegador los anota como
   * error de red: no son fallas de la pantalla, así que no cuentan.
   */
  const inesperados = errores.filter((e) => !/status of 400/.test(e));
  check("R4.3", "Sin errores de JavaScript en consola", inesperados.length === 0, inesperados.join(" | ").slice(0, 300));

  // El informe va antes de cerrar: en esta máquina el close() de Edge headless tarda minutos.
  browser.close().catch(() => {});

  const fallidos = results.filter((r) => !r.ok);
  console.log("\n=== Verificación del flyer de ofertas ===\n");
  results.forEach((r) => {
    console.log(`${r.ok ? "OK  " : "FALLA"} ${r.id.padEnd(7)} ${r.desc}${r.detail ? `  [${r.detail}]` : ""}`);
  });
  console.log(`\n${results.length - fallidos.length}/${results.length} checks OK`);
  console.log(`Capturas y PNG en ${OUT}\n`);
  process.exit(fallidos.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
