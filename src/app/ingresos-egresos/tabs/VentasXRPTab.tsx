"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { fmtDateIE, fmtMoneyIE } from "@/lib/ingresos-egresos/calculos";
import { RED, thStyle, tdStyle } from "@/lib/ingresos-egresos/estilos";
import { parseRendicionXRP, type RendicionXRP } from "@/lib/ingresos-egresos/xrp";
import type { VentaXRP } from "@/lib/ingresos-egresos/types";

const MEDIOS_VENTA = ["Efectivo", "Tarjeta de Crédito", "Cuenta Corriente", "No Definida"];
const MEDIOS_COBRO = ["Efectivo", "Tarjeta de Crédito", "Cuenta Corriente", "No Definida"];

interface ResultadoArchivo extends RendicionXRP {
  ok: boolean;
  nombreArchivo: string;
  error?: string;
}

export default function VentasXRPTab({
  ventasXRP,
  onConfirmarImportacion,
  onDelete,
}: {
  ventasXRP: VentaXRP[];
  onConfirmarImportacion: (preview: RendicionXRP[]) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  const [preview, setPreview] = useState<RendicionXRP[]>([]);
  const [error, setError] = useState("");

  const kpis = useMemo(() => {
    const totalVentas = ventasXRP.reduce((s, v) => s + (v.venta_total || 0), 0);
    const totalCobros = ventasXRP.reduce((s, v) => s + (v.cobro_total || 0), 0);
    const ventaPorMedio: Record<string, number> = {};
    const cobroPorMedio: Record<string, number> = {};
    ventasXRP.forEach((v) => {
      Object.entries(v.venta_por_medio || {}).forEach(([k, val]) => {
        ventaPorMedio[k] = (ventaPorMedio[k] || 0) + val;
      });
      Object.entries(v.cobro_por_medio || {}).forEach(([k, val]) => {
        cobroPorMedio[k] = (cobroPorMedio[k] || 0) + val;
      });
    });
    return { totalVentas, totalCobros, ventaPorMedio, cobroPorMedio };
  }, [ventasXRP]);

  const ordenadas = useMemo(() => [...ventasXRP].sort((a, b) => (a.fecha < b.fecha ? 1 : -1)), [ventasXRP]);

  async function procesarArchivos(files: FileList) {
    const lista = Array.from(files);
    const resultados: ResultadoArchivo[] = await Promise.all(
      lista.map(
        (file) =>
          new Promise<ResultadoArchivo>((resolve) => {
            const reader = new FileReader();
            reader.onload = () => {
              try {
                const parsed = parseRendicionXRP(String(reader.result));
                resolve({ ok: true, nombreArchivo: file.name, ...parsed });
              } catch (err) {
                resolve({
                  ok: false,
                  nombreArchivo: file.name,
                  error: err instanceof Error ? err.message : "Error desconocido",
                  fecha: "",
                  empresa: null,
                  venta_total: null,
                  cobro_total: null,
                  venta_por_medio: {},
                  cobro_por_medio: {},
                });
              }
            };
            reader.onerror = () =>
              resolve({
                ok: false,
                nombreArchivo: file.name,
                error: "No se pudo leer el archivo.",
                fecha: "",
                empresa: null,
                venta_total: null,
                cobro_total: null,
                venta_por_medio: {},
                cobro_por_medio: {},
              });
            reader.readAsText(file, "ISO-8859-1");
          }),
      ),
    );

    const errores = resultados.filter((r) => !r.ok);
    const exitosos = resultados.filter((r) => r.ok);
    setError(errores.length > 0 ? `No se pudieron procesar: ${errores.map((e) => `${e.nombreArchivo} (${e.error})`).join(", ")}` : "");

    const porFecha: Record<string, RendicionXRP> = {};
    exitosos.forEach((r) => {
      const { fecha, empresa, venta_total, cobro_total, venta_por_medio, cobro_por_medio } = r;
      porFecha[fecha] = { fecha, empresa, venta_total, cobro_total, venta_por_medio, cobro_por_medio };
    });
    setPreview(Object.values(porFecha).sort((a, b) => (a.fecha < b.fecha ? -1 : 1)));
  }

  async function confirmar() {
    await onConfirmarImportacion(preview);
    setPreview([]);
  }

  return (
    <div>
      <p style={{ fontSize: 11, color: "#888", marginBottom: 14 }}>
        Esta es una planilla separada de los movimientos cargados a mano — importá acá las rendiciones diarias del sistema XRP.
      </p>

      <label style={{ display: "inline-flex", alignItems: "center", gap: 6, background: "#25D366", color: "white", border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 16 }}>
        Importar rendición de XRP
        <input
          type="file"
          accept=".xml,.xls"
          multiple
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) procesarArchivos(e.target.files);
            e.target.value = "";
          }}
          style={{ display: "none" }}
        />
      </label>

      {error && (
        <div style={{ background: "#FADBD8", color: "#922B21", padding: "10px 14px", borderRadius: 8, marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {preview.length > 0 && (
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 10, marginBottom: 12 }}>
            {preview.map((p) => (
              <div key={p.fecha} style={{ background: "#FFF9C4", border: "1px solid #e6dc8f", borderRadius: 8, padding: 12, position: "relative" }}>
                <button
                  onClick={() => setPreview((prev) => prev.filter((x) => x.fecha !== p.fecha))}
                  style={{ position: "absolute", top: 6, right: 6, border: "none", background: "transparent", color: "#922B21", cursor: "pointer" }}
                >
                  <X size={14} />
                </button>
                <div style={{ fontWeight: 700, fontSize: 13 }}>{fmtDateIE(p.fecha)}</div>
                {p.empresa && <div style={{ fontSize: 11, color: "#666" }}>{p.empresa}</div>}
                <div style={{ fontSize: 12, marginTop: 6 }}>Venta total: {fmtMoneyIE(p.venta_total)}</div>
                <div style={{ fontSize: 12 }}>Cobro total: {fmtMoneyIE(p.cobro_total)}</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6 }}>
                  {Object.entries(p.venta_por_medio).map(([medio, val]) => (
                    <span key={medio} style={{ background: "#E6F1FB", color: "#0C447C", fontSize: 10, padding: "2px 6px", borderRadius: 8 }}>
                      Venta {medio}: {fmtMoneyIE(val)}
                    </span>
                  ))}
                  {Object.entries(p.cobro_por_medio).map(([medio, val]) => (
                    <span key={medio} style={{ background: "#EAFAF1", color: "#1E7B34", fontSize: 10, padding: "2px 6px", borderRadius: 8 }}>
                      Cobro {medio}: {fmtMoneyIE(val)}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={confirmar} style={{ background: RED, color: "white", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Confirmar e importar
            </button>
            <button onClick={() => setPreview([])} style={{ background: "white", color: "#666", border: "1px solid #ccc", borderRadius: 6, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 20 }}>
        <div style={{ background: "#EAFAF1", borderRadius: 8, padding: "12px 10px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#1E7B34" }}>TOTAL VENTAS CARGADAS</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1E7B34" }}>{fmtMoneyIE(kpis.totalVentas)}</div>
        </div>
        <div style={{ background: "#EBF2FA", borderRadius: 8, padding: "12px 10px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#1F4E78" }}>TOTAL COBROS CARGADOS</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1F4E78" }}>{fmtMoneyIE(kpis.totalCobros)}</div>
        </div>
        <div style={{ background: "#F8F9FA", border: "1px solid #eee", borderRadius: 8, padding: "12px 10px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#666" }}>DÍAS CARGADOS</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1A1A2E" }}>{ventasXRP.length}</div>
        </div>
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: RED, marginBottom: 8 }}>Ventas acumuladas por medio de pago</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 20 }}>
        {MEDIOS_VENTA.map((medio) => (
          <div key={medio} style={{ background: "#F8F9FA", border: "1px solid #eee", borderRadius: 8, padding: "10px" }}>
            <div style={{ fontSize: 10, color: "#666" }}>{medio}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1A1A2E" }}>{fmtMoneyIE(kpis.ventaPorMedio[medio] || 0)}</div>
          </div>
        ))}
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: RED, marginBottom: 8 }}>Cobros acumulados por medio de pago</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 20 }}>
        {MEDIOS_COBRO.map((medio) => (
          <div key={medio} style={{ background: "#F8F9FA", border: "1px solid #eee", borderRadius: 8, padding: "10px" }}>
            <div style={{ fontSize: 10, color: "#666" }}>{medio}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: "#1A1A2E" }}>{fmtMoneyIE(kpis.cobroPorMedio[medio] || 0)}</div>
          </div>
        ))}
      </div>

      <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Fecha</th>
              <th style={thStyle}>Venta Efvo.</th>
              <th style={thStyle}>Venta Cta.Cte.</th>
              <th style={thStyle}>Venta No Def.</th>
              <th style={thStyle}>Cobro Efvo.</th>
              <th style={thStyle}>Cobro Tarjeta</th>
              <th style={thStyle}>Total Venta</th>
              <th style={thStyle}>Total Cobro</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {ordenadas.length === 0 && (
              <tr>
                <td colSpan={9} style={{ ...tdStyle, textAlign: "center", color: "#888", padding: 24 }}>
                  Todavía no importaste ninguna rendición.
                </td>
              </tr>
            )}
            {ordenadas.map((v, i) => (
              <tr key={v.id} style={{ background: i % 2 === 1 ? "#F2F6FC" : "white", borderTop: "1px solid #eee" }}>
                <td style={{ ...tdStyle, fontWeight: 700 }}>{fmtDateIE(v.fecha)}</td>
                <td style={tdStyle}>{fmtMoneyIE(v.venta_por_medio?.["Efectivo"] || 0)}</td>
                <td style={tdStyle}>{fmtMoneyIE(v.venta_por_medio?.["Cuenta Corriente"] || 0)}</td>
                <td style={tdStyle}>{fmtMoneyIE(v.venta_por_medio?.["No Definida"] || 0)}</td>
                <td style={tdStyle}>{fmtMoneyIE(v.cobro_por_medio?.["Efectivo"] || 0)}</td>
                <td style={tdStyle}>{fmtMoneyIE(v.cobro_por_medio?.["Tarjeta de Crédito"] || 0)}</td>
                <td style={{ ...tdStyle, fontWeight: 700 }}>{fmtMoneyIE(v.venta_total)}</td>
                <td style={{ ...tdStyle, fontWeight: 700 }}>{fmtMoneyIE(v.cobro_total)}</td>
                <td style={tdStyle}>
                  <button onClick={() => onDelete(v.id)} title="Eliminar" style={{ border: "none", background: "transparent", color: "#C0392B", cursor: "pointer" }}>
                    <X size={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
