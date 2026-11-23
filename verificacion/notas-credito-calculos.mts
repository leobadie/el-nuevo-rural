/*
 * Cuentas de las notas de crédito de proveedores (SPEC-notas-credito.md, puntos 8-11, 15 y 20):
 * saldos y estados con NC, "a cuenta", partir una NC entre la boleta y el saldo a favor, y el
 * reparto FIFO de pagos y NC juntos. También que el corte deje afuera lo cargado antes (6).
 *
 * Uso: npm run verificar:notas-credito-calculos
 */
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const ts = require(path.join(process.cwd(), "node_modules", "typescript")) as typeof import("typescript");
const fs = require("node:fs") as typeof import("node:fs");

function cargar<T>(...partes: string[]): T {
  const fuente = fs.readFileSync(path.join(process.cwd(), "src", ...partes), "utf8");
  const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const modulo = { exports: {} as T };
  new Function("exports", "module", "require", js)(modulo.exports, modulo, require);
  return modulo.exports;
}
const cp = cargar<typeof import("../src/lib/ingresos-egresos/cuentaProveedores.ts")>("lib", "ingresos-egresos", "cuentaProveedores.ts");
const corte = cargar<typeof import("../src/lib/ingresos-egresos/corte.ts")>("lib", "ingresos-egresos", "corte.ts");

let fallos = 0;
function ok(cond: boolean, desc: string, detalle: unknown = "") {
  const d = detalle === "" ? "" : `  → ${typeof detalle === "string" ? detalle : JSON.stringify(detalle)}`;
  console.log(`${cond ? "PASS" : "FAIL"}  ${desc}${d}`);
  if (!cond) fallos++;
}

const P = "REGGIO CHICO";
const ent = (id: string, fecha: string, monto: number, proveedor = P) => ({
  id, proveedor, fecha, monto, comprobante: `R-${id}`, detalle: null, creado_el: `${fecha}T10:00:00Z`, creado_por: null,
});
const nota = (id: string, fecha: string, monto: number, proveedor = P) => ({
  id, proveedor, fecha, monto, comprobante: `NC-${id}`, detalle: "devolución", creado_el: `${fecha}T11:00:00Z`, creado_por: null,
});
const mov = (id: string, fecha: string, egreso: number, proveedor: string | null = P) => ({
  id, fecha, descripcion: "Pago", categoria: "Pago a Proveedor", ingreso: null, egreso, proveedor, medio_pago: "Efectivo" as const,
  n_cheque_pago: null, fecha_cobro_cheque_pago: null, cheque_creado: false, gasto_fijo_id: null,
  creado_el: `${fecha}T12:00:00Z`, modificado_el: `${fecha}T12:00:00Z`, creado_por: null,
});
const imp = (id: string, movimiento_id: string, entrega_id: string, monto: number) => ({ id, movimiento_id, entrega_id, monto, creado_el: "2026-11-20T00:00:00Z" });
const apl = (id: string, nota_id: string, entrega_id: string, monto: number) => ({ id, nota_id, entrega_id, monto, creado_el: "2026-11-20T00:00:00Z" });

const entregas = [ent("e1", "2026-11-01", 100000), ent("e2", "2026-11-10", 50000), ent("x1", "2026-11-05", 7000, "OTRO")];
const movs = [mov("m1", "2026-11-02", 30000), mov("m2", "2026-11-03", 999, null)];
const imputaciones = [imp("i1", "m1", "e1", 30000)];
const notas = [nota("n1", "2026-11-04", 20000), nota("n2", "2026-11-12", 15000)];
const aplicaciones = [apl("a1", "n1", "e1", 20000)];

console.log("=== Saldo de cada boleta (9) ===");
const lista = cp.entregasConSaldo(entregas, imputaciones, P, aplicaciones);
const e1 = lista.find((e) => e.id === "e1")!;
const e2 = lista.find((e) => e.id === "e2")!;
ok(e1.pagado === 30000 && e1.acreditado === 20000 && e1.saldo === 50000, "e1: $ 100.000 − $ 30.000 pagados − $ 20.000 de NC = $ 50.000", e1);
ok(e1.estado === "Parcial", "e1 queda Parcial");
ok(e2.acreditado === 0 && e2.saldo === 50000 && e2.estado === "Impaga", "e2 sin nada aplicado: Impaga");
const soloNC = cp.entregasConSaldo([ent("e9", "2026-11-01", 20000)], [], P, [apl("a9", "n1", "e9", 20000)])[0];
ok(soloNC.estado === "Pagada" && soloNC.saldo === 0, "Una boleta cubierta entera por NC queda Pagada", soloNC);
const parcialNC = cp.entregasConSaldo([ent("e8", "2026-11-01", 20000)], [], P, [apl("a8", "n1", "e8", 5000)])[0];
ok(parcialNC.estado === "Parcial", "Sólo NC parcial, sin pagos: Parcial (no Impaga)", parcialNC.estado);
const sinNotas = cp.entregasConSaldo(entregas, imputaciones, P).find((e) => e.id === "e1")!;
ok(sinNotas.saldo === 70000 && sinNotas.acreditado === 0, "Sin pasar las NC (llamadas viejas) la cuenta es la de siempre", sinNotas.saldo);

console.log("\n=== Notas con saldo ===");
const ln = cp.notasConSaldo(notas, aplicaciones, P);
ok(ln.length === 2 && ln[0].id === "n1", "Las NC del proveedor, de la más vieja a la más nueva");
ok(ln[0].aplicado === 20000 && ln[0].disponible === 0, "n1 aplicada entera");
ok(ln[1].aplicado === 0 && ln[1].disponible === 15000, "n2 a favor entera");
ok(cp.notasConSaldo(notas, aplicaciones, "OTRO").length === 0, "No mezcla proveedores");

console.log("\n=== Cuenta del proveedor (8, 10) ===");
const cuentas = cp.buildCuentasProveedores(entregas, movs, imputaciones, null, notas, aplicaciones);
const c = cuentas.find((x) => x.proveedor === P)!;
ok(c.entregado === 150000 && c.pagado === 30000 && c.notas === 35000, "Entregado, pagado y notas", c);
ok(c.saldo === 85000, "Saldo = 150.000 − 30.000 − 35.000 = 85.000", c.saldo);
ok(c.aCuenta === 15000, "A cuenta = NC sin aplicar (los pagos están todos aplicados)", c.aCuenta);
ok(c.cantEntregasPendientes === 2, "Dos boletas pendientes", c.cantEntregasPendientes);
const sumaSaldos = lista.reduce((t, e) => t + e.saldo, 0);
ok(Math.round((sumaSaldos - c.aCuenta) * 100) === Math.round(c.saldo * 100), "Cierra: Σ saldos de boletas − a cuenta = saldo del proveedor", { sumaSaldos, aCuenta: c.aCuenta });
const soloNota = cp.buildCuentasProveedores([], [], [], null, [nota("n5", "2026-11-01", 1000, "NUEVO")], []);
ok(soloNota.length === 1 && soloNota[0].saldo === -1000 && soloNota[0].aCuenta === 1000, "Un proveedor con sólo una NC aparece, con saldo a favor", soloNota);
const sinNC = cp.buildCuentasProveedores(entregas, movs, imputaciones, null).find((x) => x.proveedor === P)!;
ok(sinNC.notas === 0 && sinNC.saldo === 120000, "Sin NC, igual que antes", sinNC);

console.log("\n=== Partir una NC al cargarla (14, 15) ===");
const p1 = cp.partirNota(20000, 50000);
ok(p1.aplicar === 20000 && p1.aFavor === 0, "NC menor que la boleta: se aplica entera", p1);
const p2 = cp.partirNota(80000, 50000);
ok(p2.aplicar === 50000 && p2.aFavor === 30000, "NC mayor que la boleta: se aplica hasta el saldo y el resto queda a favor", p2);
const p3 = cp.partirNota(12345.67, null);
ok(p3.aplicar === 0 && p3.aFavor === 12345.67, "Sin boleta: todo a favor", p3);
const p4 = cp.partirNota(0.1 + 0.2, 0.3);
ok(p4.aplicar === 0.3 && p4.aFavor === 0, "Centavos: 0,1 + 0,2 contra 0,30 no deja un resto fantasma", p4);

console.log("\n=== Reparto FIFO de pagos y NC juntos (20) ===");
const pendientes = [
  { ...ent("A", "2026-11-01", 10000), pagado: 0, acreditado: 0, saldo: 10000, estado: "Impaga" as const },
  { ...ent("B", "2026-11-05", 10000), pagado: 0, acreditado: 0, saldo: 10000, estado: "Impaga" as const },
];
const pagosAF = [{ id: "pX", fecha: "2026-11-03", descripcion: null, medio_pago: null, monto: 6000, imputado: 0, disponible: 6000 }];
const notasAF = [
  { ...nota("nV", "2026-11-02", 7000), aplicado: 0, disponible: 7000 },
  { ...nota("nN", "2026-11-09", 9000), aplicado: 0, disponible: 9000 },
];
const r = cp.repartirTodoConNotasFIFO(pagosAF, notasAF, pendientes);
ok(JSON.stringify(r.notas[0]) === JSON.stringify({ nota_id: "nV", entrega_id: "A", monto: 7000 }), "La NC más vieja (02/11) va primero contra la boleta más vieja", r.notas[0]);
ok(r.pagos.length === 2 && r.pagos[0].entrega_id === "A" && r.pagos[0].monto === 3000 && r.pagos[1].entrega_id === "B" && r.pagos[1].monto === 3000, "El pago (03/11) completa A y empieza B", r.pagos);
ok(r.notas.length === 2 && r.notas[1].nota_id === "nN" && r.notas[1].entrega_id === "B" && r.notas[1].monto === 7000, "La NC nueva cubre lo que queda de B y sobran $ 2.000", r.notas[1]);
const cubierto = (id: string) => [...r.pagos, ...r.notas].filter((x) => x.entrega_id === id).reduce((t, x) => t + x.monto, 0);
ok(cubierto("A") === 10000 && cubierto("B") === 10000, "Ninguna boleta queda cubierta de más", { A: cubierto("A"), B: cubierto("B") });
const vacio = cp.repartirTodoConNotasFIFO([], [], pendientes);
ok(vacio.pagos.length === 0 && vacio.notas.length === 0, "Sin créditos no reparte nada");

console.log("\n=== Corte de registros (6) ===");
const cn = corte.aplicarCorteNotas(
  [nota("vieja", "2026-09-01", 1000), nota("nueva", "2026-10-01", 2000)],
  [apl("av", "vieja", "e1", 1000), apl("an", "nueva", "e1", 2000), apl("ax", "nueva", "eOculta", 1)],
  [ent("e1", "2026-10-01", 5000)],
  "2026-09-27T03:00:00.000Z",
);
ok(cn.notas.map((n) => n.id).join() === "nueva", "Deja afuera la NC cargada antes del corte", cn.notas.map((n) => n.id));
ok(cn.aplicaciones.map((a) => a.id).join() === "an", "Sólo quedan aplicaciones con la NC y la boleta visibles", cn.aplicaciones.map((a) => a.id));
const sinCorte = corte.aplicarCorteNotas([nota("vieja", "2026-09-01", 1000)], [], [], null);
ok(sinCorte.notas.length === 1, "Sin corte entra todo");

console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} FALLA(S)`}`);
process.exit(fallos === 0 ? 0 : 1);
