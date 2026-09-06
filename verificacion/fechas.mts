/*
 * Verifica que la app tome "hoy" del calendario del usuario y no del reloj UTC.
 *
 * El bug: `new Date().toISOString().slice(0, 10)` convierte a UTC antes de cortar la
 * fecha. En Argentina (UTC-3) eso adelanta un día a partir de las 21:00, así que un pago
 * cargado a las 21:30 del 5 se guardaba con fecha 6. Justo el horario en que se cierra la
 * caja y se cargan los movimientos.
 *
 * Para probarlo se fija el reloj en momentos concretos con un Date falso, incluida la
 * franja peligrosa de 21:00 a 23:59.
 *
 * Uso: npm run verificar:fechas
 */
import { createRequire } from "node:module";
import path from "node:path";

// La zona se fija acá y no se hereda de la máquina: si el proceso corriera en UTC, las
// 21:00 de Buenos Aires y la medianoche UTC serían el mismo instante y el test pasaría
// incluso con el bug puesto. Tiene que ir antes del primer uso de Date.
process.env.TZ = "America/Argentina/Buenos_Aires";

const require = createRequire(import.meta.url);

/* Se compila el módulo con el tsconfig del proyecto para no depender de un runner. */
const ts = require(path.join(process.cwd(), "node_modules", "typescript")) as typeof import("typescript");
const fs = require("node:fs") as typeof import("node:fs");

const fuente = fs.readFileSync(path.join(process.cwd(), "src", "lib", "fechas.ts"), "utf8");
const js = ts.transpileModule(fuente, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const modulo: { exports: { hoyISO: () => string; mesActualISO: () => string } } = { exports: {} as never };
new Function("exports", "module", js)(modulo.exports, modulo);
const { hoyISO, mesActualISO } = modulo.exports;

let fallos = 0;
function ok(cond: boolean, desc: string, detalle: string | number = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${desc}${detalle !== "" ? `  → ${detalle}` : ""}`);
  if (!cond) fallos++;
}

const DateReal = Date;

/** Congela el reloj en un instante dado, expresado como hora local de Buenos Aires. */
function conRelojEn(iso: string, fn: () => void) {
  // El offset se arma a mano para que el test dé lo mismo corra donde corra.
  const fijo = new DateReal(`${iso}-03:00`);
  class DateFalso extends DateReal {
    constructor(...args: unknown[]) {
      // @ts-expect-error — se reenvían los argumentos del constructor original.
      if (args.length) super(...args);
      else super(fijo.getTime());
    }
    static now() {
      return fijo.getTime();
    }
  }
  // @ts-expect-error — reemplazo temporal del global.
  globalThis.Date = DateFalso;
  try {
    fn();
  } finally {
    globalThis.Date = DateReal;
  }
}

// Si el TZ no tomó efecto, el test no sirve: mejor gritarlo que dar un verde falso.
const offsetActual = new DateReal("2026-09-05T12:00:00Z").getTimezoneOffset();
console.log(`\n=== Fecha local vs UTC ===  zona horaria: ${process.env.TZ} (offset ${offsetActual} min)\n`);
if (offsetActual !== 180) {
  console.error(`El proceso no quedó en UTC-3 (offset ${offsetActual}). Sin eso el test daría un verde falso.`);
  process.exit(2);
}

// Mediodía: UTC y local coinciden en el día, así que esto pasaría incluso con el bug.
conRelojEn("2026-09-05T12:00:00", () => {
  ok(hoyISO() === "2026-09-05", "Al mediodía del 5 devuelve el 5", hoyISO());
});

// 21:00 en Argentina ya es medianoche en UTC: acá es donde el bug se veía.
conRelojEn("2026-09-05T21:00:00", () => {
  ok(hoyISO() === "2026-09-05", "A las 21:00 del 5 sigue siendo el 5, no el 6", hoyISO());
});

conRelojEn("2026-09-05T23:59:00", () => {
  ok(hoyISO() === "2026-09-05", "A las 23:59 del 5 sigue siendo el 5", hoyISO());
});

// Y el día sí tiene que cambiar cuando cambia de verdad.
conRelojEn("2026-09-06T00:01:00", () => {
  ok(hoyISO() === "2026-09-06", "A las 00:01 del 6 ya es el 6", hoyISO());
});

// Último día del mes de noche: con el bug, el resumen saltaba de mes.
conRelojEn("2026-09-30T22:30:00", () => {
  ok(mesActualISO() === "2026-09", "El 30 a las 22:30 el mes sigue siendo septiembre", mesActualISO());
});

// Y el 31 de diciembre de noche saltaba de año.
conRelojEn("2026-12-31T22:30:00", () => {
  ok(hoyISO() === "2026-12-31", "El 31/12 a las 22:30 sigue siendo 2026", hoyISO());
});

// Formato: siempre YYYY-MM-DD con ceros a la izquierda, que es lo que espera <input type="date">.
conRelojEn("2026-01-07T10:00:00", () => {
  ok(hoyISO() === "2026-01-07", "Mes y día de un dígito van con cero adelante", hoyISO());
});

console.log(`\n${fallos === 0 ? "Todo OK" : `${fallos} check(s) fallaron`}\n`);
process.exit(fallos === 0 ? 0 : 1);
