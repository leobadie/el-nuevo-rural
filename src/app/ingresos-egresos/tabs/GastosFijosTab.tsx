"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, Pencil, Save, X } from "lucide-react";
import { estaCargadoEsteMes, fmtMoneyIE } from "@/lib/ingresos-egresos/calculos";
import { RED, inputStyle, thStyle, tdStyle } from "@/lib/ingresos-egresos/estilos";
import type { GastoFijo, Movimiento, NuevoGastoFijo } from "@/lib/ingresos-egresos/types";

const emptyForm: NuevoGastoFijo = { descripcion: "", categoria: "", monto: 0, proveedor: "" };

export default function GastosFijosTab({
  gastosFijos,
  movs,
  nombresCategorias,
  nombresProveedores,
  onAdd,
  onUpdate,
  onDelete,
  onCargar,
  pedirConfirmacion,
}: {
  gastosFijos: GastoFijo[];
  movs: Movimiento[];
  nombresCategorias: string[];
  nombresProveedores: string[];
  onAdd: (nuevo: NuevoGastoFijo) => Promise<void>;
  onUpdate: (id: string, patch: Partial<GastoFijo>) => Promise<void>;
  onDelete: (id: string) => void;
  onCargar: (g: GastoFijo) => Promise<void>;
  pedirConfirmacion: (message: string, onConfirm: () => void) => void;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NuevoGastoFijo>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<GastoFijo | null>(null);

  const cargadoEsteMes = useMemo(() => {
    const map = new Map<string, boolean>();
    gastosFijos.forEach((g) => map.set(g.id, estaCargadoEsteMes(movs, g.id)));
    return map;
  }, [gastosFijos, movs]);

  const totales = useMemo(() => {
    const activos = gastosFijos.filter((g) => g.activo);
    const cargados = activos.filter((g) => cargadoEsteMes.get(g.id));
    const pendientes = activos.filter((g) => !cargadoEsteMes.get(g.id));
    return {
      totalMensual: activos.reduce((s, g) => s + g.monto, 0),
      cargados,
      cargadosTotal: cargados.reduce((s, g) => s + g.monto, 0),
      pendientes,
      pendientesTotal: pendientes.reduce((s, g) => s + g.monto, 0),
    };
  }, [gastosFijos, cargadoEsteMes]);

  async function agregarGastoFijo() {
    if (!form.descripcion.trim() || !form.categoria || !form.monto) {
      window.alert("Completá descripción, categoría y monto.");
      return;
    }
    await onAdd(form);
    setForm(emptyForm);
    setShowForm(false);
  }

  function startEdit(g: GastoFijo) {
    setEditingId(g.id);
    setEditForm({ ...g });
  }
  async function saveEdit() {
    if (!editForm) return;
    await onUpdate(editForm.id, editForm);
    setEditingId(null);
    setEditForm(null);
  }

  function cargarTodosPendientes() {
    if (totales.pendientes.length === 0) {
      window.alert("No hay gastos fijos pendientes de cargar este mes.");
      return;
    }
    pedirConfirmacion(
      `Se van a crear ${totales.pendientes.length} movimientos por un total de ${fmtMoneyIE(totales.pendientesTotal)}. ¿Continuar?`,
      async () => {
        for (const g of totales.pendientes) {
          await onCargar(g);
        }
      },
    );
  }

  return (
    <div>
      <p style={{ fontSize: 11, color: "#888", marginBottom: 14 }}>
        Los gastos fijos son una plantilla — no se cargan solos. &quot;Cargar&quot; crea un movimiento de egreso fechado hoy.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 20 }}>
        <div style={{ background: "#F8F9FA", border: "1px solid #eee", borderRadius: 8, padding: "12px 10px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#666" }}>TOTAL MENSUAL</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1A1A2E" }}>{fmtMoneyIE(totales.totalMensual)}</div>
        </div>
        <div style={{ background: "#EAFAF1", borderRadius: 8, padding: "12px 10px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#1E7B34" }}>YA CARGADO ESTE MES</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#1E7B34" }}>{fmtMoneyIE(totales.cargadosTotal)}</div>
        </div>
        <div style={{ background: "#FDEBD0", borderRadius: 8, padding: "12px 10px" }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#784212" }}>PENDIENTE DE CARGAR</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: "#784212" }}>{fmtMoneyIE(totales.pendientesTotal)}</div>
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 16, flexWrap: "wrap" }}>
        <button onClick={() => setShowForm((s) => !s)} style={{ display: "flex", alignItems: "center", gap: 6, background: RED, color: "white", border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          <Plus size={15} /> {showForm ? "Cerrar" : "Nuevo gasto fijo"}
        </button>
        <button onClick={cargarTodosPendientes} style={{ background: "white", color: "#784212", border: "1px solid #784212", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Cargar todos los pendientes de este mes
        </button>
      </div>

      {showForm && (
        <div style={{ background: "#FFF9C4", border: "1px solid #e6dc8f", borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700 }}>Descripción</label>
              <input style={inputStyle} value={form.descripcion} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700 }}>Categoría</label>
              <select style={inputStyle} value={form.categoria} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
                <option value="">Elegir...</option>
                {nombresCategorias.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700 }}>Monto habitual</label>
              <input type="number" style={inputStyle} value={form.monto || ""} onChange={(e) => setForm({ ...form, monto: parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700 }}>Proveedor</label>
              <select style={inputStyle} value={form.proveedor ?? ""} onChange={(e) => setForm({ ...form, proveedor: e.target.value })}>
                <option value="">Sin proveedor</option>
                {nombresProveedores.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
          </div>
          <button onClick={agregarGastoFijo} style={{ marginTop: 12, background: RED, color: "white", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Guardar gasto fijo
          </button>
        </div>
      )}

      <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Descripción</th>
              <th style={thStyle}>Categoría</th>
              <th style={thStyle}>Monto habitual</th>
              <th style={thStyle}>Proveedor</th>
              <th style={thStyle}>Este mes</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {gastosFijos.length === 0 && (
              <tr>
                <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "#888", padding: 24 }}>
                  Todavía no cargaste ningún gasto fijo.
                </td>
              </tr>
            )}
            {gastosFijos.map((g) => {
              const isEditing = editingId === g.id;
              if (isEditing && editForm) {
                return (
                  <tr key={g.id} style={{ background: "#FFF9C4" }}>
                    <td style={tdStyle}><input style={inputStyle} value={editForm.descripcion} onChange={(e) => setEditForm({ ...editForm, descripcion: e.target.value })} /></td>
                    <td style={tdStyle}>
                      <select style={inputStyle} value={editForm.categoria} onChange={(e) => setEditForm({ ...editForm, categoria: e.target.value })}>
                        {nombresCategorias.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </td>
                    <td style={tdStyle}><input type="number" style={inputStyle} value={editForm.monto} onChange={(e) => setEditForm({ ...editForm, monto: parseFloat(e.target.value) || 0 })} /></td>
                    <td style={tdStyle}>
                      <select style={inputStyle} value={editForm.proveedor ?? ""} onChange={(e) => setEditForm({ ...editForm, proveedor: e.target.value })}>
                        <option value="">Sin proveedor</option>
                        {nombresProveedores.map((p) => (
                          <option key={p}>{p}</option>
                        ))}
                      </select>
                    </td>
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
              const cargado = cargadoEsteMes.get(g.id);
              return (
                <tr key={g.id} style={{ background: g.activo ? "white" : "#F5F5F5", color: g.activo ? "inherit" : "#999", borderTop: "1px solid #eee" }}>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{g.descripcion}</td>
                  <td style={tdStyle}>{g.categoria}</td>
                  <td style={tdStyle}>{fmtMoneyIE(g.monto)}</td>
                  <td style={tdStyle}>{g.proveedor || "-"}</td>
                  <td style={tdStyle}>
                    {cargado ? (
                      <span style={{ background: "#D5F5E3", color: "#145A32", fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 10 }}>Cargado</span>
                    ) : g.activo ? (
                      <button onClick={() => onCargar(g)} style={{ background: RED, color: "white", border: "none", borderRadius: 6, padding: "4px 10px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                        Cargar
                      </button>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <button onClick={() => onUpdate(g.id, { activo: !g.activo })} title={g.activo ? "Pausar" : "Reactivar"} style={{ border: "1px solid #ccc", background: "white", color: "#333", borderRadius: 4, padding: "4px 8px", fontSize: 10, cursor: "pointer" }}>
                        {g.activo ? "Pausar" : "Reactivar"}
                      </button>
                      <button onClick={() => startEdit(g)} title="Editar" style={{ border: "none", background: "transparent", color: RED, cursor: "pointer" }}><Pencil size={13} /></button>
                      <button onClick={() => onDelete(g.id)} title="Eliminar" style={{ border: "none", background: "transparent", color: "#C0392B", cursor: "pointer" }}><Trash2 size={13} /></button>
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
