/*
 * Busca fotos de los productos publicados en Open Food Facts y las deja como SUGERENCIAS
 * pendientes para revisar en /catalogo (SPEC-tienda-fotos.md). No publica nada.
 *
 *   npm run tienda:fotos                       todos los que faltan
 *   npm run tienda:fotos -- --limite 30        sólo 30 (para probar)
 *   npm run tienda:fotos -- --reintentar-errores
 *
 * Necesita SUPABASE_SERVICE_ROLE_KEY en .env.local (escribe en Storage y en tablas que la
 * app sólo lee). Corre en la compu del usuario, nunca en la app.
 *
 * Consulta de a un producto, con pausa entre pedidos, y espera si Open Food Facts avisa
 * que van demasiado rápido (429). Se puede cortar con Ctrl+C y volver a correr: lo ya
 * consultado no se repite.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import {
  CREDITO_OFF,
  FUENTE_OFF,
  PAUSA_ENTRE_CONSULTAS_MS,
  USER_AGENT_OFF,
  codigoConsultable,
  esperaReintento,
  interpretar,
  rutaEnStorage,
  urlConsulta,
  validarImagen,
} from "../src/lib/tienda/fotosOff.ts";

const require = createRequire(import.meta.url);
const { createClient } = require("@supabase/supabase-js");

// ---------------------------------------------------------------- argumentos y entorno
const args = process.argv.slice(2);
const iLimite = args.indexOf("--limite");
const LIMITE = iLimite >= 0 ? Number(args[iLimite + 1]) : Infinity;
const REINTENTAR_ERRORES = args.includes("--reintentar-errores");
if (!(LIMITE > 0)) {
  console.error("--limite tiene que ser un número mayor que 0");
  process.exit(2);
}

function leerEnv() {
  const env = { ...process.env };
  for (const linea of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}
const env = leerEnv();
if (!env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Falta SUPABASE_SERVICE_ROLE_KEY en .env.local.");
  process.exit(2);
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
let cortar = false;
process.on("SIGINT", () => {
  if (cortar) process.exit(130);
  cortar = true;
  console.log("\nCortando después del producto actual… (Ctrl+C otra vez para salir ya)");
});

// ---------------------------------------------------------------- red con reintentos
async function pedir(url, { binario = false } = {}) {
  for (let intento = 1; ; intento++) {
    let status = null;
    try {
      const r = await fetch(url, { headers: { "User-Agent": USER_AGENT_OFF }, signal: AbortSignal.timeout(30_000) });
      status = r.status;
      if (r.ok || r.status === 404) {
        if (binario) return { status, datos: new Uint8Array(await r.arrayBuffer()) };
        const texto = await r.text();
        try {
          return { status, datos: JSON.parse(texto) };
        } catch {
          return { status, datos: null };
        }
      }
    } catch {
      status = null; // red o tiempo agotado
    }
    const espera = esperaReintento(intento, status);
    if (espera === null) return { status, datos: null };
    console.log(`   … ${status === 429 ? "Open Food Facts pide ir más despacio" : `sin respuesta (${status ?? "red"})`}: espero ${espera / 1000}s`);
    await dormir(espera);
  }
}

// ---------------------------------------------------------------- qué buscar
async function todos(consulta) {
  const filas = [];
  for (let desde = 0; ; desde += 1000) {
    const { data, error } = await consulta().range(desde, desde + 999);
    if (error) throw new Error(error.message);
    filas.push(...data);
    if (data.length < 1000) break;
  }
  return filas;
}

async function pendientes() {
  const productos = await todos(() =>
    sb
      .from("tienda_productos")
      .select("id, codigo_xrp, codigo_barras, nombre_xrp, categoria:tienda_categorias(visible)")
      .eq("visible", true)
      .eq("en_ultima_importacion", true)
      .is("foto_url", null)
      .order("codigo_xrp"),
  );
  const buscados = await todos(() => sb.from("tienda_fotos_busquedas").select("producto_id, resultado").order("producto_id"));
  const yaBuscado = new Map(buscados.map((b) => [b.producto_id, b.resultado]));
  return productos.filter((p) => {
    if (!codigoConsultable(p.codigo_barras)) return false;
    if (p.categoria && p.categoria.visible === false) return false; // cigarrillos y otras ocultas
    const previo = yaBuscado.get(p.id);
    return previo === undefined || (REINTENTAR_ERRORES && previo === "error");
  });
}

async function anotar(producto, resultado, detalle = null) {
  const { error } = await sb
    .from("tienda_fotos_busquedas")
    .upsert({ producto_id: producto.id, fuente: FUENTE_OFF, resultado, detalle, buscado_el: new Date().toISOString() });
  if (error) throw new Error(`anotar búsqueda: ${error.message}`);
}

// ---------------------------------------------------------------- un producto
async function procesar(p) {
  const r = await pedir(urlConsulta(p.codigo_barras));
  const i = interpretar(r.status ?? 0, r.datos);
  if (i.resultado === "error") return anotar(p, "error", i.detalle).then(() => "error");
  if (i.resultado !== "con_foto") return anotar(p, i.resultado, i.nombre).then(() => i.resultado);

  const img = await pedir(i.url, { binario: true });
  if (!img.datos) return anotar(p, "error", `no se pudo bajar la foto (${img.status ?? "red"})`).then(() => "error");
  const v = validarImagen(img.datos);
  if (!v.ok) return anotar(p, "error", `foto inválida: ${v.motivo}`).then(() => "error");

  const ruta = rutaEnStorage(p.codigo_xrp, v.extension);
  const subida = await sb.storage.from("tienda").upload(ruta, img.datos, { contentType: v.tipo, upsert: true, cacheControl: "604800" });
  if (subida.error) return anotar(p, "error", `no se pudo guardar: ${subida.error.message}`).then(() => "error");
  const url = sb.storage.from("tienda").getPublicUrl(ruta).data.publicUrl;

  // Si ya había una sugerencia decidida para este producto, no se toca (se respeta la decisión).
  const { error } = await sb.from("tienda_fotos_sugeridas").upsert(
    { producto_id: p.id, fuente: FUENTE_OFF, url, url_origen: i.url, nombre_origen: i.nombre, credito: CREDITO_OFF },
    { onConflict: "producto_id,fuente", ignoreDuplicates: true },
  );
  if (error) return anotar(p, "error", `no se pudo guardar la sugerencia: ${error.message}`).then(() => "error");
  await anotar(p, "con_foto", i.nombre);
  return "con_foto";
}

// ---------------------------------------------------------------- principal
const lista = (await pendientes()).slice(0, LIMITE);
console.log(`Productos para buscar: ${lista.length}${Number.isFinite(LIMITE) ? ` (límite ${LIMITE})` : ""}`);
const cuenta = { con_foto: 0, sin_foto: 0, no_esta: 0, error: 0 };
const inicio = Date.now();
for (const [k, p] of lista.entries()) {
  if (cortar) break;
  let res;
  try {
    res = await procesar(p);
  } catch (e) {
    console.error(`   ${p.codigo_xrp}: ${e.message}`);
    res = "error";
  }
  cuenta[res]++;
  if ((k + 1) % 25 === 0 || k === lista.length - 1) {
    const min = ((Date.now() - inicio) / 60000).toFixed(1);
    console.log(`${k + 1}/${lista.length} · con foto ${cuenta.con_foto} · sin foto ${cuenta.sin_foto} · no está ${cuenta.no_esta} · errores ${cuenta.error} · ${min} min`);
  }
  await dormir(PAUSA_ENTRE_CONSULTAS_MS);
}
console.log(
  `\nListo. Fotos sugeridas nuevas: ${cuenta.con_foto}. Sin foto: ${cuenta.sin_foto}. No están en Open Food Facts: ${cuenta.no_esta}. Errores: ${cuenta.error}.`,
);
console.log("Revisalas en /catalogo → Fotos sugeridas. Nada se publica hasta que las aceptes.");
