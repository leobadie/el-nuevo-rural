/*
 * Verificación del control de límite de consultas al BCRA (src/lib/bcra/api.ts).
 * Uso: npm run verificar:limite  (no necesita la app corriendo ni internet: fetch es un doble)
 *
 * Comportamiento real medido contra la API del BCRA el 30/07/2026:
 *   - la consulta 11 al mismo endpoint dentro del minuto devuelve 429;
 *   - el cupo es por endpoint: 10 consultas a Deudas/{cuitA} dejan sin cupo a Deudas/{cuitB},
 *     pero /cheques/v1.0/entidades sigue respondiendo 200;
 *   - el 429 viene sin header Access-Control-Allow-Origin, así que en el navegador el fetch
 *     falla igual que si se cayera internet;
 *   - reintentando cada 5 s siguió bloqueado más de 120 s; con 70 s de silencio se liberó.
 * De ahí que la app cuente sus propias consultas y deje de llamar al llegar al límite.
 */
import {
  consultarDeudas,
  consultarChequesRechazados,
  consultarEntidades,
  esperaSugerida,
} from "../src/lib/bcra/api.ts";

let fallos = 0;
function ok(cond: boolean, desc: string, detalle = "") {
  console.log(`${cond ? "PASS" : "FAIL"}  ${desc}${detalle ? `  → ${detalle}` : ""}`);
  if (!cond) fallos++;
}

/** Doble de fetch: cuenta las llamadas y responde lo que se le pida. */
let llamadasReales: string[] = [];
function instalarFetch(responder: (url: string) => Response | Promise<Response>) {
  llamadasReales = [];
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    llamadasReales.push(url);
    return responder(url);
  }) as typeof fetch;
}

const okJson = () =>
  new Response(JSON.stringify({ results: { denominacion: "X", periodos: [] } }), { status: 200 });

const CUIT_A = "30546689979";
const CUIT_B = "33693450239";

console.log("=== Al llegar al límite deja de llamar a la API ===");
{
  instalarFetch(okJson);
  for (let i = 0; i < 10; i++) await consultarDeudas(CUIT_A);
  ok(llamadasReales.length === 10, "Las primeras 10 consultas salen", `${llamadasReales.length} llamadas`);

  const r = await consultarDeudas(CUIT_A);
  ok(llamadasReales.length === 10, "La consulta 11 NO sale a la red", `${llamadasReales.length} llamadas`);
  ok(r.estado === "error", "La consulta 11 devuelve error", r.estado);
  const msg = r.estado === "error" ? r.mensaje : "";
  ok(/10 consultas por minuto/.test(msg), "El mensaje nombra el límite real", msg.slice(0, 60));
  ok(!/conexión a internet/.test(msg), "NO culpa a la conexión del usuario");
  ok(/si insistís antes/.test(msg) || /esperá un minuto/i.test(msg),
    "Avisa que reintentar sostiene el bloqueo", msg.slice(-60));
}

console.log("\n=== El cupo es por endpoint, como en la API real ===");
{
  // Sigue agotado el de Deudas por el bloque anterior.
  const otroCuit = await consultarDeudas(CUIT_B);
  ok(otroCuit.estado === "error", "Otro CUIT en el mismo endpoint también queda sin cupo",
    otroCuit.estado);

  const antes = llamadasReales.length;
  const otroEndpoint = await consultarChequesRechazados(CUIT_A);
  ok(llamadasReales.length === antes + 1, "Un endpoint distinto sí sale a la red");
  ok(otroEndpoint.estado === "ok", "Y responde normalmente", otroEndpoint.estado);

  const tercero = await consultarEntidades();
  ok(tercero.estado === "ok", "Y un tercero también", tercero.estado);
}

console.log("\n=== esperaSugerida informa cuánto falta ===");
{
  const faltan = esperaSugerida(`/centraldedeudores/v1.0/Deudas/${CUIT_A}`);
  ok(faltan > 0 && faltan <= 60, "Con el cupo agotado dice cuántos segundos faltan", `${faltan}s`);
  const libre = esperaSugerida("/cheques/v1.0/entidades");
  ok(libre === 0, "Con cupo disponible dice 0", `${libre}s`);
}

console.log("\n=== Un 429 que sí se puede leer se explica igual ===");
{
  // Sale por un endpoint con cupo; el 429 llega como respuesta legible (fuera del navegador).
  instalarFetch(() => new Response("", { status: 429 }));
  const r = await consultarChequesRechazados(CUIT_B);
  const msg = r.estado === "error" ? r.mensaje : "";
  ok(/10 consultas por minuto/.test(msg), "El 429 explícito da el mismo mensaje", msg.slice(0, 50));
}

console.log("\n=== Una caída de red de verdad no se confunde con el límite ===");
{
  instalarFetch(() => {
    throw new TypeError("Failed to fetch");
  });
  const r = await consultarEntidades();
  const msg = r.estado === "error" ? r.mensaje : "";
  ok(/conexión a internet/.test(msg), "Con pocas consultas hechas, culpa a la conexión",
    msg.slice(0, 60));
  ok(!/10 consultas por minuto/.test(msg), "No inventa un límite que no se alcanzó");
}

console.log("\n=== Fallar cerca del límite se atribuye al límite ===");
{
  /* En el navegador el 429 no se puede leer: llega como "Failed to fetch". Si venimos de
     varias consultas seguidas, el límite explica mucho mejor el fallo que un corte de red. */
  let n = 0;
  instalarFetch(() => {
    n++;
    if (n <= 8) return okJson();
    throw new TypeError("Failed to fetch");
  });
  let ultimo = "";
  for (let i = 0; i < 9; i++) {
    const r = await consultarDeudas(CUIT_B);
    if (r.estado === "error") ultimo = r.mensaje;
  }
  ok(/10 consultas por minuto/.test(ultimo),
    "Un fallo opaco tras 8 consultas se atribuye al límite", ultimo.slice(0, 60));
}

console.log(`\n${fallos === 0 ? "TODO OK" : `${fallos} FALLOS`}`);
process.exit(fallos === 0 ? 0 : 1);
