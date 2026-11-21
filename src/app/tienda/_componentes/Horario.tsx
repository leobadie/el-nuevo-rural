"use client";

import { useEffect, useState } from "react";
import { estadoHorario, textoProxima, type EstadoHorario, type Horario } from "@/lib/tienda/envio";
import { Aviso } from "./Varios";

/**
 * Estado del horario AHORA, calculado en el navegador y recién después de montar: la tienda
 * se arma de antemano (estática), así que la hora del servidor no sirve. Se recalcula cada minuto.
 * Devuelve null hasta montar (así el HTML del servidor y el primer render coinciden).
 */
export function useEstadoHorario(horario: Horario | null): EstadoHorario | null {
  const [estado, setEstado] = useState<EstadoHorario | null>(null);
  useEffect(() => {
    const calcular = () => setEstado(estadoHorario(horario, new Date()));
    calcular();
    const t = window.setInterval(calcular, 60_000);
    return () => window.clearInterval(t);
  }, [horario]);
  return estado;
}

/** "Ahora estamos cerrados. Podés hacer tu pedido igual: lo preparamos cuando abramos (mañana a las 8:00)." */
export function AvisoFueraDeHorario({ horario }: { horario: Horario | null }) {
  const e = useEstadoHorario(horario);
  if (!e || !e.configurado || e.abierto) return null;
  return (
    <div data-test="fuera-de-horario">
      <Aviso tipo="atencion">
        <strong>Ahora estamos cerrados.</strong> Podés hacer tu pedido igual: lo preparamos cuando abramos ({textoProxima(e.proxima)}).
      </Aviso>
    </div>
  );
}
