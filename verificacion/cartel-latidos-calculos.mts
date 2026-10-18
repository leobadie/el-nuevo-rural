/*
 * Verifica los cálculos del estado de los televisores (SPEC-cartel-tv-en-vivo.md,
 * puntos 6 y 8): rotación admitida, cuándo un TV se da por caído y cómo se
 * resume el navegador que reporta.
 *
 * Uso: npm run verificar:cartel-latidos-calculos
 */
import { createRequire } from "node:module";
import path from "node:path";

const require = createRequire(import.meta.url);
const ts = require(path.join(process.cwd(), "node_modules", "typescript")) as typeof import("typescript");
const fs = require("node:fs") as typeof import("node:fs");

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

const p = cargar("src/lib/cartel/placas.ts", { "./types": {} }) as {
  rotacionDe: (v: string | undefined | null) => number;
  estadoTv: (visto: string | null | undefined, ahora: number) => string;
  navegadorCorto: (ua: string | null | undefined) => string;
};

let fallos = 0;
function igual(obtenido: unknown, esperado: unknown, desc: string) {
  const bien = obtenido === esperado;
  console.log(`${bien ? "PASS" : "FAIL"}  ${desc}${bien ? "" : `  → dio ${JSON.stringify(obtenido)}, se esperaba ${JSON.stringify(esperado)}`}`);
  if (!bien) fallos++;
}

// ---- Rotación (punto 6) -------------------------------------------------
igual(p.rotacionDe("90"), 90, "?rotar=90 gira 90");
igual(p.rotacionDe("270"), 270, "?rotar=270 gira 270");
igual(p.rotacionDe(undefined), 0, "sin ?rotar no gira");
for (const malo of ["45", "180", "", "abc", "90abc", "-90", "360"]) {
  igual(p.rotacionDe(malo), 0, `?rotar=${JSON.stringify(malo)} se ignora`);
}

// ---- Estado del televisor (punto 8) ------------------------------------
const ahora = Date.parse("2026-10-18T15:00:00Z");
const hace = (min: number) => new Date(ahora - min * 60 * 1000).toISOString();

igual(p.estadoTv(hace(1), ahora), "conectado", "latido de hace 1 minuto: conectado");
igual(p.estadoTv(hace(15), ahora), "conectado", "justo 15 minutos: todavía conectado");
igual(p.estadoTv(hace(16), ahora), "sin-senal", "16 minutos sin latido: sin señal");
igual(p.estadoTv(hace(60 * 24 * 3), ahora), "sin-senal", "tres días sin latido: sin señal");
igual(p.estadoTv(null, ahora), "nunca", "sin fila: nunca se conectó");
igual(p.estadoTv(undefined, ahora), "nunca", "sin latido: nunca se conectó");
igual(p.estadoTv("cualquier cosa", ahora), "nunca", "fecha ilegible: nunca, no un falso 'conectado'");

// ---- Navegador (punto 8) -----------------------------------------------
igual(
  p.navegadorCorto(
    "Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36 WebAppManager",
  ),
  "webOS · Chrome 87",
  "TV webOS",
);
igual(
  p.navegadorCorto("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36 Edg/141.0.0.0"),
  "Windows · Chrome 141",
  "compu con Edge",
);
igual(
  p.navegadorCorto("Mozilla/5.0 (SMART-TV; LINUX; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) 85.0.4183.93/6.0 TV Safari/537.36"),
  "Tizen",
  "TV Samsung sin versión de Chrome reconocible",
);
igual(p.navegadorCorto(null), "navegador desconocido", "sin User-Agent");
igual(p.navegadorCorto("algo raro"), "navegador desconocido", "User-Agent irreconocible");

console.log(`\n${fallos === 0 ? "OK" : "FALLÓ"}: ${fallos} fallos.`);
process.exit(fallos === 0 ? 0 : 1);
