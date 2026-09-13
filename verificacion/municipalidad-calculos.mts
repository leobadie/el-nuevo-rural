/*
 * Verifica la lógica de saldos de las cobranzas de la Municipalidad (SPEC-municipalidad.md):
 * estados de factura, antigüedad, resumen, repartos FIFO y topes de aplicación.
 *
 * Uso: npm run verificar:municipalidad-calculos
 */
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

/* Se compila el módulo con el typescript del proyecto para no depender de un runner. */
const ts = require(path.join(process.cwd(), "node_modules", "typescript")) as typeof import("typescript");
const fs = require("node:fs") as typeof import("node:fs");

const fuente = fs.readFileSync(path.join(process.cwd(), "src", "lib", "municipalidad", "calculos.ts"), "utf8");
const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const modulo = { exports: {} as typeof import("../src/lib/municipalidad/calculos.ts") };
new Function("exports", "module", "require", js)(modulo.exports, modulo, require);
const {
  claveNumeroFactura,
  cobrosConSaldo,
  diasEntre,
  facturasConSaldo,
  filtrarFacturas,
  repartirFIFO,
  repartirTodoFIFO,
  resumenMunicipalidad,
  validarAplicaciones,
} = modulo.exports;

let fallos = 0;
function ok(cond: boolean, desc: string, detalle: unknown = "") {
  const d = detalle === "" ? "" : `  → ${typeof detalle === "string" ? detalle : JSON.stringify(detalle)}`;
  console.log(`${cond ? "PASS" : "FAIL"}  ${desc}${d}`);
  if (!cond) fallos++;
}

const HOY = "2026-09-13";

function factura(id: string, fecha_entrega: string, monto: number | string, extra: Record<string, unknown> = {}) {
  return {
    id,
    fecha_entrega,
    numero_factura: `0001-${id}`,
    fecha_factura: null,
    monto: monto as number,
    orden_compra: null,
    lugar_entrega: null,
    detalle: null,
    creado_el: `${fecha_entrega}T12:00:00Z`,
    creado_por: null,
    ...extra,
  };
}

function cobro(id: string, fecha: string, monto_cobrado: number | string, retenciones: number | string = 0) {
  return {
    id,
    fecha,
    monto_cobrado: monto_cobrado as number,
    retenciones: retenciones as number,
    medio_pago: "Transferencia" as const,
    comprobante: null,
    detalle: null,
    creado_el: `${fecha}T12:00:00Z`,
    creado_por: null,
  };
}

const imp = (id: string, cobro_id: string, factura_id: string, monto: number | string) => ({
  id,
  cobro_id,
  factura_id,
  monto: monto as number,
  creado_el: HOY,
});

console.log("=== Antigüedad ===");
ok(diasEntre("2026-09-01", HOY) === 12, "diasEntre cuenta días de calendario", diasEntre("2026-09-01", HOY));
ok(diasEntre("2026-02-28", "2026-03-01") === 1, "diasEntre cruza fin de mes", diasEntre("2026-02-28", "2026-03-01"));

console.log("\n=== Estados y saldos de facturas (R3.3) ===");
// Montos como string a propósito: así los devuelve supabase-js para numeric(14,2).
const FACTURAS = [
  factura("B", "2026-08-20", "300000.50"),
  factura("A", "2026-07-15", 100000, { fecha_factura: "2026-07-20" }),
  factura("C", "2026-09-10", 50000),
];
const COBROS = [cobro("c1", "2026-08-01", 90000, 10000), cobro("c2", "2026-09-05", "120000")];
const IMPS = [imp("i1", "c1", "A", 100000), imp("i2", "c2", "B", "100000.25")];

const fs1 = facturasConSaldo(FACTURAS, IMPS, HOY);
ok(fs1.map((f) => f.id).join() === "A,B,C", "Ordenadas de la más vieja a la más nueva", fs1.map((f) => f.id));
ok(fs1[0].estado === "Cobrada" && fs1[0].saldo === 0 && fs1[0].dias === null, "Factura cubierta entera = Cobrada, sin días", fs1[0]);
ok(fs1[1].estado === "Parcial" && fs1[1].saldo === 200000.25, "Factura cubierta a medias = Parcial con saldo exacto en centavos", fs1[1].saldo);
ok(fs1[2].estado === "Pendiente" && fs1[2].dias === 3, "Factura sin cobros = Pendiente con 3 días", fs1[2]);

const conFechaFactura = facturasConSaldo([factura("D", "2026-08-01", 1, { fecha_factura: "2026-08-11" })], [], HOY)[0];
ok(conFechaFactura.dias === 33, "Los días corren desde la fecha de factura si existe", conFechaFactura.dias);

console.log("\n=== Cobros (R4.5) ===");
const cs = cobrosConSaldo(COBROS, IMPS, FACTURAS);
ok(cs[0].id === "c2", "Cobros del más nuevo al más viejo", cs.map((c) => c.id));
ok(cs[1].total === 100000 && cs[1].disponible === 0, "Total del cobro = cobrado + retenciones", cs[1]);
ok(cs[0].disponible === 19999.75 && cs[0].aplicaciones[0].numero_factura === "0001-B",
  "Disponible del cobro y número de la factura que cancela", cs[0]);

// Un cobro aplicado en dos veces a la misma factura (p. ej. "Aplicar" sobre lo que quedó libre)
// son dos filas: se muestran como una sola, que se deshace entera.
const dosVeces = cobrosConSaldo(COBROS, [...IMPS, imp("i3", "c2", "B", 19999.75)], FACTURAS).find((c) => c.id === "c2")!;
ok(dosVeces.aplicaciones.length === 1 && dosVeces.aplicaciones[0].monto === 120000 && dosVeces.aplicaciones[0].imputacion_ids.join() === "i2,i3",
  "Dos aplicaciones del mismo cobro a la misma factura se agrupan en una", dosVeces.aplicaciones);

console.log("\n=== Resumen (R2.2) y cuadre (R6.4) ===");
const r = resumenMunicipalidad(FACTURAS, COBROS, IMPS, HOY);
ok(r.facturado === 450000.5, "Facturado", r.facturado);
ok(r.cobrado === 220000 && r.retenido === 10000, "Cobrado incluye retenciones y las informa aparte", r);
ok(r.teDebe === 230000.5, "Te debe = facturado − cobrado", r.teDebe);
ok(r.facturasPendientes === 2 && r.diasMasVieja === 24, "Pendientes y antigüedad de la más vieja", r);
ok(r.sinAplicar === 19999.75, "Cobros sin aplicar", r.sinAplicar);
const saldos = fs1.reduce((a, f) => a + Math.round(f.saldo * 100), 0);
ok(Math.round(r.teDebe * 100) === saldos - Math.round(r.sinAplicar * 100),
  "Cuadra: te debe = Σ saldos de facturas − Σ sin aplicar", { saldos: saldos / 100, sinAplicar: r.sinAplicar });

const vacio = resumenMunicipalidad([], [], [], HOY);
ok(vacio.teDebe === 0 && vacio.diasMasVieja === null && vacio.facturasPendientes === 0, "Sin datos todo en cero", vacio);

console.log("\n=== Reparto FIFO (R4.3 / R4.6) ===");
const rep = repartirFIFO(250000, fs1);
ok(rep.length === 2 && rep[0].factura_id === "B" && rep[0].monto === 200000.25 && rep[1].factura_id === "C" && rep[1].monto === 49999.75,
  "Salta la cobrada, llena la más vieja y deja el resto en la siguiente", rep);
ok(repartirFIFO(0, fs1).length === 0, "Sin disponible no reparte nada");

const todo = repartirTodoFIFO(
  [
    { id: "n", fecha: "2026-09-12", creado_el: "x", disponible: 100000 },
    { id: "v", fecha: "2026-09-01", creado_el: "x", disponible: 150000 },
  ],
  fs1,
);
const porFactura = todo.reduce<Record<string, number>>((a, t) => ({ ...a, [t.factura_id]: (a[t.factura_id] ?? 0) + t.monto }), {});
ok(todo[0].cobro_id === "v", "Reparte primero el cobro más viejo", todo);
ok(porFactura.B === 200000.25 && porFactura.C === 49999.75, "Ninguna factura recibe más que su saldo entre varios cobros", porFactura);

console.log("\n=== Topes (R4.4) ===");
ok(validarAplicaciones(250000, rep, fs1) === null, "Acepta un reparto válido");
ok(validarAplicaciones(100, [{ factura_id: "C", monto: 200 }], fs1) !== null, "Rechaza aplicar más que el total del cobro");
ok(validarAplicaciones(999999, [{ factura_id: "C", monto: 50000.01 }], fs1) !== null, "Rechaza aplicar más que el saldo de la factura");
ok(validarAplicaciones(999999, [{ factura_id: "A", monto: 1 }], fs1) !== null, "Rechaza aplicar a una factura ya cobrada");
ok(validarAplicaciones(999999, [{ factura_id: "C", monto: 0 }], fs1) !== null, "Rechaza aplicar $0");

console.log("\n=== Filtro y duplicados (R3.2 / R3.4) ===");
ok(filtrarFacturas(fs1, "pendientes", "").length === 2, "Pendientes incluye las parciales");
ok(filtrarFacturas(fs1, "cobradas", "").map((f) => f.id).join() === "A", "Cobradas");
ok(filtrarFacturas(fs1, "todas", "0001-c").map((f) => f.id).join() === "C", "Busca por número sin importar mayúsculas");
ok(claveNumeroFactura(" 0001 - 00123 ") === claveNumeroFactura("0001-00123"), "El número se compara sin espacios");

console.log(`\n${fallos === 0 ? "Todo OK." : `${fallos} check(s) fallaron.`}`);
process.exit(fallos === 0 ? 0 : 1);
