/*
 * Verificación de los datos realmente cargados en Supabase por scripts/importar-registros.mjs.
 * Uso: npm run verificar:base   (después de correr la importación)
 *
 * Los otros verificadores prueban el parseo (verificar:registros) y la pantalla con datos de
 * muestra (verificar:bcra). Este es el único que mira la base: que las filas hayan entrado,
 * que el cruce CUIT → personas funcione con datos reales y que el tamaño entre en el plan.
 *
 * Usa la service_role key porque las tablas tienen RLS y este script no tiene sesión de
 * usuario. Corre en la máquina del usuario, igual que el importador, nunca en la app.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { armarBloqueSociedad } from "../src/lib/registros/sociedad.ts";

const require = createRequire(import.meta.url);

let fallos = 0;
function ok(cond: boolean, desc: string, detalle: string | number = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${desc}${detalle !== "" ? `  → ${detalle}` : ""}`);
  if (!cond) fallos++;
}

function leerEnv(): Record<string, string> {
  const env: Record<string, string> = { ...(process.env as Record<string, string>) };
  const archivo = path.join(process.cwd(), ".env.local");
  for (const linea of fs.readFileSync(archivo, "utf8").split(/\r?\n/)) {
    const m = linea.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
  return env;
}

const env = leerEnv();
if (!env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Falta SUPABASE_SERVICE_ROLE_KEY en .env.local (la misma que usa el importador).");
  process.exit(2);
}
const { createClient } = require("@supabase/supabase-js");
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

async function contar(tabla: string): Promise<number> {
  const { count, error } = await sb.from(tabla).select("*", { count: "exact", head: true });
  if (error) throw new Error(`${tabla}: ${error.message}`);
  return count ?? 0;
}

console.log("=== R5.4 — Qué entró en la base ===");
const filasSociedades = await contar("sociedades");
const filasPersonas = await contar("sociedad_personas");
ok(filasSociedades > 1_200_000, "El registro nacional entró completo (más de 1,2M de CUIT)",
  filasSociedades.toLocaleString("es"));
ok(filasPersonas > 1_000_000, "Las personas de la IGJ entraron (más de 1M)",
  filasPersonas.toLocaleString("es"));

const { data: tamanos, error: errTam } = await sb.rpc("tamano_registros");
if (errTam) {
  ok(false, "La función tamano_registros() responde", errTam.message);
} else {
  for (const t of tamanos) console.log(`      ${t.tabla}: ${Number(t.filas).toLocaleString("es")} filas · ${t.tamano}`);
  const mb = tamanos.reduce((suma: number, t: { tamano: string }) => {
    const m = t.tamano.match(/([\d.]+)\s*(kB|MB|GB)/i);
    if (!m) return suma;
    const n = Number(m[1]);
    return suma + (/GB/i.test(m[2]) ? n * 1024 : /kB/i.test(m[2]) ? n / 1024 : n);
  }, 0);
  ok(mb < 500, "Entra en los 500 MB del plan gratuito", `${mb.toFixed(0)} MB ocupados`);
  /*
   * Entrar no alcanza: en el resto de la base están los cheques, los empleados y los ingresos
   * y egresos, que crecen todos los días, y estas dos tablas son casi todo el consumo. Si el
   * margen baja del 10 % conviene enterarse acá y no cuando Supabase ponga el proyecto en solo
   * lectura. Para recuperar espacio, ver supabase/010 y 011: el desglose sale de
   * detalle_registros().
   */
  ok(mb < 450, "Deja al menos un 10 % del plan libre para el resto de la app",
    `${(mb / 5).toFixed(0)} % del plan ocupado por los registros`);
}

console.log("\n=== R1 — Datos de la sociedad, con filas reales ===");
{
  const { data, error } = await sb
    .from("sociedades")
    .select("cuit, razon_social, tipo_societario, fecha_contrato, provincia, localidad, actividad, periodo_fuente")
    .not("fecha_contrato", "is", null)
    .not("actividad", "is", null)
    .limit(1);
  const s = data?.[0];
  ok(!error && !!s, "Trae una sociedad con todos los campos que muestra la pantalla",
    s ? s.razon_social : String(error?.message));
  if (s) {
    ok(/^\d{11}$/.test(s.cuit), "El CUIT son 11 dígitos, como el que se escribe en la pantalla", s.cuit);
    ok(/^\d{4}-\d{2}-\d{2}$/.test(s.fecha_contrato), "La fecha del contrato es una fecha real", s.fecha_contrato);
    ok(/^\d{6}$/.test(s.periodo_fuente ?? ""), "Guarda el período del archivo de origen", s.periodo_fuente);
  }
}

console.log("\n=== R2 — El cruce CUIT → personas funciona con datos reales ===");
{
  const { data: unaPersona } = await sb.from("sociedad_personas").select("cuit").limit(1);
  const cuit = unaPersona?.[0]?.cuit;
  ok(!!cuit, "Hay personas cargadas apuntando a un CUIT", cuit ?? "ninguna");
  if (cuit) {
    const { data: soc } = await sb.from("sociedades").select("*").eq("cuit", cuit).maybeSingle();
    const { data: personas } = await sb
      .from("sociedad_personas")
      .select("nombre, rol, tipo_documento, numero_documento")
      .eq("cuit", cuit);
    ok(!!soc, "Ese CUIT existe en sociedades: el cruce cierra en las dos direcciones",
      soc?.razon_social ?? "no está");
    ok((personas?.length ?? 0) > 0, "Y devuelve sus personas", `${personas?.length} personas`);

    // El mismo armado que hace la pantalla, pero con la fila real de la base.
    const bloque = armarBloqueSociedad(cuit, soc, personas ?? []);
    ok(bloque.motivoSinPersonas === null, "Con personas reales no inventa un motivo de ausencia",
      String(bloque.motivoSinPersonas));
    ok(bloque.personas.every((p) => ["S", "A", "R"].includes(p.rol)),
      "Todos los roles son de los tres válidos",
      [...new Set(bloque.personas.map((p) => p.rol))].join(""));
    ok(/accionistas/i.test(bloque.explicacion),
      "Aclara que los accionistas de una S.A. no son públicos");
  }
}

console.log("\n=== R3.1 — Una sociedad del interior no aparece como 'sin socios' ===");
{
  const { data } = await sb
    .from("sociedades")
    .select("cuit, razon_social, provincia, localidad, tipo_societario, fecha_contrato, actividad, periodo_fuente")
    .eq("provincia", "CORDOBA")
    .limit(20);
  const candidatas = data ?? [];
  ok(candidatas.length > 0, "Hay sociedades de Córdoba cargadas (la carga es nacional)",
    `${candidatas.length} traídas`);

  // La primera que efectivamente no tenga personas: es el caso que hay que explicar bien.
  let sinPersonas = null;
  for (const s of candidatas) {
    const { count } = await sb
      .from("sociedad_personas")
      .select("*", { count: "exact", head: true })
      .eq("cuit", s.cuit);
    if (!count) { sinPersonas = s; break; }
  }
  ok(!!sinPersonas, "Se encontró una de Córdoba sin personas, que es lo esperado",
    sinPersonas?.razon_social ?? "todas tenían personas");
  if (sinPersonas) {
    const bloque = armarBloqueSociedad(sinPersonas.cuit, sinPersonas, []);
    ok(bloque.motivoSinPersonas === "sociedadDeOtraProvincia",
      "La ausencia se explica por el registro provincial, no como 'no tiene socios'",
      String(bloque.motivoSinPersonas));
    ok(/no significa que la sociedad no tenga socios/i.test(bloque.explicacion),
      "Y lo dice con esas palabras");
    ok(!/sin socios|no tiene socios/i.test(bloque.explicacion.replace(/no tenga socios/gi, "")),
      "Nunca afirma que no tenga socios");
  }
}

console.log("\n=== Cobertura real, para no prometer de más ===");
{
  const { data } = await sb.rpc("tamano_registros");
  const filas = Object.fromEntries((data ?? []).map((t: { tabla: string; filas: number }) => [t.tabla, Number(t.filas)]));
  console.log(`      sociedades: ${filas.sociedades?.toLocaleString("es")} · personas: ${filas.sociedad_personas?.toLocaleString("es")}`);
}

console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} FALLOS`}`);
process.exit(fallos === 0 ? 0 : 1);
