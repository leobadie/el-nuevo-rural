import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import FlyerArte from "./FlyerArte";
import { MEDIDAS, validarFlyer } from "./calculos";
import type { Flyer, FormatoFlyer } from "./tipos";

/*
 * Arma el PNG del flyer. Vive acá y no en la ruta porque lo usan dos: la ruta real
 * (`/api/flyer`, con sesión) y la de pruebas que sólo existe en desarrollo. Una sola
 * implementación, así lo que verifica el test es lo mismo que descarga el usuario.
 */

/**
 * Geist en los dos pesos que usa el arte. `next/og` sólo trae Geist Regular, y un precio grande
 * en peso normal se ve flaco; los .ttf viven en assets/fonts (licencia OFL, ver el LICENSE de
 * al lado). Se leen una vez por proceso: son 256 KB que no conviene releer en cada descarga.
 */
let fuentesCache: { name: string; data: ArrayBuffer; weight: 600 | 900; style: "normal" }[] | null = null;

async function fuentes() {
  if (fuentesCache) return fuentesCache;
  const leer = async (archivo: string) => {
    // process.cwd() es la raíz del proyecto, no la carpeta de este archivo.
    const buf = await readFile(join(process.cwd(), "assets", "fonts", archivo));
    return Uint8Array.from(buf).buffer;
  };
  const [semibold, black] = await Promise.all([leer("Geist-SemiBold.ttf"), leer("Geist-Black.ttf")]);
  fuentesCache = [
    { name: "Geist", data: semibold, weight: 600, style: "normal" },
    { name: "Geist", data: black, weight: 900, style: "normal" },
  ];
  return fuentesCache;
}

/** El PNG, o una respuesta de error con el motivo en castellano. */
export async function generarFlyer(flyer: Flyer, formato: FormatoFlyer, logoSrc: string): Promise<Response> {
  const problema = validarFlyer(flyer);
  if (problema) return Response.json({ error: problema }, { status: 400 });

  const medida = MEDIDAS[formato];
  try {
    return new ImageResponse(<FlyerArte flyer={flyer} formato={formato} logoSrc={logoSrc} />, {
      width: medida.ancho,
      height: medida.alto,
      fonts: await fuentes(),
    });
  } catch (e) {
    console.error("no se pudo armar el flyer:", e);
    return Response.json(
      { error: "No se pudo armar la imagen. Probá sacando la foto de algún producto." },
      { status: 500 },
    );
  }
}
