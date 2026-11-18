/*
 * Verificación de punta a punta de la tienda en un navegador real (SPEC-tienda.md, req. 11–22).
 *
 * Necesita: dev server corriendo, migración 033 aplicada, el Excel importado desde /catalogo,
 * WhatsApp cargado y la tienda abierta. No cambia la configuración.
 *
 * Hace un pedido de verdad (teléfono de prueba 1100000009) y lo borra al final con la
 * service_role. El enlace a wa.me se intercepta: no se abre WhatsApp.
 *
 * Uso:
 *   1) npm run dev              (en otra terminal)
 *   2) npm run verificar:tienda
 */
import { chromium } from "playwright-core";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

const URL_BASE = process.env.URL_BASE || "http://localhost:3000";
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), "capturas");
const TEL = "1100000009";
const NAVEGADORES = [
  process.env.NAVEGADOR,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);

function leerEnv() {
  const env = { ...process.env };
  for (const linea of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}
const env = leerEnv();
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const results = [];
const check = (id, desc, ok, detail) => results.push({ id, desc, ok: !!ok, detail: detail === undefined ? "" : String(detail) });
const plano = (s) => s.replace(/[\u00a0\u202f\s]+/g, " ").trim();

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  await admin.from("tienda_pedidos").delete().eq("telefono", TEL);

  const cfg = (await admin.from("tienda_config").select("abierta, whatsapp").eq("id", true).single()).data;
  if (!cfg?.abierta || !cfg?.whatsapp) {
    console.error("La tienda tiene que estar abierta y con WhatsApp cargado (desde /catalogo).");
    process.exit(2);
  }
  // Publicados = visibles, del último Excel y de una categoría visible (o sin categoría):
  // la misma regla que el RLS. Los cigarrillos están cargados pero su categoría está oculta.
  const ocultas = ((await admin.from("tienda_categorias").select("id").eq("visible", false)).data ?? []).map((c) => c.id);
  let consulta = admin
    .from("tienda_productos").select("codigo_xrp", { count: "exact", head: true }).eq("visible", true).eq("en_ultima_importacion", true);
  if (ocultas.length) consulta = consulta.or(`categoria_id.is.null,categoria_id.not.in.(${ocultas.join(",")})`);
  const { count: publicados } = await consulta;

  const browser = await chromium.launch({ executablePath: NAVEGADORES.find((p) => fs.existsSync(p)), headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const errores = [];
  let enlaceWa = null;
  await ctx.route("https://wa.me/**", (route) => {
    enlaceWa = route.request().url();
    return route.fulfill({ status: 200, contentType: "text/html", body: "<p>WhatsApp (simulado)</p>" });
  });

  const page = await ctx.newPage();
  page.on("pageerror", (e) => errores.push(String(e)));
  page.on("console", (m) => m.type() === "error" && errores.push(m.text()));
  const pausa = (ms = 250, p = page) => p.waitForTimeout(ms);
  const contador = async (p = page) => (await p.getByRole("link", { name: /^Carrito/ }).getAttribute("aria-label")) ?? "";

  // ---------- Inicio ----------
  const t0 = Date.now();
  await page.goto(`${URL_BASE}/tienda`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("article", { timeout: 60000 });
  await page.evaluate(() => localStorage.removeItem("tienda-carrito-v1"));
  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("article");
  check("R11", "/tienda abre sin login y muestra productos", new URL(page.url()).pathname === "/tienda", `${Date.now() - t0} ms`);
  const total = Number((await page.getByText(/^\d+ productos?$/).first().innerText()).replace(/\D/g, ""));
  check("R12a", "Muestra todos los productos publicados", total === publicados, `${total} en pantalla / ${publicados} en la base`);
  check("R12b", "De a 40 tarjetas", (await page.locator("article").count()) === Math.min(40, total));
  await page.getByRole("button", { name: /Mostrar más/ }).click();
  await pausa();
  check("R12c", "'Mostrar más' agrega 40", (await page.locator("article").count()) === Math.min(80, total));
  const cigarrillos = await page.getByRole("button", { name: "Cigarrillos", exact: true }).count();
  check("R25", "La categoría Cigarrillos no aparece", cigarrillos === 0);

  // ---------- Categorías ----------
  await page.getByRole("button", { name: "Carnicería", exact: true }).click();
  await pausa();
  const titulo = plano(await page.locator("h1").first().innerText());
  const nCarne = Number((await page.getByText(/^\d+ productos?$/).first().innerText()).replace(/\D/g, ""));
  check("R12d", "Filtrar por categoría", titulo === "Carnicería" && nCarne > 0 && nCarne < total, `${titulo}: ${nCarne}`);
  const tarjetasCarne = await page.locator("article").allInnerTexts();
  check("R14a", "En Carnicería todo muestra precio por kilo", tarjetasCarne.every((t) => /\/kg/.test(plano(t))), tarjetasCarne.find((t) => !/\/kg/.test(plano(t)))?.slice(0, 60) ?? "");
  await page.getByRole("button", { name: "Todo", exact: true }).click();

  // ---------- Búsqueda ----------
  const buscador = page.getByRole("searchbox", { name: "Buscar productos" });
  await buscador.fill("ACEITE girasol");
  await pausa(400);
  const nombres = (await page.locator("article h3").allInnerTexts()).map(plano);
  check("R13a", "Busca sin importar mayúsculas y con todas las palabras", nombres.length > 0 && nombres.every((n) => /aceite/i.test(n) && /girasol/i.test(n)), `${nombres.length}: ${nombres.slice(0, 3).join(" | ")}`);
  // En XRP el azúcar está cargado SIN tilde ("Azucar Comun"): buscar CON tilde lo tiene que encontrar.
  await buscador.fill("azúcar común");
  await pausa(400);
  const azucar = (await page.locator("article h3").allInnerTexts()).map(plano);
  check("R13b", "'azúcar común' (con tildes) encuentra 'Azucar Comun' (sin tildes)", azucar.length > 0 && azucar.every((n) => /az[uú]car com[uú]n/i.test(n)), `${azucar.length}: ${azucar.slice(0, 3).join(" | ")}`);
  await buscador.fill("xyzqwv");
  await pausa(400);
  check("R13c", "Sin resultados lo dice", (await page.getByText("No encontramos eso").count()) === 1);
  check("R14b", "Los nombres en MAYÚSCULAS se ven en tipo oración", nombres.every((n) => n !== n.toUpperCase()), nombres.find((n) => n === n.toUpperCase()) ?? "");

  // ---------- Carrito desde las tarjetas ----------
  await buscador.fill("aceite girasol natura");
  await pausa(400);
  const aceite = page.locator("article").first();
  const nombreAceite = plano(await aceite.locator("h3").innerText());
  await aceite.getByRole("button", { name: "Agregar" }).click();
  await aceite.getByRole("button", { name: "Más" }).click();
  await pausa();
  check("R15a", "Agregar y + suman unidades", plano(await aceite.getByRole("group").innerText()) === "2");

  await buscador.fill("molleja");
  await pausa(400);
  const molleja = page.locator("article").first();
  const textoMolleja = plano(await molleja.innerText());
  check("R14c", "Un pesable muestra $/kg y 'Se pesa'", /\/kg/.test(textoMolleja) && textoMolleja.includes("Se pesa"), textoMolleja.slice(0, 80));
  await molleja.getByRole("button", { name: "Agregar" }).click();
  await pausa();
  check("R15b", "Un pesable entra en gramos (500 g)", plano(await molleja.getByRole("group").innerText()) === "500 g");
  check("R15c", "El contador del carrito se actualiza", (await contador()).includes("2 productos"), await contador());

  await page.reload({ waitUntil: "domcontentloaded" });
  await page.waitForSelector("article");
  await pausa(500);
  check("R16a", "El carrito sobrevive a recargar", (await contador()).includes("2 productos"), await contador());
  const guardado = await page.evaluate(() => localStorage.getItem("tienda-carrito-v1"));
  check("R16b", "El navegador guarda códigos y cantidades, no precios", /^\[\["[^"]+",2\],\["[^"]+",0\.5\]\]$/.test(guardado ?? ""), guardado);

  // ---------- Carrito y pedido ----------
  await page.getByRole("link", { name: /^Carrito/ }).click();
  await page.waitForSelector("#titulo-carrito");
  await pausa(400);
  const textoTotal = plano(await page.locator('[data-test="total"]').innerText());
  const totalPagina = plano(await page.locator("section").first().innerText());
  check("R17a", "El carrito muestra las dos líneas", totalPagina.includes(nombreAceite) && /Molleja/i.test(totalPagina), totalPagina.slice(0, 120));
  check("R17b", "Con pesables, el total dice 'aproximado' y explica la balanza", totalPagina.includes("Total aproximado") && totalPagina.includes("balanza"), textoTotal);
  await page.screenshot({ path: path.join(OUT, "tienda-carrito-desktop.png"), fullPage: true, caret: "initial" });

  await page.getByRole("button", { name: /Enviar pedido por WhatsApp/ }).click();
  await pausa();
  const errNombre = await page.getByText("Poné tu nombre.").count();
  const errTel = await page.getByText(/Entre 8 y 15 números/).count();
  check("R18a", "Sin datos marca los errores al lado de cada campo", errNombre === 1 && errTel === 1);
  check("R18b", "El foco va al primer campo con error", await page.evaluate(() => document.activeElement?.id === "campo-nombre"));

  await page.getByRole("radio", { name: /Envío/ }).click();
  await page.getByLabel("Nombre").fill("Prueba Claude");
  await page.getByLabel("Teléfono (WhatsApp)").fill("11 0000-0009");
  await page.getByRole("button", { name: /Enviar pedido por WhatsApp/ }).click();
  await pausa();
  check("R18c", "Envío sin dirección pide la dirección", (await page.getByText(/Poné la dirección/).count()) === 1);
  await page.getByLabel("Dirección").fill("San Martín 450");
  await page.getByText("Transferencia", { exact: true }).click();
  await page.getByLabel("Nota (opcional)").fill("Prueba automática, no preparar");
  await page.getByRole("button", { name: /Enviar pedido por WhatsApp/ }).click();

  await page.waitForURL(/\/tienda\/pedido\/\d+\?t=/, { timeout: 30000 }).catch(() => {});
  const urlPedido = page.url();
  // El pedido se abre solo en WhatsApp: esperamos esa navegación (interceptada).
  await page.waitForURL(/wa\.me/, { timeout: 15000 }).catch(() => {});
  check("R19a", "Al enviar se guarda y va a la pantalla del pedido", /\/tienda\/pedido\/\d+\?t=/.test(urlPedido), urlPedido);
  const numero = Number(urlPedido.match(/pedido\/(\d+)/)?.[1]);
  check("R19b", "Abre WhatsApp solo, al número configurado", enlaceWa?.startsWith(`https://wa.me/${cfg.whatsapp}?text=`), enlaceWa?.slice(0, 40));
  const texto = enlaceWa ? decodeURIComponent(new URL(enlaceWa).searchParams.get("text") ?? "") : "";
  check("R19c", "El mensaje trae número de pedido, líneas, total, entrega, pago y datos",
    texto.includes(`(#${numero})`) && texto.includes("• 2 ×") && texto.includes("• 500 g") && texto.includes("*Total aproximado:")
      && texto.includes("Envío a domicilio: San Martín 450") && texto.includes("Pago: Transferencia") && texto.includes("Teléfono: 1100000009"),
    texto.replace(/\n/g, " / ").slice(0, 200));

  const enBase = (await admin.from("tienda_pedidos").select("total_centavos, total_aproximado, entrega").eq("numero", numero).single()).data;
  const totalMensaje = Number((texto.match(/Total aproximado: \$ ([\d.]+)/)?.[1] ?? "").replace(/\./g, "")) * 100;
  check("R19d", "El total del mensaje es el que guardó la base", enBase && enBase.total_centavos === totalMensaje, `${enBase?.total_centavos} / ${totalMensaje}`);

  await page.goto(urlPedido.replace("&nuevo=1", ""), { waitUntil: "domcontentloaded" });
  await page.waitForSelector('[data-test="abrir-whatsapp"]');
  const pantalla = plano(await page.locator("main").innerText());
  check("R20a", "La pantalla del pedido muestra el número y el resumen", pantalla.includes(`Pedido #${numero}`) && pantalla.includes("Total aproximado"), pantalla.slice(0, 100));
  check("R20b", "…y el botón para volver a abrir WhatsApp", (await page.locator('[data-test="abrir-whatsapp"]').getAttribute("href"))?.startsWith("https://wa.me/"));
  check("R19e", "Después de enviar, el carrito queda vacío", !(await contador()).match(/[1-9] producto/), await contador());
  await page.screenshot({ path: path.join(OUT, "tienda-pedido-desktop.png"), fullPage: true, caret: "initial" });

  await page.goto(urlPedido.replace(/t=[^&]+/, "t=00000000-0000-0000-0000-000000000000"), { waitUntil: "domcontentloaded" });
  check("R5", "Con otro token no se ve el pedido", (await page.getByText("No encontramos ese pedido").count()) === 1);

  // ---------- Celular ----------
  const movil = await browser.newContext({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
  const m = await movil.newPage();
  m.on("pageerror", (e) => errores.push(String(e)));
  await m.goto(`${URL_BASE}/tienda`, { waitUntil: "domcontentloaded" });
  await m.waitForSelector("article");
  await pausa(500, m);
  const desborde = async () => m.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  check("R21a", "Inicio a 375 px sin scroll horizontal", (await desborde()) <= 0, `${await desborde()}px`);
  await m.screenshot({ path: path.join(OUT, "tienda-inicio-movil.png"), caret: "initial" });
  await m.locator("article").first().getByRole("button", { name: "Agregar" }).click();
  await pausa(300, m);
  check("R21b", "En el celular aparece la barra 'Ver carrito'", (await m.getByRole("link", { name: /Ver carrito \(1\)/ }).count()) === 1);
  await m.screenshot({ path: path.join(OUT, "tienda-inicio-movil-carrito.png"), caret: "initial" });
  await m.getByRole("link", { name: /Ver carrito/ }).click();
  await m.waitForSelector("#titulo-carrito");
  await pausa(400, m);
  check("R21c", "Carrito a 375 px sin scroll horizontal", (await desborde()) <= 0, `${await desborde()}px`);
  const botonesChicos = await m.evaluate(() =>
    [...document.querySelectorAll("main button, main a")]
      .filter((b) => b.getBoundingClientRect().height > 0 && b.getBoundingClientRect().height < 44 && !b.closest("p"))
      .map((b) => `${b.textContent?.trim() || b.getAttribute("aria-label")}:${Math.round(b.getBoundingClientRect().height)}`),
  );
  check("R21d", "Botones del carrito de al menos 44 px", botonesChicos.length === 0, botonesChicos.join(", "));
  await m.screenshot({ path: path.join(OUT, "tienda-carrito-movil.png"), fullPage: true, caret: "initial" });
  await movil.close();

  check("R22", "Sin errores de JavaScript en consola", errores.length === 0, errores.join(" | ").slice(0, 400));

  await browser.close().catch(() => {});
}

try {
  await main();
} catch (e) {
  console.error(e);
  results.push({ id: "ERR", desc: "Error inesperado", ok: false, detail: String(e).slice(0, 300) });
} finally {
  const { error } = await admin.from("tienda_pedidos").delete().eq("telefono", TEL);
  check("LIMP", "Se borró el pedido de prueba", !error, error?.message ?? "");
}
const fallidos = results.filter((r) => !r.ok);
console.log("\n=== Verificación de la tienda (punta a punta) ===\n");
results.forEach((r) => console.log(`${r.ok ? "OK  " : "FALLA"} ${r.id.padEnd(5)} ${r.desc}${r.detail ? `  [${r.detail}]` : ""}`));
console.log(`\n${results.length - fallidos.length}/${results.length} checks OK\n`);
process.exit(fallidos.length === 0 ? 0 : 1);
