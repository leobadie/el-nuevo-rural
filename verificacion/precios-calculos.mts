/*
 * Verifica las cuentas de la calculadora de precios (SPEC-precios.md, puntos 4 a 6).
 *
 * Uso: npm run verificar:precios-calculos
 */
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const ts = require(path.join(process.cwd(), "node_modules", "typescript")) as typeof import("typescript");
const fs = require("node:fs") as typeof import("node:fs");

const fuente = fs.readFileSync(path.join(process.cwd(), "src", "lib", "precios", "calculos.ts"), "utf8");
const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const modulo = { exports: {} as typeof import("../src/lib/precios/calculos.ts") };
new Function("exports", "module", "require", js)(modulo.exports, modulo, require);
const { aNumero, calcularPrecio, costoNeto, margenDePrecio, problemaPrecio, redondearArriba } = modulo.exports;

let fallos = 0;
function ok(cond: boolean, desc: string, detalle: unknown = "") {
  const d = detalle === "" ? "" : `  → ${typeof detalle === "string" ? detalle : JSON.stringify(detalle)}`;
  console.log(`${cond ? "PASS" : "FAIL"}  ${desc}${d}`);
  if (!cond) fallos++;
}
const cerca = (a: number, b: number, tol = 0.001) => Math.abs(a - b) <= tol;

console.log("=== De costo a precio (SPEC 4) ===");
const p21 = calcularPrecio({ costo: 1000, incluyeIva: false, iva: 21, margen: 40, redondeo: 0 })!;
ok(p21.gondola === 2016.67 && p21.netoExacto === 1666.67, "$ 1.000 neto, 21%, 40%: góndola $ 2.016,67 (neto $ 1.666,67)", p21);
ok(cerca(p21.margenReal, 40, 0.001) && p21.ganancia === 666.67, "…deja 40% y $ 666,67 de ganancia neta");
ok(cerca(p21.recargo, 66.667, 0.01), "…que es un recargo de 66,7% sobre el costo", p21.recargo);
const p105 = calcularPrecio({ costo: 1000, incluyeIva: false, iva: 10.5, margen: 40, redondeo: 0 })!;
ok(p105.gondola === 1841.67 && p105.ganancia === 666.67, "Carne al 10,5%: $ 1.841,67 y la misma ganancia neta", p105);

console.log("\n=== Redondeo hacia arriba ===");
const r10 = calcularPrecio({ costo: 1000, incluyeIva: false, iva: 21, margen: 40, redondeo: 10 })!;
ok(r10.gondola === 2020 && r10.gondolaExacto === 2016.67, "A $10: $ 2.016,67 → $ 2.020", r10.gondola);
ok(r10.margenReal > 40 && cerca(r10.margenReal, 40.099, 0.01), "El margen real con el redondeo sube un poco (40,1%), nunca baja", r10.margenReal);
ok(redondearArriba(2016.67, 50) === 2050 && redondearArriba(2016.67, 100) === 2100, "A $50 y a $100");
ok(redondearArriba(2020, 10) === 2020 && redondearArriba(2020.0000000001, 10) === 2020, "Un precio que ya es múltiplo no salta (ni por un decimal de flotante)");

console.log("\n=== Costo con IVA y otros costos ===");
ok(cerca(costoNeto(1210, true, 21), 1000) && cerca(costoNeto(1105, true, 10.5), 1000), "Le saca el IVA al costo que lo incluye");
const conIva = calcularPrecio({ costo: 1210, incluyeIva: true, iva: 21, margen: 40, redondeo: 0 })!;
ok(conIva.gondola === 2016.67, "Cargar $ 1.210 con IVA da lo mismo que $ 1.000 neto", conIva.gondola);
const conOtros = calcularPrecio({ costo: 1000, incluyeIva: false, iva: 21, margen: 40, otros: 30, redondeo: 0 })!;
ok(conOtros.costoNeto === 1030 && cerca(conOtros.gondola, (1030 / 0.6) * 1.21, 0.01), "La percepción que no se recupera se suma al costo", conOtros.gondola);

console.log("\n=== De precio a margen (SPEC 5) ===");
const m = margenDePrecio({ costo: 1000, incluyeIva: false, iva: 21, gondola: 2016.67 })!;
ok(cerca(m.margenReal, 40, 0.01) && !m.perdida, "Con $ 2.016,67 de góndola el margen es 40%", m);
const barato = margenDePrecio({ costo: 1000, incluyeIva: false, iva: 21, gondola: 1400 })!;
ok(cerca(barato.margenReal, 13.571, 0.01), "Sumar 40% al costo con IVA ($ 1.400) deja sólo 13,6% de margen neto", barato.margenReal);
const perdida = margenDePrecio({ costo: 1000, incluyeIva: false, iva: 21, gondola: 1100 })!;
ok(perdida.perdida && perdida.ganancia < 0, "Un precio que no cubre el costo avisa la pérdida", perdida);

console.log("\n=== Datos inválidos (SPEC 6) ===");
ok(problemaPrecio({ costo: 0, margen: 40 }) !== null && calcularPrecio({ costo: 0, incluyeIva: false, iva: 21, margen: 40, redondeo: 0 }) === null, "Sin costo no calcula");
ok(problemaPrecio({ costo: 1000, margen: 100 }) !== null && problemaPrecio({ costo: 1000, margen: -1 }) !== null, "Margen de 100% o negativo no");
ok(problemaPrecio({ costo: 1000, margen: 0 }) === null, "Margen 0% sí (precio de costo)");
ok(margenDePrecio({ costo: 1000, incluyeIva: false, iva: 21, gondola: 0 }) === null, "Sin precio de góndola no calcula el margen");

console.log("\n=== Lo que se tipea ===");
ok(aNumero("1.234,5") === 1234.5 && aNumero("1234.5") === 1234.5 && aNumero("$ 12.500") === 12500 && aNumero("40") === 40, "Acepta 1.234,5 · 1234.5 · $ 12.500");
ok(Number.isNaN(aNumero("")) && Number.isNaN(aNumero("abc")), "Vacío o basura no es un número");

console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} FALLA(S)`}`);
process.exit(fallos === 0 ? 0 : 1);
