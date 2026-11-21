// Pruebas de src/lib/tienda/envio.ts: horario de atención y costo de envío
// (SPEC-tienda-envio-horarios.md, req. 18). Correr: npm run verificar:tienda-envio
import assert from "node:assert/strict";
import {
  ahoraEnArgentina,
  calcularEnvio,
  estadoHorario,
  horarioConfigurado,
  resumenHorario,
  textoEnvio,
  textoProxima,
  validarHorario,
  type Horario,
} from "../src/lib/tienda/envio.ts";

let n = 0;
function caso(nombre: string, fn: () => void) {
  fn();
  n++;
  console.log(`ok  ${nombre}`);
}

// Fechas en hora argentina escritas como UTC−3 explícito: no dependen de la zona de la compu.
const ar = (iso: string) => new Date(`${iso}-03:00`);
// 2026-11-23 es lunes.
const LUN = "2026-11-23";
const SAB = "2026-11-28";
const DOM = "2026-11-29";

const SUPER: Horario = {
  "1": [["8:00", "13:00"], ["17:00", "21:00"]],
  "2": [["8:00", "13:00"], ["17:00", "21:00"]],
  "3": [["8:00", "13:00"], ["17:00", "21:00"]],
  "4": [["8:00", "13:00"], ["17:00", "21:00"]],
  "5": [["8:00", "13:00"], ["17:00", "21:00"]],
  "6": [["8:00", "13:00"], ["17:00", "21:00"]],
  "0": [["9:00", "13:00"]],
};

// ---------------------------------------------------------------- hora argentina
caso("La hora se toma en Argentina (UTC−3), no en UTC", () => {
  // 23:30 del lunes en Argentina = 02:30 UTC del martes.
  const f = ar(`${LUN}T23:30:00`);
  assert.equal(f.getUTCDay(), 2);
  assert.deepEqual(ahoraEnArgentina(f), { dia: 1, minuto: 23 * 60 + 30 });
});

// ---------------------------------------------------------------- abierto / cerrado
caso("Abierto dentro de la franja de la mañana y de la tarde", () => {
  assert.deepEqual(estadoHorario(SUPER, ar(`${LUN}T08:00:00`)), { configurado: true, abierto: true });
  assert.deepEqual(estadoHorario(SUPER, ar(`${LUN}T20:59:00`)), { configurado: true, abierto: true });
});

caso("Al mediodía (entre franjas) está cerrado y abre hoy a las 17:00", () => {
  const e = estadoHorario(SUPER, ar(`${LUN}T14:00:00`));
  assert.ok(e.configurado && !e.abierto);
  if (e.configurado && !e.abierto) assert.equal(textoProxima(e.proxima), "hoy a las 17:00");
});

caso("A la hora de cierre ya está cerrado; de noche abre mañana a las 8:00", () => {
  const e = estadoHorario(SUPER, ar(`${LUN}T21:00:00`));
  assert.ok(e.configurado && !e.abierto);
  if (e.configurado && !e.abierto) assert.equal(textoProxima(e.proxima), "mañana a las 8:00");
});

caso("De madrugada abre hoy a las 8:00", () => {
  const e = estadoHorario(SUPER, ar(`${LUN}T03:00:00`));
  if (!(e.configurado && !e.abierto)) assert.fail("tendría que estar cerrado");
  assert.equal(textoProxima(e.proxima), "hoy a las 8:00");
});

caso("Sábado a la noche abre mañana (domingo) a las 9:00", () => {
  const e = estadoHorario(SUPER, ar(`${SAB}T22:00:00`));
  if (!(e.configurado && !e.abierto)) assert.fail("tendría que estar cerrado");
  assert.equal(textoProxima(e.proxima), "mañana a las 9:00");
});

caso("Con días sin franjas busca el próximo día abierto: 'el lunes a las 8:00'", () => {
  const sinFinde: Horario = { "1": [["8:00", "13:00"]], "5": [["8:00", "13:00"]] };
  const e = estadoHorario(sinFinde, ar(`${SAB}T10:00:00`));
  if (!(e.configurado && !e.abierto)) assert.fail("tendría que estar cerrado");
  assert.equal(textoProxima(e.proxima), "el lunes a las 8:00");
  assert.equal(e.proxima.enDias, 2);
});

caso("Un solo día abierto a la semana: después del cierre, vuelve a abrir en 7 días", () => {
  const e = estadoHorario({ "1": [["8:00", "9:00"]] }, ar(`${LUN}T10:00:00`));
  if (!(e.configurado && !e.abierto)) assert.fail("tendría que estar cerrado");
  assert.equal(e.proxima.enDias, 7);
  assert.equal(textoProxima(e.proxima), "el lunes a las 8:00");
});

caso("Sin horario cargado no hay avisos (ni con días vacíos o franjas inválidas)", () => {
  assert.deepEqual(estadoHorario(null, ar(`${DOM}T03:00:00`)), { configurado: false });
  assert.deepEqual(estadoHorario({}, ar(`${DOM}T03:00:00`)), { configurado: false });
  assert.equal(horarioConfigurado({ "1": [], "2": [["13:00", "8:00"]] }), false);
});

// ---------------------------------------------------------------- resumen del pie
caso("El resumen agrupa días iguales seguidos", () => {
  assert.equal(resumenHorario(SUPER), "Lun a Sáb 8:00–13:00 y 17:00–21:00 · Dom 9:00–13:00");
  assert.equal(
    resumenHorario({ "1": [["8:00", "13:00"]], "2": [["8:00", "13:00"]], "4": [["08:30", "12:00"]] }),
    "Lun a Mar 8:00–13:00 · Mié cerrado · Jue 8:30–12:00 · Vie a Dom cerrado",
  );
  assert.equal(resumenHorario(null), null);
});

// ---------------------------------------------------------------- validar lo cargado
caso("Validar: normaliza las horas, ordena franjas y descarta las vacías", () => {
  const r = validarHorario({ "1": [["17:00", "21:00"], ["08:00", "13:00"]], "2": [["", ""]] });
  assert.deepEqual(r, { ok: true, horario: { "1": [["8:00", "13:00"], ["17:00", "21:00"]] } });
});

caso("Validar: rechaza horas mal escritas, cierre antes de apertura y franjas que se pisan", () => {
  const mal = validarHorario({ "1": [["8", "13:00"]] });
  assert.ok(!mal.ok && /8:00 o 17:30/.test(mal.error) && /lunes/.test(mal.error));
  const alReves = validarHorario({ "3": [["13:00", "8:00"]] });
  assert.ok(!alReves.ok && /después/.test(alReves.error) && /miércoles/.test(alReves.error));
  const pisan = validarHorario({ "5": [["8:00", "14:00"], ["13:00", "21:00"]] });
  assert.ok(!pisan.ok && /se pisan/.test(pisan.error));
  const tres = validarHorario({ "6": [["8:00", "9:00"], ["10:00", "11:00"], ["12:00", "13:00"]] });
  assert.ok(!tres.ok && /más de dos/.test(tres.error));
  const media = validarHorario({ "1": [["8:00", ""]] });
  assert.ok(!media.ok);
});

// ---------------------------------------------------------------- envío
const CFG = { costo_envio_centavos: 150000, envio_gratis_desde_centavos: 3000000, minimo_envio_centavos: 1000000 };

caso("Envío con costo: lo cobra y dice cuánto falta para el gratis", () => {
  const c = calcularEnvio(CFG, 2000000);
  assert.deepEqual(c, { aConfirmar: false, costo: 150000, gratis: false, faltaGratis: 1000000, faltaMinimo: 0 });
  assert.equal(textoEnvio(c).replace(/ /g, " "), "$ 1.500");
});

caso("Llegando justo al monto, el envío es gratis", () => {
  const c = calcularEnvio(CFG, 3000000);
  assert.equal(c.costo, 0);
  assert.equal(c.gratis, true);
  assert.equal(c.faltaGratis, 0);
  assert.equal(textoEnvio(c), "gratis");
});

caso("Bajo el mínimo dice cuánto falta", () => {
  assert.equal(calcularEnvio(CFG, 400000).faltaMinimo, 600000);
  assert.equal(calcularEnvio(CFG, 1000000).faltaMinimo, 0);
});

caso("Sin costo cargado el envío queda 'a confirmar' (como en la etapa 1)", () => {
  const c = calcularEnvio({ costo_envio_centavos: null, envio_gratis_desde_centavos: null, minimo_envio_centavos: null }, 500000);
  assert.deepEqual(c, { aConfirmar: true, costo: 0, gratis: false, faltaGratis: 0, faltaMinimo: 0 });
  assert.equal(textoEnvio(c), "a confirmar");
});

caso("Costo sin envío gratis configurado: nunca es gratis ni avisa cuánto falta", () => {
  const c = calcularEnvio({ ...CFG, envio_gratis_desde_centavos: 0 }, 99_000_000);
  assert.equal(c.costo, 150000);
  assert.equal(c.faltaGratis, 0);
});

console.log(`\n${n} casos, todos bien`);
