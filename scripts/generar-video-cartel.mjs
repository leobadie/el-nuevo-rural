/*
 * Genera el video de publicidad para los televisores del local a partir del
 * cartel web (/cartel).
 *
 * Por qué existe: el panel de señalización (badie.cdenet.com.ar) no acepta
 * URLs, solo archivos multimedia. Así que en vez de diseñar cada placa a mano
 * en un editor de video, se cargan los precios una sola vez en /cartel/admin y
 * este script arma el archivo para subir.
 *
 * Salidas, en la carpeta de salida:
 *   - placas/placa-01.png …   una imagen por placa, 1080x1920.
 *   - cartel-vertical-1080x1920.mp4   (solo si hay un ffmpeg con H.264)
 *   - cartel-rotado-<N>.mp4           (con --rotar; ver más abajo)
 *
 * Las imágenes sirven por sí solas: el panel permite armar la lista de
 * reproducción con imágenes y darle una duración a cada una. El video es
 * cómodo cuando se prefiere un archivo único.
 *
 * Uso:
 *   1) npm run dev            (en otra terminal)
 *   2) npm run cartel:video
 *
 * Opciones:
 *   --url <url>       de dónde leer el cartel (por defecto http://localhost:3000/cartel)
 *   --salida <dir>    carpeta de salida (por defecto ./cartel-salida)
 *   --rotar <grados>  además del vertical, genera una copia rotada: 90, 180 o 270.
 *                     Se puede repetir. Sirve para los televisores que están
 *                     puestos de costado y cuyo reproductor no rota la imagen.
 *   --fps <n>         cuadros por segundo del video (por defecto 25)
 *
 * Variables de entorno:
 *   NAVEGADOR  ruta a un Chrome/Edge/Chromium
 *   FFMPEG     ruta a un ffmpeg con soporte H.264
 */
import { chromium } from "playwright-core";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const NAVEGADORES = [
  process.env.NAVEGADOR,
  "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
  "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
  "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
].filter(Boolean);

// Candidatos de ffmpeg. Ojo: el ffmpeg que trae Playwright NO sirve, es una
// build recortada que solo encodea VP8 y no tiene H.264 ni muxer mp4.
const FFMPEGS = [
  process.env.FFMPEG,
  "ffmpeg",
  "C:\\Program Files\\ffmpeg\\bin\\ffmpeg.exe",
  "C:\\ffmpeg\\bin\\ffmpeg.exe",
].filter(Boolean);

const ANCHO = 1080;
const ALTO = 1920;

// ---------------------------------------------------------------- argumentos
function leerArgs(argv) {
  const args = { url: "http://localhost:3000/cartel", salida: "cartel-salida", rotar: [], fps: 25 };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--url") args.url = argv[++i];
    else if (a === "--salida") args.salida = argv[++i];
    else if (a === "--fps") args.fps = Number(argv[++i]) || 25;
    else if (a === "--rotar") {
      const g = Number(argv[++i]);
      if (![90, 180, 270].includes(g)) {
        console.error(`--rotar acepta 90, 180 o 270 (recibí "${g}").`);
        process.exit(1);
      }
      args.rotar.push(g);
    }
  }
  return args;
}

// ------------------------------------------------------------------ captura
async function capturarPlacas({ url, dirPlacas }) {
  const executablePath = NAVEGADORES.find((p) => fs.existsSync(p));
  if (!executablePath) {
    console.error("No encontré Chrome ni Edge. Pasá la ruta con la variable NAVEGADOR.");
    process.exit(1);
  }

  const browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({
    viewport: { width: ANCHO, height: ALTO },
    deviceScaleFactor: 1,
  });

  // El servidor de desarrollo dibuja su propio indicador flotante ("N 1 Issue")
  // sobre la página. Queda fuera de nuestro árbol de componentes, así que si no
  // se esconde acá termina grabado en un rincón del video.
  await page.addInitScript(() => {
    const ocultar = () => {
      const style = document.createElement("style");
      style.textContent = "nextjs-portal, #next-logo, [data-nextjs-toast] { display: none !important; }";
      document.head?.appendChild(style);
    };
    if (document.head) ocultar();
    else document.addEventListener("DOMContentLoaded", ocultar, { once: true });
  });

  const placas = [];

  try {
    // Primera pasada: además de la placa 0, nos dice cuántas hay en total.
    await page.goto(`${url}?fijo=0`, { waitUntil: "networkidle", timeout: 30_000 });

    const marco = page.locator(".cartel-marco");
    await marco.waitFor({ state: "visible", timeout: 15_000 });

    const total = Number(await marco.getAttribute("data-total"));
    if (!Number.isFinite(total) || total < 1) {
      throw new Error("No pude leer cuántas placas tiene el cartel.");
    }

    console.log(`Cartel con ${total} placa(s). Capturando en ${ANCHO}x${ALTO}…`);

    for (let i = 0; i < total; i++) {
      if (i > 0) {
        await page.goto(`${url}?fijo=${i}`, { waitUntil: "networkidle", timeout: 30_000 });
        await marco.waitFor({ state: "visible", timeout: 15_000 });
      }

      // Sin esperar a las fuentes, los títulos se capturan con la tipografía de
      // reserva y el video sale con otra letra que la pantalla.
      await page.evaluate(() => document.fonts.ready);
      // Y sin esperar las imágenes, las fotos de producto salen en blanco.
      await page.evaluate(async () => {
        const imgs = [...document.images].filter((img) => !img.complete);
        await Promise.all(
          imgs.map((img) => new Promise((listo) => {
            img.addEventListener("load", listo, { once: true });
            img.addEventListener("error", listo, { once: true });
          })),
        );
      });
      // La placa entra con una animación de 620ms; capturarla antes la deja a
      // medio camino, corrida y semitransparente.
      await page.waitForTimeout(900);

      const duracion = Number(await marco.getAttribute("data-duracion")) || 8000;
      const archivo = path.join(dirPlacas, `placa-${String(i + 1).padStart(2, "0")}.png`);
      await marco.screenshot({ path: archivo });

      placas.push({ archivo, segundos: duracion / 1000 });
      console.log(`  ✓ placa ${i + 1}/${total} (${duracion / 1000}s)`);
    }
  } finally {
    await browser.close();
  }

  return placas;
}

// ------------------------------------------------------------------- ffmpeg
/** Devuelve la ruta de un ffmpeg que sepa encodear H.264, o null. */
function buscarFfmpeg() {
  for (const candidato of FFMPEGS) {
    const r = spawnSync(candidato, ["-hide_banner", "-encoders"], { encoding: "utf8" });
    if (r.status === 0 && r.stdout.includes("libx264")) return candidato;
  }
  return null;
}

function filtroDeRotacion(grados) {
  // transpose=1 gira 90° en sentido horario; 2, antihorario.
  if (grados === 90) return "transpose=1";
  if (grados === 270) return "transpose=2";
  if (grados === 180) return "transpose=1,transpose=1";
  return null;
}

function armarVideo({ ffmpeg, placas, destino, fps, grados }) {
  // El demuxer concat quiere un archivo de lista. La última imagen va repetida
  // sin duración porque, si no, concat descarta el tiempo del último elemento y
  // esa placa aparecería un instante.
  const lista = placas
    .map((p) => `file '${p.archivo.replace(/\\/g, "/")}'\nduration ${p.segundos}`)
    .join("\n");
  const ultimo = placas[placas.length - 1].archivo.replace(/\\/g, "/");
  const listaPath = path.join(path.dirname(destino), "lista-ffmpeg.txt");
  fs.writeFileSync(listaPath, `${lista}\nfile '${ultimo}'\n`, "utf8");

  const filtro = filtroDeRotacion(grados);
  const args = [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", listaPath,
    ...(filtro ? ["-vf", filtro] : []),
    "-r", String(fps),
    "-c:v", "libx264",
    "-preset", "medium",
    "-crf", "20",
    // yuv420p y +faststart: sin esto hay reproductores de TV que muestran negro.
    "-pix_fmt", "yuv420p",
    "-movflags", "+faststart",
    destino,
  ];

  const r = spawnSync(ffmpeg, args, { encoding: "utf8" });
  fs.rmSync(listaPath, { force: true });

  if (r.status !== 0) {
    console.error(`  ✗ ffmpeg falló:\n${(r.stderr || "").split("\n").slice(-12).join("\n")}`);
    return false;
  }
  return true;
}

// --------------------------------------------------------------------- main
const args = leerArgs(process.argv.slice(2));
const dirSalida = path.resolve(args.salida);
const dirPlacas = path.join(dirSalida, "placas");

fs.mkdirSync(dirPlacas, { recursive: true });

const placas = await capturarPlacas({ url: args.url, dirPlacas });
const duracionTotal = placas.reduce((t, p) => t + p.segundos, 0);

console.log(`\nImágenes listas en ${dirPlacas}`);
console.log(`Duración del loop: ${duracionTotal} segundos.`);

const ffmpeg = buscarFfmpeg();

if (!ffmpeg) {
  console.log(
    "\nNo encontré un ffmpeg con H.264, así que no generé el .mp4.\n" +
      "Las imágenes de arriba ya se pueden subir al panel y armar la lista de\n" +
      "reproducción con la duración de cada una.\n" +
      "Para obtener el video, instalá ffmpeg (winget install Gyan.FFmpeg) y volvé\n" +
      "a correr el comando, o pasá la ruta con la variable FFMPEG.",
  );
  process.exit(0);
}

console.log(`\nUsando ffmpeg: ${ffmpeg}`);

const salidas = [{ grados: 0, nombre: `cartel-vertical-${ANCHO}x${ALTO}.mp4` }].concat(
  args.rotar.map((g) => ({ grados: g, nombre: `cartel-rotado-${g}.mp4` })),
);

let fallo = false;
for (const s of salidas) {
  const destino = path.join(dirSalida, s.nombre);
  process.stdout.write(`  · ${s.nombre} … `);
  if (armarVideo({ ffmpeg, placas, destino, fps: args.fps, grados: s.grados })) {
    const mb = (fs.statSync(destino).size / 1024 / 1024).toFixed(1);
    console.log(`ok (${mb} MB)`);
  } else {
    fallo = true;
  }
}

console.log(`\nTodo en ${dirSalida}`);
process.exit(fallo ? 1 : 0);
