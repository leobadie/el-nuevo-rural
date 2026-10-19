/*
 * Verifica los cálculos de las placas de video (SPEC-cartel-videos.md, puntos
 * 1-5 y 10): detección del formato, tope de peso, recorte y duración.
 *
 * Uso: npm run verificar:cartel-videos-calculos
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

type Clip = { url: string; desde: number; hasta: number; duracion: number };
const v = cargar("src/lib/cartel/video.ts", { "./types": {} }) as {
  MAX_BYTES_VIDEO: number;
  duracionClips: (c: Clip[] | null | undefined) => number;
  acotarTramo: (c: Clip) => Clip;
  detectarCodec: (b: Uint8Array) => string;
  veredictoVideo: (codec: string, bytes: number) => { puede: boolean; aviso: string | null };
  avisoResolucion: (ancho: number | null, alto: number | null) => string | null;
  nivelH264: (s: string | null) => number | null;
  tamanoParaTele: (ancho: number, alto: number) => { ancho: number; alto: number };
  motivosParaAdaptar: (f: Record<string, unknown>) => { texto: string; grave: boolean }[];
};
const p = cargar("src/lib/cartel/placas.ts", { "./types": {} }) as {
  duracionMs: (placa: Record<string, unknown>) => number;
};

let fallos = 0;
function igual(obtenido: unknown, esperado: unknown, desc: string) {
  const bien = JSON.stringify(obtenido) === JSON.stringify(esperado);
  console.log(`${bien ? "PASS" : "FAIL"}  ${desc}${bien ? "" : `  → dio ${JSON.stringify(obtenido)}, se esperaba ${JSON.stringify(esperado)}`}`);
  if (!bien) fallos++;
}
const bytes = (...partes: string[]) => new Uint8Array(Buffer.concat(partes.map((x) => Buffer.from(x))));

// ---- Formato (punto 2) ---------------------------------------------------
const muestra = fs.readFileSync(path.join(process.cwd(), "verificacion", "muestras", "video-h264.mp4"));
igual(v.detectarCodec(new Uint8Array(muestra)), "h264", "el MP4 de muestra se reconoce como H.264");
const falso = fs.readFileSync(path.join(process.cwd(), "verificacion", "muestras", "video-hevc-falso.mp4"));
igual(v.detectarCodec(new Uint8Array(falso)), "hevc", "un MP4 con marca hvc1 (iPhone) se reconoce como HEVC");
igual(v.detectarCodec(bytes("xxxxhev1yyyy")), "hevc", "hev1 también es HEVC");
igual(v.detectarCodec(bytes("ftyp", "avc1", "hvc1")), "hevc", "si aparece HEVC manda HEVC, aunque haya marca H.264");
igual(v.detectarCodec(bytes("xx", "av01", "yy")), "av1", "AV1");
igual(v.detectarCodec(bytes("\x1aE\xdf\xa3", "V_VP9")), "vp9", "WebM VP9");
igual(v.detectarCodec(bytes("\x1aE\xdf\xa3", "V_VP8")), "vp8", "WebM VP8");
igual(v.detectarCodec(bytes("nada que ver")), "desconocido", "sin marca conocida: desconocido");
igual(v.detectarCodec(bytes("avc")), "desconocido", "una marca cortada al final no cuenta");

const ok = (codec: string, b = 1_000_000) => v.veredictoVideo(codec, b).puede;
igual(ok("h264"), true, "H.264 se sube");
igual(ok("vp9"), true, "VP9 se sube");
igual(ok("hevc"), false, "HEVC no se sube");
igual(/Más compatible/.test(v.veredictoVideo("hevc", 1).aviso ?? ""), true, "y el aviso dice cómo arreglarlo en el iPhone");
igual(ok("av1"), false, "AV1 no se sube");
igual(ok("desconocido"), true, "formato desconocido se sube con aviso");
igual(v.veredictoVideo("desconocido", 1).aviso !== null, true, "…y el aviso existe");
igual(v.veredictoVideo("h264", 1_000_000).aviso, null, "un H.264 liviano no tiene aviso");
igual(/WhatsApp/.test(v.veredictoVideo("hevc", 1).aviso ?? ""), false, "el aviso de HEVC no manda a WhatsApp (achica el video)");

// ---- Resolución (reportado el 19/10/2026: un video de 392x848 se veía pixelado) ----
igual(/392×848/.test(v.avisoResolucion(392, 848) ?? ""), true, "392x848 (pasado por WhatsApp) avisa que se va a ver pixelado");
igual(v.avisoResolucion(848, 392) !== null, true, "…también acostado");
igual(v.avisoResolucion(360, 640) !== null, true, "360x640 avisa");
igual(v.avisoResolucion(720, 1280), null, "720x1280 no avisa");
igual(v.avisoResolucion(1080, 1920), null, "1080x1920 (celular) no avisa");
igual(v.avisoResolucion(3840, 2160), null, "4K no avisa");
igual(v.avisoResolucion(null, null), null, "sin tamaño conocido no avisa");

// ---- Apto para la tele (SPEC-cartel-convertir-video.md) ----
igual(v.nivelH264("avc1.640032"), 5, "avc1.640032 es nivel 5 (el video que dejó en negro a Carnicería 1)");
igual(v.nivelH264("avc1.64002A"), 4.2, "avc1.64002A es nivel 4.2");
igual(v.nivelH264("avc1.4D4028"), 4, "avc1.4D4028 es nivel 4");
igual(v.nivelH264("hvc1.1.6.L93.B0"), null, "un HEVC no tiene nivel H.264");
igual(v.tamanoParaTele(1080, 2336), { ancho: 886, alto: 1920 }, "1080×2336 → 886×1920 (entra parado, sin deformar)");
igual(v.tamanoParaTele(1080, 1920), { ancho: 1080, alto: 1920 }, "1080×1920 queda igual");
igual(v.tamanoParaTele(1920, 1080), { ancho: 1920, alto: 1080 }, "1920×1080 queda igual");
igual(v.tamanoParaTele(3840, 2160), { ancho: 1920, alto: 1080 }, "4K acostado → 1920×1080");
igual(v.tamanoParaTele(2160, 3840), { ancho: 1080, alto: 1920 }, "4K parado → 1080×1920");
igual(v.tamanoParaTele(720, 1280), { ancho: 720, alto: 1280 }, "720×1280 no se agranda");
igual(v.tamanoParaTele(1081, 1921), { ancho: 1080, alto: 1918 }, "los lados quedan pares");
const ficha = (extra: Record<string, unknown>) => ({ codec: "avc", nivel: 4, ancho: 1080, alto: 1920, fps: 30, bitrate: 5e6, esMp4: true, girado: false, ...extra });
igual(v.motivosParaAdaptar(ficha({})), [], "un video de 1080×1920, nivel 4, 30 fps, 5 Mbps se sube tal cual");
const celular = v.motivosParaAdaptar(ficha({ nivel: 5, ancho: 1080, alto: 2336, bitrate: 12e6 }));
igual(celular.map((m) => m.grave), [true, true, false], "el del celular: tamaño y nivel son graves, el peso no");
igual(v.motivosParaAdaptar(ficha({ codec: "hevc", nivel: null }))[0]?.grave, true, "HEVC es grave");
igual(v.motivosParaAdaptar(ficha({ fps: 60 })).map((m) => m.grave), [false], "60 fps se adapta pero no es grave");
igual(v.motivosParaAdaptar(ficha({ fps: 30.02 })), [], "30,02 fps (redondeo del celular) no cuenta como más de 30");
igual(v.motivosParaAdaptar(ficha({ esMp4: false })).length, 1, "un MOV se pasa a MP4");
igual(v.motivosParaAdaptar(ficha({ girado: true })).length, 1, "un video girado por metadatos se adapta");

// ---- Peso (punto 3) ------------------------------------------------------
igual(ok("h264", v.MAX_BYTES_VIDEO), true, "justo 50 MB se sube");
igual(ok("h264", v.MAX_BYTES_VIDEO + 1), false, "un byte más que 50 MB no");
igual(v.veredictoVideo("h264", 30 * 1024 * 1024).aviso !== null, true, "30 MB se sube, sugiriendo comprimir");

// ---- Recorte (punto 5) ---------------------------------------------------
const c = (desde: number, hasta: number, duracion = 10): Clip => ({ url: "x", desde, hasta, duracion });
const tramo = (x: Clip) => [x.desde, x.hasta];
igual(tramo(v.acotarTramo(c(2, 7))), [2, 7], "un tramo normal queda igual");
igual(tramo(v.acotarTramo(c(-3, 7))), [0, 7], "no empieza antes del video");
igual(tramo(v.acotarTramo(c(2, 50))), [2, 10], "no termina después del video");
igual(tramo(v.acotarTramo(c(6, 3))), [6, 7], "fin antes que el inicio: queda el largo mínimo de 1 s");
igual(tramo(v.acotarTramo(c(9.8, 9.9))), [9, 10], "al final del video: el mínimo se acomoda adentro");
igual(tramo(v.acotarTramo(c(0, 0.4, 0.5))), [0, 0.5], "un video de medio segundo se usa entero");
igual(tramo(v.acotarTramo(c(1.234, 4.567))), [1.2, 4.6], "se redondea a décimas");

// ---- Duración en el TV (punto 10) ----------------------------------------
igual(v.duracionClips([c(1, 4), c(0, 2.5)]), 5.5, "dos tramos suman");
igual(v.duracionClips(null), 0, "sin tramos: 0");
igual(p.duracionMs({ tipo: "video", clips: [c(1, 4)], duracion_seg: 60 }), 3000, "la placa de video dura su recorte, no duracion_seg");
igual(p.duracionMs({ tipo: "video", clips: [c(0, 0.2)], duracion_seg: 8 }), 1000, "como mínimo 1 s");
igual(p.duracionMs({ tipo: "video", clips: [], duracion_seg: 8 }), 8000, "video sin tramos: cae en duracion_seg");
igual(p.duracionMs({ tipo: "oferta", duracion_seg: 8 }), 8000, "las demás placas siguen igual");

// ---- Encuadre y precio encima (puntos 7 y 8) -----------------------------
const o = v as unknown as {
  opcionesVideo: (p: Record<string, unknown>) => { encuadre: string; foco: string; texto: string };
  estiloVideo: (e: string, f: string) => { objectFit: string; objectPosition: string };
};
igual(o.opcionesVideo({}), { encuadre: "entero", foco: "centro", texto: "ninguno" }, "sin la migración 030: entero, centro, sin texto");
igual(
  o.opcionesVideo({ video_encuadre: "llenar", video_foco: "fin", video_texto: "arriba" }),
  { encuadre: "llenar", foco: "fin", texto: "arriba" },
  "las opciones guardadas se respetan",
);
igual(
  o.opcionesVideo({ video_encuadre: "estirar", video_foco: "costado", video_texto: "medio" }),
  { encuadre: "entero", foco: "centro", texto: "ninguno" },
  "un valor desconocido cae en el seguro por defecto",
);
igual(o.estiloVideo("entero", "inicio"), { objectFit: "contain", objectPosition: "50% 50%" }, "entero: se ve todo y el foco no importa");
igual(o.estiloVideo("llenar", "inicio"), { objectFit: "cover", objectPosition: "0% 0%" }, "llenar desde el inicio: arriba / izquierda");
igual(o.estiloVideo("llenar", "centro"), { objectFit: "cover", objectPosition: "50% 50%" }, "llenar al centro");
igual(o.estiloVideo("llenar", "fin"), { objectFit: "cover", objectPosition: "100% 100%" }, "llenar hasta el fin: abajo / derecha");

// ---- Unir clips (punto 6) ------------------------------------------------
const l = v as unknown as {
  moverClip: (c: Clip[], i: number, d: -1 | 1) => Clip[];
  quitarClip: (c: Clip[], i: number) => Clip[];
  duplicarClip: (c: Clip[], i: number) => Clip[];
};
const A = { url: "a", desde: 0, hasta: 2, duracion: 10 };
const B = { url: "b", desde: 1, hasta: 3, duracion: 5 };
const C = { url: "c", desde: 0, hasta: 4, duracion: 4 };
const urls = (cs: Clip[]) => cs.map((x) => x.url).join("");
igual(urls(l.moverClip([A, B, C], 2, -1)), "acb", "subir el último lo pone antes del anterior");
igual(urls(l.moverClip([A, B, C], 0, 1)), "bac", "bajar el primero");
igual(urls(l.moverClip([A, B, C], 0, -1)), "abc", "subir el primero no hace nada");
igual(urls(l.moverClip([A, B, C], 2, 1)), "abc", "bajar el último no hace nada");
igual(urls(l.quitarClip([A, B, C], 1)), "ac", "quitar el del medio");
const dup = l.duplicarClip([A, B, C], 0);
igual(urls(dup), "aabc", "duplicar deja la copia justo detrás");
igual([dup[1].desde, dup[1].hasta], [2, 4], "la copia sigue donde terminó el original, con el mismo largo");
const alFinal = l.duplicarClip([C], 0);
igual([alFinal[1].desde, alFinal[1].hasta], [3, 4], "si el original llega al final, la copia queda adentro del video");
igual(urls(l.duplicarClip([A], 5)), "a", "duplicar fuera de rango no hace nada");

console.log(`\n${fallos === 0 ? "OK" : "FALLÓ"}: ${fallos} fallos.`);
process.exit(fallos === 0 ? 0 : 1);
