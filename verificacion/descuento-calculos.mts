/*
 * Verifica la cuenta del descuento por boleta de proveedores (SPEC-descuento-proveedores.md,
 * puntos 4, 6 y 7): lo que se debe, el redondeo a centavos y los límites del %.
 *
 * Uso: npm run verificar:descuento-calculos
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
const { entregasConSaldo, esDescuentoValido, montoConDescuento } = modulo.exports;

let fallos = 0;
function ok(cond: boolean, desc: string, detalle: unknown = "") {
  const d = detalle === "" ? "" : `  → ${typeof detalle === "string" ? detalle : JSON.stringify(detalle)}`;
  console.log(`${cond ? "PASS" : "FAIL"}  ${desc}${d}`);
  if (!cond) fallos++;
}

console.log("=== Lo que se debe (SPEC 4 y 6) ===");
ok(montoConDescuento(100000, 5) === 95000, "Boleta de $ 100.000 con 5%: se deben $ 95.000", montoConDescuento(100000, 5));
ok(montoConDescuento(33333.33, 5) === 31666.66, "5% de $ 33.333,33: se descuentan $ 1.666,67 y se deben $ 31.666,66", montoConDescuento(33333.33, 5));
ok(montoConDescuento(1234.56, 2.5) === 1203.7, "2,5% de $ 1.234,56 = $ 1.203,70", montoConDescuento(1234.56, 2.5));
ok(montoConDescuento("50000.00" as unknown as number, 5) === 47500, "Acepta el monto como lo devuelve la base (texto)");
const boleta = 87654.32;
const debe = montoConDescuento(boleta, 5);
ok(Math.round((boleta - debe) * 100) === Math.round(boleta * 5), "Boleta = lo que se debe + el descuento, sin perder un centavo", boleta - debe);

console.log("\n=== Límites (SPEC 7) ===");
ok(esDescuentoValido(5) && esDescuentoValido(0.5) && esDescuentoValido(99.99), "5%, 0,5% y 99,99% valen");
ok(!esDescuentoValido(0) && !esDescuentoValido(100) && !esDescuentoValido(-5) && !esDescuentoValido(NaN) && !esDescuentoValido(null), "0%, 100%, negativos, vacío y basura no");

console.log("\n=== El saldo usa lo que se debe ===");
const entrega = { id: "e1", proveedor: "SANTA RITA SOTO (MAYORISTA)", fecha: "2026-09-27", monto: 95000, monto_boleta: 100000, descuento_pct: 5, comprobante: "A-1", detalle: null, creado_el: "2026-09-27T12:00:00Z", creado_por: null };
const [conSaldo] = entregasConSaldo([entrega], [{ id: "i1", movimiento_id: "m1", entrega_id: "e1", monto: 95000, creado_el: "2026-09-27T13:00:00Z" }], entrega.proveedor);
ok(conSaldo.saldo === 0 && conSaldo.estado === "Pagada", "Pagar los $ 95.000 salda la boleta de $ 100.000 con 5%", conSaldo);
ok(conSaldo.monto_boleta === 100000 && conSaldo.descuento_pct === 5, "La entrega con saldo conserva la boleta y el % para mostrarlos");

console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} FALLA(S)`}`);
process.exit(fallos === 0 ? 0 : 1);
