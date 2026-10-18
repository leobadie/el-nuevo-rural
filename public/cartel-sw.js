/*
 * Service worker de los televisores (SPEC-cartel-tv-en-vivo.md, puntos 10-13, y
 * SPEC-cartel-videos.md, punto 15).
 *
 * Hace dos cosas:
 *   1. Que el TV arranque aunque se prenda sin internet: guarda la página, las
 *      ofertas y las fotos, y si la red no responde muestra lo último que tenía.
 *   2. Que cada foto o video se baje una sola vez: con 10 televisores, volver a
 *      pedir un video en cada vuelta se come la cuota de datos de Supabase.
 *
 * Reglas:
 *   - Página del TV y lecturas de Supabase (ofertas, asignaciones, pantalla):
 *     primero la red; si falla o tarda más de 8 s, lo guardado. Lo guardado es
 *     solo el respaldo: con internet manda siempre lo nuevo.
 *   - Código de la app (/_next/static), fotos, videos y logo: primero lo
 *     guardado. Esos archivos no cambian nunca (cada subida tiene nombre nuevo).
 *   - Todo lo demás (el latido, cualquier escritura) pasa directo.
 *
 * Vive en la raíz y no en /cartel/tv/ porque esa ruta solo admite slugs; se
 * registra con scope /cartel/tv/ para que no toque el resto del sistema.
 */

const VERSION = "v1";
const PAGINAS = `cartel-paginas-${VERSION}`;
const DATOS = `cartel-datos-${VERSION}`;
const ARCHIVOS = `cartel-archivos-${VERSION}`;
const MIOS = [PAGINAS, DATOS, ARCHIVOS];

/** Topes para no llenar el almacenamiento del TV con versiones viejas. */
const TOPE = { [PAGINAS]: 20, [DATOS]: 40, [ARCHIVOS]: 300 };

/** Si la red no contesta en este tiempo, se usa lo guardado. */
const ESPERA_RED_MS = 8000;

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Cachés de versiones anteriores de este archivo.
      for (const nombre of await caches.keys()) {
        if (nombre.startsWith("cartel-") && !MIOS.includes(nombre)) await caches.delete(nombre);
      }
      // Tomar control de la página ya abierta, sin esperar a que se recargue.
      await self.clients.claim();
    })(),
  );
});

/*
 * La página avisa qué cargó antes de que existiera el service worker (la
 * primera visita): se guarda todo, así ya puede arrancar sin internet la
 * próxima vez que se prenda el TV.
 */
self.addEventListener("message", (event) => {
  const datos = event.data || {};
  if (datos.tipo !== "precargar" || !Array.isArray(datos.urls)) return;
  event.waitUntil(
    Promise.all(
      datos.urls.map(async (url) => {
        try {
          const req = new Request(url, { mode: url.startsWith(self.location.origin) ? "same-origin" : "cors" });
          const tipo = clasificar(req);
          if (!tipo) return;
          const resp = await fetch(req);
          if (resp.ok) await guardar(tipo === "archivo" ? ARCHIVOS : tipo === "pagina" ? PAGINAS : DATOS, claveDe(req), resp);
        } catch (e) {
          // Un archivo que no se pudo guardar se guarda en la próxima pasada.
        }
      }),
    ),
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const tipo = clasificar(req);
  if (tipo === "pagina") event.respondWith(redPrimero(req, PAGINAS));
  else if (tipo === "datos") event.respondWith(redPrimero(req, DATOS));
  else if (tipo === "archivo") event.respondWith(guardadoPrimero(req));
});

/** Qué regla le toca a cada pedido; null = pasa directo. */
function clasificar(req) {
  const url = new URL(req.url);
  const propio = url.origin === self.location.origin;

  if (propio && /^\/cartel\/tv\/[a-z0-9-]+\/?$/.test(url.pathname)) return "pagina";
  if (propio && (url.pathname.startsWith("/_next/static/") || url.pathname === "/logo.jpg" || url.pathname === "/cartel/despierto.webm")) {
    return "archivo";
  }
  if (!propio && url.pathname.startsWith("/storage/v1/object/public/")) return "archivo";
  if (
    !propio &&
    /^\/rest\/v1\/(cartel_placas|cartel_placa_pantalla|cartel_pantallas)$/.test(url.pathname)
  ) {
    return "datos";
  }
  return null;
}

/**
 * Clave de guardado: la URL entera. Las lecturas de Supabase llevan la API key
 * en un header, no en la URL, y la página guarda su ?rotar, que cambia lo que se
 * ve. El modo captura (?fijo) no registra el service worker.
 */
function claveDe(req) {
  return req.url;
}

async function redPrimero(req, cache) {
  const guardado = caches.open(cache).then((c) => c.match(claveDe(req)));
  try {
    const resp = await conEspera(fetch(req), ESPERA_RED_MS);
    // Un 404 o un 500 no pisa lo guardado: con el servidor caído el TV sigue
    // mostrando las últimas ofertas en vez de una página de error.
    if (resp.ok) {
      await guardar(cache, claveDe(req), resp.clone());
      return resp;
    }
    return (await guardado) || resp;
  } catch (e) {
    const g = await guardado;
    if (g) return g;
    throw e;
  }
}

async function guardadoPrimero(req) {
  const c = await caches.open(ARCHIVOS);
  // El video pide de a pedazos (Range): lo guardado es el archivo entero y se
  // corta acá. Así el video tampoco se vuelve a bajar.
  const rango = req.headers.get("range");
  const entero = await c.match(req.url);
  if (entero) return rango ? recortar(entero, rango) : entero;

  if (rango) {
    // Primera vez: se reproduce desde la red mientras en segundo plano se baja
    // entero para guardarlo.
    bajarEntero(req.url);
    return fetch(req);
  }

  // Pedido en modo cors para poder guardarlo: una respuesta "opaca" ocupa
  // varios MB de cuota cada una aunque la foto pese 100 KB.
  const resp = await fetch(new Request(req.url, { mode: "cors", credentials: "omit" })).catch(() => fetch(req));
  if (resp.ok && resp.type !== "opaque") await guardar(ARCHIVOS, req.url, resp.clone());
  return resp;
}

const bajando = new Set();
async function bajarEntero(url) {
  if (bajando.has(url)) return;
  bajando.add(url);
  try {
    const resp = await fetch(new Request(url, { mode: "cors", credentials: "omit" }));
    if (resp.ok && resp.status === 200) await guardar(ARCHIVOS, url, resp);
  } catch (e) {
    // Se reintenta en el próximo pedido.
  } finally {
    bajando.delete(url);
  }
}

/** Respuesta 206 con el pedazo pedido de un archivo guardado entero. */
async function recortar(resp, rango) {
  const datos = await resp.arrayBuffer();
  const total = datos.byteLength;
  const m = /bytes=(\d*)-(\d*)/.exec(rango);
  let desde = m && m[1] !== "" ? Number(m[1]) : 0;
  let hasta = m && m[2] !== "" ? Number(m[2]) : total - 1;
  if (m && m[1] === "" && m[2] !== "") {
    // "bytes=-500": los últimos 500.
    desde = Math.max(total - Number(m[2]), 0);
    hasta = total - 1;
  }
  hasta = Math.min(hasta, total - 1);
  if (desde > hasta || desde >= total) {
    return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
  }
  return new Response(datos.slice(desde, hasta + 1), {
    status: 206,
    headers: {
      "Content-Type": resp.headers.get("Content-Type") || "application/octet-stream",
      "Content-Range": `bytes ${desde}-${hasta}/${total}`,
      "Content-Length": String(hasta - desde + 1),
      "Accept-Ranges": "bytes",
    },
  });
}

async function guardar(cache, clave, resp) {
  const c = await caches.open(cache);
  await c.put(clave, resp);
  // Recorte por antigüedad: Cache API devuelve las claves en orden de alta.
  const claves = await c.keys();
  const sobran = claves.length - (TOPE[cache] || 100);
  for (let i = 0; i < sobran; i++) await c.delete(claves[i]);
}

function conEspera(promesa, ms) {
  return new Promise((ok, mal) => {
    const id = setTimeout(() => mal(new Error("la red no contestó a tiempo")), ms);
    promesa.then(
      (v) => {
        clearTimeout(id);
        ok(v);
      },
      (e) => {
        clearTimeout(id);
        mal(e);
      },
    );
  });
}
