/*
 * Verifica las cuentas de la carnicería (SPEC-carniceria.md) contra la planilla de Criterio
 * Carnicero: con los datos de ejemplo, cada módulo tiene que dar lo mismo que el Excel.
 * Los valores esperados son los que calcula el propio Excel (sin redondear), leídos del .xlsx.
 *
 * Uso: npm run verificar:carniceria-calculos
 */
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

/* Se compila el módulo con el typescript del proyecto para no depender de un runner. */
const ts = require(path.join(process.cwd(), "node_modules", "typescript")) as typeof import("typescript");
const fs = require("node:fs") as typeof import("node:fs");

const fuente = fs.readFileSync(path.join(process.cwd(), "src", "lib", "carniceria", "calculos.ts"), "utf8");
const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
const modulo = { exports: {} as typeof import("../src/lib/carniceria/calculos.ts") };
new Function("exports", "module", "require", js)(modulo.exports, modulo, require);
const {
  CAMPOS,
  CORTES_EJEMPLO,
  calcularCarniceria,
  calcularMediaRes,
  fix,
  parseNumero,
  polloUltimoMes,
  promediosHistorial,
  resumenPolloPorMes,
  resumenPolloPorProveedor,
  resumirPollo,
  resumenPorAbastecedor,
  resumenPorMes,
  ultimoMes,
} = modulo.exports;

type Entrada = Parameters<typeof calcularCarniceria>[0];
type MediaRes = Entrada["medias"][number];

let fallos = 0;
function ok(cond: boolean, desc: string, detalle: unknown = "") {
  const d = detalle === "" ? "" : `  → ${typeof detalle === "string" ? detalle : JSON.stringify(detalle)}`;
  console.log(`${cond ? "PASS" : "FAIL"}  ${desc}${d}`);
  if (!cond) fallos++;
}
const cerca = (a: number, b: number, tol = 0.001) => Math.abs(a - b) <= tol;

const HOY = "2026-09-26";
const cortes = CORTES_EJEMPLO.map((c, i) => ({ ...c, id: `c${i + 1}` }));

/*
 * Los gastos fijos del Excel (módulo 10) como si vinieran de Ingresos y Egresos, al 100 %.
 * Los sueldos van aparte porque en la app no son un gasto fijo sino un campo del módulo.
 */
const gastosExcel = [
  { id: "g1", descripcion: "Alquiler del local", categoria: "Alquiler", monto: 900000, incluido: true },
  { id: "g2", descripcion: "Impuestos, monotributo o ingresos brutos", categoria: "Impuestos", monto: 1200000, incluido: true },
  { id: "g3", descripcion: "Contador, seguro, alarma y servicios", categoria: "Servicios", monto: 300000, incluido: true },
  { id: "g4", descripcion: "Bolsas, papel, bandejas y limpieza", categoria: "Insumos", monto: 250000, incluido: true },
];
const ajustesM10 = { "m10.pct": 100, "m10.sueldos": 1700000, "m10.otros": 0 };

/** Cada campo cargado a mano con el valor del Excel: cada módulo aislado, como en la planilla. */
const todoManual: Record<string, number> = {};
for (const [clave, def] of Object.entries(CAMPOS)) todoManual[clave] = def.ejemplo;
Object.assign(todoManual, ajustesM10);

function calcular(parametros: Record<string, number>, extra: Partial<Entrada> = {}) {
  return calcularCarniceria({ parametros, cortes, gastos: gastosExcel, medias: [], hoy: HOY, ...extra });
}
const mod = (res: ReturnType<typeof calcular>, n: number) => res.modulos.find((m) => m.numero === n)!;
const sec = (res: ReturnType<typeof calcular>, n: number, etiqueta: string) =>
  mod(res, n).secundarios.find((s) => s.etiqueta.startsWith(etiqueta))?.valor ?? NaN;

// ============================================================================
console.log("=== Formato ===");
ok(fix(14082.524, 0) === "14.083", "FIXED(…,0) con miles", fix(14082.524, 0));
ok(fix(82.4, 1) === "82,4", "FIXED(…,1) con coma decimal", fix(82.4, 1));
ok(fix(1446120, 0) === "1.446.120", "Millones", fix(1446120, 0));
ok(parseNumero("10.600") === 10600, "'10.600' es diez mil seiscientos");
ok(parseNumero("2,6") === 2.6, "'2,6' es dos coma seis");
ok(parseNumero("2.6") === 2.6, "'2.6' también");
ok(parseNumero("1.446.120,50") === 1446120.5, "'1.446.120,50'");
ok(parseNumero("$ 17.700") === 17700, "Con signo pesos");
ok(parseNumero("") === null && parseNumero("abc") === null, "Vacío o basura → null");

// ============================================================================
console.log("\n=== Los 16 módulos contra el Excel (cada uno con sus datos de ejemplo) ===");
const ej = calcular(todoManual);
const esperados: [number, number, number][] = [
  // módulo, valor del Excel, tolerancia
  [1, 14082.524271844659, 1e-6],
  [2, 2.09, 1e-9],
  [3, 280120, 1e-6],
  [4, 9.325, 0.001],
  [5, 23.077, 0.001],
  [6, 7002.967, 0.001],
  [7, 3460, 1e-6],
  [8, 3428, 1e-6],
  [9, 289.853, 0.001],
  [10, 2320.665, 0.001],
  [11, 20.273, 0.001],
  [12, 4909.626, 0.001],
  [13, 131.207, 0.001],
  [14, 486920, 1e-6],
  [15, 421200, 1e-6],
  [16, 53870.04, 0.001],
];
for (const [n, esperado, tol] of esperados) {
  const m = mod(ej, n);
  ok(cerca(m.principal.valor, esperado, tol), `Módulo ${n} (${m.titulo}): ${m.principal.etiqueta} = ${esperado}`, m.principal.valor);
}
ok(ej.modulos.length === 16 && ej.modulos.every((m, i) => m.numero === i + 1), "Están los 16, en orden");

console.log("\n--- Resultados secundarios ---");
ok(cerca(sec(ej, 1, "Kilos que sí"), 82.4), "M1 kilos que sí vendés 82,4");
ok(cerca(sec(ej, 1, "Rendimiento"), 74.909, 0.001), "M1 rendimiento 74,9 %");
ok(cerca(sec(ej, 1, "Plata que pagaste"), 259400), "M1 hueso y grasa 259.400");
ok(cerca(sec(ej, 1, "Lo que regalás"), 286960), "M1 lo que regalás 286.960");
ok(cerca(sec(ej, 2, "Plata por mes"), 576004), "M2 plata por mes 576.004");
ok(cerca(sec(ej, 3, "Facturación"), 1446120), "M3 facturación 1.446.120");
ok(cerca(sec(ej, 3, "Margen sobre"), 19.37, 0.001), "M3 margen 19,37 %");
ok(cerca(sec(ej, 3, "Kilos que no aparecen"), 2.6), "M3 kilos que no aparecen 2,6");
ok(cerca(sec(ej, 4, "Facturación que"), 1547200), "M4 facturación que necesitás 1.547.200");
ok(cerca(sec(ej, 4, "Lo que ponen"), 296520), "M4 cortes fijos 296.520");
ok(cerca(sec(ej, 4, "Lo que facturás"), 1440520), "M4 facturás hoy 1.440.520");
const filaM4 = (nombre: string) => ej.prorrateo.find((x) => x.nombre === nombre)!;
ok(cerca(filaM4("Lomo").precioNuevo, 31376.325, 0.001), "M4 lomo pasa a 31.376", filaM4("Lomo").precioNuevo);
ok(cerca(filaM4("Nalga").precioNuevo, 23942.213, 0.001), "M4 nalga pasa a 23.942", filaM4("Nalga").precioNuevo);
ok(filaM4("Asado (con hueso)").precioNuevo === 17700, "M4 el asado fijo no se mueve");
ok(cerca(sec(ej, 5, "Precio para tu margen"), 18777.333, 0.001), "M5 precio para tu margen");
ok(cerca(sec(ej, 7, "Margen trozado"), 40.863, 0.001), "M7 margen trozado 40,9 %");
ok(cerca(sec(ej, 8, "Costo del kilo"), 18303.03, 0.001), "M8 costo del kilo de milanesa");
ok(cerca(sec(ej, 9, "Factura de luz"), 620865), "M9 luz 620.865 por mes");
ok(cerca(sec(ej, 10, "Gasto fijo del mes"), 4970865), "M10 gasto fijo 4.970.865");
ok(cerca(sec(ej, 10, "Por día abierto"), 191187.115, 0.001), "M10 por día abierto");
ok(cerca(sec(ej, 11, "Lo que te queda en el mes"), 1404153), "M11 te quedan 1.404.153");
ok(cerca(sec(ej, 11, "Margen de seguridad"), 22.026, 0.001), "M11 margen de seguridad 22 %");
ok(cerca(sec(ej, 12, "Lo que ganás por ser"), -883847), "M12 por ser el dueño -883.847");
ok(cerca(sec(ej, 13, "Kilos de más"), 64.207, 0.001), "M13 kilos de más 64,2");
ok(cerca(sec(ej, 14, "Comisión promedio"), 1.295, 1e-9), "M14 comisión promedio 1,295 %");
ok(cerca(sec(ej, 14, "Precio con crédito"), 18690.602, 0.001), "M14 precio con crédito");
ok(cerca(sec(ej, 15, "Plata por año"), 5054400), "M15 plata por año");
ok(cerca(sec(ej, 15, "Por media res"), 16200), "M15 por media res 16.200 (el dato del módulo 16)");
ok(cerca(sec(ej, 16, "Lo que se va en gastos"), 226249.96, 0.001), "M16 gastos 226.250");

console.log("\n--- Frases (las del Excel con los datos de ejemplo) ---");
const frases: [number, string][] = [
  [1, "La factura dice 110 kilos a 10.600 pesos. A la balanza del mostrador llegan 82,4: cada kilo que vendés te cuesta 14.083 pesos, un 32,9 % más que el de la factura."],
  [2, "Entre la romana y la cámara se van 2,09 kilos por media res: 22.154 pesos. Con 6 medias por semana son 576.004 pesos por mes que pagaste y nunca pesaste en el mostrador."],
  [5, "Le sumás 30 % al costo y te quedan 23,1 pesos de cada 100 que cobrás. Para quedarte con 25 de cada 100, el recargo tiene que ser 33,3 %: el kilo va a 18.777 pesos, no a 18.308."],
  [11, "Las primeras 20,3 medias reses de cada mes no son ganancia: pagan la persiana. Con las 26 que vendés, te quedan 1.404.153 pesos al mes, que son 54.006 por media res."],
  [12, "Trabajás 286 horas por mes y te quedan 1.404.153 pesos: tu hora vale 4.910 pesos, 0,61 veces la de tu empleado."],
];
for (const [n, esperado] of frases) ok(mod(ej, n).frase === esperado, `Frase del módulo ${n}`, mod(ej, n).frase);
ok(mod(ej, 4).frase.includes("sube 9,3 %") && mod(ej, 4).frase.includes("28.700 a 31.376"), "Frase del módulo 4 nombra la suba y el lomo", mod(ej, 4).frase);
ok(mod(ej, 3).consejo.startsWith("El asado y la picada son 18,5 % de los kilos y 20,5 % de la plata"), "Frase del asado y la picada (B40 del escandallo)", mod(ej, 3).consejo);

// ============================================================================
console.log("\n=== Módulos encadenados (lo que en el Excel dice «sale del módulo N») ===");
// Sin cargar nada salvo el reparto de gastos: todo lo encadenado se completa solo.
const cadena = calcular({ ...ajustesM10 });
const campo = (res: ReturnType<typeof calcular>, clave: string) =>
  res.modulos.flatMap((m) => m.campos).concat(res.generales).find((c) => c.clave === clave)!;
ok(campo(cadena, "m5.costo").origen === "auto" && cerca(campo(cadena, "m5.costo").valor, mod(cadena, 1).principal.valor),
  "M5 toma el costo real del módulo 1", campo(cadena, "m5.costo").valor);
ok(cerca(campo(cadena, "m9.deja_media").valor, 280120), "M9 toma lo que deja la media res del módulo 3");
ok(cerca(campo(cadena, "m10.luz").valor, 620865), "M10 toma la luz del módulo 9");
ok(cerca(campo(cadena, "m11.gasto_fijo").valor, 4970865), "M11 toma el gasto fijo del módulo 10");
ok(cerca(campo(cadena, "m11.deja_media").valor, 245193, 0.5), "M11 recibe 245.193 por media res de los módulos 3, 14 y 15", campo(cadena, "m11.deja_media").valor);
ok(cerca(campo(cadena, "m12.limpio").valor, sec(cadena, 11, "Lo que te queda en el mes")), "M12 toma lo que queda del módulo 11");
ok(cerca(campo(cadena, "m16.gasto_kg").valor, 2320.665, 0.001), "M16 toma el gasto por kilo del módulo 10 (sin redondear)");
ok(cerca(campo(cadena, "m16.picada").valor, 16200), "M16 toma la picada por media res del módulo 15");
ok(cerca(campo(cadena, "m4.recupero").valor, 5600), "M4 toma la grasa del escandallo (7 kg × 800)");
ok(cerca(campo(cadena, "m2.medias_semana").valor, 6, 0.001), "M2 pasa 26 medias por mes a 6 por semana", campo(cadena, "m2.medias_semana").valor);
// 1.446.120 × (1 − 0,01295) − 1.166.000 − 82,4 × 2.320,665 − 16.200
ok(cerca(mod(cadena, 16).principal.valor, 1446120 * (1 - 0.01295) - 1166000 - 82.4 * (4970865 / 2142) - 16200, 1e-6), "M16 encadenado, con 1,295 % y 2.320,67 sin redondear", mod(cadena, 16).principal.valor);

console.log("\n--- Lo cargado a mano gana ---");
const pisado = calcular({ ...ajustesM10, "m5.costo": 15000, "m1.hueso": 20 });
ok(campo(pisado, "m5.costo").origen === "manual" && campo(pisado, "m5.costo").valor === 15000, "Un valor pisado queda manual");
ok(cerca(campo(pisado, "m5.costo").valorAuto ?? NaN, mod(pisado, 1).principal.valor), "…y se sabe cuánto valdría en automático");
ok(campo(pisado, "m3.hueso").valor === 20 && campo(pisado, "m3.hueso").origen === "auto", "Pisar el módulo 1 se propaga al 3");
ok(campo(pisado, "m7.kg").origen === "ejemplo", "Lo que nadie cargó queda como ejemplo");

// ============================================================================
console.log("\n=== Módulo 10: gastos fijos de la app ===");
const gastosMix = [
  ...gastosExcel,
  { id: "g5", descripcion: "Factura EPEC", categoria: "Servicios", monto: 800000, incluido: true },
  { id: "g6", descripcion: "Mercadería", categoria: "Compras", monto: 5000000, incluido: false },
];
const r10 = calcular({ ...ajustesM10, "m10.pct": 10, "m10.sueldos": 0 }, { gastos: gastosMix });
const esperado10 = (900000 + 1200000 + 300000 + 250000 + 800000) * 0.1 + 620865;
ok(cerca(sec(r10, 10, "Gasto fijo del mes"), esperado10), "Suma sólo los incluidos, al % de la carnicería, más la luz del 9", sec(r10, 10, "Gasto fijo del mes"));
ok(r10.gastos.find((g) => g.id === "g6")!.parte === 0, "Un gasto excluido no suma");
ok(!!r10.avisoLuzDoble && r10.avisoLuzDoble.includes("EPEC"), "Avisa si la luz está dos veces", r10.avisoLuzDoble);
const sinLuz9 = calcular({ ...ajustesM10, "m10.usar_luz_m9": 0 }, { gastos: gastosMix });
ok(sinLuz9.avisoLuzDoble === null, "Sin la luz del 9 no hay aviso");
ok(cerca(sec(sinLuz9, 10, "Gasto fijo del mes"), 900000 + 1200000 + 300000 + 250000 + 800000 + 1700000), "…ni se suma");
const sinGastos = calcular({}, { gastos: [] });
ok(Number.isFinite(mod(sinGastos, 10).principal.valor), "Sin gastos fijos cargados no se rompe");

// ============================================================================
console.log("\n=== Divisiones por cero (el IFERROR del Excel) ===");
const roto = calcular({ ...todoManual, "m1.hueso": 110, "m1.grasa": 0, "m1.merma": 0 });
ok(mod(roto, 1).principal.valor === 0 && mod(roto, 1).frase.startsWith("Cargá"), "Sin kilos vendibles: 0 y pide cargar datos", mod(roto, 1).frase);
ok(roto.modulos.every((m) => Number.isFinite(m.principal.valor)), "Ningún módulo muestra NaN");
const promoMala = calcular({ ...todoManual, "m13.descuento": 30 });
ok(mod(promoMala, 13).frase.includes("perder plata"), "Promo que vende bajo costo: lo dice en vez de dar kilos negativos", mod(promoMala, 13).frase);

// ============================================================================
console.log("\n=== Historial de medias reses ===");
let n = 0;
function media(fecha: string, extra: Partial<MediaRes> = {}): MediaRes {
  return {
    id: `m${++n}`, fecha, abastecedor: "Frigorífico Río", especie: "vaca",
    kg_factura: 110, precio_kg: 10600, kg_balanza: 109, dias_camara: 2,
    hueso_kg: 18, grasa_kg: 7, merma_kg: 2.6, precio_grasero: 800, notas: null, ...extra,
  };
}
const una = calcularMediaRes(media(HOY));
ok(cerca(una.costoReal ?? NaN, 14082.524, 0.001), "Una media res con los datos del Excel da el costo del módulo 1", una.costoReal);
ok(cerca(una.rendimiento ?? NaN, 74.909, 0.001) && una.romanaKg === 1 && una.romanaPlata === 10600, "Rendimiento y romana de una media res");
const sinDesp = calcularMediaRes(media(HOY, { hueso_kg: null, kg_balanza: null }));
ok(!sinDesp.tieneDesposte && sinDesp.costoReal === null && sinDesp.romanaKg === null, "Sin desposte ni balanza no inventa números");

const historial = [
  media("2026-09-26", { kg_factura: 120, precio_kg: 11000, kg_balanza: 118 }),
  media("2026-08-28"), // hace 29 días: entra
  media("2026-08-27", { abastecedor: "Don Pedro" }), // hace 30 días: afuera
  media("2026-09-20", { especie: "cerdo", kg_factura: 45, precio_kg: 5300, hueso_kg: 5.4, grasa_kg: 5, merma_kg: 0.9, precio_grasero: 500 }),
  media("2026-09-27"), // mañana: afuera
  media("2026-09-10", { hueso_kg: null, grasa_kg: null, merma_kg: null, kg_balanza: null, abastecedor: "Don Pedro" }),
];
ok(ultimoMes(historial, "vaca", HOY).length === 3, "Últimos 30 días: hoy, hace 29 y sin desposte; no hace 30 ni mañana", ultimoMes(historial, "vaca", HOY).map((m) => m.fecha));
const prom = promediosHistorial(historial, "vaca", HOY);
ok(prom.cantidad === 3, "Cuenta las 3 del último mes");
ok(cerca(prom.valores.kg_factura, 115) && cerca(prom.valores.hueso, 18), "Promedia kilos y hueso de las despostadas", prom.valores);
ok(cerca(prom.valores.precio_kg, (120 * 11000 + 110 * 10600) / 230, 1e-6), "El precio se pondera por kilos", prom.valores.precio_kg);
ok(cerca(prom.valores.kg_balanza, 113.5) && cerca(prom.valores.kg_factura_pesadas, 115), "Romana: factura y balanza de las mismas medias reses");
const conHist = calcular({ ...ajustesM10 }, { medias: historial });
ok(campo(conHist, "m1.kg_factura").origen === "auto" && cerca(campo(conHist, "m1.kg_factura").valor, 115), "El módulo 1 toma el historial");
ok(campo(conHist, "gen.medias_mes").origen === "auto" && campo(conHist, "gen.medias_mes").valor === 3, "Las medias por mes salen del historial");
ok(campo(conHist, "m6.kg_factura").origen === "auto" && cerca(mod(conHist, 6).principal.valor, 7002.967, 0.001), "El cerdo toma su propio historial");
ok(conHist.historial.vaca === 3 && conHist.historial.cerdo === 1, "Cuenta vaca y cerdo por separado");

const porMes = resumenPorMes(historial, "vaca");
ok(porMes.map((x) => x.clave).join() === "2026-09,2026-08", "Resumen por mes, el más nuevo primero", porMes.map((x) => x.clave));
const sep = porMes[0];
ok(sep.cantidad === 3 && sep.conDesposte === 2, "Septiembre: 3 medias, 2 despostadas", sep);
ok(cerca(sep.romanaPct ?? NaN, (2 + 1) / (120 + 110) * 100, 1e-9), "Romana % sobre las que se pesaron", sep.romanaPct);
const porAb = resumenPorAbastecedor(historial, "vaca");
ok(porAb[0].clave === "Frigorífico Río" && porAb[0].cantidad === 3 && porAb[1].clave === "Don Pedro", "Resumen por abastecedor, el que más mandó primero", porAb.map((x) => `${x.clave}:${x.cantidad}`));

// ============================================================================
console.log("\n=== Cajones de pollo (SPEC 19 a 23) ===");
type Ingreso = NonNullable<Entrada["pollo"]>[number];
let np = 0;
const ingreso = (fecha: string, cajones: number, kg_total: number, precio_kg: number, proveedor: string | null = "Granja Sur"): Ingreso =>
  ({ id: `p${++np}`, fecha, proveedor, cajones, kg_total, precio_kg, notas: null });
const pollo = [
  ingreso("2026-09-25", 10, 200, 3000),
  ingreso("2026-09-10", 5, 110, 3200, "Avícola Norte"),
  ingreso("2026-08-27", 20, 400, 2500), // hace 30 días: fuera del mes
  ingreso("2026-09-27", 3, 60, 9999), // mañana: fuera
];
const ult = polloUltimoMes(pollo, HOY);
ok(ult.length === 2, "Últimos 30 días: el de ayer y el del 10", ult.map((x) => x.fecha));
const rp = resumirPollo("mes", ult);
ok(rp.cajones === 15 && rp.kg === 310, "Suma cajones y kilos", rp);
ok(cerca(rp.kgPorCajon ?? NaN, 310 / 15, 1e-9), "Kilos por cajón = kilos totales / cajones (no el promedio de promedios)", rp.kgPorCajon);
ok(cerca(rp.precioPromedio ?? NaN, (200 * 3000 + 110 * 3200) / 310, 1e-9), "Precio ponderado por kilos", rp.precioPromedio);
ok(rp.total === 200 * 3000 + 110 * 3200, "Total pagado", rp.total);
const vacio = resumirPollo("nada", []);
ok(vacio.kgPorCajon === null && vacio.precioPromedio === null, "Sin ingresos no inventa promedios");

const conPollo = calcular({ ...ajustesM10 }, { pollo });
ok(campo(conPollo, "m7.kg").origen === "auto" && cerca(campo(conPollo, "m7.kg").valor, 310 / 15, 1e-9), "El módulo 7 toma los kilos por cajón del historial", campo(conPollo, "m7.kg").valor);
ok(campo(conPollo, "m7.compra").origen === "auto" && cerca(campo(conPollo, "m7.compra").valor, rp.precioPromedio!, 1e-9), "…y el precio de compra");
ok(conPollo.historial.pollo === 2, "Cuenta los ingresos de pollo del último mes");
const polloPisado = calcular({ ...ajustesM10, "m7.kg": 20 }, { pollo });
ok(campo(polloPisado, "m7.kg").origen === "manual" && campo(polloPisado, "m7.kg").valor === 20, "El kilo del cajón se puede pisar a mano");
ok(campo(calcular({}), "m7.kg").origen === "ejemplo" && mod(calcular(todoManual), 7).principal.valor === 3460, "Sin historial de pollo sigue el ejemplo del Excel (3.460)");

const polloMes = resumenPolloPorMes(pollo);
ok(polloMes.map((x) => x.clave).join() === "2026-09,2026-08" && polloMes[0].cajones === 18, "Resumen mes a mes (septiembre incluye todo el mes)", polloMes.map((x) => `${x.clave}:${x.cajones}`));
const polloProv = resumenPolloPorProveedor(pollo);
ok(polloProv[0].clave === "Granja Sur" && polloProv[0].cajones === 33 && polloProv[1].clave === "Avícola Norte", "Por proveedor, el que más cajones mandó primero", polloProv.map((x) => `${x.clave}:${x.cajones}`));

console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} FALLA(S)`}`);
process.exit(fallos === 0 ? 0 : 1);
