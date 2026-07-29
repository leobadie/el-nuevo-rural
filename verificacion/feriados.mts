/*
 * Verificación del cálculo de feriados (src/lib/cheques/feriados.ts).
 *
 * Uso: npm run verificar:feriados
 *
 * No hace falta que la app esté corriendo: es lógica pura. Las fechas esperadas de 2026
 * salen de cruzar dos fuentes independientes, porque los sitios de feriados se
 * contradicen entre sí (ver "Fuentes" al final).
 */
import {
  domingoDePascua,
  feriadosNacionales,
  trasladarFeriado,
  mapaNoHabiles,
  proximoDiaHabil,
} from "../src/lib/cheques/feriados.ts";

const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
let fallos = 0;

function ok(cond: boolean, desc: string, detalle = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${desc}${detalle ? `  → ${detalle}` : ""}`);
  if (!cond) fallos++;
}

function fmt(fecha: string): string {
  const [y, m, d] = fecha.split("-").map(Number);
  return `${fecha} (${DIAS[new Date(y, m - 1, d).getDay()]})`;
}

function claveDe(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// ---------- Pascua en años conocidos ----------
const PASCUAS: Record<number, string> = {
  2024: "2024-03-31",
  2025: "2025-04-20",
  2026: "2026-04-05",
  2027: "2027-03-28",
};
console.log("=== Domingo de Pascua ===");
for (const [anio, esperado] of Object.entries(PASCUAS)) {
  const d = domingoDePascua(Number(anio));
  const got = claveDe(d);
  ok(got === esperado, `Pascua ${anio} = ${esperado}`, got === esperado ? "" : `calculado ${got}`);
  ok(d.getDay() === 0, `Pascua ${anio} cae domingo`, DIAS[d.getDay()]);
}

// ---------- Regla de traslado (Ley 27.399) ----------
// Semana de referencia: 2026-06-14 domingo ... 2026-06-20 sábado.
console.log("\n=== Traslado Ley 27.399 ===");
const esperadoTraslado: Record<string, string> = {
  "2026-06-14": "2026-06-14", // domingo: no se mueve
  "2026-06-15": "2026-06-15", // lunes: no se mueve
  "2026-06-16": "2026-06-15", // martes → lunes anterior
  "2026-06-17": "2026-06-15", // miércoles → lunes anterior
  "2026-06-18": "2026-06-22", // jueves → lunes siguiente
  "2026-06-19": "2026-06-22", // viernes → lunes siguiente
  "2026-06-20": "2026-06-20", // sábado: no se mueve
};
for (const [fecha, esperado] of Object.entries(esperadoTraslado)) {
  const [y, m, d] = fecha.split("-").map(Number);
  const got = claveDe(trasladarFeriado(new Date(y, m - 1, d)));
  ok(got === esperado, `${fmt(fecha)} → ${esperado}`, got === esperado ? "" : `dio ${got}`);
}

// ---------- Feriados 2026 contra las fuentes cruzadas ----------
console.log("\n=== Feriados nacionales 2026 ===");
const f2026 = feriadosNacionales(2026);
for (const f of f2026) console.log(`   ${fmt(f.fecha).padEnd(26)} ${f.tipo.padEnd(12)} ${f.nombre}`);

const ESPERADOS_2026 = [
  "2026-01-01", // Año Nuevo
  "2026-02-16", // Carnaval (lunes)
  "2026-02-17", // Carnaval (martes)
  "2026-03-24", // Memoria
  "2026-04-02", // Malvinas + Jueves Santo
  "2026-04-03", // Viernes Santo
  "2026-05-01", // Día del Trabajador
  "2026-05-25", // Revolución de Mayo
  "2026-06-15", // Güemes, trasladado del miércoles 17/6
  "2026-06-20", // Belgrano
  "2026-07-09", // Independencia
  "2026-08-17", // San Martín (lunes, no se traslada)
  "2026-10-12", // Diversidad Cultural (lunes, no se traslada)
  "2026-11-23", // Soberanía, trasladada del viernes 20/11
  "2026-12-08", // Inmaculada Concepción
  "2026-12-25", // Navidad
];
const fechas2026 = [...new Set(f2026.map((f) => f.fecha))].sort();
console.log("");
ok(
  JSON.stringify(fechas2026) === JSON.stringify(ESPERADOS_2026),
  "Las fechas de 2026 coinciden con las fuentes cruzadas",
  JSON.stringify(fechas2026) === JSON.stringify(ESPERADOS_2026)
    ? `${fechas2026.length} fechas`
    : `\n      esperado: ${ESPERADOS_2026.join(" ")}\n      obtenido: ${fechas2026.join(" ")}`,
);

// Los tres puntos donde las fuentes se contradecían entre sí.
ok(fechas2026.includes("2026-02-16") && fechas2026.includes("2026-02-17"),
  "Carnaval son DOS días (lunes 16 y martes 17 de febrero)");
ok(fechas2026.includes("2026-11-23") && !fechas2026.includes("2026-11-20"),
  "Soberanía se observa el lunes 23/11, no el viernes 20/11");
ok(fechas2026.includes("2026-06-15") && !fechas2026.includes("2026-06-17"),
  "Güemes se observa el lunes 15/6, no el miércoles 17/6");

const mapa2026 = mapaNoHabiles(2026);
const dobles = mapa2026.get("2026-04-02");
ok(!!dobles && dobles.nombre.includes("·"),
  "El 2/4/2026 muestra los dos feriados juntos (Malvinas y Jueves Santo)", dobles?.nombre);

// ---------- Días propios del usuario ----------
console.log("\n=== Días propios (puentes por decreto) ===");
const conPropios = mapaNoHabiles(2026, [
  { fecha: "2026-12-07", nombre: "Puente turístico", tipo: "propio" },
  { fecha: "2027-01-02", nombre: "De otro año, no debe entrar", tipo: "propio" },
]);
ok(conPropios.has("2026-12-07"), "Se agrega un día propio del año visible");
ok(!conPropios.has("2027-01-02"), "No se cuelan días propios de otro año");
ok(conPropios.get("2026-12-25")?.tipo === "inamovible", "Los nacionales siguen ahí junto a los propios");

// ---------- Otros años ----------
console.log("\n=== Sanidad en otros años ===");
for (const anio of [2025, 2027, 2028, 2030]) {
  const fs = feriadosNacionales(anio);
  const unicas = new Set(fs.map((f) => f.fecha));
  const todasDelAnio = [...unicas].every((f) => f.startsWith(String(anio)));
  ok(unicas.size >= 15 && todasDelAnio, `${anio}: ${unicas.size} fechas, todas del año`,
    todasDelAnio ? "" : "hay fechas de otro año");
  const malTrasladados = fs.filter((f) => f.tipo === "trasladable").filter((f) => {
    const [y, m, d] = f.fecha.split("-").map(Number);
    const dow = new Date(y, m - 1, d).getDay();
    return dow >= 2 && dow <= 5; // ningún trasladable debe quedar entre martes y viernes
  });
  ok(malTrasladados.length === 0, `${anio}: ningún trasladable queda entre martes y viernes`,
    malTrasladados.map((f) => fmt(f.fecha)).join(" "));
}

// ---------- Próximo día hábil ----------
console.log("\n=== Próximo día hábil ===");
const noHab2026 = mapaNoHabiles(2026);
const casos: [string, string, string][] = [
  ["2026-12-24", "2026-12-28", "jueves 24/12 → 25 Navidad, 26-27 finde → lunes 28"],
  ["2026-04-01", "2026-04-06", "miércoles 1/4 → 2 y 3 Santos, 4-5 finde → lunes 6"],
  ["2026-07-29", "2026-07-30", "miércoles hábil → jueves siguiente"],
  ["2026-11-20", "2026-11-24", "viernes 20/11 → finde y lunes 23 feriado → martes 24"],
];
for (const [desde, esperado, desc] of casos) {
  const got = proximoDiaHabil(desde, noHab2026);
  ok(got === esperado, desc, got === esperado ? fmt(got) : `dio ${fmt(got)}, esperaba ${esperado}`);
}

console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} FALLOS`}`);

/*
 * Fuentes de las fechas esperadas de 2026 (consultadas el 29/07/2026):
 *  - https://feriadosargentina.com.ar/feriados-2026/
 *  - https://www.assistcard.com/ar/feriados-argentina-2026
 *  - https://www.argentina.gob.ar/jefatura/feriados-nacionales-2026 (oficial)
 * Los puentes turísticos que informan esas fuentes para 2026 (23/3, 10/7, 7/12) NO están
 * en la lista calculada a propósito: se fijan por decreto y se cargan como días propios.
 */
process.exit(fallos === 0 ? 0 : 1);
