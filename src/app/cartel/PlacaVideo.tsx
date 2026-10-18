"use client";

import { useEffect, useRef, useState } from "react";
import type { Placa } from "@/lib/cartel/types";

/** Si un video no arranca, cuánto se espera antes de saltarlo. */
const ESPERA_ERROR_MS = 2000;

/**
 * Placa de video: reproduce sus tramos en orden, mudo, y avisa cuando terminó
 * (SPEC-cartel-videos.md, puntos 10-14).
 *
 * El archivo no se toca: el tramo se respeta acá, saltando a `desde` y cortando
 * al llegar a `hasta`. Sin `onFin` (la previa del admin) da vueltas solo.
 */
export default function PlacaVideo({
  placa,
  onFin,
  quieto = false,
}: {
  placa: Placa;
  /** El televisor pasa a la placa siguiente cuando se llama. */
  onFin?: () => void;
  /** Modo captura: queda congelado en el primer cuadro del primer tramo. */
  quieto?: boolean;
}) {
  const clips = placa.clips ?? [];
  const [i, setI] = useState(0);
  const [roto, setRoto] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  const terminado = useRef(false);
  const clip = clips[i] ?? clips[0];

  // Cada tramo arranca en su `desde`. Con el mismo archivo no hace falta
  // recargarlo: alcanza con mover la posición.
  useEffect(() => {
    const v = ref.current;
    if (!v || !clip) return;
    const empezar = () => {
      v.currentTime = clip.desde;
      if (!quieto) v.play().catch(() => {});
    };
    if (v.readyState >= 1) empezar();
    else v.addEventListener("loadedmetadata", empezar, { once: true });
    return () => v.removeEventListener("loadedmetadata", empezar);
  }, [clip, i, quieto]);

  // Un video que no carga se salta: nunca un cuadro negro trabado.
  useEffect(() => {
    if (!roto || quieto) return;
    const id = window.setTimeout(() => terminar(), ESPERA_ERROR_MS);
    return () => window.clearTimeout(id);
    // terminar solo usa refs y props: no hace falta en las dependencias.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roto, quieto]);

  function terminar() {
    if (onFin) {
      if (terminado.current) return;
      terminado.current = true;
      ref.current?.pause();
      onFin();
    } else {
      // Previa del admin: vuelve a empezar.
      setI(0);
      const v = ref.current;
      if (v && clips[0]) {
        v.currentTime = clips[0].desde;
        v.play().catch(() => {});
      }
    }
  }

  function siguienteTramo() {
    if (quieto) return;
    if (i + 1 < clips.length) setI(i + 1);
    else terminar();
  }

  if (!clip) return <div className="pl-video" />;

  return (
    <div className="pl-video">
      <video
        ref={ref}
        // #t= hace que el navegador arranque ya en el tramo y no muestre un
        // instante del principio del archivo.
        src={`${clip.url}#t=${clip.desde}`}
        muted
        playsInline
        preload="auto"
        autoPlay={!quieto}
        onTimeUpdate={(e) => {
          if (e.currentTarget.currentTime >= clip.hasta - 0.05) siguienteTramo();
        }}
        onEnded={siguienteTramo}
        onError={() => setRoto(true)}
        data-tramo={i}
      />
      {/* En la previa del admin se avisa; en el TV no, ahí se salta y listo. */}
      {roto && !onFin && <p className="pl-video-roto">Este video no se puede reproducir</p>}
    </div>
  );
}
