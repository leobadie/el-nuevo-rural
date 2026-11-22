/*
 * Cuentas de SPEC-cheque-a-proveedor.md: parecido de nombres, cheques sin usar, búsqueda,
 * reparto de un cheque entre entregas y posibles repetidos. Casos tomados de la base real.
 *
 * Uso: npm run verificar:cheque-a-proveedor-calculos
 */
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ts = require("typescript") as typeof import("typescript");
const fuente = fs.readFileSync(path.join(process.cwd(), "src", "lib", "cheques", "vinculo.ts"), "utf8");
const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const modulo = { exports: {} as typeof import("../src/lib/cheques/vinculo.ts") };
new Function("exports", "module", "require", js)(modulo.exports, modulo, require);
const v = modulo.exports;

let fallos = 0;
function ok(cond: boolean, desc: string, detalle: unknown = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${desc}${detalle !== "" ? `  → ${typeof detalle === "string" ? detalle : JSON.stringify(detalle)}` : ""}`);
  if (!cond) fallos++;
}

const ch = (id: string, proveedor: string, importe: number, extra: Partial<import("../src/lib/cheques/vinculo.ts").ChequeBasico> = {}) => ({
  id, proveedor, importe, n_cheque: id.replace(/\D/g, "") || null, fecha_emision: "2026-11-15", fecha_cobro: "2026-12-31",
  rechazado: false, observaciones: null, creado_el: "2026-11-15T10:00:00Z", ...extra,
});

console.log("=== Parecido de nombres (R3) ===");
ok(v.parecidoProveedor("santa rita santander", "SANTA RITA SOTO (MAYORISTA)") === 1, "'santa rita santander' ≈ 'SANTA RITA SOTO (MAYORISTA)'");
ok(v.parecidoProveedor("REGGIO", "REGGIO CHICO") === 1, "'REGGIO' ≈ 'REGGIO CHICO'");
ok(v.parecidoProveedor("CERDO", "CHASINADOS ARIAS CERDO") === 1, "'CERDO' ≈ 'CHASINADOS ARIAS CERDO'");
ok(v.parecidoProveedor("Pollería Ñandú", "polleria nandu") === 1, "Acentos y mayúsculas no importan");
ok(v.parecidoProveedor("TERRABUSI", "Italiana") === 0, "'TERRABUSI' no se parece a 'Italiana'");
ok(v.parecidoProveedor("puerta santander", "Galicia Santander") === 0, "Compartir sólo el banco no cuenta");
ok(v.parecidoProveedor("", "REGGIO") === 0, "Vacío = 0");

console.log("\n=== Cheques sin usar (R2) ===");
const cheques = [
  ch("c726", "REGGIO CHICO", 893000),
  ch("c599", "REGGIO CHICO", 997000, { fecha_emision: "2026-09-23", creado_el: "2026-09-23T10:00:00Z" }),
  ch("c1", "santa rita santander", 500000, { rechazado: true }),
  ch("c2", "TERRABUSI", 431597),
  ch("c3", "REGGIO", 700000),
];
const movs = [{ id: "m1", cheque_id: "c2", proveedor: "TERRABUSI", descripcion: "x", fecha: "2026-11-01" }, { id: "m2", cheque_id: null, proveedor: "X", descripcion: null, fecha: "2026-11-01" }];
const libres = v.chequesSinUsar(cheques, movs).map((c) => c.id);
ok(JSON.stringify(libres) === JSON.stringify(["c726", "c599", "c3"]), "Saca los rechazados y los ya vinculados", libres);

console.log("\n=== Búsqueda y orden (R3) ===");
ok(v.filtrarCheques(cheques, "726").map((c) => c.id).join() === "c726", "Por N°: 726");
ok(v.filtrarCheques(cheques, "893.000").map((c) => c.id).join() === "c726", "Por importe con puntos: 893.000");
ok(v.filtrarCheques(cheques, "reggio").length === 3, "Por proveedor: reggio");
ok(v.filtrarCheques(cheques, "  ").length === cheques.length, "Vacío = todos");
const orden = v.ordenarParaProveedor(v.chequesSinUsar(cheques, movs), "REGGIO CHICO").map((c) => c.id);
ok(orden.length === 3 && orden[2] === "c599", "Todos se parecen a REGGIO CHICO; el emitido en septiembre va último", orden);
const ord2 = v.ordenarParaProveedor([ch("a", "TERRABUSI", 1), ch("b", "REGGIO CHICO", 1, { fecha_emision: "2026-01-01" }), ch("c", "REGGIO CHICO", 1, { fecha_emision: "2026-11-20" })], "Reggio Chico").map((c) => c.id);
ok(ord2.join() === "c,b,a", "Entre parecidos, el más nuevo primero; los no parecidos al final", ord2);

console.log("\n=== Reparto de un cheque (R4) ===");
// El caso real: el cheque 726 de REGGIO CHICO paga 6 facturas del 15/11.
const facturas = [169000, 153000, 105000, 184000, 135000, 147000].map((s, i) => ({ id: `e${i + 1}`, saldo: s }));
let r = v.repartirCheque(893000, facturas);
ok(r.aplicaciones.length === 6 && r.aCuenta === 0, "893.000 cubre justo las 6 facturas de REGGIO CHICO", r.aplicaciones.length);
r = v.repartirCheque(400000, facturas, "e4");
ok(r.aplicaciones[0].entrega_id === "e4" && r.aplicaciones[0].monto === 184000, "Primero la entrega donde se tocó Pagar", r.aplicaciones[0]);
ok(r.aplicaciones[1].entrega_id === "e1" && r.aplicaciones[1].monto === 169000, "…después la más vieja", r.aplicaciones[1]);
ok(r.aplicaciones[2].entrega_id === "e2" && r.aplicaciones[2].monto === 47000 && r.aCuenta === 0, "…y lo que sobra a la siguiente, en parte", r.aplicaciones[2]);
r = v.repartirCheque(1000000, facturas);
ok(r.aCuenta === 107000, "Si sobra después de cubrir todo, queda a cuenta", r.aCuenta);
r = v.repartirCheque(100000, [{ id: "a", saldo: 250000 }]);
ok(r.aplicaciones[0].monto === 100000 && r.aCuenta === 0, "Cheque menor que la deuda: aplica todo, la entrega queda parcial");
r = v.repartirCheque(500000, []);
ok(r.aplicaciones.length === 0 && r.aCuenta === 500000, "Sin deuda: todo a cuenta");
r = v.repartirCheque(0.3, [{ id: "a", saldo: 0.1 }, { id: "b", saldo: 0.2 }]);
ok(r.aplicaciones.map((a) => a.monto).join() === "0.1,0.2" && r.aCuenta === 0, "Centavos sin errores de redondeo", r);

console.log("\n=== Posibles repetidos (R9) ===");
const gen = { observaciones: `${v.PREFIJO_GENERADO}: Pago a REGGIO CHICO` };
const rep = v.posiblesRepetidos([
  ch("manual", "REGGIO", 893000, { fecha_emision: "2026-11-15" }),
  ch("gen", "REGGIO CHICO", 893000, { fecha_emision: "2026-11-20", ...gen }),
  ch("lejos", "REGGIO CHICO", 893000, { fecha_emision: "2026-01-01" }),
  ch("otroProv", "TERRABUSI", 893000, { fecha_emision: "2026-11-15" }),
  ch("otroImporte", "REGGIO", 893001, { fecha_emision: "2026-11-15" }),
]);
ok(rep.length === 1 && rep[0].generado.id === "gen" && rep[0].otro.id === "manual", "Detecta el generado repetido con el manual, y sólo ese", rep.map((p) => `${p.generado.id}~${p.otro.id}`));
ok(v.posiblesRepetidos([ch("a", "ALQUILER", 300000), ch("b", "ALQUILER", 300000)]).length === 0, "Dos cargados a mano con el mismo importe no son repetidos");
ok(v.posiblesRepetidos([ch("a", "X", 1, gen), ch("b", "X", 1, gen)]).length === 0, "Dos generados tampoco");

console.log(fallos ? `\n${fallos} FALLO(S)` : "\nTodo OK");
process.exit(fallos ? 1 : 0);
