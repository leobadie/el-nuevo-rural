/*
 * Verificación de que la migración 014 quedó bien aplicada en Supabase: la tabla,
 * el bucket y —lo que más importa— que las políticas de RLS hagan exactamente lo
 * que el cartel necesita: que el televisor pueda leer sin sesión, pero que nadie
 * pueda escribir desde afuera ni ver las placas apagadas.
 *
 * Uso: npm run verificar:base-cartel   (después de pegar supabase/014 en el editor SQL)
 *
 * Usa la service_role key para preparar los datos de prueba, y la anon key para
 * comprobar qué ve realmente alguien sin login. Corre en la máquina del usuario,
 * nunca en la app.
 *
 * Las filas de prueba que crea se borran al final, pasen o fallen los checks.
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

/* Supabase devuelve las filas sin tipar; describimos sólo los campos que miramos acá. */
type FilaPlaca = { id: string; titulo: string };
type FilaBucket = { id: string; public: boolean };

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
if (!env.SUPABASE_SERVICE_ROLE_KEY || !env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  console.error("Faltan SUPABASE_SERVICE_ROLE_KEY o NEXT_PUBLIC_SUPABASE_ANON_KEY en .env.local.");
  process.exit(2);
}

const { createClient } = require("@supabase/supabase-js");
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});
// Este cliente es el televisor: sin sesión, igual que /cartel abierto en el TV.
const anon = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
  auth: { persistSession: false },
});

const MARCA = "__PRUEBA_CLAUDE__";
/** El slug solo admite minúsculas, números y guiones: no puede llevar la MARCA. */
const SLUG_PRUEBA = "zz-prueba-claude";
let idActiva: string | null = null;
let idApagada: string | null = null;

async function limpiar() {
  await admin.from("cartel_placas").delete().like("titulo", `${MARCA}%`);
  // Puede no existir todavía (migración 016 sin aplicar): el error se ignora a
  // propósito para que la limpieza no tape el resultado de los checks.
  await admin.from("cartel_pantallas").delete().like("slug", `${SLUG_PRUEBA}%`);
}

try {
  console.log("=== R1 — La tabla existe y se puede leer ===");
  const { error: eLectura, count } = await admin
    .from("cartel_placas")
    .select("*", { count: "exact", head: true });
  ok(!eLectura, "cartel_placas existe", eLectura?.message ?? `${count} fila(s) hoy`);

  if (eLectura) {
    console.log("\nLa tabla no está: pegá supabase/014_cartel.sql en el editor SQL de Supabase.");
    process.exit(1);
  }

  console.log("\n=== R2 — Preparo una placa encendida y una apagada ===");
  const { data: creadas, error: eInsert } = await admin
    .from("cartel_placas")
    .insert([
      { titulo: `${MARCA} activa`, tipo: "oferta", precio: 1234, activa: true, orden: 9001 },
      { titulo: `${MARCA} apagada`, tipo: "aviso", activa: false, orden: 9002 },
    ])
    .select();

  ok(!eInsert && creadas?.length === 2, "se pudieron crear las placas de prueba", eInsert?.message);
  idActiva = creadas?.find((p: FilaPlaca) => p.titulo.endsWith("activa"))?.id ?? null;
  idApagada = creadas?.find((p: FilaPlaca) => p.titulo.endsWith("apagada"))?.id ?? null;

  console.log("\n=== R3 — El televisor (sin sesión) ve las placas activas ===");
  const { data: vistas, error: eAnon } = await anon
    .from("cartel_placas")
    .select("id, titulo, activa")
    .like("titulo", `${MARCA}%`);

  ok(!eAnon, "la lectura anónima no da error", eAnon?.message);
  ok(
    !!vistas?.some((p: FilaPlaca) => p.id === idActiva),
    "ve la placa encendida (si no, el TV queda sin ofertas)",
    `devolvió ${vistas?.length ?? 0} fila(s)`,
  );

  console.log("\n=== R4 — Pero no ve las apagadas ===");
  ok(
    !vistas?.some((p: FilaPlaca) => p.id === idApagada),
    "la placa apagada no se filtra a quien no tiene sesión",
  );

  console.log("\n=== R5 — Nadie puede escribir sin sesión ===");
  const { error: eEscritura } = await anon
    .from("cartel_placas")
    .insert({ titulo: `${MARCA} intrusa`, tipo: "aviso" });
  ok(!!eEscritura, "el insert anónimo es rechazado", eEscritura?.message ?? "¡ENTRÓ! revisá las políticas");

  const { data: trasBorrado } = await anon.from("cartel_placas").delete().eq("id", idActiva!).select();
  ok((trasBorrado?.length ?? 0) === 0, "el delete anónimo no borra nada");

  console.log("\n=== R6 — Ninguna otra tabla quedó abierta al público ===");
  for (const tabla of ["cheques", "movimientos", "colaboradores", "usuarios"]) {
    const { data, error } = await anon.from(tabla).select("*").limit(1);
    ok(!!error || (data?.length ?? 0) === 0, `${tabla} sigue cerrada sin sesión`, error?.code ?? "0 filas");
  }

  console.log("\n=== R7 — La vigencia al revés se rechaza en la base ===");
  const { error: eVigencia } = await admin.from("cartel_placas").insert({
    titulo: `${MARCA} imposible`,
    vigencia_desde: "2026-09-10",
    vigencia_hasta: "2026-09-01",
  });
  ok(!!eVigencia, "no deja cargar una placa que no se vería nunca", eVigencia?.message?.slice(0, 60));

  console.log("\n=== R8 — actualizado_el se mueve solo al editar ===");
  const { data: antes } = await admin
    .from("cartel_placas")
    .select("actualizado_el")
    .eq("id", idActiva!)
    .single();

  await new Promise((r) => setTimeout(r, 1100));
  await admin.from("cartel_placas").update({ precio: 4321 }).eq("id", idActiva!);

  const { data: despues } = await admin
    .from("cartel_placas")
    .select("actualizado_el")
    .eq("id", idActiva!)
    .single();

  ok(
    new Date(despues!.actualizado_el).getTime() > new Date(antes!.actualizado_el).getTime(),
    "el trigger actualizó la marca de tiempo",
  );

  console.log("\n=== R9 — El bucket de fotos existe y es público ===");
  const { data: buckets, error: eBuckets } = await admin.storage.listBuckets();
  const cartel = buckets?.find((b: FilaBucket) => b.id === "cartel");
  ok(!eBuckets && !!cartel, "existe el bucket 'cartel'", eBuckets?.message);
  ok(!!cartel?.public, "el bucket es público (si no, el TV no ve las fotos)");

  // ---------------------------------------------------------------- pantallas
  console.log("\n=== R10 — Las tablas de pantallas existen (migración 016) ===");
  // Sin head:true a propósito: con head, una tabla inexistente vuelve sin error
  // y con count en null, así que el check daba verde sobre una base vacía.
  const { error: ePantallas } = await admin.from("cartel_pantallas").select("slug").limit(1);
  const { error: ePuente } = await admin.from("cartel_placa_pantalla").select("placa_id").limit(1);

  ok(!ePantallas, "cartel_pantallas existe", ePantallas?.message);
  ok(!ePuente, "cartel_placa_pantalla existe", ePuente?.message);

  if (ePantallas || ePuente) {
    console.log("\nFaltan: pegá supabase/016_cartel_pantallas.sql en el editor SQL de Supabase.");
  } else {
    console.log("\n=== R11 — El televisor (sin sesión) ve la pantalla encendida, no la apagada ===");
    await admin.from("cartel_pantallas").delete().like("slug", `${SLUG_PRUEBA}%`);
    const { error: eAltaP } = await admin.from("cartel_pantallas").insert([
      { slug: `${SLUG_PRUEBA}-on`, nombre: `${MARCA} on`, activa: true, orden: 9001 },
      { slug: `${SLUG_PRUEBA}-off`, nombre: `${MARCA} off`, activa: false, orden: 9002 },
    ]);
    ok(!eAltaP, "se pudieron crear las pantallas de prueba", eAltaP?.message);

    const { data: vistasP, error: eAnonP } = await anon
      .from("cartel_pantallas")
      .select("slug, activa")
      .like("slug", `${SLUG_PRUEBA}%`);

    ok(!eAnonP, "la lectura anónima de pantallas no da error", eAnonP?.message);
    ok(
      !!vistasP?.some((p: { slug: string }) => p.slug === `${SLUG_PRUEBA}-on`),
      "ve la pantalla encendida (si no, el televisor da 404)",
    );
    ok(
      !vistasP?.some((p: { slug: string }) => p.slug === `${SLUG_PRUEBA}-off`),
      "no ve la pantalla apagada",
    );

    console.log("\n=== R12 — Nadie da de alta un televisor sin sesión ===");
    const { error: eIntrusa } = await anon
      .from("cartel_pantallas")
      .insert({ slug: `${SLUG_PRUEBA}-intrusa`, nombre: `${MARCA} intrusa` });
    // Que falle no alcanza: si fallara porque la tabla no existe, el check daría
    // verde sin haber probado ninguna política.
    ok(
      !!eIntrusa && !eIntrusa.message.includes("schema cache"),
      "el insert anónimo de pantalla lo rechaza RLS",
      eIntrusa?.message ?? "¡ENTRÓ! revisá las políticas",
    );

    console.log("\n=== R13 — Borrar una pantalla se lleva sus asignaciones ===");
    // Si al dar de baja un televisor quedaran filas colgadas en la tabla puente,
    // una placa seguiría figurando como "solo en esa pantalla" para siempre y
    // no volvería a mostrarse en ningún lado.
    if (idActiva) {
      const { error: eAsig } = await admin
        .from("cartel_placa_pantalla")
        .insert({ placa_id: idActiva, pantalla_slug: `${SLUG_PRUEBA}-on` });

      await admin.from("cartel_pantallas").delete().eq("slug", `${SLUG_PRUEBA}-on`);

      const { data: colgadas, error: eColgadas } = await admin
        .from("cartel_placa_pantalla")
        .select("placa_id")
        .eq("pantalla_slug", `${SLUG_PRUEBA}-on`);

      // Se exige que la asignación se haya podido crear y leer: sin eso, "cero
      // filas colgadas" sería cierto por no haber probado nada.
      ok(
        !eAsig && !eColgadas && colgadas?.length === 0,
        "la asignación se borró en cascada al borrar la pantalla",
        eAsig?.message ?? eColgadas?.message ?? `quedaron ${colgadas?.length ?? "?"} fila(s)`,
      );
    }
  }

  console.log("\n=== Latidos de los televisores (027, SPEC-cartel-tv-en-vivo.md) ===");
  const { error: sin027 } = await admin.from("cartel_latidos").select("pantalla_slug").limit(1);
  if (sin027) {
    ok(false, "Existe cartel_latidos: falta aplicar supabase/027_cartel_latidos.sql", sin027.message);
  } else {
    // Pantallas propias: los latidos de prueba no pueden caer en un televisor real.
    const lOn = `${SLUG_PRUEBA}-lat-on`;
    const lOff = `${SLUG_PRUEBA}-lat-off`;
    const { error: ePant } = await admin.from("cartel_pantallas").insert([
      { slug: lOn, nombre: `${MARCA} lat on`, activa: true, orden: 9101 },
      { slug: lOff, nombre: `${MARCA} lat off`, activa: false, orden: 9102 },
    ]);
    ok(!ePant, "se pudieron crear las pantallas de prueba", ePant?.message);

    const latido = (slug: string) =>
      anon.rpc("cartel_latido", { p_slug: slug, p_navegador: `${MARCA} Web0S Chrome/87`, p_version: "prueba", p_ancho: 1920, p_alto: 1080 });

    const { error: eLat } = await latido(lOn);
    ok(!eLat, "El televisor (sin sesión) puede avisar que está prendido", eLat?.message);
    const { data: fila } = await admin.from("cartel_latidos").select("*").eq("pantalla_slug", lOn).maybeSingle();
    ok(!!fila && fila.ancho === 1920 && fila.alto === 1080 && fila.version === "prueba", "…y queda guardado con navegador y tamaño", JSON.stringify(fila));

    const primero = fila?.visto_el;
    await latido(lOn);
    const { data: filas2 } = await admin.from("cartel_latidos").select("visto_el").eq("pantalla_slug", lOn);
    ok((filas2?.length ?? 0) === 1 && filas2![0].visto_el >= primero, "Un segundo latido actualiza la misma fila, no agrega otra", `${filas2?.length} fila(s)`);

    await latido(lOff);
    await latido(`${SLUG_PRUEBA}-inventada`);
    const { data: basura } = await admin
      .from("cartel_latidos").select("pantalla_slug").in("pantalla_slug", [lOff, `${SLUG_PRUEBA}-inventada`]);
    ok((basura?.length ?? 0) === 0, "Una pantalla apagada o inventada no deja latido", `${basura?.length ?? 0} fila(s)`);

    const { data: leidosAnon } = await anon.from("cartel_latidos").select("*");
    ok((leidosAnon ?? []).length === 0, "Sin sesión no se leen los latidos", `${leidosAnon?.length ?? 0} fila(s)`);
    const { error: eInsAnon } = await anon
      .from("cartel_latidos").insert({ pantalla_slug: lOn, navegador: MARCA });
    ok(!!eInsAnon, "…ni se escriben directo en la tabla", eInsAnon?.message ?? "¡ENTRÓ! revisá las políticas");
    const { error: eUpdAnon, data: updAnon } = await anon
      .from("cartel_latidos").update({ navegador: "pisado" }).eq("pantalla_slug", lOn).select();
    ok(!!eUpdAnon || (updAnon?.length ?? 0) === 0, "…ni se pisan", eUpdAnon?.message ?? `${updAnon?.length} fila(s)`);

    const largo = "x".repeat(5000);
    await anon.rpc("cartel_latido", { p_slug: lOn, p_navegador: largo, p_version: largo, p_ancho: 999999, p_alto: -5 });
    const { data: recortado } = await admin.from("cartel_latidos").select("navegador, version, ancho, alto").eq("pantalla_slug", lOn).single();
    ok(
      recortado?.navegador?.length === 300 && recortado?.version?.length === 40 && recortado?.ancho === null && recortado?.alto === null,
      "Textos larguísimos se recortan y tamaños absurdos quedan vacíos",
      `${recortado?.navegador?.length}/${recortado?.version?.length}/${recortado?.ancho}/${recortado?.alto}`,
    );

    await admin.from("cartel_pantallas").delete().eq("slug", lOn);
    const { data: huerfano } = await admin.from("cartel_latidos").select("pantalla_slug").eq("pantalla_slug", lOn);
    ok((huerfano?.length ?? 0) === 0, "Borrar la pantalla se lleva su latido", `${huerfano?.length ?? 0} fila(s)`);
  }

  console.log("\n=== Giro de cada televisor (028, SPEC-cartel-tv-en-vivo.md) ===");
  const { error: sin028 } = await admin.from("cartel_pantallas").select("rotacion").limit(1);
  if (sin028) {
    ok(false, "Existe cartel_pantallas.rotacion: falta aplicar supabase/028_cartel_pantallas_rotacion.sql", sin028.message);
  } else {
    const g = `${SLUG_PRUEBA}-giro`;
    const { data: nueva, error: eNueva } = await admin
      .from("cartel_pantallas").insert({ slug: g, nombre: `${MARCA} giro` }).select("rotacion").single();
    ok(!eNueva && nueva?.rotacion === 0, "Una pantalla nueva arranca derecha (rotacion = 0)", eNueva?.message ?? JSON.stringify(nueva));
    for (const valido of [90, 270, 0]) {
      const { error } = await admin.from("cartel_pantallas").update({ rotacion: valido }).eq("slug", g);
      ok(!error, `Acepta rotacion = ${valido}`, error?.message);
    }
    // Las combinaciones inválidas, incluido NULL: un CHECK que da NULL deja pasar la fila.
    for (const invalido of [45, 180, -90, 360, null]) {
      const { error } = await admin.from("cartel_pantallas").update({ rotacion: invalido }).eq("slug", g);
      ok(!!error, `Rechaza rotacion = ${invalido}`, error?.message ?? "¡LO ACEPTÓ!");
    }
    const { data: anonVe } = await anon.from("cartel_pantallas").select("rotacion").eq("slug", g).maybeSingle();
    ok(anonVe?.rotacion === 0, "El televisor (sin sesión) lee el giro de su pantalla", JSON.stringify(anonVe));
    await admin.from("cartel_pantallas").delete().eq("slug", g);
  }

  console.log("\n=== Ofertas y flyer en un solo módulo (023, SPEC-ofertas.md) ===");
  const { error: sin023 } = await admin.from("flyer_config").select("id").limit(1);
  if (sin023) {
    ok(false, "Existe flyer_config: falta aplicar supabase/023_ofertas_flyer.sql", sin023.message);
  } else {
    // Sobre la placa apagada: una prueba no tiene que aparecer nunca en los televisores.
    const { data: antes } = await admin.from("cartel_placas").select("en_flyer, orden_flyer").eq("id", idApagada!).single();
    ok(antes?.en_flyer === false && antes?.orden_flyer === 0, "Una placa nueva no va al flyer (en_flyer = false)", JSON.stringify(antes));
    const { data: despues, error: eMarca } = await admin
      .from("cartel_placas").update({ en_flyer: true, orden_flyer: 7 }).eq("id", idApagada!).select("en_flyer, orden_flyer").single();
    ok(!eMarca && despues?.en_flyer === true && despues?.orden_flyer === 7, "Se marca para el flyer con su orden", eMarca?.message ?? JSON.stringify(despues));

    const { data: configAnon } = await anon.from("flyer_config").select("*");
    ok((configAnon ?? []).length === 0, "Sin sesión no se lee la configuración del flyer (no es pública, a diferencia de las placas)", `${configAnon?.length ?? 0} fila(s)`);
    const { error: eConfigAnon } = await anon.from("flyer_config").insert({ id: 1, titulo: MARCA });
    ok(!!eConfigAnon, "…ni se escribe", eConfigAnon?.message ?? "¡ENTRÓ! revisá las políticas");
    const { error: eDos } = await admin.from("flyer_config").insert({ id: 2, titulo: MARCA });
    ok(!!eDos, "flyer_config tiene una sola fila (id = 1)", eDos?.message ?? "aceptó id 2");
    await admin.from("flyer_config").delete().eq("id", 2);
  }
} finally {
  await limpiar();
}

console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} CHECK(S) FALLARON`}`);
process.exit(fallos === 0 ? 0 : 1);
