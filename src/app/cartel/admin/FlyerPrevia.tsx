"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import FlyerArte from "@/lib/flyer/FlyerArte";
import { MEDIDAS } from "@/lib/flyer/calculos";
import type { Flyer, FormatoFlyer } from "@/lib/flyer/tipos";

const AZUL = "#1F3864";

const botonStyle = {
  border: "none",
  borderRadius: 6,
  padding: "9px 14px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};

/**
 * La vista previa del flyer y los botones de descarga (SPEC-flyer.md R3.4 y R3.5). Dibuja el
 * mismo `FlyerArte` que genera el PNG en el servidor, así que lo que se ve es lo que se baja.
 */
export default function FlyerPrevia({
  flyer,
  formato,
  onFormato,
  onDescargar,
  bajando,
  puede,
}: {
  flyer: Flyer;
  formato: FormatoFlyer;
  onFormato: (f: FormatoFlyer) => void;
  onDescargar: (f: FormatoFlyer) => void;
  bajando: FormatoFlyer | null;
  puede: boolean;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);
  const medida = MEDIDAS[formato];

  // El arte se dibuja siempre a 1080 de ancho y se achica con scale: así la previa es el PNG
  // en chiquito, y no una maqueta parecida que después no coincide.
  const medir = useCallback(() => {
    if (caja.current) setAncho(caja.current.getBoundingClientRect().width);
  }, []);

  useEffect(() => {
    medir();
    const obs = new ResizeObserver(medir);
    if (caja.current) obs.observe(caja.current);
    return () => obs.disconnect();
  }, [medir]);

  const escala = ancho > 0 ? ancho / medida.ancho : 0;

  return (
    <div style={{ flex: "1 1 300px", minWidth: 0, maxWidth: 420, position: "sticky", top: 16 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {(Object.keys(MEDIDAS) as FormatoFlyer[]).map((f) => (
          <button
            key={f}
            onClick={() => onFormato(f)}
            style={{ ...botonStyle, background: formato === f ? AZUL : "#F0F0F0", color: formato === f ? "white" : "#1A1A2E" }}
            data-test={`formato-${f}`}
          >
            {MEDIDAS[f].etiqueta}
          </button>
        ))}
      </div>

      <div ref={caja} style={{ width: "100%", minWidth: 0 }}>
        <div
          style={{ width: "100%", height: escala ? medida.alto * escala : 0, overflow: "hidden", borderRadius: 10, border: "1px solid #ddd" }}
          data-test="flyer-previa"
          data-formato={formato}
        >
          {escala > 0 && (
            <div style={{ width: medida.ancho, height: medida.alto, transform: `scale(${escala})`, transformOrigin: "top left" }}>
              <FlyerArte flyer={flyer} formato={formato} />
            </div>
          )}
        </div>
      </div>

      <p style={{ fontSize: 11, color: "#888", margin: "8px 0 10px" }}>
        {medida.ancho}×{medida.alto} px · {medida.destino}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {(Object.keys(MEDIDAS) as FormatoFlyer[]).map((f) => (
          <button
            key={f}
            onClick={() => onDescargar(f)}
            disabled={!puede || bajando !== null}
            style={{
              ...botonStyle,
              background: puede ? AZUL : "#DDD",
              color: puede ? "white" : "#888",
              padding: "11px 14px",
              cursor: puede && bajando === null ? "pointer" : "default",
            }}
            data-test={`btn-descargar-${f}`}
          >
            {bajando === f ? "Armando la imagen…" : `Descargar para ${MEDIDAS[f].etiqueta}`}
          </button>
        ))}
      </div>
    </div>
  );
}
