/*
 * Verificación en navegador real de los componentes de la tienda (/tienda/diseno) y de que
 * /tienda sea pública sin abrir nada más.
 *
 * Uso:
 *   1) npm run dev              (en otra terminal)
 *   2) npm run verificar:tienda-diseno
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const URL_BASE = process.env.URL_BASE || "http://localhost:3000";
const PAGINA = `${URL_BASE}/tienda/diseno`;
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "capturas");
const NAVEGADORES = [
  process.env.NAVEGADOR,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);

const results = [];
const check = (id, desc, ok, detail) => results.push({ id, desc, ok: !!ok, detail: detail === undefined ? "" : String(detail) });
const plano = (s) => s.replace(/[\u00a0\u202f\s]+/g, " ").trim();

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const browser = await chromium.launch({ executablePath: NAVEGADORES.find((p) => fs.existsSync(p)), headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await ctx.newPage();
  const errores = [];
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errores.push(m.text()));

  const tarjeta = (texto, p = page) => p.locator("article").filter({ hasText: texto }).first();
  const textoDe = async (loc) => plano(await loc.innerText());
  const contador = async (p = page) => (await p.getByRole("link", { name: /^Carrito/ }).getAttribute("aria-label")) ?? "";
  const pausa = (ms = 150, p = page) => p.waitForTimeout(ms);

  // ---------- Acceso ----------
  const resp = await page.goto(PAGINA, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("article");
  await pausa(500);
  check("A1", "/tienda/diseno abre sin iniciar sesión", new URL(page.url()).pathname === "/tienda/diseno" && resp.status() === 200, `${resp.status()} ${page.url()}`);

  const aparte = await ctx.newPage();
  await aparte.goto(`${URL_BASE}/`, { waitUntil: "domcontentloaded" });
  check("A2", "El panel interno (/) sigue pidiendo login", new URL(aparte.url()).pathname === "/login", aparte.url());
  await aparte.goto(`${URL_BASE}/tiendas-falsas`, { waitUntil: "domcontentloaded" });
  check("A3", "Una ruta que sólo empieza con 'tienda' NO queda pública", new URL(aparte.url()).pathname === "/login", aparte.url());
  await aparte.close();

  // ---------- Tarjetas ----------
  check("T1", "Se ven las 8 tarjetas de muestra", (await page.locator("article").count()) === 8, await page.locator("article").count());

  for (const nombre of ["Bondiola pieza", "Molleja", "Arroz largo fino estuche"]) {
    const t = await textoDe(tarjeta(nombre));
    check("K1", `"${nombre}" (por kg) muestra el precio por kilo`, /\$ [\d.]+ ?\/kg/.test(t), t.slice(0, 90));
  }
  const aceite = await textoDe(tarjeta("Natura"));
  check("K2", "Aceite 1,5 L a $7.600 muestra $ 5.067 por litro", aceite.includes("$ 5.067 por litro"), aceite.slice(0, 120));
  check("K3", "Oferta: tachado y descuento (-15%)", aceite.includes("8.990") && aceite.includes("-15%"), aceite.slice(0, 120));
  const donJose = await textoDe(tarjeta("Don Jose").locator("h3"));
  check("K4", "Nombre en MAYÚSCULAS se muestra en tipo oración", donJose === "Aceite de girasol", donJose);
  const amargo = await textoDe(tarjeta("Amargo"));
  check("K5", "Precio con centavos: $ 159,90", amargo.includes("$ 159,90"), amargo.slice(0, 80));
  check("K6", "Pesables tienen la etiqueta 'Se pesa'", (await textoDe(tarjeta("Molleja"))).includes("Se pesa"));
  check("K7", "Arroz en paquete de 1 kg NO dice 'Se pesa'", !(await textoDe(tarjeta("Arroz largo"))).includes("Se pesa"));
  check("K8", "Bebida con alcohol lleva +18", (await textoDe(tarjeta("Fernet"))).includes("+18"));

  // ---------- Carrito ----------
  const antes = await contador();
  check("C0", "Arranca con 1 producto en el carrito (bondiola)", antes.includes("1 producto"), antes);

  await tarjeta("Molleja").getByRole("button", { name: "Agregar" }).click();
  await pausa();
  check("C1", "Agregar un pesable (paso 250 g) entra con 500 g", (await textoDe(tarjeta("Molleja"))).includes("500 g"));
  await tarjeta("Molleja").getByRole("button", { name: "Más" }).click();
  await pausa();
  check("C2", "'+' suma 250 g → 750 g", (await textoDe(tarjeta("Molleja"))).includes("750 g"));
  check("C3", "El contador del carrito pasa a 2", (await contador()).includes("2 productos"), await contador());

  const bondiola = tarjeta("Bondiola");
  check("C4", "Fiambre arranca en 200 g (paso 100 g)", (await textoDe(bondiola)).includes("200 g"));
  await bondiola.getByRole("button", { name: "Menos" }).click();
  await pausa();
  check("C5", "'−' baja a 100 g", (await textoDe(bondiola)).includes("100 g"));
  await bondiola.getByRole("button", { name: /Quitar/ }).click();
  await pausa();
  check("C6", "En el mínimo, el tacho lo quita y vuelve 'Agregar'", (await bondiola.getByRole("button", { name: "Agregar" }).count()) === 1);

  await tarjeta("Natura").getByRole("button", { name: "Agregar" }).click();
  await pausa();
  const grupo = tarjeta("Natura").getByRole("group");
  check("C7", "Por unidad entra con 1", (await textoDe(grupo)) === "1", await textoDe(grupo));
  await page.screenshot({ path: path.join(OUT, "tienda-diseno-desktop.png"), fullPage: true });

  // ---------- Celular ----------
  const movil = await ctx.newPage();
  movil.on("pageerror", (e) => errores.push(String(e)));
  await movil.setViewportSize({ width: 375, height: 812 });
  await movil.goto(PAGINA, { waitUntil: "domcontentloaded" });
  await movil.waitForSelector("article");
  await pausa(500, movil);
  const desborde = await movil.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("M1", "A 375 px no hay scroll horizontal", desborde <= 0, `${desborde}px`);
  const columnas = await movil.evaluate(() => {
    const xs = [...document.querySelectorAll("article")].slice(0, 4).map((a) => Math.round(a.getBoundingClientRect().left));
    return new Set(xs).size;
  });
  check("M2", "Tarjetas en 2 columnas en el celular", columnas === 2, columnas);
  const alto = await movil.evaluate(() => {
    const b = [...document.querySelectorAll("article button")].find((x) => x.textContent?.includes("Agregar"));
    return b ? Math.round(b.getBoundingClientRect().height) : 0;
  });
  check("M3", "El botón Agregar mide al menos 44 px de alto", alto >= 44, `${alto}px`);
  await movil.screenshot({ path: path.join(OUT, "tienda-diseno-movil.png"), fullPage: true });
  await movil.screenshot({ path: path.join(OUT, "tienda-diseno-movil-arriba.png") });

  check("E1", "Sin errores de JavaScript en consola", errores.length === 0, errores.join(" | ").slice(0, 400));

  browser.close().catch(() => {});
  const fallidos = results.filter((r) => !r.ok);
  console.log("\n=== Verificación de componentes de la tienda ===\n");
  results.forEach((r) => console.log(`${r.ok ? "OK  " : "FALLA"} ${r.id.padEnd(4)} ${r.desc}${r.detail ? `  [${r.detail}]` : ""}`));
  console.log(`\n${results.length - fallidos.length}/${results.length} checks OK\n`);
  process.exit(fallidos.length === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
