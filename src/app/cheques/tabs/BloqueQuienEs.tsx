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

/*
 * La grilla de una sola columna `minmax(0, 1fr)` no es decorativa: la tabla de personas pide
 * 420px de ancho mínimo para que las tres columnas se lean, y el <body> de la app es un flex
 * column, así que ese mínimo se propaga hacia arriba y estira la página entera. Medido en un
 * viewport de 390px, la página pasaba a 494px: el botón "Consultar" quedaba fuera de la
 * pantalla y no se podía tocar. Con la grilla el mínimo del panel es 0 y la tabla se arrastra
 * dentro de su caja, que es lo que pide R6.2. Es el mismo blindaje que usa VerificacionTab.
 */
const panel = {
  display: "grid",
  gridTemplateColumns: "minmax(0, 1fr)",
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
  /*
   * El bloque no se muestra cuando no hay nada que aportar: ni las tablas cargadas
   * ("sinTablas"), ni una sola fila visible para esta sesión ("sinAcceso"). Callar es lo
   * correcto: con la lista vacía que devuelve RLS no se puede distinguir un CUIT que no está
   * de uno que no se puede ver, y decir "no figura" sobre una empresa que sí está cargada es
   * peor que no decir nada.
   */
  if (registro.estado === "sinTablas" || registro.estado === "sinAcceso") return null;
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
          {/* Si la provincia tiene su propia consulta pública, se dice dónde y qué hace falta:
              el dato existe y es gratis, solo que hay que ir a buscarlo a mano. */}
          {bloque.consultaProvincial && (
            <div data-testid="consulta-provincial" style={{ marginTop: 8 }}>
              <div>{bloque.consultaProvincial.detalle}</div>
              <a
                data-testid="link-consulta-provincial"
                href={bloque.consultaProvincial.url}
                target="_blank"
                rel="noopener noreferrer"
                style={{
                  display: "inline-block",
                  marginTop: 6,
                  padding: "5px 10px",
                  background: NAVY,
                  color: "white",
                  borderRadius: 6,
                  fontWeight: 700,
                  textDecoration: "none",
                }}
              >
                Consultarlas en {bloque.consultaProvincial.organismo} →
              </a>
              <div style={{ marginTop: 4, opacity: 0.8 }}>
                Buscá por el CUIT {cuit}.
              </div>
            </div>
          )}
        </div>
      )}

      <div style={{ fontSize: 10, color: "#777", marginTop: 8 }}>
        Fuente: Registro Nacional de Sociedades e Inspección General de Justicia (datos
        públicos, Ministerio de Justicia){periodo ? ` · dato de ${periodo}` : ""}.
      </div>
    </div>
  );
}
