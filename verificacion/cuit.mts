/*
 * Verificación de la validación de CUIT (src/lib/bcra/cuit.ts).
 * Uso: npm run verificar:cuit  (no necesita la app corriendo ni internet)
 *
 * Los CUIT válidos usados como referencia son de empresas públicas y organismos, así que
 * son datos públicos: sirven para comprobar el dígito verificador con casos reales.
 */
import {
  validarCuit,
  digitoVerificador,
  formatearCuit,
  normalizarCuit,
  tipoDeCuit,
} from "../src/lib/bcra/cuit.ts";

let fallos = 0;
function ok(cond: boolean, desc: string, detalle = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${desc}${detalle ? `  → ${detalle}` : ""}`);
  if (!cond) fallos++;
}

console.log("=== CUIT válidos (empresas y organismos, dato público) ===");
const VALIDOS = [
  ["30546689979", "YPF S.A."],
  ["30-54668997-9", "YPF con guiones"],
  ["30 54668997 9", "YPF con espacios"],
  ["33693450239", "AFIP"],
  ["30500010912", "Banco de la Nación Argentina"],
];
for (const [entrada, quien] of VALIDOS) {
  const r = validarCuit(entrada);
  ok(r.valido === true, `${entrada} (${quien}) es válido`, r.valido ? "" : r.motivo);
}

console.log("\n=== CUIT inválidos ===");
const INVALIDOS = [
  ["", "vacío"],
  ["123", "muy corto"],
  ["305466899791", "12 dígitos"],
  ["30546689978", "último dígito cambiado"],
  ["30546689970", "verificador en cero"],
  ["abcdefghijk", "letras"],
];
for (const [entrada, caso] of INVALIDOS) {
  const r = validarCuit(entrada);
  ok(r.valido === false, `"${entrada}" (${caso}) se rechaza`, r.valido ? "lo aceptó" : r.motivo);
}

console.log("\n=== El motivo del rechazo es específico ===");
const corto = validarCuit("123");
ok(!corto.valido && /11 dígitos/.test(corto.motivo), "Avisa cuántos dígitos faltan",
  corto.valido ? "" : corto.motivo);
const malDigito = validarCuit("30546689978");
ok(!malDigito.valido && /último dígito/.test(malDigito.motivo),
  "Avisa que el verificador no coincide", malDigito.valido ? "" : malDigito.motivo);

console.log("\n=== Dígito verificador calculado ===");
ok(digitoVerificador("3054668997") === 9, "YPF: los primeros 10 dígitos dan verificador 9",
  String(digitoVerificador("3054668997")));
ok(digitoVerificador("3369345023") === 9, "AFIP: verificador 9",
  String(digitoVerificador("3369345023")));
ok(digitoVerificador("123") === null, "Con menos de 10 dígitos no calcula nada");

console.log("\n=== Formato y tipo ===");
ok(formatearCuit("30546689979") === "30-54668997-9", "Formatea con guiones",
  formatearCuit("30546689979"));
ok(formatearCuit("123") === "123", "Si no son 11 dígitos, lo deja como está");
ok(normalizarCuit("30-54668997-9") === "30546689979", "Normaliza quitando separadores");
ok(tipoDeCuit("30546689979") === "empresa", "30 → empresa");
ok(tipoDeCuit("20123456789") === "persona", "20 → persona");
ok(tipoDeCuit("27123456780") === "persona", "27 → persona");

// Todo CUIT que la función marca como válido debe reconstruir su propio verificador.
console.log("\n=== Coherencia interna sobre 3000 números generados ===");
let generados = 0;
let coherentes = 0;
for (let n = 0; n < 3000; n++) {
  const base = `20${String(10000000 + n).padStart(8, "0")}`;
  const dv = digitoVerificador(base);
  if (dv === null) continue;
  generados++;
  const r = validarCuit(base + String(dv));
  if (r.valido) coherentes++;
}
ok(generados > 2500 && coherentes === generados,
  "Todo CUIT armado con su verificador calculado se valida",
  `${coherentes}/${generados} coherentes`);

console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} FALLOS`}`);
process.exit(fallos === 0 ? 0 : 1);
