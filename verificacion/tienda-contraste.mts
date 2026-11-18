// Contraste WCAG de los tokens de la tienda (replica/design/tokens.json).
// Reemplaza a contrast.py de replica-design porque en esta máquina no hay Python.
// normal: 4.5:1 · large (24px o 18.66px negrita): 3:1 · ui (bordes, foco): 3:1
// Sale con código 1 si algún par no llega.
import { readFileSync } from "node:fs";

const ruta = process.argv[2] ?? "replica/design/tokens.json";
const tokens = JSON.parse(readFileSync(ruta, "utf8"));
const colores: Record<string, string> = tokens.color;
const minimo = { normal: 4.5, large: 3, ui: 3 } as const;

function lum(hex: string): number {
  const h = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
  const c = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  return 0.2126 * c(r) + 0.7152 * c(g) + 0.0722 * c(b);
}
export function razon(a: string, b: string): number {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
  return (x + 0.05) / (y + 0.05);
}

let fallas = 0;
for (const [fg, bg, tipo = "normal"] of tokens.pairs as [string, string, (keyof typeof minimo)?][]) {
  if (!colores[fg] || !colores[bg]) {
    console.log(`FALTA  ${fg} sobre ${bg}: token desconocido`);
    fallas++;
    continue;
  }
  const r = razon(colores[fg], colores[bg]);
  const ok = r >= minimo[tipo];
  if (!ok) fallas++;
  console.log(`${ok ? "OK   " : "FALLA"}  ${r.toFixed(2).padStart(5)}:1  (mín ${minimo[tipo]})  ${fg} sobre ${bg}${tipo !== "normal" ? ` [${tipo}]` : ""}`);
}
console.log(fallas ? `\n${fallas} par(es) no cumplen AA` : `\n${tokens.pairs.length} pares, 0 fallas AA`);
process.exit(fallas ? 1 : 0);
