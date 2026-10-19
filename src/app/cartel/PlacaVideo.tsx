"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Placa } from "@/lib/cartel/types";
import { colorDePlaca, fmtPrecio, porcentajeAhorro, textoVigencia } from "@/lib/cartel/placas";
import { estiloVideo, estiloVideoGirado, opcionesVideo, urlGirada } from "@/lib/cartel/video";

/** Si un video no arranca, cuánto se espera antes de saltarlo. */
const ESPERA_ERROR_MS = 2000;

/**
 * Si en este tiempo la imagen no avanzó, la tele no lo está pudiendo mostrar
 * aunque no dé error (Carnicería 1 quedó en negro con un video de nivel 5.0,
 * 19/10/2026), o todavía lo está bajando: se pasa a la siguiente placa.
 * Solo se mira el tiempo: la LG de Carnicería 1 informa 0 cuadros dibujados
 * aunque el video se vea, y contarlos lo cortaba a los 8 s.
 */
const ESPERA_SIN_AVANCE_MS = 8000;

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
  giro = 0,
  capa = null,
}: {
  placa: Placa;
  /** El televisor pasa a la placa siguiente cuando se llama. */
  onFin?: () => void;
  /** Modo captura: queda congelado en el primer cuadro del primer tramo. */
  quieto?: boolean;
  /** Giro de la tele (0, 90, 270). */
  giro?: number;
  /**
   * Capa sin girar, del tamaño de la pantalla, donde va el video ya girado de
   * fábrica en las teles paradas (SPEC-cartel-convertir-video.md, punto 17).
   */
  capa?: HTMLElement | null;
}) {
  const clips = placa.clips ?? [];
  const [i, setI] = useState(0);
  const [roto, setRoto] = useState(false);
  const ref = useRef<HTMLVideoElement>(null);
  const terminado = useRef(false);
  const clip = clips[i] ?? clips[0];
  const { encuadre, foco, texto } = opcionesVideo(placa);

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

  // Cuadro negro sin error: el tiempo no avanzó.
  useEffect(() => {
    if (!onFin || quieto || !clip) return;
    const id = window.setTimeout(() => {
      const v = ref.current;
      if (v && v.currentTime < clip.desde + 0.3) terminar();
    }, ESPERA_SIN_AVANCE_MS);
    return () => window.clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clip, i, quieto, onFin]);

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

  // Tele parada con versión girada: el video va en la capa sin girar, porque el
  // circuito de video de la tele ignora el giro por CSS. La placa queda
  // transparente encima, con el precio girado como siempre.
  const girada = !quieto && capa ? urlGirada(clip, giro) : null;
  const video = (
      <video
        ref={ref}
        // #t= hace que el navegador arranque ya en el tramo y no muestre un
        // instante del principio del archivo.
        src={`${girada ?? clip.url}#t=${clip.desde}`}
        muted
        playsInline
        preload="auto"
        style={girada ? estiloVideoGirado(encuadre, foco, giro as 90 | 270) : estiloVideo(encuadre, foco)}
        autoPlay={!quieto}
        onTimeUpdate={(e) => {
          if (e.currentTarget.currentTime >= clip.hasta - 0.05) siguienteTramo();
        }}
        onEnded={siguienteTramo}
        onError={() => setRoto(true)}
        data-tramo={i}
        data-girado={girada ? giro : undefined}
      />
  );

  return (
    <div className={girada ? "pl-video pl-video-aparte" : "pl-video"}>
      {girada ? createPortal(video, capa!) : video}
      {texto !== "ninguno" && <PrecioEncima placa={placa} donde={texto} />}
      {/* En la previa del admin se avisa; en el TV no, ahí se salta y listo. */}
      {roto && !onFin && <p className="pl-video-roto">Este video no se puede reproducir</p>}
    </div>
  );
}

/**
 * El precio de la oferta encima del video (SPEC-cartel-videos.md, punto 8).
 * Lo dibuja la app y no va "quemado" en el archivo: cambiar el precio es
 * instantáneo y sale nítido, con la letra de las placas.
 */
function PrecioEncima({ placa, donde }: { placa: Placa; donde: "arriba" | "abajo" }) {
  const off = porcentajeAhorro(placa);
  const vigencia = textoVigencia(placa);
  const precio = placa.precio != null ? fmtPrecio(placa.precio) : null;
  const pie = [placa.unidad, vigencia].filter(Boolean).join(" · ");

  return (
    <div className={`vd-texto vd-texto-${donde}`} data-test="precio-encima">
      {placa.seccion && (
        <span className="vd-seccion" style={{ background: colorDePlaca(placa) }}>
          {placa.seccion}
        </span>
      )}
      <h2 className={placa.titulo.length > 24 ? "vd-titulo vd-titulo-largo" : "vd-titulo"}>{placa.titulo}</h2>
      {(placa.precio_anterior != null || off != null) && (
        <div className="vd-antes">
          {placa.precio_anterior != null && <span className="vd-tachado">{fmtPrecio(placa.precio_anterior)}</span>}
          {off != null && <span className="vd-off">{off}% OFF</span>}
        </div>
      )}
      {precio && <span className={precio.length > 9 ? "vd-precio vd-precio-largo" : "vd-precio"}>{precio}</span>}
      {pie && <span className="vd-pie">{pie}</span>}
    </div>
  );
}
