"use client";

import { NAVY, thStyle, tdStyle } from "@/lib/cheques/estilos";
import type { ResultadoRegistro } from "@/lib/registros/consulta";
import {
  antiguedadEnAnios,
  armarBloqueSociedad,
  domicilioLegible,
  periodoLegible,
  NOMBRE_ROL,
} from "@/lib/registros/sociedad";

const panel = {
  background: "#fff",
  border: "1px solid #e0e0e0",
  borderRadius: 10,
  padding: "14px 16px",
  marginBottom: 16,
} as const;

const tituloPanel = { fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 10 } as const;

/**
 * Datos de la sociedad y personas registradas detrás de un CUIT.
 *
 * La parte importante de este bloque es lo que dice cuando NO hay personas. El único registro
 * con datos abiertos de socios es el de la IGJ, que es el de CABA: de las 280.759 sociedades
 * que llegan hasta sus personas, la enorme mayoría son de Capital y Buenos Aires. Una S.R.L.
 * de Córdoba no aparece, y eso no es lo mismo que no tener socios. Por eso cada ausencia se
 * muestra con su motivo en vez de como una lista vacía.
 */
export default function BloqueQuienEs({
  cuit,
  registro,
}: {
  cuit: string;
  registro: ResultadoRegistro;
}) {
  // Sin las tablas cargadas el bloque no se muestra: no tiene nada que aportar todavía.
  if (registro.estado === "sinTablas") return null;
  if (registro.estado === "error") {
    return (
      <div style={panel}>
        <div style={tituloPanel}>Quién está detrás de este CUIT</div>
        <div data-testid="error-registro" style={{ fontSize: 12, color: "#922B21" }}>
          {registro.mensaje}
        </div>
      </div>
    );
  }

  const bloque = armarBloqueSociedad(cuit, registro.sociedad, registro.personas);
  const s = bloque.sociedad;
  const anios = antiguedadEnAnios(s?.fecha_contrato ?? null, new Date());
  const domicilio = s ? domicilioLegible(s) : "";
  const periodo = periodoLegible(s?.periodo_fuente ?? null);

  return (
    <div style={panel} data-testid="panel-quien-es">
      <div style={tituloPanel}>Quién está detrás de este CUIT</div>

      {s && (
        <div
          data-testid="datos-sociedad"
          style={{ display: "flex", flexWrap: "wrap", gap: "6px 18px", fontSize: 12, color: "#555", marginBottom: 10 }}
        >
          <span><strong style={{ color: NAVY }}>{s.razon_social}</strong></span>
          {s.tipo_societario && <span>{s.tipo_societario}</span>}
          {anios !== null && (
            <span data-testid="antiguedad">
              {anios} {anios === 1 ? "año" : "años"} de antigüedad
            </span>
          )}
          {domicilio && <span data-testid="domicilio">{domicilio}</span>}
          {s.actividad && <span data-testid="actividad">{s.actividad}</span>}
        </div>
      )}

      {bloque.personas.length > 0 ? (
        <>
          <div style={{ overflowX: "auto", maxWidth: "100%" }}>
            <table data-testid="tabla-personas" style={{ width: "100%", borderCollapse: "collapse", minWidth: 420 }}>
              <thead>
                <tr>
                  <th style={thStyle}>Nombre</th>
                  <th style={thStyle}>Rol</th>
                  <th style={thStyle}>Documento</th>
                </tr>
              </thead>
              <tbody>
                {bloque.personas.map((p, i) => (
                  <tr key={i} data-rol={p.rol} style={{ background: i % 2 ? "#F4F6FB" : "white" }}>
                    <td style={tdStyle}>{p.nombre}</td>
                    <td style={tdStyle}>{NOMBRE_ROL[p.rol]}</td>
                    <td style={tdStyle}>
                      {p.numero_documento ? `${p.tipo_documento ?? "Doc."} ${p.numero_documento}` : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div data-testid="aclaracion-personas" style={{ fontSize: 10, color: "#777", marginTop: 8, lineHeight: 1.6 }}>
            {bloque.explicacion}
          </div>
        </>
      ) : (
        <div
          data-testid="sin-personas"
          data-motivo={bloque.motivoSinPersonas ?? ""}
          style={{ background: "#FCF3CF", color: "#7D6608", borderRadius: 8, padding: "10px 12px", fontSize: 11, lineHeight: 1.6 }}
        >
          {bloque.explicacion}
        </div>
      )}

      <div style={{ fontSize: 10, color: "#777", marginTop: 8 }}>
        Fuente: Registro Nacional de Sociedades e Inspección General de Justicia (datos
        públicos, Ministerio de Justicia){periodo ? ` · dato de ${periodo}` : ""}.
      </div>
    </div>
  );
}
