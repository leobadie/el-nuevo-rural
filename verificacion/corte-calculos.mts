/*
 * Verifica el corte de registros de Ingresos y Egresos (SPEC-corte-registros.md): qué se cuenta,
 * qué queda guardado, bordes y pagos aplicados que cruzan el corte.
 *
 * Uso: npm run verificar:corte
 */
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const ts = require(path.join(process.cwd(), "node_modules", "typescript")) as typeof import("typescript");
const fs = require("node:fs") as typeof import("node:fs");

const fuente = fs.readFileSync(path.join(process.cwd(), "src", "lib", "ingresos-egresos", "corte.ts"), "utf8");
const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const modulo = { exports: {} as typeof import("../src/lib/ingresos-egresos/corte.ts") };
new Function("exports", "module", "require", js)(modulo.exports, modulo, require);
const { aplicarCorte, corteCuentaCorriente, corteDesdeDia, cuentaDesdeCorte, textoGuardados } = modulo.exports;

type Datos = Parameters<typeof aplicarCorte>[0];

let fallos = 0;
function ok(cond: boolean, desc: string, detalle: unknown = "") {
  const d = detalle === "" ? "" : `  → ${typeof detalle === "string" ? detalle : JSON.stringify(detalle)}`;
  console.log(`${cond ? "PASS" : "FAIL"}  ${desc}${d}`);
  if (!cond) fallos++;
}

// El corte de la migración 024: 27/09/2026 00:00 de Argentina = 03:00 UTC. Así lo devuelve la base.
const CORTE = "2026-09-27T03:00:00+00:00";

console.log("=== Qué cuenta (SPEC 2 y 3) ===");
ok(cuentaDesdeCorte("2026-09-27T03:00:00Z", CORTE), "Lo cargado justo en el corte cuenta (mismo instante, otro formato)");
ok(cuentaDesdeCorte("2026-09-27T12:30:00.123+00:00", CORTE), "Lo cargado hoy a la mañana cuenta");
ok(!cuentaDesdeCorte("2026-09-27T02:59:59Z", CORTE), "Lo cargado anoche a las 23:59 de Argentina no cuenta");
ok(!cuentaDesdeCorte("2026-09-26T20:00:00+00:00", CORTE), "Lo de ayer no cuenta");
ok(cuentaDesdeCorte("2026-01-01T00:00:00Z", null) && cuentaDesdeCorte("2026-01-01T00:00:00Z", undefined), "Sin corte cuenta todo (SPEC 8)");
ok(cuentaDesdeCorte(null, CORTE), "Un registro sin fecha de carga no se esconde");

console.log("\n=== Aplicar el corte a todo Ingresos y Egresos (SPEC 4 y 5) ===");
const mov = (id: string, creado_el: string, extra: Record<string, unknown> = {}) => ({ id, fecha: creado_el.slice(0, 10), creado_el, ...extra }) as unknown as Datos["movimientos"][number];
const datos: Datos = {
  movimientos: [
    mov("m-viejo", "2026-09-20T15:00:00+00:00"),
    // Cargado hoy aunque corresponde al 20: entra igual (el criterio es cuándo se cargó).
    mov("m-tarde", "2026-09-27T14:00:00+00:00", { fecha: "2026-09-20" }),
    mov("m-hoy", "2026-09-27T15:00:00+00:00"),
    // El de la fecha mal tipeada (0206): se cargó antes del corte, queda guardado.
    mov("m-0206", "2026-08-26T18:00:00+00:00", { fecha: "0206-08-26" }),
  ],
  ventasXRP: [
    { id: "v1", fecha: "2026-09-18", creado_el: "2026-09-18T23:00:00+00:00" },
    { id: "v2", fecha: "2026-09-27", creado_el: "2026-09-27T23:00:00+00:00" },
  ] as unknown as Datos["ventasXRP"],
  pedidos: [
    { id: "p1", enviado_el: "2026-09-10T12:00:00+00:00" },
    { id: "p2", enviado_el: "2026-09-27T12:00:00+00:00" },
  ] as unknown as Datos["pedidos"],
  entregas: [
    { id: "e-vieja", creado_el: "2026-09-25T12:00:00+00:00" },
    { id: "e-nueva", creado_el: "2026-09-27T13:00:00+00:00" },
  ] as unknown as Datos["entregas"],
  imputaciones: [
    { id: "i-vieja", movimiento_id: "m-viejo", entrega_id: "e-vieja" },
    // Pago nuevo aplicado a una entrega vieja: cruza el corte, no se cuenta.
    { id: "i-cruza", movimiento_id: "m-hoy", entrega_id: "e-vieja" },
    { id: "i-nueva", movimiento_id: "m-hoy", entrega_id: "e-nueva" },
  ] as unknown as Datos["imputaciones"],
};
const { visibles, guardados } = aplicarCorte(datos, CORTE);
ok(visibles.movimientos.map((m) => m.id).join() === "m-tarde,m-hoy", "Movimientos: los cargados desde hoy, aunque correspondan a un día anterior", visibles.movimientos.map((m) => m.id));
ok(visibles.ventasXRP.map((v) => v.id).join() === "v2" && visibles.pedidos.map((p) => p.id).join() === "p2", "Ventas XRP y pedidos: sólo lo de hoy");
ok(visibles.entregas.map((e) => e.id).join() === "e-nueva", "Entregas de proveedor: sólo lo de hoy");
ok(visibles.imputaciones.map((i) => i.id).join() === "i-nueva", "Pagos aplicados: sólo si el pago y la entrega están del lado de hoy", visibles.imputaciones.map((i) => i.id));
ok(JSON.stringify(guardados) === JSON.stringify({ movimientos: 2, ventasXRP: 1, pedidos: 1, entregas: 1 }), "Cuenta lo que quedó guardado antes del corte", guardados);
ok(datos.movimientos.length === 4 && datos.imputaciones.length === 3, "No toca los datos de entrada: filtra, no borra");
const sinCorte = aplicarCorte(datos, null);
ok(sinCorte.visibles.movimientos.length === 4 && sinCorte.visibles.imputaciones.length === 3 && sinCorte.guardados.movimientos === 0, "Sin corte (o quitándolo) vuelve a verse todo (SPEC 7)");

console.log("\n=== Cuenta corriente: manda el corte más nuevo (SPEC 5) ===");
ok(corteCuentaCorriente("2026-08-26T20:40:47+00:00", CORTE) === CORTE, "El general (27/09) es posterior al propio (26/08): manda el general");
ok(corteCuentaCorriente("2026-10-01T00:00:00Z", CORTE) === "2026-10-01T00:00:00Z", "Si el propio es posterior, manda el propio");
ok(corteCuentaCorriente(null, CORTE) === CORTE && corteCuentaCorriente("2026-08-26T20:40:47Z", null) === "2026-08-26T20:40:47Z", "Si falta uno, el otro");

console.log("\n=== Textos ===");
ok(textoGuardados({ movimientos: 799, ventasXRP: 18, pedidos: 6, entregas: 35 }) === "799 movimientos, 18 ventas XRP, 6 pedidos y 35 entregas de proveedores", "El aviso con todo", textoGuardados({ movimientos: 799, ventasXRP: 18, pedidos: 6, entregas: 35 }));
ok(textoGuardados({ movimientos: 1, ventasXRP: 0, pedidos: 0, entregas: 0 }) === "1 movimiento", "Singular y sin ceros");
ok(textoGuardados({ movimientos: 1200, ventasXRP: 0, pedidos: 0, entregas: 0 }) === "1.200 movimientos", "Miles con punto");
ok(textoGuardados({ movimientos: 0, ventasXRP: 0, pedidos: 0, entregas: 0 }) === "", "Nada guardado: vacío");
ok(Date.parse(corteDesdeDia("2026-09-27")) === Date.parse(CORTE), "Elegir el 27/09 da las 00:00 de Argentina", corteDesdeDia("2026-09-27"));

console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} FALLA(S)`}`);
process.exit(fallos === 0 ? 0 : 1);
