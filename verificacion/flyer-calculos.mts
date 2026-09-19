/*
 * Verifica las cuentas del flyer (SPEC-flyer.md R4.1): escalado según cuántos productos haya,
 * validaciones, color de la franja, descuento y nombre del archivo.
 *
 * Uso: npm run verificar:flyer-calculos
 */
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);

/* Se compila con el typescript del proyecto para no depender de un runner. */
const ts = require(path.join(process.cwd(), "node_modules", "typescript")) as typeof import("typescript");
const fs = require("node:fs") as typeof import("node:fs");

/*
 * calculos.ts importa de "@/lib/cartel/placas" (alias que node no resuelve) y de "./tipos",
 * que sólo tiene tipos. Se transpilan los dos módulos y se resuelve el alias a mano.
 */
function cargar(rutaRelativa: string, deps: Record<string, unknown> = {}) {
  const fuente = fs.readFileSync(path.join(process.cwd(), rutaRelativa), "utf8");
  const js = ts.transpileModule(fuente, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText;
  const modulo = { exports: {} as Record<string, unknown> };
  const req = (id: string) => {
    if (id in deps) return deps[id];
    throw new Error(`import no previsto en la prueba: ${id}`);
  };
  new Function("exports", "module", "require", js)(modulo.exports, modulo, req);
  return modulo.exports;
}

const placas = cargar("src/lib/cartel/placas.ts", { "./types": {} });
const calculos = cargar("src/lib/flyer/calculos.ts", {
  "@/lib/cartel/placas": placas,
  "./tipos": {},
}) as typeof import("../src/lib/flyer/calculos");

const { MAX_PRODUCTOS, MEDIDAS, colorDeFlyer, descuentoDe, escalaDe, esFormato, nombreArchivo, validarFlyer } = calculos;

let fallos = 0;
function ok(cond: boolean, desc: string, detalle: unknown = "") {
  const d = detalle === "" ? "" : `  → ${typeof detalle === "string" ? detalle : JSON.stringify(detalle)}`;
  console.log(`${cond ? "PASS" : "FAIL"}  ${desc}${d}`);
  if (!cond) fallos++;
}

const prod = (nombre: string, precio: number | null, extra: Record<string, unknown> = {}) => ({
  id: nombre,
  nombre,
  precio,
  precio_anterior: null,
  unidad: "el kilo",
  imagen_url: null,
  ...extra,
});

console.log("=== Medidas (R1.5) ===");
ok(MEDIDAS.redes.ancho === 1080 && MEDIDAS.redes.alto === 1350, "Redes mide 1080×1350", MEDIDAS.redes);
ok(MEDIDAS.story.ancho === 1080 && MEDIDAS.story.alto === 1920, "Estado/TV mide 1080×1920", MEDIDAS.story);
ok(esFormato("redes") && esFormato("story"), "Reconoce los dos formatos");
ok(!esFormato("a4") && !esFormato(null) && !esFormato(undefined), "Rechaza un formato inventado");

console.log("\n=== Escalado por cantidad (R1.7) ===");
for (const formato of ["redes", "story"] as const) {
  const alto = MEDIDAS[formato].alto;
  let anterior = Infinity;
  let entranTodos = true;
  for (let n = 1; n <= MAX_PRODUCTOS; n++) {
    const e = escalaDe(formato, n);
    // Lo que ocupan las filas más los huecos no puede pasar el alto del lienzo.
    const usado = e.altoFila * n + e.hueco * (n - 1);
    if (usado > alto) entranTodos = false;
    if (e.precioFS > anterior) {
      ok(false, `${formato}: con ${n} productos el precio debería achicarse, no agrandarse`, e.precioFS);
    }
    anterior = e.precioFS;
  }
  ok(entranTodos, `${formato}: con 1 a ${MAX_PRODUCTOS} productos las filas entran en el alto del flyer`);
  const uno = escalaDe(formato, 1);
  const seis = escalaDe(formato, 6);
  ok(uno.precioFS > seis.precioFS * 1.5, `${formato}: un solo producto se ve mucho más grande que seis`, {
    uno: uno.precioFS,
    seis: seis.precioFS,
  });
  ok(seis.precioFS >= 54, `${formato}: con seis productos el precio sigue siendo legible`, seis.precioFS);
  ok(escalaDe(formato, 1).hueco === 0, `${formato}: con un solo producto no hay hueco entre filas`);
}
ok(
  escalaDe("story", 3).altoFila > escalaDe("redes", 3).altoFila,
  "El formato alto le da más lugar a cada producto que el de redes",
  { story: escalaDe("story", 3).altoFila, redes: escalaDe("redes", 3).altoFila },
);
ok(escalaDe("redes", 99).altoFila === escalaDe("redes", MAX_PRODUCTOS).altoFila, "Pedir de más no rompe la escala");

console.log("\n=== Reparto del ancho de la fila (R1.7) ===");
/*
 * La primera versión repartía el ancho a ojo y el precio se le montaba encima al nombre: el PNG
 * salía ilegible aunque midiera 1080×1350. Estos checks son por eso.
 */
const { anchosDeFila, tamanoQueEntra, ANCHO } = calculos;
for (const formato of ["redes", "story"] as const) {
  for (let n = 1; n <= MAX_PRODUCTOS; n++) {
    const e = escalaDe(formato, n);
    for (const conFoto of [false, true]) {
      const a = anchosDeFila(e, conFoto);
      const margenes = (conFoto ? e.foto + 28 : 0) + 40 * 2 + 30 * 2;
      // Apilado van uno debajo del otro, así que cada uno puede usar todo el ancho de la columna.
      const usado = e.apilado ? Math.max(a.nombre, a.precio) + margenes : a.nombre + a.precio + 20 + margenes;
      if (a.nombre <= 0 || a.precio <= 0) ok(false, `${formato}/${n}/foto=${conFoto}: alguna columna quedó sin ancho`, a);
      if (usado > ANCHO) ok(false, `${formato}/${n}/foto=${conFoto}: las columnas suman más que el ancho`, { usado, ANCHO });
    }
  }
}
ok(true, "Nombre y precio siempre tienen ancho propio y juntos entran en los 1080");
ok(escalaDe("redes", 1).apilado && escalaDe("redes", 2).apilado, "Con una o dos ofertas el precio va debajo del nombre");
ok(!escalaDe("redes", 3).apilado && !escalaDe("story", 6).apilado, "Con tres o más, el precio va al lado del nombre");
const apilada = anchosDeFila(escalaDe("story", 1), false);
ok(apilada.nombre === apilada.precio, "Apilado, nombre y precio tienen el mismo ancho (el entero)", apilada);
ok(
  tamanoQueEntra("$ 8.900", apilada.precio, escalaDe("story", 1).precioFS) >
    tamanoQueEntra("$ 8.900", anchosDeFila(escalaDe("story", 3), false).precio, escalaDe("story", 3).precioFS),
  "Una sola oferta muestra el precio más grande que tres",
);

const conFoto = anchosDeFila(escalaDe("redes", 3), true);
const sinFoto = anchosDeFila(escalaDe("redes", 3), false);
ok(conFoto.nombre < sinFoto.nombre, "Con foto, al nombre le queda menos ancho", { conFoto: conFoto.nombre, sinFoto: sinFoto.nombre });

const anchoPrecio = sinFoto.precio;
const corto = tamanoQueEntra("$ 8.900", anchoPrecio, 210);
ok(corto * "$ 8.900".length * 0.62 <= anchoPrecio + 1, "Un precio corto se agranda hasta llenar su columna", corto);
const largo = tamanoQueEntra("$ 1.234.567,89", anchoPrecio, 210);
ok(largo < 210, "Un precio de siete cifras se achica para entrar", largo);
ok(largo * "$ 1.234.567,89".length * 0.62 <= anchoPrecio + 1, "…y el achique alcanza para que entre de verdad", largo);
ok(tamanoQueEntra("PROVOLETA ESPECIAL", 100, 92, 26) === 26, "Un nombre larguísimo baja hasta el mínimo, no a cero");
ok(colorDeFlyer("Carnicería") === "#A62C2C", "Carnicería pinta rojo, como en el cartel", colorDeFlyer("Carnicería"));
ok(colorDeFlyer("carniceria") === colorDeFlyer("CARNICERÍA"), "La sección no distingue acentos ni mayúsculas");
ok(colorDeFlyer("Verdulería") === "#1E7B4D", "Verdulería pinta verde");
ok(colorDeFlyer("") === "#1F3864", "Sin sección usa el azul de la marca", colorDeFlyer(""));
ok(colorDeFlyer("Pescadería") === "#1F3864", "Una sección sin color propio cae en el azul de la marca");

console.log("\n=== Descuento (R1.3) ===");
ok(descuentoDe({ precio: 800, precio_anterior: 1000 }) === 20, "20% cuando baja de 1000 a 800");
ok(descuentoDe({ precio: 800, precio_anterior: null }) === null, "Sin precio anterior no hay descuento");
ok(descuentoDe({ precio: 800, precio_anterior: 800 }) === null, "Precio anterior igual no muestra 0% OFF");
ok(descuentoDe({ precio: 800, precio_anterior: 700 }) === null, "Precio anterior menor no inventa un descuento");
ok(descuentoDe({ precio: 999, precio_anterior: 1000 }) === null, "Una diferencia que redondea a 0% no se muestra");

console.log("\n=== Validación (R2.4) ===");
ok(validarFlyer({ productos: [] }) !== null, "Sin productos no se puede armar");
ok(validarFlyer({ productos: Array.from({ length: 7 }, (_, i) => prod(`p${i}`, 100)) }) !== null, "Más de 6 productos se rechaza");
ok(validarFlyer({ productos: [prod("Asado", 8900)] }) === null, "Un producto bien cargado pasa");
ok(validarFlyer({ productos: [prod("  ", 100)] }) !== null, "Un producto sin nombre se rechaza");
ok(validarFlyer({ productos: [prod("Asado", null)] }) !== null, "Un producto sin precio se rechaza");
ok(validarFlyer({ productos: [prod("Asado", 0)] }) !== null, "Un producto con precio 0 se rechaza");
const alReves = validarFlyer({ productos: [prod("Asado", 8900, { precio_anterior: 5000 })] });
ok(alReves !== null && alReves.includes("Asado"), "Un precio anterior menor al de oferta se rechaza y dice cuál", alReves);
ok(validarFlyer({ productos: Array.from({ length: MAX_PRODUCTOS }, (_, i) => prod(`p${i}`, 100)) }) === null, "Justo 6 productos entra");

console.log("\n=== Nombre del archivo (R3.5) ===");
ok(nombreArchivo("redes", "2026-09-19") === "flyer-redes-2026-09-19.png", "Nombre para redes", nombreArchivo("redes", "2026-09-19"));
ok(nombreArchivo("story", "2026-09-19") === "flyer-story-2026-09-19.png", "Nombre para estado/TV");

console.log(`\n${fallos === 0 ? "Todo OK." : `${fallos} check(s) fallaron.`}`);
process.exit(fallos === 0 ? 0 : 1);
