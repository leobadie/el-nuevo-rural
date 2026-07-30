/*
 * Verificación de la interpretación de cheques denunciados (src/lib/bcra/denuncias.ts).
 * Uso: npm run verificar:denuncias  (no necesita la app corriendo ni internet)
 *
 * El punto de todo esto: el endpoint del BCRA devuelve las denuncias de ESE NÚMERO en TODAS
 * las cuentas del banco, no las del cheque que se tiene en la mano. Los datos de ejemplo son
 * los que devolvió la API real para el cheque 456 del Banco de la Nación Argentina.
 */
import { evaluarDenuncia, normalizarCuenta } from "../src/lib/bcra/denuncias.ts";
import type { ChequeDenunciado } from "../src/lib/bcra/api.ts";

let fallos = 0;
function ok(cond: boolean, desc: string, detalle = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${desc}${detalle ? `  → ${detalle}` : ""}`);
  if (!cond) fallos++;
}

const BANCO = "BANCO DE LA NACION ARGENTINA";

/** Respuesta real de GET /cheques/v1.0/denunciados/11/456 (recortada a 4 denuncias). */
const CON_DENUNCIAS: ChequeDenunciado = {
  numeroCheque: 456,
  denunciado: true,
  fechaProcesamiento: "2026-07-29",
  denominacionEntidad: BANCO,
  detalles: [
    { sucursal: 89, numeroCuenta: 890036218, causal: "Denunciado por titular" },
    { sucursal: 105, numeroCuenta: 1050020266, causal: "Denunciado por titular" },
    { sucursal: 252, numeroCuenta: 2520086889, causal: "Denunciado por tercero" },
    { sucursal: 635, numeroCuenta: 6350050316, causal: "Denunciado por tercero" },
  ],
};

/** Respuesta real para un número sin denuncias (el 12345678 del mismo banco). */
const SIN_DENUNCIAS: ChequeDenunciado = {
  numeroCheque: 12345678,
  denunciado: false,
  fechaProcesamiento: "2026-07-29",
  denominacionEntidad: BANCO,
  detalles: [],
};

console.log("=== Sin ninguna denuncia de ese número ===");
{
  const v = evaluarDenuncia(SIN_DENUNCIAS, "890036218");
  ok(v.nivel === "limpio", "Da limpio", v.nivel);
  ok(/cheque limpio/i.test(v.titulo), "El título es el veredicto", v.titulo);
  ok(v.total === 0 && v.coincidencias.length === 0, "No hay nada que mostrar");
  ok(v.nota === "", "Sin denuncias de otras cuentas, no hay nota al pie");
}

console.log("\n=== V6.10 — Sin cuenta nunca puede dar limpio ===");
{
  const v = evaluarDenuncia(CON_DENUNCIAS, "");
  ok(v.nivel === "indeterminado", "Llamarla sin cuenta no da un veredicto", v.nivel);
  ok(v.nivel !== "denunciado" && v.nivel !== "limpio" && v.nivel !== "otrasCuentas",
    "Ni rojo ni verde: verde significa que el cruce se hizo");
  ok(/número de cuenta/.test(v.detalle), "Pide el número de cuenta", v.detalle.slice(0, 60));
  ok(v.coincidencias.length === 0, "No afirma ninguna coincidencia");
  const sinNada = evaluarDenuncia(SIN_DENUNCIAS, "");
  ok(sinNada.nivel === "indeterminado",
    "Ni siquiera con un número sin denuncias: no se comparó nada", sinNada.nivel);
}

console.log("\n=== V6.5 — La cuenta coincide con una denuncia ===");
{
  const v = evaluarDenuncia(CON_DENUNCIAS, "890036218");
  ok(v.nivel === "denunciado", "Da denunciado", v.nivel);
  ok(/no lo aceptes/i.test(v.titulo), "El título es inequívoco", v.titulo);
  ok(/Denunciado por titular/.test(v.detalle), "Muestra la causal", v.detalle);
  ok(/N° 456/.test(v.detalle), "Nombra el cheque sobre el que responde (V6.7)");
  ok(v.coincidencias.length === 1, "Muestra solo la denuncia que es este cheque",
    String(v.coincidencias.length));
}

console.log("\n=== V6.5 — La cuenta NO coincide con ninguna ===");
{
  const v = evaluarDenuncia(CON_DENUNCIAS, "1230009999");
  ok(v.nivel === "otrasCuentas", "Da por limpio el cheque consultado", v.nivel);
  ok(/cheque limpio/i.test(v.titulo), "Mismo título que si no hubiera ninguna denuncia", v.titulo);
  ok(/1230009999/.test(v.detalle) && /N° 456/.test(v.detalle),
    "El detalle nombra la cuenta y el cheque cruzados (V6.7)", v.detalle);
  ok(v.coincidencias.length === 0, "V6.6: no lista las denuncias de otras cuentas");
  ok(/4 denuncias de ese número en otras chequeras/.test(v.nota),
    "V6.6: las menciona en una línea al pie", v.nota.slice(0, 60));
}

console.log("\n=== V6.8 — La cuenta se compara por dígitos ===");
{
  ok(normalizarCuenta("89-0036218/4") === "8900362184", "Saca guiones y barras",
    normalizarCuenta("89-0036218/4"));
  ok(normalizarCuenta("") === "", "Vacío queda vacío");
  for (const escrita of ["890036218", "89-0036218", "89 0036218", "890.036.218", "89/0036218"]) {
    const v = evaluarDenuncia(CON_DENUNCIAS, escrita);
    ok(v.nivel === "denunciado", `"${escrita}" coincide igual`, v.nivel);
  }
}

console.log("\n=== V6.9 — Coincidencia parcial (se omitió la sucursal) ===");
{
  const v = evaluarDenuncia(CON_DENUNCIAS, "0036218");
  ok(v.nivel === "posible", "No da por limpio: avisa que podría ser", v.nivel);
  ok(v.nivel !== "otrasCuentas", "Un falso negativo acá sería aceptar un cheque robado");
  ok(v.coincidencias.length === 1 && v.coincidencias[0].numeroCuenta === 890036218,
    "Muestra la cuenta que termina igual, para poder compararla");
  ok(/completa|entero/.test(v.detalle), "Pide comparar el número entero", v.detalle.slice(0, 70));
}

console.log("\n=== Un sufijo corto no puede hacer match con media chequera ===");
{
  const v = evaluarDenuncia(CON_DENUNCIAS, "6218");
  ok(v.nivel === "otrasCuentas", "4 dígitos no alcanzan para dar coincidencia parcial", v.nivel);
  const cinco = evaluarDenuncia(CON_DENUNCIAS, "36218");
  ok(cinco.nivel === "otrasCuentas", "5 dígitos tampoco", cinco.nivel);
  const seis = evaluarDenuncia(CON_DENUNCIAS, "036218");
  ok(seis.nivel === "posible", "6 dígitos sí (es el mínimo elegido)", seis.nivel);
}

console.log("\n=== Los casos que motivaron el arreglo ===");
{
  // Antes: cualquier consulta con denuncias mostraba "DENUNCIADO: no lo aceptes".
  const sinCuenta = evaluarDenuncia(CON_DENUNCIAS, "");
  ok(!/no lo aceptes/i.test(sinCuenta.titulo),
    'El cheque 456 sin cuenta ya no dice "no lo aceptes"', sinCuenta.titulo);
  const otraCuenta = evaluarDenuncia(CON_DENUNCIAS, "4070160834");
  ok(otraCuenta.nivel === "otrasCuentas",
    "Un cheque 456 de otra chequera queda en verde, no rechazado", otraCuenta.nivel);

  // Y después: el veredicto quedaba enterrado bajo las 18 denuncias ajenas.
  ok(otraCuenta.coincidencias.length === 0,
    "El veredicto no viene acompañado de un listado que no es de este cheque");
  ok(otraCuenta.titulo.length < 25 && !/\d/.test(otraCuenta.titulo),
    "El título es corto y binario, no una explicación", `"${otraCuenta.titulo}"`);
}

console.log("\n=== Datos raros no rompen la evaluación ===");
{
  const sinCampos: ChequeDenunciado = {
    ...CON_DENUNCIAS,
    detalles: [{ algoNuevo: "x" }, { numeroCuenta: 890036218 }],
  };
  const v = evaluarDenuncia(sinCampos, "890036218");
  ok(v.nivel === "denunciado", "Ignora las denuncias sin cuenta y usa las que sí la tienen", v.nivel);
  const soloRaros = evaluarDenuncia({ ...CON_DENUNCIAS, detalles: [{ algoNuevo: "x" }] }, "890036218");
  ok(soloRaros.nivel === "otrasCuentas", "Con detalles sin cuenta no inventa coincidencia",
    soloRaros.nivel);
}

console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} FALLOS`}`);
process.exit(fallos === 0 ? 0 : 1);
