/*
 * Verifica la lógica de la tele vinculada por código (SPEC-cartel-vincular.md):
 * qué hace con lo que le contesta el servidor, y la clave que se guarda.
 *
 * Uso: npm run verificar:cartel-vincular-calculos
 */
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const ts = require(path.join(process.cwd(), "node_modules", "typescript")) as typeof import("typescript");
const fs = require("node:fs") as typeof import("node:fs");

// Un localStorage en memoria, como el del navegador de la tele.
const almacen = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => almacen.get(k) ?? null,
    setItem: (k: string, v: string) => void almacen.set(k, v),
    removeItem: (k: string) => void almacen.delete(k),
  },
};

function cargar(rutaRelativa: string) {
  const fuente = fs.readFileSync(path.join(process.cwd(), rutaRelativa), "utf8");
  const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const modulo = { exports: {} as Record<string, unknown> };
  new Function("exports", "module", "require", js)(modulo.exports, modulo, () => {
    throw new Error("import no previsto");
  });
  return modulo.exports;
}

type Decision = { tipo: string; slug?: string };
const t = cargar("src/lib/cartel/tele.ts") as {
  decidirVinculo: (slug: string, tieneClave: boolean, estado: Record<string, unknown>) => Decision;
  claveDeLaTele: () => string | null;
  claveDeLaTeleOCrear: () => string;
  pantallaGuardada: () => string | null;
  guardarPantalla: (s: string | null) => void;
};

let fallos = 0;
function ok(cond: boolean, desc: string, detalle: unknown = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${desc}${detalle !== "" ? `  → ${JSON.stringify(detalle)}` : ""}`);
  if (!cond) fallos++;
}

// ---- decidirVinculo ----
let d = t.decidirVinculo("carniceria-1", false, { identificar_seg: 0 });
ok(d.tipo === "seguir", "cargada a mano (sin clave): sigue en su pantalla", d);

d = t.decidirVinculo("carniceria-1", true, { identificar_seg: 0, conocida: true, pantalla: "carniceria-1" });
ok(d.tipo === "seguir", "vinculada a la pantalla que muestra: sigue", d);

d = t.decidirVinculo("carniceria-1", true, { identificar_seg: 0, conocida: true, pantalla: "polleria-2" });
ok(d.tipo === "ir" && d.slug === "polleria-2", "la movieron desde el admin: va a la nueva", d);

d = t.decidirVinculo("carniceria-1", true, { identificar_seg: 0, conocida: false, pantalla: null });
ok(d.tipo === "desvinculada", "la desvincularon (fila borrada): vuelve al código", d);

d = t.decidirVinculo("carniceria-1", true, { identificar_seg: 0, conocida: true, pantalla: null });
ok(d.tipo === "desvinculada", "la pantalla se borró (slug en null): vuelve al código", d);

d = t.decidirVinculo("carniceria-1", true, { identificar_seg: 12 });
ok(d.tipo === "seguir", "respuesta sin 'conocida' (función vieja): no hace nada raro", d);

// ---- clave y pantalla guardadas ----
ok(t.claveDeLaTele() === null, "una tele nueva no tiene clave");
const clave = t.claveDeLaTeleOCrear();
ok(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(clave), "la clave creada es un UUID v4", clave);
ok(t.claveDeLaTeleOCrear() === clave, "la segunda vez devuelve la misma clave");
const otras = new Set(Array.from({ length: 200 }, () => {
  almacen.clear();
  return t.claveDeLaTeleOCrear();
}));
ok(otras.size === 200, "200 teles distintas sacan 200 claves distintas", otras.size);

almacen.set("cartel_tv_clave", "no-es-un-uuid");
ok(t.claveDeLaTele() === null, "una clave dañada se ignora");

t.guardarPantalla("polleria-2");
ok(t.pantallaGuardada() === "polleria-2", "guarda y lee la pantalla");
almacen.set("cartel_tv_pantalla", "../admin");
ok(t.pantallaGuardada() === null, "una pantalla guardada con caracteres raros se ignora");
t.guardarPantalla(null);
ok(t.pantallaGuardada() === null, "guardar null la borra");

// Sin localStorage (modo privado): no explota.
(globalThis as unknown as { window: unknown }).window = {
  get localStorage(): never {
    throw new Error("SecurityError");
  },
};
let exploto = false;
try {
  t.claveDeLaTeleOCrear();
  t.guardarPantalla("x");
  t.pantallaGuardada();
} catch {
  exploto = true;
}
ok(!exploto, "sin localStorage la tele sigue andando");

console.log(fallos ? `\n${fallos} FALLO(S)` : "\nTodo OK");
process.exit(fallos ? 1 : 0);
