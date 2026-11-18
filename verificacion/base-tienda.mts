/*
 * Verificación de la migración 033 (tienda online) contra Supabase: RLS y las funciones
 * tienda_crear_pedido / tienda_ver_pedido / tienda_importar (SPEC-tienda.md, req. 1–5).
 *
 * Uso: npm run verificar:base-tienda   (después de pegar supabase/033_tienda.sql)
 *
 * Usa la service_role key para preparar datos de prueba y la anon key para comprobar lo
 * que ve y puede hacer alguien sin login (un cliente de la tienda).
 *
 * Para probar los pedidos abre la tienda un momento con un WhatsApp de prueba y al final
 * deja la configuración EXACTAMENTE como estaba. Todo lo que crea lleva la marca ZZ-PRUEBA
 * y se borra al final, pasen o fallen los checks.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

let fallos = 0;
function ok(cond: boolean, desc: string, detalle: unknown = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${desc}${detalle !== "" ? `  → ${typeof detalle === "string" ? detalle : JSON.stringify(detalle)}` : ""}`);
  if (!cond) fallos++;
}

function leerEnv(): Record<string, string> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  for (const linea of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = leerEnv();
if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.error("Faltan SUPABASE_SERVICE_ROLE_KEY o NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local.");
  process.exit(2);
}
const { createClient } = require("@supabase/supabase-js");
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const P = "ZZ-PRUEBA-";
const CAT_OCULTA = "ZZ Prueba oculta";
const TELS = ["1100000001", "1100000002", "1100000003", "1100000004"];
const WA_PRUEBA = "5490000000000";

type Config = Record<string, unknown>;
let configOriginal: Config | null = null;

async function ponerConfig(cambios: Config) {
  const { error } = await admin.from("tienda_config").update(cambios).eq("id", true);
  if (error) throw new Error(`config: ${error.message}`);
}

async function limpiar() {
  await admin.from("tienda_pedidos").delete().in("telefono", TELS);
  await admin.from("tienda_productos").delete().like("codigo_xrp", `${P}%`);
  await admin.from("tienda_categorias").delete().eq("nombre", CAT_OCULTA);
  if (configOriginal) await ponerConfig(configOriginal);
}

const pedidoBase = (lineas: unknown[], extra: Config = {}) => ({
  p: { nombre: "Prueba Claude", telefono: TELS[0], entrega: "retiro", forma_pago: "efectivo", nota: "", lineas, ...extra },
});
const errorDe = async (args: unknown) => {
  const { data, error } = await anon.rpc("tienda_crear_pedido", args);
  return error ? error.message : `sin error (pedido ${data?.numero})`;
};

async function main() {
  // ---------- estado inicial ----------
  const cfg = await admin.from("tienda_config").select("*").eq("id", true).maybeSingle();
  if (cfg.error) {
    console.error(`No se pudo leer tienda_config: ${cfg.error.message}\n¿Está aplicada supabase/033_tienda.sql?`);
    process.exit(2);
  }
  ok(!!cfg.data, "Existe la fila única de configuración");
  configOriginal = { abierta: cfg.data.abierta, whatsapp: cfg.data.whatsapp };
  await limpiar();

  const unica = await admin.from("tienda_config").insert({ id: false });
  ok(!!unica.error, "No se puede crear una segunda fila de configuración", unica.error?.message ?? "");

  // ---------- datos de prueba ----------
  const cat = await admin.from("tienda_categorias").insert({ nombre: CAT_OCULTA, slug: "zz-prueba-oculta", visible: false }).select("id").single();
  if (cat.error) throw new Error(cat.error.message);
  const base = { nombre_xrp: "Producto de prueba", busqueda: "prueba" };
  // En un insert de varias filas, PostgREST manda NULL en las columnas que una fila no trae
  // (no usa el default): cada fila declara TODAS las columnas que varían.
  const fila = (codigo: string, precio: number, porKg: boolean, extra: Partial<{ fraccionable: boolean; visible: boolean; en_ultima_importacion: boolean; categoria_id: string | null }> = {}) => ({
    ...base,
    codigo_xrp: `${P}${codigo}`,
    precio_centavos: precio,
    se_vende_por: porKg ? "kg" : "unidad",
    fraccionable: false,
    visible: true,
    en_ultima_importacion: true,
    categoria_id: null,
    ...extra,
  });
  const ins = await admin.from("tienda_productos").insert([
    fila("1", 123400, false),
    fila("2", 3500000, true, { fraccionable: true }),
    fila("3", 1000, false, { visible: false }),
    fila("4", 1000, false, { en_ultima_importacion: false }),
    fila("5", 1000, false, { categoria_id: cat.data.id }),
    fila("6", 360000, true),
  ]);
  ok(!ins.error, "Se cargan productos de prueba con la service_role", ins.error?.message ?? "");

  // ---------- restricciones ----------
  const tachadoMenor = await admin.from("tienda_productos").insert({ ...base, codigo_xrp: `${P}x1`, precio_centavos: 1000, precio_anterior_centavos: 900, se_vende_por: "unidad" });
  ok(!!tachadoMenor.error, "Rechaza un tachado menor que el precio");
  const tachadoIgual = await admin.from("tienda_productos").insert({ ...base, codigo_xrp: `${P}x2`, precio_centavos: 1000, precio_anterior_centavos: 1000, se_vende_por: "unidad" });
  ok(!!tachadoIgual.error, "Rechaza un tachado igual al precio");
  const pesableUnidad = await admin.from("tienda_productos").insert({ ...base, codigo_xrp: `${P}x3`, precio_centavos: 1000, se_vende_por: "unidad", fraccionable: true });
  ok(!!pesableUnidad.error, "Rechaza un pesable que se vende por unidad");
  const precioCero = await admin.from("tienda_productos").insert({ ...base, codigo_xrp: `${P}x4`, precio_centavos: 0, se_vende_por: "unidad" });
  ok(!!precioCero.error, "Rechaza precio 0");

  // ---------- RLS: tienda cerrada ----------
  await ponerConfig({ abierta: false, whatsapp: WA_PRUEBA });
  const cerrada = await anon.from("tienda_productos").select("codigo_xrp").like("codigo_xrp", `${P}%`);
  ok(!cerrada.error && cerrada.data.length === 0, "Con la tienda cerrada, anon no ve productos", cerrada.data?.length ?? cerrada.error?.message);
  ok((await errorDe(pedidoBase([{ codigo: `${P}1`, cantidad: 1 }]))).includes("tienda: cerrada"), "Con la tienda cerrada no entran pedidos");

  // ---------- RLS: tienda abierta ----------
  await ponerConfig({ abierta: true, whatsapp: WA_PRUEBA });
  const abierta = await anon.from("tienda_productos").select("codigo_xrp").like("codigo_xrp", `${P}%`).order("codigo_xrp");
  ok(
    JSON.stringify(abierta.data?.map((r: { codigo_xrp: string }) => r.codigo_xrp)) === JSON.stringify([`${P}1`, `${P}2`, `${P}6`]),
    "Abierta, anon ve sólo los visibles, del último Excel y de categoría visible",
    abierta.data?.map((r: { codigo_xrp: string }) => r.codigo_xrp) ?? abierta.error?.message,
  );
  const catAnon = await anon.from("tienda_categorias").select("nombre").eq("nombre", CAT_OCULTA);
  ok(catAnon.data?.length === 0, "anon no ve categorías ocultas");
  const insAnon = await anon.from("tienda_productos").insert({ ...base, codigo_xrp: `${P}anon`, precio_centavos: 1, se_vende_por: "unidad" });
  ok(!!insAnon.error, "anon no puede crear productos");
  const updAnon = await anon.from("tienda_productos").update({ precio_centavos: 1 }).eq("codigo_xrp", `${P}1`).select();
  const sigue = await admin.from("tienda_productos").select("precio_centavos").eq("codigo_xrp", `${P}1`).single();
  ok(sigue.data?.precio_centavos === 123400, "anon no puede cambiar precios", updAnon.error?.message ?? `filas: ${updAnon.data?.length}`);
  const cfgAnon = await anon.from("tienda_config").update({ whatsapp: "5491111111111" }).eq("id", true).select();
  const cfgSigue = await admin.from("tienda_config").select("whatsapp").eq("id", true).single();
  ok(cfgSigue.data?.whatsapp === WA_PRUEBA, "anon no puede cambiar la configuración", cfgAnon.error?.message ?? `filas: ${cfgAnon.data?.length}`);
  const impAnon = await anon.rpc("tienda_importar", { filas: [], archivo: "x", aplicar: false });
  ok(!!impAnon.error, "anon no puede importar", impAnon.error?.message ?? "");

  // ---------- pedido válido ----------
  const bueno = await anon.rpc("tienda_crear_pedido", pedidoBase(
    [
      { codigo: `${P}1`, cantidad: 2, precio_centavos: 1 },
      { codigo: `${P}2`, cantidad: 0.5 },
      { codigo: `${P}6`, cantidad: 1 },
    ],
    { telefono: "11 0000-0001", nota: "  probando  " },
  ));
  ok(!bueno.error, "Un pedido válido se guarda", bueno.error?.message ?? "");
  const d = bueno.data;
  ok(d?.total_centavos === 246800 + 1750000 + 360000, "Total con precios de la base (ignora el precio que manda el navegador)", d?.total_centavos);
  ok(d?.total_aproximado === true, "Con un pesable, el total es aproximado");
  ok(d?.whatsapp === WA_PRUEBA && typeof d?.numero === "number" && typeof d?.token === "string", "Devuelve número, token y WhatsApp");
  ok(d?.lineas?.[1]?.subtotal_centavos === 1750000 && Number(d?.lineas?.[1]?.cantidad) === 0.5, "500 g a $35.000/kg = $17.500", d?.lineas?.[1]);

  const pedAnon = await anon.from("tienda_pedidos").select("id");
  ok(!pedAnon.error && pedAnon.data.length === 0, "anon no puede leer pedidos", pedAnon.data?.length ?? pedAnon.error?.message);
  const linAnon = await anon.from("tienda_pedido_lineas").select("id");
  ok(!linAnon.error && linAnon.data.length === 0, "anon no puede leer líneas de pedidos");
  const guardado = await admin.from("tienda_pedidos").select("telefono, nota, entrega, direccion").eq("numero", d?.numero).single();
  ok(guardado.data?.telefono === TELS[0] && guardado.data?.nota === "probando", "Teléfono queda en dígitos y la nota sin espacios de más", guardado.data);

  // ---------- ver pedido ----------
  const visto = await anon.rpc("tienda_ver_pedido", { p_numero: d?.numero, p_token: d?.token });
  ok(visto.data?.numero === d?.numero && visto.data?.lineas?.length === 3, "Con el token se ve el pedido", visto.error?.message ?? "");
  const ajeno = await anon.rpc("tienda_ver_pedido", { p_numero: d?.numero, p_token: "00000000-0000-0000-0000-000000000000" });
  ok(ajeno.data === null, "Con otro token no se ve nada", ajeno.data);

  // ---------- pedidos inválidos ----------
  const casos: [string, unknown, string][] = [
    ["Producto pausado", pedidoBase([{ codigo: `${P}3`, cantidad: 1 }], { telefono: TELS[1] }), "no disponible"],
    ["Producto que ya no vino en el Excel", pedidoBase([{ codigo: `${P}4`, cantidad: 1 }], { telefono: TELS[1] }), "no disponible"],
    ["Producto de categoría oculta", pedidoBase([{ codigo: `${P}5`, cantidad: 1 }], { telefono: TELS[1] }), "no disponible"],
    ["Código inexistente", pedidoBase([{ codigo: `${P}nada`, cantidad: 1 }], { telefono: TELS[1] }), "no disponible"],
    ["Media unidad de algo que va por unidad", pedidoBase([{ codigo: `${P}1`, cantidad: 1.5 }], { telefono: TELS[1] }), "cantidad"],
    ["100 unidades", pedidoBase([{ codigo: `${P}1`, cantidad: 100 }], { telefono: TELS[1] }), "cantidad"],
    ["Paquete de 1 kg pedido en gramos", pedidoBase([{ codigo: `${P}6`, cantidad: 0.5 }], { telefono: TELS[1] }), "cantidad"],
    ["50 g de un pesable", pedidoBase([{ codigo: `${P}2`, cantidad: 0.05 }], { telefono: TELS[1] }), "cantidad"],
    ["11 kg de un pesable", pedidoBase([{ codigo: `${P}2`, cantidad: 11 }], { telefono: TELS[1] }), "cantidad"],
    ["Cantidad que no es número", pedidoBase([{ codigo: `${P}1`, cantidad: "dos" }], { telefono: TELS[1] }), "cantidad"],
    ["Línea repetida", pedidoBase([{ codigo: `${P}1`, cantidad: 1 }, { codigo: `${P}1`, cantidad: 1 }], { telefono: TELS[1] }), "linea repetida"],
    ["Carrito vacío", pedidoBase([], { telefono: TELS[1] }), "vacio"],
    ["Teléfono corto", pedidoBase([{ codigo: `${P}1`, cantidad: 1 }], { telefono: "123" }), "telefono"],
    ["Nombre de una letra", pedidoBase([{ codigo: `${P}1`, cantidad: 1 }], { telefono: TELS[1], nombre: "A" }), "nombre"],
    ["Envío sin dirección", pedidoBase([{ codigo: `${P}1`, cantidad: 1 }], { telefono: TELS[1], entrega: "envio", direccion: " " }), "direccion"],
    ["Forma de pago inventada", pedidoBase([{ codigo: `${P}1`, cantidad: 1 }], { telefono: TELS[1], forma_pago: "cripto" }), "pago"],
    ["Entrega inventada", pedidoBase([{ codigo: `${P}1`, cantidad: 1 }], { telefono: TELS[1], entrega: "dron" }), "entrega"],
  ];
  for (const [desc, args, esperado] of casos) {
    const m = await errorDe(args);
    ok(m.includes(`tienda: ${esperado}`), `Rechaza: ${desc}`, m);
  }
  const quedo = await admin.from("tienda_pedidos").select("id", { count: "exact", head: true }).eq("telefono", TELS[1]);
  ok(quedo.count === 0, "Un pedido rechazado no deja nada guardado (ni a medias)", quedo.count);

  const envio = await anon.rpc("tienda_crear_pedido", pedidoBase([{ codigo: `${P}1`, cantidad: 1 }], { telefono: TELS[2], entrega: "envio", direccion: "San Martín 450" }));
  ok(!envio.error && envio.data?.total_aproximado === false, "Envío con dirección y sin pesables: total exacto", envio.error?.message ?? "");
  const retiroDir = await anon.rpc("tienda_crear_pedido", pedidoBase([{ codigo: `${P}1`, cantidad: 1 }], { telefono: TELS[2], direccion: "No debería guardarse" }));
  const rd = await admin.from("tienda_pedidos").select("direccion").eq("numero", retiroDir.data?.numero).single();
  ok(rd.data?.direccion === null, "En un retiro no se guarda dirección", rd.data);

  // ---------- freno de ráfagas ----------
  let ultimo = "";
  for (let i = 0; i < 6; i++) ultimo = await errorDe(pedidoBase([{ codigo: `${P}1`, cantidad: 1 }], { telefono: TELS[3] }));
  ok(ultimo.includes("tienda: demasiados pedidos"), "El sexto pedido en 10 minutos del mismo teléfono se frena", ultimo);

  // ---------- sin WhatsApp ----------
  await ponerConfig({ abierta: true, whatsapp: null });
  ok((await errorDe(pedidoBase([{ codigo: `${P}1`, cantidad: 1 }], { telefono: TELS[2] }))).includes("sin whatsapp"), "Sin WhatsApp cargado no entran pedidos");
}

try {
  await main();
} catch (e) {
  fallos++;
  console.error("ERROR inesperado:", e);
} finally {
  await limpiar();
  const fin = await admin.from("tienda_config").select("abierta, whatsapp").eq("id", true).single();
  const restaurada = JSON.stringify({ abierta: fin.data?.abierta, whatsapp: fin.data?.whatsapp }) === JSON.stringify(configOriginal);
  ok(restaurada, "La configuración quedó como estaba", fin.data);
  const resto = await admin.from("tienda_productos").select("codigo_xrp", { count: "exact", head: true }).like("codigo_xrp", `${P}%`);
  ok(resto.count === 0, "No quedaron datos de prueba", resto.count);
}
console.log(fallos ? `\n${fallos} check(s) fallaron` : "\nTodos los checks pasaron");
process.exit(fallos ? 1 : 0);
