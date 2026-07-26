"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, Pencil, Save, X } from "lucide-react";
import { fmtDate, fmtMoney } from "@/lib/cheques/calculos";
import { NAVY, inputStyle, thStyle, tdStyle } from "@/lib/cheques/estilos";
import type { ChequeTercero, NuevoChequeTercero } from "@/lib/cheques/types";

const emptyFormTercero: NuevoChequeTercero = {
  n_cheque: "",
  librador: "",
  banco: "",
  fecha_emision: "",
  fecha_cobro: "",
  importe: 0,
  observaciones: "",
};

const ESTADO_COLORES: Record<string, { bg: string; text: string }> = {
  "En cartera": { bg: "#FDEBD0", text: "#784212" },
  Entregado: { bg: "#D5F5E3", text: "#145A32" },
  Rechazado: { bg: "#FADBD8", text: "#922B21" },
  Depositado: { bg: "#F8F9FA", text: "#1A1A2E" },
};

export default function TercerosTab({
  terceros,
  onAdd,
  onUpdate,
  onDelete,
  onCambiarEstado,
}: {
  terceros: ChequeTercero[];
  onAdd: (nuevo: NuevoChequeTercero) => Promise<void>;
  onUpdate: (id: string, patch: Partial<ChequeTercero>) => Promise<void>;
  onDelete: (id: string) => void;
  onCambiarEstado: (id: string, estado: ChequeTercero["estado"]) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NuevoChequeTercero>(emptyFormTercero);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<ChequeTercero | null>(null);
  const [entregaId, setEntregaId] = useState<string | null>(null);
  const [entregaProveedor, setEntregaProveedor] = useState("");
  const [entregaFecha, setEntregaFecha] = useState("");

  const kpis = useMemo(() => {
    const enCartera = terceros.filter((t) => t.estado === "En cartera");
    const entregados = terceros.filter((t) => t.estado === "Entregado");
    const rechazados = terceros.filter((t) => t.estado === "Rechazado");
    const depositados = terceros.filter((t) => t.estado === "Depositado");
    const sum = (arr: ChequeTercero[]) => arr.reduce((s, t) => s + (Number(t.importe) || 0), 0);
    return {
      enCartera: sum(enCartera),
      enCarteraCant: enCartera.length,
      entregados: sum(entregados),
      entregadosCant: entregados.length,
      rechazados: sum(rechazados),
      depositados: sum(depositados),
    };
  }, [terceros]);

  async function agregarTercero() {
    if (!form.librador.trim() || !form.importe) return;
    await onAdd(form);
    setForm(emptyFormTercero);
    setShowForm(false);
  }

  function startEdit(t: ChequeTercero) {
    setEditingId(t.id);
    setEditForm({ ...t });
  }
  async function saveEdit() {
    if (!editForm) return;
    await onUpdate(editForm.id, editForm);
    setEditingId(null);
    setEditForm(null);
  }

  function abrirEntrega(t: ChequeTercero) {
    setEntregaId(t.id);
    setEntregaProveedor(t.entregado_a || "");
    setEntregaFecha(t.fecha_entrega || new Date().toISOString().slice(0, 10));
  }
  async function confirmarEntrega() {
    if (!entregaProveedor.trim()) {
      window.alert("Escribí a qué proveedor se lo entregaste.");
      return;
    }
    await onUpdate(entregaId!, { estado: "Entregado", entregado_a: entregaProveedor.trim(), fecha_entrega: entregaFecha });
    setEntregaId(null);
  }

  const ordenados = useMemo(
    () => [...terceros].sort((a) => (a.estado === "En cartera" ? -1 : 1)),
    [terceros],
  );

  return (
    <div>
      <p style={{ fontSize: 11, color: "#888", marginBottom: 14 }}>
        Cheques que recibiste de clientes (no son tuyos) y que tenés en cartera o le fuiste dando a tus propios proveedores como pago.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 20 }}>
        <div style={{ background: "#FDEBD0", borderRadius: 8, padding: "12px 10px" }}>
          <div style={{ fontSize: 10, color: "#784212", fontWeight: 700 }}>EN CARTERA ({kpis.enCarteraCant})</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#784212" }}>{fmtMoney(kpis.enCartera)}</div>
        </div>
        <div style={{ background: "#D5F5E3", borderRadius: 8, padding: "12px 10px" }}>
          <div style={{ fontSize: 10, color: "#145A32", fontWeight: 700 }}>ENTREGADOS ({kpis.entregadosCant})</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#145A32" }}>{fmtMoney(kpis.entregados)}</div>
        </div>
        <div style={{ background: "#FADBD8", borderRadius: 8, padding: "12px 10px" }}>
          <div style={{ fontSize: 10, color: "#922B21", fontWeight: 700 }}>RECHAZADOS</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#922B21" }}>{fmtMoney(kpis.rechazados)}</div>
        </div>
        <div style={{ background: "#F8F9FA", borderRadius: 8, padding: "12px 10px", border: "1px solid #eee" }}>
          <div style={{ fontSize: 10, color: "#666", fontWeight: 700 }}>DEPOSITADOS</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1A1A2E" }}>{fmtMoney(kpis.depositados)}</div>
        </div>
      </div>

      <button
        onClick={() => setShowForm((s) => !s)}
        style={{ display: "flex", alignItems: "center", gap: 6, background: NAVY, color: "white", border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 16 }}
      >
        <Plus size={15} /> {showForm ? "Cerrar" : "Nuevo cheque de tercero"}
      </button>

      {showForm && (
        <div style={{ background: "#FFF9C4", border: "1px solid #e6dc8f", borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700 }}>N° Cheque</label>
              <input style={inputStyle} value={form.n_cheque ?? ""} onChange={(e) => setForm({ ...form, n_cheque: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700 }}>Librador (quién lo firmó)</label>
              <input style={inputStyle} value={form.librador} onChange={(e) => setForm({ ...form, librador: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700 }}>Banco</label>
              <input style={inputStyle} value={form.banco ?? ""} onChange={(e) => setForm({ ...form, banco: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700 }}>Fecha emisión</label>
              <input type="date" style={inputStyle} value={form.fecha_emision ?? ""} onChange={(e) => setForm({ ...form, fecha_emision: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700 }}>Fecha de cobro</label>
              <input type="date" style={inputStyle} value={form.fecha_cobro ?? ""} onChange={(e) => setForm({ ...form, fecha_cobro: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700 }}>Importe</label>
              <input type="number" style={inputStyle} value={form.importe || ""} onChange={(e) => setForm({ ...form, importe: parseFloat(e.target.value) || 0 })} />
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11, fontWeight: 700 }}>Observaciones</label>
              <input style={inputStyle} value={form.observaciones ?? ""} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} />
            </div>
          </div>
          <button onClick={agregarTercero} style={{ marginTop: 12, background: NAVY, color: "white", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Guardar cheque
          </button>
        </div>
      )}

      {entregaId && (
        <div style={{ background: "#E6F1FB", border: "1px solid #85B7EB", borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 8 }}>¿A qué proveedor se lo entregaste?</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <input placeholder="Nombre del proveedor" value={entregaProveedor} onChange={(e) => setEntregaProveedor(e.target.value)} style={{ ...inputStyle, maxWidth: 220 }} />
            <input type="date" value={entregaFecha} onChange={(e) => setEntregaFecha(e.target.value)} style={{ ...inputStyle, maxWidth: 160 }} />
            <button onClick={confirmarEntrega} style={{ background: "#145A32", color: "white", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Confirmar entrega
            </button>
            <button onClick={() => setEntregaId(null)} style={{ background: "white", color: "#922B21", border: "1px solid #922B21", borderRadius: 6, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>N° Cheque</th>
              <th style={thStyle}>Librador</th>
              <th style={thStyle}>Banco</th>
              <th style={thStyle}>F. Cobro</th>
              <th style={thStyle}>Importe</th>
              <th style={thStyle}>Estado</th>
              <th style={thStyle}>Entregado a</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {terceros.length === 0 && (
              <tr>
                <td colSpan={8} style={{ ...tdStyle, textAlign: "center", color: "#888", padding: 24 }}>
                  Todavía no cargaste ningún cheque de tercero.
                </td>
              </tr>
            )}
            {ordenados.map((t) => {
              const isEditing = editingId === t.id;
              const style = ESTADO_COLORES[t.estado] || ESTADO_COLORES["En cartera"];
              if (isEditing && editForm) {
                return (
                  <tr key={t.id} style={{ background: "#FFF9C4" }}>
                    <td style={tdStyle}><input style={inputStyle} value={editForm.n_cheque ?? ""} onChange={(e) => setEditForm({ ...editForm, n_cheque: e.target.value })} /></td>
                    <td style={tdStyle}><input style={inputStyle} value={editForm.librador} onChange={(e) => setEditForm({ ...editForm, librador: e.target.value })} /></td>
                    <td style={tdStyle}><input style={inputStyle} value={editForm.banco ?? ""} onChange={(e) => setEditForm({ ...editForm, banco: e.target.value })} /></td>
                    <td style={tdStyle}><input type="date" style={inputStyle} value={editForm.fecha_cobro ?? ""} onChange={(e) => setEditForm({ ...editForm, fecha_cobro: e.target.value })} /></td>
                    <td style={tdStyle}><input type="number" style={inputStyle} value={editForm.importe} onChange={(e) => setEditForm({ ...editForm, importe: parseFloat(e.target.value) || 0 })} /></td>
                    <td style={tdStyle}>-</td>
                    <td style={tdStyle}>-</td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={saveEdit} style={{ border: "none", background: "#D5F5E3", color: "#145A32", borderRadius: 4, padding: 6, cursor: "pointer" }}><Save size={14} /></button>
                        <button onClick={() => setEditingId(null)} style={{ border: "none", background: "#FADBD8", color: "#922B21", borderRadius: 4, padding: 6, cursor: "pointer" }}><X size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={t.id} style={{ background: style.bg, borderTop: "1px solid #eee" }}>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{t.n_cheque || "-"}</td>
                  <td style={tdStyle}>{t.librador}</td>
                  <td style={tdStyle}>{t.banco || "-"}</td>
                  <td style={tdStyle}>{fmtDate(t.fecha_cobro)}</td>
                  <td style={tdStyle}>{fmtMoney(t.importe)}</td>
                  <td style={tdStyle}>
                    <span style={{ background: style.bg, color: style.text, fontWeight: 700, fontSize: 11, padding: "3px 8px", borderRadius: 10, border: `1px solid ${style.text}33` }}>
                      {t.estado}
                    </span>
                  </td>
                  <td style={tdStyle}>{t.entregado_a ? `${t.entregado_a}${t.fecha_entrega ? " (" + fmtDate(t.fecha_entrega) + ")" : ""}` : "-"}</td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {t.estado === "En cartera" && (
                        <>
                          <button onClick={() => abrirEntrega(t)} title="Entregar a proveedor" style={{ border: "none", background: "#1F3864", color: "white", borderRadius: 4, padding: "4px 8px", fontSize: 10, fontWeight: 700, cursor: "pointer" }}>
                            Entregar
                          </button>
                          <button onClick={() => onCambiarEstado(t.id, "Depositado")} title="Marcar como depositado" style={{ border: "1px solid #ccc", background: "white", color: "#333", borderRadius: 4, padding: "4px 8px", fontSize: 10, cursor: "pointer" }}>
                            Depositar
                          </button>
                          <button onClick={() => onCambiarEstado(t.id, "Rechazado")} title="Marcar como rechazado" style={{ border: "1px solid #922B21", background: "white", color: "#922B21", borderRadius: 4, padding: "4px 8px", fontSize: 10, cursor: "pointer" }}>
                            Rechazado
                          </button>
                        </>
                      )}
                      {t.estado !== "En cartera" && (
                        <button onClick={() => onCambiarEstado(t.id, "En cartera")} title="Volver a En cartera" style={{ border: "1px solid #ccc", background: "white", color: "#333", borderRadius: 4, padding: "4px 8px", fontSize: 10, cursor: "pointer" }}>
                          Revertir
                        </button>
                      )}
                      <button onClick={() => startEdit(t)} title="Editar" style={{ border: "none", background: "transparent", color: NAVY, cursor: "pointer" }}><Pencil size={13} /></button>
                      <button
                        onClick={() => onDelete(t.id)}
                        title="Eliminar"
                        style={{ border: "none", background: "transparent", color: "#C0392B", cursor: "pointer" }}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
