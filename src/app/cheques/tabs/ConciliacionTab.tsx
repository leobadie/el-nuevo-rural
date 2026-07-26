"use client";

import { useMemo, useState } from "react";
import { fmtDate, fmtMoney } from "@/lib/cheques/calculos";
import { matchMovimientos, parseMovimientosBancarios } from "@/lib/cheques/conciliacion";
import { thStyle, tdStyle } from "@/lib/cheques/estilos";
import type { ChequeEnriquecido, MovimientoBanco } from "@/lib/cheques/types";

export default function ConciliacionTab({
  enriched,
  pedirConfirmacion,
  onConfirmarPago,
}: {
  enriched: ChequeEnriquecido[];
  pedirConfirmacion: (message: string, onConfirm: () => void) => void;
  onConfirmarPago: (chequeId: string, importeBanco: number) => Promise<void>;
}) {
  const [pasteText, setPasteText] = useState("");
  const [movimientos, setMovimientos] = useState<MovimientoBanco[]>([]);

  const conciliacion = useMemo(() => {
    const matched = matchMovimientos(movimientos, enriched);
    const idsConciliados = new Set(matched.filter((m) => m.cheque).map((m) => m.cheque!.id));
    const pagadosSinBanco = enriched.filter((c) => c.estado === "Pagado" && !idsConciliados.has(c.id));
    const confirmables = matched.filter((m) => m.cheque && m.cheque.estado !== "Pagado");
    const sinCoincidencia = matched.filter((m) => !m.cheque);
    return { matched, pagadosSinBanco, confirmables, sinCoincidencia };
  }, [movimientos, enriched]);

  function agregarMovimientosPegados() {
    const nuevos = parseMovimientosBancarios(pasteText);
    if (nuevos.length === 0) {
      window.alert("No se pudo reconocer ningún movimiento. Revisá el formato: fecha, importe y descripción separados por tabulación o punto y coma.");
      return;
    }
    setMovimientos((prev) => [...prev, ...nuevos]);
    setPasteText("");
  }

  function borrarMovimientos() {
    pedirConfirmacion("¿Borrar todos los movimientos bancarios cargados? Los cheques no se ven afectados.", () => {
      setMovimientos([]);
    });
  }

  return (
    <div>
      <p style={{ fontSize: 11, color: "#888", marginBottom: 10 }}>
        Pegá acá los movimientos de tu banco — funciona tanto si copiás el detalle completo (con &quot;Fecha:&quot;, &quot;Comprobante:&quot;, &quot;Monto:&quot;, etc.) como si pegás una línea simple por movimiento. La app intenta emparejar cada uno con un cheque por el importe. Este texto no se guarda — se pierde al salir de esta pestaña.
      </p>
      <textarea
        value={pasteText}
        onChange={(e) => setPasteText(e.target.value)}
        placeholder={"Fecha: 22/07/2026 - 00:00:00\nComprobante: 468\nSucursal: 0001\nConcepto: 48HS. BANCOS\nMonto:\n- $1.150.000,00\n\n(o también funciona: 21/07/2026\\t2333333\\tDEBITO CHEQUE 1)"}
        style={{ width: "100%", minHeight: 100, padding: 10, borderRadius: 8, border: "1px solid #ccc", fontSize: 12, fontFamily: "monospace", boxSizing: "border-box", color: "#1A1A2E", background: "white" }}
      />
      <div style={{ display: "flex", gap: 10, margin: "10px 0 20px" }}>
        <button onClick={agregarMovimientosPegados} style={{ background: "#1F3864", color: "white", border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Procesar movimientos
        </button>
        {movimientos.length > 0 && (
          <button onClick={borrarMovimientos} style={{ background: "white", color: "#922B21", border: "1px solid #922B21", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Borrar movimientos ({movimientos.length})
          </button>
        )}
      </div>

      {movimientos.length > 0 && (
        <>
          {conciliacion.confirmables.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#145A32", marginBottom: 8 }}>
                ✓ Movimientos del banco que coinciden con cheques todavía no marcados como pagados
              </div>
              <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Fecha banco</th>
                      <th style={thStyle}>Importe</th>
                      <th style={thStyle}>N° Cheque</th>
                      <th style={thStyle}>Proveedor</th>
                      <th style={thStyle}>Estado actual</th>
                      <th style={thStyle}>Coincidencia</th>
                      <th style={thStyle}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {conciliacion.confirmables.map((m) => (
                      <tr key={m.id} style={{ background: "#D5F5E3", borderTop: "1px solid #eee" }}>
                        <td style={tdStyle}>{fmtDate(m.fecha)}</td>
                        <td style={tdStyle}>{fmtMoney(m.importe)}</td>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{m.cheque!.n_cheque || "-"}</td>
                        <td style={tdStyle}>{m.cheque!.proveedor}</td>
                        <td style={tdStyle}>{m.cheque!.estado}</td>
                        <td style={tdStyle}>
                          <span
                            style={{
                              fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 8,
                              background: m.matchPor === "comprobante" ? "#D5F5E3" : "#FDEBD0",
                              color: m.matchPor === "comprobante" ? "#145A32" : "#784212",
                            }}
                          >
                            {m.matchPor === "comprobante" ? "por N° cheque" : "por importe"}
                          </span>
                        </td>
                        <td style={tdStyle}>
                          <button
                            onClick={() => onConfirmarPago(m.cheque!.id, m.importe)}
                            style={{ background: "#145A32", color: "white", border: "none", borderRadius: 6, padding: "5px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}
                          >
                            Marcar pagado
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {conciliacion.sinCoincidencia.length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#784212", marginBottom: 8 }}>
                ⚠ Movimientos del banco sin ningún cheque que coincida
              </div>
              <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>Fecha banco</th>
                      <th style={thStyle}>Importe</th>
                      <th style={thStyle}>Descripción</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conciliacion.sinCoincidencia.map((m) => (
                      <tr key={m.id} style={{ background: "#FDEBD0", borderTop: "1px solid #eee" }}>
                        <td style={tdStyle}>{fmtDate(m.fecha)}</td>
                        <td style={tdStyle}>{fmtMoney(m.importe)}</td>
                        <td style={tdStyle}>
                          {m.descripcion || "-"}
                          {m.comprobante && (
                            <div style={{ fontSize: 11, color: "#922B21", fontWeight: 700, marginTop: 2 }}>
                              ⚠ El cheque N° {m.comprobante} no está cargado en el sistema (o el importe no coincide).
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
                Puede ser un cheque que todavía no cargaste, un gasto distinto, o un importe que no coincide exacto.
              </p>
            </div>
          )}

          {conciliacion.pagadosSinBanco.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#922B21", marginBottom: 8 }}>
                ⚠ Cheques marcados &quot;Pagado&quot; en el sistema que no aparecen en los movimientos que pegaste
              </div>
              <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>N° Cheque</th>
                      <th style={thStyle}>Proveedor</th>
                      <th style={thStyle}>Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conciliacion.pagadosSinBanco.map((c) => (
                      <tr key={c.id} style={{ background: "#FADBD8", borderTop: "1px solid #eee" }}>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{c.n_cheque || "-"}</td>
                        <td style={tdStyle}>{c.proveedor}</td>
                        <td style={tdStyle}>{fmtMoney(c.importe)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p style={{ fontSize: 11, color: "#888", marginTop: 6 }}>
                Puede ser normal si pegaste solo un resumen parcial del banco — revisá si corresponde.
              </p>
            </div>
          )}
        </>
      )}

      {movimientos.length === 0 && (
        <div style={{ fontSize: 12, color: "#888", padding: "20px 0", textAlign: "center" }}>
          Todavía no pegaste ningún movimiento bancario.
        </div>
      )}
    </div>
  );
}
