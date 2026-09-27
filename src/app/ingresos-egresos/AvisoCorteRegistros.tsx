"use client";

import { useState } from "react";
import { corteDesdeDia, textoGuardados, type Guardados } from "@/lib/ingresos-egresos/corte";
import { hoyISO } from "@/lib/fechas";

const RED = "#C00000";

/** El día (AAAA-MM-DD) de un corte, en hora local: el corte de las 00:00 del 27 es "el 27". */
function diaLocal(corte: string): string {
  const d = new Date(corte);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

const fmtDia = (dia: string) => dia.split("-").reverse().join("/");

const boton = { border: "none", borderRadius: 6, padding: "7px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" } as const;

/**
 * El aviso del corte de registros (SPEC-corte-registros.md, puntos 6 y 7). El corte es invisible
 * por definición —lo que hace es que algo no aparezca—, así que se dice arriba de todo desde
 * cuándo se cuenta y cuánto quedó guardado antes. Un admin lo puede mover o quitar: no borra
 * nada, así que moverlo para atrás hace volver lo anterior.
 */
export default function AvisoCorteRegistros({
  corte,
  guardados,
  esAdmin,
  onCambiar,
}: {
  corte: string | null;
  guardados: Guardados;
  esAdmin: boolean;
  /** Guarda el corte nuevo (null = sin corte). Devuelve el error a mostrar, o null. */
  onCambiar: (corte: string | null) => Promise<string | null>;
}) {
  const [editando, setEditando] = useState(false);
  const [dia, setDia] = useState(() => (corte ? diaLocal(corte) : hoyISO()));
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState("");

  async function cambiar(nuevo: string | null) {
    setGuardando(true);
    setError("");
    const e = await onCambiar(nuevo);
    setGuardando(false);
    if (e) setError(e);
    else setEditando(false);
  }

  // Sin corte no hay nada que avisar; un admin igual puede volver a ponerlo.
  if (!corte && !esAdmin) return null;

  const detalle = textoGuardados(guardados);

  return (
    <div
      style={{ background: "#FFF8E1", border: "1px solid #F3D27A", borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, color: "#5D4300" }}
      data-test="aviso-corte-registros"
    >
      <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
        <span style={{ flex: "1 1 260px", minWidth: 0 }} data-test="texto-corte-registros">
          {corte ? (
            <>
              Los registros arrancan el <strong>{fmtDia(diaLocal(corte))}</strong>.
              {detalle && (
                <>
                  {" "}Lo cargado antes (<strong>{detalle}</strong>) no se borró: está guardado y no se cuenta en la caja, el inicio
                  ni Rentabilidad.
                </>
              )}
            </>
          ) : (
            <>Se ven todos los registros, desde el primero. Podés poner una fecha para arrancar de cero sin borrar nada.</>
          )}
        </span>
        {esAdmin && !editando && (
          <button onClick={() => setEditando(true)} style={{ ...boton, background: "transparent", color: RED, textDecoration: "underline", padding: "2px 4px" }} data-test="btn-cambiar-corte-registros">
            {corte ? "Cambiar" : "Poner fecha de corte"}
          </button>
        )}
      </div>

      {editando && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10, flexWrap: "wrap" }}>
          <input
            type="date"
            value={dia}
            max={hoyISO()}
            onChange={(e) => setDia(e.target.value)}
            style={{ padding: "7px 9px", border: "1px solid #ccc", borderRadius: 6, fontSize: 13, color: "#1A1A2E", background: "white" }}
            data-test="corte-registros-fecha"
          />
          <button onClick={() => void cambiar(corteDesdeDia(dia))} disabled={guardando || !dia} style={{ ...boton, background: RED, color: "white" }} data-test="corte-registros-guardar">
            {guardando ? "Guardando…" : "Guardar"}
          </button>
          {corte && (
            <button onClick={() => void cambiar(null)} disabled={guardando} style={{ ...boton, background: "white", color: "#1A1A2E", border: "1px solid #ccc" }} data-test="corte-registros-quitar">
              Ver todo (quitar el corte)
            </button>
          )}
          <button onClick={() => setEditando(false)} style={{ ...boton, background: "#F0F0F0", color: "#1A1A2E" }}>
            Cancelar
          </button>
          <span style={{ fontSize: 11, color: "#7A6200", flex: "1 1 100%" }}>
            Cambia lo que ven todos. No borra ni crea nada: moverlo para atrás hace volver lo anterior.
          </span>
        </div>
      )}
      {error && (
        <div role="alert" style={{ marginTop: 8, color: "#922B21", fontWeight: 700 }} data-test="error-corte-registros">
          {error}
        </div>
      )}
    </div>
  );
}
