/*
 * Verifica qué ofertas entran al flyer unificado (SPEC-ofertas.md, puntos 4, 7, 8, 10 y 11):
 * marcadas, con precio, vigentes, en su orden, con tope, y la lectura del flyer viejo.
 *
 * Uso: npm run verificar:ofertas-calculos
 */
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const ts = require(path.join(process.cwd(), "node_modules", "typescript")) as typeof import("typescript");
const fs = require("node:fs") as typeof import("node:fs");

/* Se transpilan los módulos y se resuelven a mano los alias "@/", que node no conoce. */
function cargar(rutaRelativa: string, deps: Record<string, unknown> = {}) {
  const fuente = fs.readFileSync(path.join(process.cwd(), rutaRelativa), "utf8");
  const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const modulo = { exports: {} as Record<string, unknown> };
  const req = (id: string) => {
    if (id in deps) return deps[id];
    throw new Error(`import no previsto en la prueba: ${id}`);
  };
  new Function("exports", "module", "require", js)(modulo.exports, modulo, req);
  return modulo.exports;
}

const placasMod = cargar("src/lib/cartel/placas.ts", { "./types": {} });
const calculosFlyer = cargar("src/lib/flyer/calculos.ts", { "@/lib/cartel/placas": placasMod, "./tipos": {} });
const of = cargar("src/lib/ofertas/flyer.ts", {
  "@/lib/cartel/placas": placasMod,
  "@/lib/flyer/calculos": calculosFlyer,
}) as typeof import("../src/lib/ofertas/flyer");
const { validarFlyer } = calculosFlyer as typeof import("../src/lib/flyer/calculos");
const { CONFIG_INICIAL, armarFlyer, leerFlyerViejo, moverEnFlyer, ofertasDelFlyer, productoDesdePlaca, puedeIrAlFlyer, siguienteOrdenFlyer } = of;

type Placa = Parameters<typeof productoDesdePlaca>[0];

let fallos = 0;
function ok(cond: boolean, desc: string, detalle: unknown = "") {
  const d = detalle === "" ? "" : `  → ${typeof detalle === "string" ? detalle : JSON.stringify(detalle)}`;
  console.log(`${cond ? "PASS" : "FAIL"}  ${desc}${d}`);
  if (!cond) fallos++;
}

const HOY = "2026-09-26";
let n = 0;
function placa(titulo: string, extra: Partial<Placa> = {}): Placa {
  n++;
  return {
    id: `p${n}`, tipo: "oferta", seccion: "Carnicería", titulo, bajada: null, precio: 1000 * n, precio_anterior: null,
    unidad: "el kilo", imagen_url: null, color: null, vigencia_desde: null, vigencia_hasta: null,
    duracion_seg: 8, orden: n, activa: true, en_flyer: false, orden_flyer: 0, ...extra,
  };
}

console.log("=== Qué puede ir al flyer (SPEC 7) ===");
ok(puedeIrAlFlyer({ tipo: "oferta" }), "Una oferta con precio sí");
ok(!puedeIrAlFlyer({ tipo: "imagen" }) && !puedeIrAlFlyer({ tipo: "institucional" }) && !puedeIrAlFlyer({ tipo: "aviso" }), "Carteles ya diseñados, institucionales y avisos no");

console.log("\n=== Qué entra (SPEC 4, 8 y 11) ===");
const asado = placa("Asado", { en_flyer: true, orden_flyer: 2 });
const vacio = placa("Vacío", { en_flyer: true, orden_flyer: 1 });
const vencida = placa("Matambre", { en_flyer: true, orden_flyer: 3, vigencia_hasta: "2026-09-25" });
const futura = placa("Nalga", { en_flyer: true, orden_flyer: 4, vigencia_desde: "2026-09-27" });
const apagada = placa("Lomo", { en_flyer: true, orden_flyer: 5, activa: false });
const cartel = placa("Cartel de la costilla", { tipo: "imagen", en_flyer: true, orden_flyer: 0 });
const sinMarcar = placa("Falda");
const sinMarcarVencida = placa("Osobuco", { vigencia_hasta: "2026-09-01" });
const r = ofertasDelFlyer([asado, vacio, vencida, futura, apagada, cartel, sinMarcar, sinMarcarVencida], HOY);
ok(r.entran.map((p) => p.titulo).join() === "Vacío,Asado", "Entran las marcadas y vigentes, en el orden del flyer (no el del TV)", r.entran.map((p) => p.titulo));
ok(r.noVigentes.map((p) => p.titulo).join() === "Matambre,Nalga,Lomo", "Las marcadas vencidas, futuras o apagadas quedan aparte", r.noVigentes.map((p) => p.titulo));
ok(!r.entran.concat(r.noVigentes).some((p) => p.tipo === "imagen"), "Un cartel ya diseñado marcado no entra nunca");
ok(r.disponibles.map((p) => p.titulo).join() === "Falda", "Para sumar: vigentes y sin marcar (la vencida no)", r.disponibles.map((p) => p.titulo));
ok(r.afuera.length === 0, "Con 2 no queda ninguna afuera");

const ocho = Array.from({ length: 8 }, (_, i) => placa(`Corte ${i + 1}`, { en_flyer: true, orden_flyer: i + 1 }));
const r8 = ofertasDelFlyer(ocho, HOY);
ok(r8.entran.length === 6 && r8.afuera.map((p) => p.titulo).join() === "Corte 7,Corte 8", "Con 8 marcadas entran las 6 primeras y avisa cuáles quedan afuera", r8.afuera.map((p) => p.titulo));

const iguales = [placa("B", { en_flyer: true, orden: 2 }), placa("A", { en_flyer: true, orden: 1 })];
ok(ofertasDelFlyer(iguales, HOY).entran.map((p) => p.titulo).join() === "A,B", "A igual orden de flyer, desempata el orden del TV");
const viejas = [{ ...placa("Sin columnas"), en_flyer: undefined, orden_flyer: undefined }];
ok(ofertasDelFlyer(viejas, HOY).entran.length === 0 && ofertasDelFlyer(viejas, HOY).disponibles.length === 1, "Una placa leída antes de la 023 (sin en_flyer) no va al flyer, pero se puede sumar");

console.log("\n=== El flyer que se dibuja ===");
const conPrecio = placa("Pechito", { precio: "8990.00" as unknown as number, precio_anterior: "11500.00" as unknown as number, imagen_url: "https://x/f.jpg", unidad: "el kilo" });
const prod = productoDesdePlaca(conPrecio);
ok(prod.nombre === "Pechito" && prod.precio === 8990 && prod.precio_anterior === 11500 && prod.imagen_url === "https://x/f.jpg", "Una placa pasa a producto (y los numeric de la base, a número)", prod);
const flyer = armarFlyer({ ...CONFIG_INICIAL, titulo: "Finde largo", telefono: "351 555" }, [vacio, asado]);
ok(flyer.titulo === "Finde largo" && flyer.pie.telefono === "351 555" && flyer.productos.map((p) => p.nombre).join() === "Vacío,Asado", "Arma el flyer con la configuración y las ofertas que entran");
ok(validarFlyer(flyer) === null, "Y pasa la misma validación que usa la descarga", validarFlyer(flyer));

console.log("\n=== Orden dentro del flyer ===");
ok(siguienteOrdenFlyer([asado, vacio, sinMarcar]) === 3 && siguienteOrdenFlyer([sinMarcar]) === 1, "Una oferta que se suma va al final");
const lista = ofertasDelFlyer([asado, vacio], HOY).entran;
const mov = moverEnFlyer(lista, asado.id, -1);
ok(JSON.stringify(mov) === JSON.stringify([{ id: asado.id, orden_flyer: 1 }, { id: vacio.id, orden_flyer: 2 }]), "Subir el asado lo cruza con el vacío", mov);
ok(moverEnFlyer(lista, vacio.id, -1) === null, "La primera no sube más");
const empatadas = [placa("X", { en_flyer: true, orden_flyer: 5 }), placa("Y", { en_flyer: true, orden_flyer: 5 })];
const movEmp = moverEnFlyer(empatadas, empatadas[1].id, -1)!;
ok(movEmp[0].orden_flyer !== movEmp[1].orden_flyer, "Si estaban empatadas, quedan con órdenes distintos", movEmp);

console.log("\n=== El flyer guardado en el navegador antes de unificar (SPEC 9 y 10) ===");
const viejo = leerFlyerViejo(JSON.stringify({
  titulo: "Ofertas del finde", seccion: "Carnicería", vigencia: "Hasta el domingo",
  productos: [{ nombre: "Asado " }, { nombre: "" }, { nombre: "Vacío" }],
  pie: { direccion: "Alvear 637", telefono: "351 1234", horarios: "8 a 22", instagram: "@rural" },
}));
ok(viejo?.config.titulo === "Ofertas del finde" && viejo.config.telefono === "351 1234" && viejo.config.vigencia === "Hasta el domingo", "Trae el título y los datos del local", viejo?.config);
ok(viejo?.productos.join() === "Asado,Vacío", "Lista los productos que tenía (sin los vacíos) para marcarlos a mano", viejo?.productos);
ok(leerFlyerViejo(null) === null && leerFlyerViejo("{roto") === null, "Nada guardado o guardado roto: no hay flyer viejo");
const sinPie = leerFlyerViejo(JSON.stringify({ titulo: "X", productos: [] }));
ok(sinPie?.config.direccion === CONFIG_INICIAL.direccion, "Sin pie guardado usa los datos del local de siempre");

console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} FALLA(S)`}`);
process.exit(fallos === 0 ? 0 : 1);
