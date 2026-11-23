/*
 * Reparto de una transferencia que paga varias boletas (SPEC-transferencia-proveedor.md, punto 4 y 10).
 *
 * Uso: npm run verificar:transferencia-calculos
 */
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const ts = require(path.join(process.cwd(), "node_modules", "typescript")) as typeof import("typescript");
const fs = require("node:fs") as typeof import("node:fs");
const fuente = fs.readFileSync(path.join(process.cwd(), "src", "lib", "ingresos-egresos", "cuentaProveedores.ts"), "utf8");
const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const modulo = { exports: {} as typeof import("../src/lib/ingresos-egresos/cuentaProveedores.ts") };
new Function("exports", "module", "require", js)(modulo.exports, modulo, require);
const { repartirTransferencia, entregasConSaldo } = modulo.exports;

let fallos = 0;
function ok(cond: boolean, desc: string, detalle: unknown = "") {
  const d = detalle === "" ? "" : `  → ${typeof detalle === "string" ? detalle : JSON.stringify(detalle)}`;
  console.log(`${cond ? "PASS" : "FAIL"}  ${desc}${d}`);
  if (!cond) fallos++;
}

const P = "Pompeda (lácteos)";
const ent = (id: string, fecha: string, monto: number) => ({
  id, proveedor: P, fecha, monto, comprobante: id, detalle: null, creado_el: `${fecha}T10:00:00Z`, creado_por: null,
});
const entregas = [ent("A", "2026-11-01", 100000), ent("B", "2026-11-05", 50000), ent("C", "2026-11-09", 30000)];
const pendientes = entregasConSaldo(entregas, [], P);

console.log("=== Sin boletas marcadas: todas, de la más vieja a la más nueva ===");
const r1 = repartirTransferencia(170000, pendientes, []);
ok(JSON.stringify(r1.aplicaciones) === JSON.stringify([{ entrega_id: "A", monto: 100000 }, { entrega_id: "B", monto: 50000 }, { entrega_id: "C", monto: 20000 }]),
  "$170.000 cubre A y B y deja C debiendo $10.000", r1.aplicaciones);
ok(r1.aCuenta === 0, "No sobra nada", r1.aCuenta);
const r2 = repartirTransferencia(200000, pendientes, []);
ok(r2.aCuenta === 20000 && r2.aplicaciones.length === 3, "$200.000 cubre las tres y sobran $20.000 a cuenta", r2);

console.log("\n=== Con boletas marcadas: sólo ésas ===");
const r3 = repartirTransferencia(80000, pendientes, ["C", "B"]);
ok(JSON.stringify(r3.aplicaciones) === JSON.stringify([{ entrega_id: "B", monto: 50000 }, { entrega_id: "C", monto: 30000 }]),
  "Marcadas C y B: va primero a B (más vieja) y después a C, sin tocar A", r3.aplicaciones);
ok(r3.aCuenta === 0, "Justo lo marcado: no sobra");
const r4 = repartirTransferencia(90000, pendientes, ["B"]);
ok(r4.aplicaciones.length === 1 && r4.aplicaciones[0].monto === 50000 && r4.aCuenta === 40000,
  "Marcada sólo B y la transferencia es mayor: lo que sobra queda a cuenta, no va a A", r4);
const r5 = repartirTransferencia(20000, pendientes, ["C"]);
ok(r5.aplicaciones[0].monto === 20000 && r5.aCuenta === 0, "Transferencia menor que la boleta marcada: pago parcial", r5);

console.log("\n=== Centavos y saldos con notas de crédito ===");
const r6 = repartirTransferencia(0.1 + 0.2, entregasConSaldo([ent("X", "2026-11-01", 0.3)], [], P), []);
ok(r6.aplicaciones[0].monto === 0.3 && r6.aCuenta === 0, "0,1 + 0,2 contra una boleta de 0,30: sin resto fantasma", r6);
const conNC = entregasConSaldo(entregas, [], P, [{ id: "a1", nota_id: "n1", entrega_id: "A", monto: 25000, creado_el: "x" }]);
const r7 = repartirTransferencia(100000, conNC, ["A"]);
ok(r7.aplicaciones[0].monto === 75000 && r7.aCuenta === 25000, "Boleta con $25.000 de NC: sólo se le aplican $75.000", r7);
const r8 = repartirTransferencia(5000, [], []);
ok(r8.aplicaciones.length === 0 && r8.aCuenta === 5000, "Sin boletas pendientes: todo a cuenta", r8);

console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} FALLA(S)`}`);
process.exit(fallos === 0 ? 0 : 1);
