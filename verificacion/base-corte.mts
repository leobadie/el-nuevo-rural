/*
 * Verificación de que la migración 024 quedó bien aplicada (SPEC-corte-registros.md, punto 11):
 * la tabla, el corte del 27/09/2026, que sin sesión no se lee ni se cambia, y —sólo leyendo—
 * cuánto de lo que hay en la base queda de cada lado del corte. No escribe nada en los datos de
 * Ingresos y Egresos.
 *
 * Uso: npm run verificar:base-corte   (después de pegar supabase/024 en el editor SQL)
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require(path.join(process.cwd(), "node_modules", "typescript")) as typeof import("typescript");

let fallos = 0;
function ok(cond: boolean, desc: string, detalle: string | number = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${desc}${detalle !== "" ? `  → ${detalle}` : ""}`);
  if (!cond) fallos++;
}

const env: Record<string, string> = { ...(process.env as Record<string, string>) };
for (const linea of fs.readFileSync(path.join(process.cwd(), ".env.local"), "utf8").split(/\r?\n/)) {
  const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { createClient } = require("@supabase/supabase-js");
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

// Las mismas cuentas que usa la app, para que lo que se imprime sea lo que se va a ver.
const fuente = fs.readFileSync(path.join(process.cwd(), "src", "lib", "ingresos-egresos", "corte.ts"), "utf8");
const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const modulo = { exports: {} as typeof import("../src/lib/ingresos-egresos/corte.ts") };
new Function("exports", "module", "require", js)(modulo.exports, modulo, require);
const { aplicarCorte, textoGuardados } = modulo.exports;

console.log("=== La migración 024 ===");
const { data: fila, error } = await admin.from("config_ingresos_egresos").select("corte").eq("id", true).maybeSingle();
if (error) {
  ok(false, "Existe config_ingresos_egresos: falta aplicar supabase/024_corte_ingresos_egresos.sql", error.message);
} else {
ok(!!fila, "Hay una fila con el corte");
const corte: string | null = fila?.corte ?? null;
ok(!!corte && Date.parse(corte) === Date.parse("2026-09-27T03:00:00Z"), "El corte es el 27/09/2026 a las 00:00 de Argentina", corte ?? "sin corte");

const { data: vistaAnon } = await anon.from("config_ingresos_egresos").select("*");
ok((vistaAnon ?? []).length === 0, "Sin sesión no se lee el corte", `${vistaAnon?.length ?? 0} fila(s)`);
const { data: cambioAnon } = await anon.from("config_ingresos_egresos").update({ corte: null }).eq("id", true).select();
const { data: sigue } = await admin.from("config_ingresos_egresos").select("corte").eq("id", true).single();
ok((cambioAnon ?? []).length === 0 && sigue?.corte === corte, "Sin sesión no se puede cambiar", sigue?.corte ?? "");
const { error: eDos } = await admin.from("config_ingresos_egresos").insert({ id: false, corte: null });
ok(!!eDos, "Tiene una sola fila", eDos?.message ?? "aceptó una segunda fila");

console.log("\n=== Qué se va a ver (sólo lectura) ===");
const leer = async (tabla: string) => ((await admin.from(tabla).select("*")).data ?? []) as never[];
const datos = {
  movimientos: await leer("movimientos"),
  ventasXRP: await leer("ventas_xrp"),
  pedidos: await leer("pedidos"),
  entregas: await leer("entregas_proveedor"),
  imputaciones: await leer("imputaciones_pago"),
};
const { visibles, guardados } = aplicarCorte(datos, corte);
console.log(`      Guardado antes del corte: ${textoGuardados(guardados) || "nada"}`);
console.log(`      Desde el corte: ${visibles.movimientos.length} movimientos, ${visibles.ventasXRP.length} ventas XRP, ${visibles.pedidos.length} pedidos, ${visibles.entregas.length} entregas, ${visibles.imputaciones.length} pagos aplicados`);
ok(
  guardados.movimientos + visibles.movimientos.length === datos.movimientos.length &&
    guardados.entregas + visibles.entregas.length === datos.entregas.length,
  "No se pierde nada: lo guardado más lo visible es todo lo que hay en la base",
  `${datos.movimientos.length} movimientos en total`,
);

}

console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} FALLA(S)`}`);
// exitCode y no process.exit(): cortar con conexiones abiertas hace fallar a Node en Windows.
process.exitCode = fallos === 0 ? 0 : 1;
