/*
 * Verifica que la migración 037 quedó aplicada (SPEC-cheque-a-proveedor.md, punto 1). Sólo lee:
 * no escribe nada en la base.
 *
 * Uso: npm run verificar:base-cheque-a-proveedor   (después de pegar supabase/037 en el editor SQL)
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
let fallos = 0;
function ok(cond: boolean, desc: string, detalle: string | number = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${desc}${detalle !== "" ? `  → ${detalle}` : ""}`);
  if (!cond) fallos++;
}

const env: Record<string, string> = { ...(process.env as Record<string, string>) };
const archivoEnv = [path.join(process.cwd(), ".env.local"), path.join(process.cwd(), "..", "..", "..", ".env.local")].find((p) => fs.existsSync(p))!;
for (const l of fs.readFileSync(archivoEnv, "utf8").split(/\r?\n/)) {
  const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
  if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
}
const { createClient } = require("@supabase/supabase-js");
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const col = await admin.from("movimientos").select("id, cheque_id").limit(1);
ok(!col.error, "movimientos.cheque_id existe", col.error?.message ?? "");

// El embed sólo anda si PostgREST ve la clave foránea movimientos.cheque_id → cheques.id.
const fk = await admin.from("movimientos").select("id, cheque_id, cheques(id, n_cheque)").not("cheque_id", "is", null).limit(5);
ok(!fk.error, "cheque_id es clave foránea a cheques", fk.error?.message ?? "");

const vinculados = await admin.from("movimientos").select("cheque_id").not("cheque_id", "is", null);
const ids = (vinculados.data ?? []).map((r: { cheque_id: string }) => r.cheque_id);
ok(!vinculados.error && new Set(ids).size === ids.length, "Ningún cheque está vinculado a dos pagos", `${ids.length} vinculados`);

// La consulta de Control de Cheques (la misma que usa la página).
const pagina = await admin.from("movimientos").select("id, cheque_id, proveedor, descripcion, fecha").not("cheque_id", "is", null).range(0, 999);
ok(!pagina.error, "La consulta de Control de Cheques responde", pagina.error?.message ?? `${pagina.data?.length} filas`);

const sinSesion = await anon.from("movimientos").select("id, cheque_id").limit(1);
ok(!sinSesion.error && (sinSesion.data ?? []).length === 0, "Sin sesión no se lee nada (RLS sigue igual)", sinSesion.error?.message ?? `${sinSesion.data?.length} filas`);

console.log(fallos ? `\n${fallos} FALLO(S)` : "\nTodo OK");
process.exit(fallos ? 1 : 0);
