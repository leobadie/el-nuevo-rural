/*
 * Adaptar un video a las teles en el navegador de quien lo sube
 * (SPEC-cartel-convertir-video.md).
 *
 * Usa el codificador del propio aparato (WebCodecs) a través de Mediabunny: sin
 * servidor y sin mandar el video a nadie. La librería se carga recién cuando se
 * sube un video, para no sumarle peso al resto del admin.
 */
import { BITRATE_ADAPTADO, FPS_MAX_TELE, tamanoParaTele, nivelH264, type FichaVideo } from "./video";

/** Lee lo necesario para decidir si hay que adaptar. null = no se pudo leer. */
export async function leerFicha(archivo: File): Promise<FichaVideo | null> {
  const mb = await import("mediabunny");
  const input = new mb.Input({ source: new mb.BlobSource(archivo), formats: mb.ALL_FORMATS });
  try {
    const pista = await input.getPrimaryVideoTrack();
    if (!pista) return null;
    const [codec, cadena, ancho, alto, giro, formato] = await Promise.all([
      pista.getCodec(),
      pista.getCodecParameterString(),
      pista.getDisplayWidth(),
      pista.getDisplayHeight(),
      pista.getRotation(),
      input.getFormat(),
    ]);
    // Alcanza con una muestra de paquetes: leer todo un video de 60 s tarda.
    const stats = await pista.computePacketStats(300).catch(() => null);
    return {
      codec,
      nivel: codec === "avc" ? nivelH264(cadena) : null,
      ancho,
      alto,
      fps: stats?.averagePacketRate ?? null,
      bitrate: stats?.averageBitrate ?? null,
      esMp4: formato === mb.MP4,
      girado: giro !== 0,
    };
  } catch {
    return null;
  } finally {
    input.dispose();
  }
}

/** Si este navegador puede leer el video y codificar H.264. */
export async function puedeAdaptar(archivo: File): Promise<boolean> {
  if (typeof window === "undefined" || !("VideoEncoder" in window) || !("VideoDecoder" in window)) return false;
  const mb = await import("mediabunny");
  const input = new mb.Input({ source: new mb.BlobSource(archivo), formats: mb.ALL_FORMATS });
  try {
    const pista = await input.getPrimaryVideoTrack();
    if (!pista || !(await pista.canDecode())) return false;
    const t = tamanoParaTele(await pista.getDisplayWidth(), await pista.getDisplayHeight());
    return await mb.canEncodeVideo("avc", { width: t.ancho, height: t.alto, bitrate: BITRATE_ADAPTADO });
  } catch {
    return false;
  } finally {
    input.dispose();
  }
}

export type Adaptacion = {
  /** Corre la conversión; avisa el avance entre 0 y 1. */
  correr: (alAvanzar: (avance: number) => void) => Promise<File>;
  cancelar: () => void;
};

/**
 * Prepara la conversión a lo que la tele reproduce seguro: H.264 dentro de
 * 1080×1920 (o 1920×1080), 30 fps, ~6 Mbps, sin audio, MP4 con el índice al
 * principio y el giro aplicado a la imagen.
 */
export async function prepararAdaptacion(archivo: File, ficha: FichaVideo): Promise<Adaptacion> {
  const mb = await import("mediabunny");
  const input = new mb.Input({ source: new mb.BlobSource(archivo), formats: mb.ALL_FORMATS });
  const destino = new mb.BufferTarget();
  const output = new mb.Output({ format: new mb.Mp4OutputFormat({ fastStart: "in-memory" }), target: destino });
  const t = tamanoParaTele(ficha.ancho, ficha.alto);

  const conversion = await mb.Conversion.init({
    input,
    output,
    video: {
      codec: "avc",
      width: t.ancho,
      height: t.alto,
      fit: "contain",
      frameRate: Math.min(FPS_MAX_TELE, Math.round(ficha.fps ?? FPS_MAX_TELE)),
      bitrate: BITRATE_ADAPTADO,
      // El giro va en la imagen: hay teles que ignoran el dato de giro del archivo.
      allowTransformationMetadata: false,
      forceTranscode: true,
    },
    // Las teles van mudas: sin audio el archivo pesa menos.
    audio: { discard: true },
  });

  return {
    async correr(alAvanzar) {
      if (!conversion.isValid) {
        input.dispose();
        throw new Error("Este navegador no puede adaptar este video.");
      }
      conversion.onProgress = (p) => alAvanzar(p);
      try {
        await conversion.execute();
      } finally {
        input.dispose();
      }
      const nombre = archivo.name.replace(/\.[^.]+$/, "") + "-tele.mp4";
      return new File([destino.buffer!], nombre, { type: "video/mp4" });
    },
    cancelar() {
      conversion.cancel().catch(() => {});
    },
  };
}

/** Si el error es porque alguien apretó Cancelar. */
export function fueCancelado(e: unknown): boolean {
  return (e as Error)?.name === "ConversionCanceledError";
}
