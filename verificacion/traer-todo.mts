/*
 * Verifica que traerTodo devuelva la tabla entera aunque Supabase corte en 1000 filas
 * (SPEC-traer-todo.md). Primero con una base falsa, después contra la base real —sólo
 * leyendo— con las mismas consultas que usan las páginas.
 *
 * Uso: npm run verificar:traer-todo
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript") as typeof import("typescript");

const fuente = fs.readFileSync(path.join(process.cwd(), "src", "lib", "supabase", "traerTodo.ts"), "utf8");
const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const modulo = { exports: {} as typeof import("../src/lib/supabase/traerTodo.ts") };
new Function("exports", "module", "require", js)(modulo.exports, modulo, require);
const { traerTodo } = modulo.exports;

let fallos = 0;
function ok(cond: boolean, desc: string, detalle: string | number = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${desc}${detalle !== "" ? `  → ${detalle}` : ""}`);
  if (!cond) fallos++;
}

/** Una tabla falsa que, como PostgREST, devuelve como mucho `tope` filas por pedido. */
function tablaFalsa(n: number, tope: number, opciones: { sinTotal?: boolean; fallaEn?: number } = {}) {
  const filas = Array.from({ length: n }, (_, i) => ({ id: i }));
  let pedidos = 0;
  const tramo = async (desde: number, hasta: number, conTotal: boolean) => {
    pedidos++;
    if (opciones.fallaEn !== undefined && desde === opciones.fallaEn) return { data: null, error: { message: "se cortó" } };
    const fin = Math.min(hasta, desde + tope - 1);
    return { data: filas.slice(desde, fin + 1), error: null, count: conTotal && !opciones.sinTotal ? n : null };
  };
  return { tramo, pedidos: () => pedidos };
}
const sinHuecos = (d: { id: number }[], n: number) => d.length === n && d.every((f, i) => f.id === i);

console.log("=== Base falsa ===");
{
  const t = tablaFalsa(1095, 1000);
  const r = await traerTodo(t.tramo);
  ok(!r.error && sinHuecos(r.data as { id: number }[], 1095), "1095 filas con tope 1000: vienen todas, en orden y sin repetir", r.data.length);
  ok(t.pedidos() === 2, "…en 2 pedidos", t.pedidos());
}
{
  const t = tablaFalsa(1095, 300);
  const r = await traerTodo(t.tramo);
  ok(sinHuecos(r.data as { id: number }[], 1095), "Si el servidor corta en 300 y no en 1000, igual vienen todas", r.data.length);
}
{
  const t = tablaFalsa(1000, 1000);
  const r = await traerTodo(t.tramo);
  ok(sinHuecos(r.data as { id: number }[], 1000) && t.pedidos() === 1, "Exactamente 1000: un solo pedido", t.pedidos());
}
{
  const r = await traerTodo(tablaFalsa(0, 1000).tramo);
  ok(!r.error && r.data.length === 0, "Tabla vacía: lista vacía sin error");
}
{
  const r = await traerTodo(tablaFalsa(2500, 1000, { sinTotal: true }).tramo);
  ok(sinHuecos(r.data as { id: number }[], 2500), "Sin total, sigue pidiendo hasta un tramo vacío", r.data.length);
}
{
  const r = await traerTodo(tablaFalsa(2500, 1000, { fallaEn: 1000 }).tramo);
  ok(!!r.error && r.data.length === 0, "Si falla un tramo devuelve el error, no una lista a medias", r.data.length);
}
{
  const r = await traerTodo(tablaFalsa(1095, 1000, { fallaEn: 0 }).tramo);
  ok(!!r.error && r.data.length === 0, "Si falla el primero también");
}

console.log("\n=== Base real (sólo lectura) ===");
const archivoEnv = [path.join(process.cwd(), ".env.local"), path.join(process.cwd(), "..", "..", "..", ".env.local")].find((p) => fs.existsSync(p));
if (!archivoEnv) {
  console.log("SKIP  no hay .env.local: no se prueba contra la base");
} else {
  const env: Record<string, string> = {};
  for (const l of fs.readFileSync(archivoEnv, "utf8").split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  const { createClient } = require("@supabase/supabase-js");
  const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });

  for (const tabla of ["movimientos", "cheques"]) {
    const { count } = await db.from(tabla).select("*", { count: "exact", head: true });
    const sinHelper = await db.from(tabla).select("id");
    const r = await traerTodo<{ id: string; fecha?: string }>((desde, hasta, conTotal) =>
      db.from(tabla).select("*", { count: conTotal ? "exact" : undefined }).order("creado_el", { ascending: true }).order("id", { ascending: true }).range(desde, hasta),
    );
    const ids = new Set(r.data.map((f) => f.id));
    ok(!r.error && r.data.length === count, `${tabla}: trae las ${count} filas (una consulta sola trae ${sinHelper.data?.length})`, r.data.length);
    ok(ids.size === r.data.length, `${tabla}: ninguna repetida`, ids.size);
    if (tabla === "movimientos") {
      const nov = r.data.filter((f) => (f.fecha ?? "") >= "2026-11-16" && (f.fecha ?? "") <= "2026-11-21").length;
      ok(nov > 0, "movimientos: están los del 16 al 21/11", nov);
    }
  }
}

console.log(fallos ? `\n${fallos} FALLO(S)` : "\nTodo OK");
process.exit(fallos ? 1 : 0);
