/*
 * Verifica la elección automática del encuadre de los videos
 * (SPEC-cartel-encuadre-auto.md, punto 10).
 *
 * Uso: npm run verificar:cartel-encuadre-calculos
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

type Medidas = { ancho?: number | null; alto?: number | null };
type Sugerido = { encuadre: string; recorte: number } | null;
const v = cargar("src/lib/cartel/video.ts", { "./types": {} }) as {
  FORMA_PARADA: number;
  FORMA_ACOSTADA: number;
  recorte: (av: number, hv: number, ap: number, hp: number) => number;
  formaDeTeles: (r: (number | null | undefined)[]) => number;
  encuadreSugerido: (c: Medidas[], forma: number) => Sugerido;
  textoEncuadreSugerido: (s: { encuadre: string; recorte: number }) => string;
  encuadreEnTele: (e: string, r: number) => string;
};

let fallos = 0;
function igual(obtenido: unknown, esperado: unknown, desc: string) {
  const bien = JSON.stringify(obtenido) === JSON.stringify(esperado);
  console.log(`${bien ? "PASS" : "FAIL"}  ${desc}${bien ? "" : `  → dio ${JSON.stringify(obtenido)}, se esperaba ${JSON.stringify(esperado)}`}`);
  if (!bien) fallos++;
}
const pct = (x: number) => Math.round(x * 100);
const enc = (s: Sugerido) => s && s.encuadre;

// ---- Recorte --------------------------------------------------------------
igual(pct(v.recorte(1080, 2340, 1080, 1920)), 18, "celular parado en tele parada: recorta 18 %");
igual(pct(v.recorte(886, 1920, 1080, 1920)), 18, "el caso de Carnicería 1 (886 de 1080): 18 %");
igual(pct(v.recorte(1080, 1920, 1080, 1920)), 0, "misma forma: no recorta");
igual(pct(v.recorte(1920, 1080, 1080, 1920)), 68, "video acostado en tele parada: 68 %");
igual(pct(v.recorte(1080, 2340, 1920, 1080)), 74, "celular parado en tele acostada: 74 %");
igual(pct(v.recorte(1080, 1080, 1080, 1920)), 44, "video cuadrado en tele parada: 44 %");
igual(v.recorte(0, 1920, 1080, 1920), 0, "medidas inválidas: 0");

// ---- Forma de las teles (punto 2) ----------------------------------------
igual(v.formaDeTeles([]), v.FORMA_PARADA, "sin teles conocidas: parada");
igual(v.formaDeTeles([270, 270, 270]), v.FORMA_PARADA, "Carnicería 1-3 (giro 270): parada");
igual(v.formaDeTeles([270, 0]), v.FORMA_PARADA, "mezcla parada + acostada: parada");
igual(v.formaDeTeles([90]), v.FORMA_PARADA, "giro 90 también es parada");
igual(v.formaDeTeles([0, undefined, null]), v.FORMA_ACOSTADA, "solo acostadas (Pasillo, Acceso): acostada");

// ---- Elección (punto 1) --------------------------------------------------
igual(enc(v.encuadreSugerido([{ ancho: 1080, alto: 2340 }], v.FORMA_PARADA)), "llenar", "celular parado → llenar");
igual(enc(v.encuadreSugerido([{ ancho: 1080, alto: 1920 }], v.FORMA_PARADA)), "llenar", "justo 9:16 → llenar");
igual(enc(v.encuadreSugerido([{ ancho: 1920, alto: 1080 }], v.FORMA_PARADA)), "entero", "acostado en tele parada → entero");
igual(enc(v.encuadreSugerido([{ ancho: 1920, alto: 1080 }], v.FORMA_ACOSTADA)), "llenar", "acostado en tele acostada → llenar");
igual(enc(v.encuadreSugerido([{ ancho: 1080, alto: 1440 }], v.FORMA_PARADA)), "llenar", "3:4 en tele parada (25 % justo) → llenar");
igual(enc(v.encuadreSugerido([{ ancho: 1080, alto: 1400 }], v.FORMA_PARADA)), "entero", "un poco más ancho que 3:4 (27 %) → entero");
igual(enc(v.encuadreSugerido([{ ancho: 1080, alto: 1080 }], v.FORMA_PARADA)), "entero", "cuadrado → entero");
igual(
  enc(v.encuadreSugerido([{ ancho: 1080, alto: 2340 }, { ancho: 1920, alto: 1080 }], v.FORMA_PARADA)),
  "entero",
  "dos videos, uno acostado: manda el peor → entero",
);
igual(
  pct((v.encuadreSugerido([{ ancho: 1080, alto: 2340 }, { ancho: 1080, alto: 1920 }], v.FORMA_PARADA) as { recorte: number }).recorte),
  18,
  "con varios videos informa el peor recorte",
);
igual(
  enc(v.encuadreSugerido([{ ancho: null, alto: null }, { ancho: 1080, alto: 2340 }], v.FORMA_PARADA)),
  "llenar",
  "un video sin medidas no cuenta (punto 7)",
);
igual(v.encuadreSugerido([{}, { ancho: 0, alto: 0 }], v.FORMA_PARADA), null, "ninguno con medidas: no se elige nada");
igual(v.encuadreSugerido([], v.FORMA_PARADA), null, "sin videos: no se elige nada");

// ---- Texto (punto 5) -----------------------------------------------------
igual(
  v.textoEncuadreSugerido({ encuadre: "llenar", recorte: 0.18 }),
  "Elegido solo: el video tiene casi la forma de la tele, recorta 18 %.",
  "texto al llenar",
);
igual(
  v.textoEncuadreSugerido({ encuadre: "entero", recorte: 0.68 }),
  "Elegido solo: la forma del video es muy distinta a la de la tele (recortaría 68 %).",
  "texto al dejar entero",
);
igual(
  v.textoEncuadreSugerido({ encuadre: "llenar", recorte: 0 }),
  "Elegido solo: el video tiene la misma forma que la tele, no recorta nada.",
  "texto sin recorte",
);

// ---- En la tele (punto 8) ------------------------------------------------
igual(v.encuadreEnTele("llenar", v.recorte(1080, 2340, 1080, 1920)), "llenar", "tele parada con celular: sigue llenando");
igual(v.encuadreEnTele("llenar", v.recorte(1080, 2340, 1920, 1080)), "entero", "Pasillo (acostada) con celular: se ve entero");
igual(v.encuadreEnTele("llenar", v.recorte(1080, 1080, 1080, 1920)), "llenar", "cuadrado elegido a mano (44 %): se respeta");
igual(v.encuadreEnTele("llenar", 0.5), "llenar", "50 % justo: se respeta");
igual(v.encuadreEnTele("entero", 0.9), "entero", "entero queda entero");

console.log(fallos === 0 ? "\nTodo bien." : `\n${fallos} fallo(s).`);
process.exit(fallos === 0 ? 0 : 1);
