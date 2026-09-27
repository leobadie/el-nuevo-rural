"use client";

/* Piezas chicas que comparten las pestañas de la carnicería. */

import { useState, type CSSProperties, type ReactNode } from "react";
import { parseNumero, type CampoResuelto, type Resultado } from "@/lib/carniceria/calculos";

export const ROJO = "#922B21";
export const ROJO_CLARO = "#FDEDEC";
/** Amarillo = lo cargás vos, como en la planilla. */
export const AMARILLO = "#FFF6D5";
export const AMARILLO_BORDE = "#E2C044";

export const thStyle: CSSProperties = {
  background: ROJO,
  color: "white",
  fontWeight: 700,
  fontSize: 12,
  padding: "8px 6px",
  textAlign: "left",
  whiteSpace: "nowrap",
};

export const tdStyle: CSSProperties = { padding: "6px", fontSize: 13, borderBottom: "1px solid #eee", verticalAlign: "middle" };

export const tarjeta: CSSProperties = { background: "white", border: "1px solid #e0e0e0", borderRadius: 10, padding: 16 };

export const botonPrimario: CSSProperties = {
  background: ROJO,
  color: "white",
  border: "none",
  borderRadius: 6,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

export const botonSecundario: CSSProperties = {
  background: "white",
  color: "#1A1A2E",
  border: "1px solid #ccc",
  borderRadius: 6,
  padding: "6px 10px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
};

/** Número para mostrar: miles con punto, hasta `dec` decimales. */
export function num(n: number, dec = 0, min = dec): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("es-AR", { minimumFractionDigits: min, maximumFractionDigits: dec });
}

export function conUnidad(valor: number, unidad: string, dec: number): string {
  if (!Number.isFinite(valor)) return "—";
  if (unidad === "$") return `$ ${num(valor, dec)}`;
  if (unidad === "%") return `${num(valor, dec, Math.min(dec, 1))} %`;
  return `${num(valor, dec)} ${unidad}`;
}

/** Tabla con scroll horizontal propio: nunca estira la página (ver memoria del body flex). */
export function TablaScroll({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)" }}>
      <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>{children}</div>
    </div>
  );
}

/**
 * Input numérico que se guarda al salir del campo (o con Enter). Acepta "10.600" y "2,6".
 * Vacío = null (volver a automático / sacar el dato).
 */
export function InputNumero({
  valor,
  onCommit,
  ancho = 110,
  permiteVacio = false,
  dataTest,
  ariaLabel,
  amarillo = true,
}: {
  valor: number | null;
  onCommit: (v: number | null) => void;
  ancho?: number | string;
  permiteVacio?: boolean;
  dataTest?: string;
  ariaLabel?: string;
  amarillo?: boolean;
}) {
  // Hasta 3 decimales pero sin forzarlos: "18,000" se lee como dieciocho mil.
  const mostrar = (v: number | null) => (v == null || !Number.isFinite(v) ? "" : num(v, 3, 0));
  // Mientras se escribe manda el borrador; el resto del tiempo se muestra el valor de afuera,
  // así un cambio que viene de otro módulo (o "volver al automático") se ve sin sincronizar nada.
  const [borrador, setBorrador] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const texto = borrador ?? mostrar(valor);

  function confirmar() {
    const limpio = texto.trim();
    if (limpio === "") {
      setBorrador(null);
      setError(false);
      if (permiteVacio && valor != null) onCommit(null);
      return;
    }
    const n = parseNumero(limpio);
    if (n == null) {
      // Queda el texto en rojo para que se vea qué no se entendió.
      setError(true);
      return;
    }
    setError(false);
    setBorrador(null);
    if (n !== valor) onCommit(n);
  }

  return (
    <input
      type="text"
      inputMode="decimal"
      value={texto}
      aria-label={ariaLabel}
      aria-invalid={error || undefined}
      data-test={dataTest}
      onFocus={(e) => {
        setBorrador(texto);
        e.currentTarget.select();
      }}
      onChange={(e) => setBorrador(e.target.value)}
      onBlur={confirmar}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          setBorrador(mostrar(valor));
          setError(false);
          e.currentTarget.blur();
        }
      }}
      style={{
        width: ancho,
        maxWidth: "100%",
        boxSizing: "border-box",
        padding: "7px 8px",
        fontSize: 15,
        textAlign: "right",
        border: `1px solid ${error ? "#C0392B" : amarillo ? AMARILLO_BORDE : "#ccc"}`,
        background: error ? "#FADBD8" : amarillo ? AMARILLO : "white",
        borderRadius: 6,
        fontFamily: "inherit",
      }}
    />
  );
}

/** Un dato que se carga: etiqueta, campo, unidad y de dónde sale el valor. */
export function FilaCampo({
  campo,
  onGuardar,
}: {
  campo: CampoResuelto;
  onGuardar: (clave: string, valor: number | null) => void;
}) {
  const tieneAuto = campo.valorAuto != null;
  return (
    <div data-test={`campo-${campo.clave}`} data-origen={campo.origen} style={{ padding: "8px 0", borderBottom: "1px dashed #eee" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
        <label style={{ flex: "1 1 180px", fontSize: 13, color: "#333", minWidth: 0 }}>{campo.etiqueta}</label>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <InputNumero
            valor={campo.valor}
            ariaLabel={campo.etiqueta}
            dataTest={`input-${campo.clave}`}
            permiteVacio={campo.origen === "manual"}
            amarillo={campo.origen !== "auto"}
            onCommit={(v) => onGuardar(campo.clave, v)}
          />
          <span style={{ fontSize: 12, color: "#666", width: 48 }}>{campo.unidad}</span>
        </div>
      </div>
      <div style={{ fontSize: 11, marginTop: 3, display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {campo.origen === "auto" && (
          <span style={{ color: "#1E7B34", fontWeight: 700 }}>↳ sale de {campo.fuente}</span>
        )}
        {campo.origen === "ejemplo" && (
          <span style={{ color: "#8A6D00", fontWeight: 700 }} data-test="chip-ejemplo">
            valor de ejemplo de la planilla: cargá el tuyo
          </span>
        )}
        {campo.origen === "manual" && (
          <>
            <span style={{ color: "#555" }}>cargado por vos</span>
            <button
              type="button"
              data-test={`volver-${campo.clave}`}
              onClick={() => onGuardar(campo.clave, null)}
              style={{ background: "none", border: "none", color: ROJO, fontSize: 11, fontWeight: 700, cursor: "pointer", padding: 0, textDecoration: "underline" }}
            >
              {tieneAuto ? `volver al automático (${num(campo.valorAuto!, 2)})` : "volver al ejemplo"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export function Secundario({ r }: { r: Resultado }) {
  const negativo = r.valor < 0;
  return (
    <div style={{ background: "#F8F9FA", borderRadius: 8, padding: "8px 10px", minWidth: 0 }}>
      <div style={{ fontSize: 10, color: "#666", fontWeight: 700, textTransform: "uppercase" }}>{r.etiqueta}</div>
      <div style={{ fontSize: 15, fontWeight: 700, color: negativo ? "#C0392B" : "#1A1A2E" }}>{conUnidad(r.valor, r.unidad, r.decimales)}</div>
    </div>
  );
}
