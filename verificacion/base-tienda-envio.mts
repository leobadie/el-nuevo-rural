/*
 * Verificación de la migración 036 (envío y horario) contra Supabase
 * (SPEC-tienda-envio-horarios.md, req. 13–15 y 19).
 *
 * Uso: npm run verificar:base-tienda-envio   (después de pegar supabase/036_tienda_envio_horarios.sql)
 *
 * Crea pedidos de prueba con el teléfono 1100000008 y los borra al final. Para poder pedir,
 * abre la tienda y pone montos de prueba; al terminar (pase o falle) deja la configuración
 * EXACTAMENTE como estaba.
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
const { createClient } = require("@supabase/supabase-js");
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const TEL = "1100000008";
const CAMPOS = "abierta, costo_envio_centavos, envio_gratis_desde_centavos, minimo_envio_centavos, horario";
// "as": se asigna dentro de main(); sin esto TS lo da por null en el finally.
let original = null as Record<string, unknown> | null;

async function limpiar() {
  await admin.from("tienda_pedidos").delete().eq("telefono", TEL);
}

async function main() {
  const cfg = await admin.from("tienda_config").select(CAMPOS).eq("id", true).single();
  if (cfg.error) {
    console.error(`Falta la migración 036: ${cfg.error.message}`);
    process.exit(2);
  }
  original = cfg.data;
  ok(true, "Existen las columnas de envío y horario en tienda_config");
  await limpiar();

  // Un producto común publicado, para armar pedidos de monto conocido.
  const ocultas = ((await admin.from("tienda_categorias").select("id").eq("visible", false)).data ?? []).map((c: { id: string }) => c.id);
  let q = admin
    .from("tienda_productos")
    .select("codigo_xrp, precio_centavos")
    .eq("visible", true)
    .eq("en_ultima_importacion", true)
    .eq("fraccionable", false)
    .gt("precio_centavos", 100000)
    .lt("precio_centavos", 1000000)
    .order("codigo_xrp")
    .limit(1);
  if (ocultas.length) q = q.or(`categoria_id.is.null,categoria_id.not.in.(${ocultas.join(",")})`);
  const prod = (await q.single()).data as { codigo_xrp: string; precio_centavos: number };
  const P = prod.precio_centavos;

  // Montos armados alrededor del precio: mínimo = 2 unidades, gratis desde 4 unidades.
  const COSTO = 150000;
  const set = await admin
    .from("tienda_config")
    .update({ abierta: true, costo_envio_centavos: COSTO, envio_gratis_desde_centavos: 4 * P, minimo_envio_centavos: 2 * P })
    .eq("id", true);
  if (set.error) throw new Error(set.error.message);

  const pedir = (cantidad: number, entrega: "envio" | "retiro", extra: Record<string, unknown> = {}) =>
    anon.rpc("tienda_crear_pedido", {
      p: {
        nombre: "Prueba envío", telefono: TEL, entrega, direccion: "San Martín 450", forma_pago: "efectivo",
        lineas: [{ codigo: prod.codigo_xrp, cantidad }], ...extra,
      },
    });

  const bajo = await pedir(1, "envio");
  ok(!!bajo.error && bajo.error.message.includes(`tienda: minimo ${2 * P}`), "Envío bajo el mínimo se rechaza con el monto", bajo.error?.message ?? "se creó");

  const retiro = await pedir(1, "retiro");
  ok(!retiro.error && retiro.data.costo_envio_centavos === 0 && retiro.data.total_centavos === P, "Retiro no tiene mínimo ni costo", retiro.error?.message ?? retiro.data);

  const conCosto = await pedir(2, "envio", { costo_envio_centavos: 0, total_centavos: 1 });
  ok(
    !conCosto.error && conCosto.data.costo_envio_centavos === COSTO && conCosto.data.total_centavos === 2 * P + COSTO && !conCosto.data.envio_a_confirmar,
    "Envío con costo: lo suma al total (e ignora costo y total mandados desde afuera)",
    conCosto.error?.message ?? conCosto.data,
  );

  const gratis = await pedir(4, "envio");
  ok(!gratis.error && gratis.data.costo_envio_centavos === 0 && gratis.data.total_centavos === 4 * P, "Desde el monto de envío gratis, el envío es 0", gratis.error?.message ?? gratis.data);

  // Lo guardado y lo que devuelve tienda_ver_pedido.
  if (!conCosto.error) {
    const ver = await anon.rpc("tienda_ver_pedido", { p_numero: conCosto.data.numero, p_token: conCosto.data.token });
    ok(
      !ver.error && ver.data.subtotal_centavos === 2 * P && ver.data.costo_envio_centavos === COSTO && ver.data.envio_a_confirmar === false && "horario" in ver.data,
      "tienda_ver_pedido devuelve subtotal, envío y horario",
      ver.error?.message ?? "",
    );
  }

  // Sin costo cargado: "a confirmar", como en la etapa 1.
  await admin.from("tienda_config").update({ costo_envio_centavos: null, minimo_envio_centavos: 0 }).eq("id", true);
  const aConf = await pedir(1, "envio");
  ok(!aConf.error && aConf.data.envio_a_confirmar === true && aConf.data.costo_envio_centavos === 0, "Sin costo cargado el envío queda 'a confirmar'", aConf.error?.message ?? aConf.data);

  // Restricciones de la tabla.
  const negativo = await admin.from("tienda_config").update({ costo_envio_centavos: -1 }).eq("id", true);
  ok(!!negativo.error, "Un costo negativo se rechaza");
  const horarioMal = await admin.from("tienda_config").update({ horario: [1, 2] }).eq("id", true);
  ok(!!horarioMal.error, "El horario tiene que ser un objeto");
  const anonEdita = await anon.from("tienda_config").update({ costo_envio_centavos: 1 }).eq("id", true).select("id");
  ok(!anonEdita.error ? (anonEdita.data ?? []).length === 0 : true, "Sin login no se puede cambiar la configuración");
}

try {
  await main();
} catch (e) {
  fallos++;
  console.error("ERROR inesperado:", e);
} finally {
  await limpiar();
  if (original) {
    const r = await admin.from("tienda_config").update(original).eq("id", true);
    ok(!r.error, "La configuración quedó como estaba", r.error?.message ?? (original.abierta ? "abierta" : "cerrada"));
  }
}
console.log(fallos ? `\n${fallos} check(s) fallaron` : "\nTodos los checks pasaron");
process.exit(fallos ? 1 : 0);
