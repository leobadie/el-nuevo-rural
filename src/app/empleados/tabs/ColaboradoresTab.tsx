"use client";

import { useState } from "react";
import { Plus, Trash2, Pencil, Save, X } from "lucide-react";
import { fmtMoneyEmp } from "@/lib/empleados/calculos";
import { GREEN, inputStyle, thStyle, tdStyle } from "@/lib/empleados/estilos";
import type { Colaborador, NuevoColaborador, ParametrosEmpleados, TipoJornada, TipoPago } from "@/lib/empleados/types";

const emptyForm: NuevoColaborador = {
  codigo: "",
  nombre: "",
  area: "",
  cargo: "",
  tipo_pago: "Mensual",
  valor: 0,
  tipo_jornada: "Jornada Completa",
};

export default function ColaboradoresTab({
  colaboradores,
  parametros,
  onAdd,
  onUpdate,
  onDelete,
  onUpdateParametros,
}: {
  colaboradores: Colaborador[];
  parametros: ParametrosEmpleados;
  onAdd: (nuevo: NuevoColaborador) => Promise<void>;
  onUpdate: (id: string, patch: Partial<Colaborador>) => Promise<void>;
  onDelete: (id: string) => void;
  onUpdateParametros: (patch: Partial<ParametrosEmpleados>) => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NuevoColaborador>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Colaborador | null>(null);

  async function agregar() {
    if (!form.codigo.trim() || !form.nombre.trim()) {
      window.alert("Completá código y nombre.");
      return;
    }
    await onAdd(form);
    setForm(emptyForm);
    setShowForm(false);
  }

  function startEdit(c: Colaborador) {
    setEditingId(c.id);
    setEditForm({ ...c });
  }
  async function saveEdit() {
    if (!editForm) return;
    await onUpdate(editForm.id, editForm);
    setEditingId(null);
    setEditForm(null);
  }

  return (
    <div>
      <button
        onClick={() => setShowForm((s) => !s)}
        style={{ display: "flex", alignItems: "center", gap: 6, background: GREEN, color: "white", border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer", marginBottom: 16 }}
      >
        <Plus size={15} /> {showForm ? "Cerrar" : "Nuevo colaborador"}
      </button>

      {showForm && (
        <div style={{ background: "#FFF9C4", border: "1px solid #e6dc8f", borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700 }}>Código</label>
              <input style={inputStyle} value={form.codigo} onChange={(e) => setForm({ ...form, codigo: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700 }}>Apellido y Nombre</label>
              <input style={inputStyle} value={form.nombre} onChange={(e) => setForm({ ...form, nombre: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700 }}>Área</label>
              <input style={inputStyle} value={form.area ?? ""} onChange={(e) => setForm({ ...form, area: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700 }}>Cargo</label>
              <input style={inputStyle} value={form.cargo ?? ""} onChange={(e) => setForm({ ...form, cargo: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700 }}>Tipo de Pago</label>
              <select style={inputStyle} value={form.tipo_pago} onChange={(e) => setForm({ ...form, tipo_pago: e.target.value as TipoPago })}>
                <option>Jornal</option>
                <option>Semanal</option>
                <option>Mensual</option>
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700 }}>Valor</label>
              <input type="number" style={inputStyle} value={form.valor || ""} onChange={(e) => setForm({ ...form, valor: parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700 }}>Tipo de Jornada</label>
              <select style={inputStyle} value={form.tipo_jornada} onChange={(e) => setForm({ ...form, tipo_jornada: e.target.value as TipoJornada })}>
                <option>Jornada Completa</option>
                <option>Media Jornada</option>
              </select>
            </div>
          </div>
          <button onClick={agregar} style={{ marginTop: 12, background: GREEN, color: "white", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Guardar colaborador
          </button>
        </div>
      )}

      <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8, marginBottom: 24 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Código</th>
              <th style={thStyle}>Nombre</th>
              <th style={thStyle}>Área</th>
              <th style={thStyle}>Cargo</th>
              <th style={thStyle}>Tipo de Pago</th>
              <th style={thStyle}>Valor</th>
              <th style={thStyle}>Tipo de Jornada</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {colaboradores.length === 0 && (
              <tr>
                <td colSpan={8} style={{ ...tdStyle, textAlign: "center", color: "#888", padding: 24 }}>
                  Todavía no cargaste ningún colaborador.
                </td>
              </tr>
            )}
            {colaboradores.map((c) => {
              const isEditing = editingId === c.id;
              if (isEditing && editForm) {
                return (
                  <tr key={c.id} style={{ background: "#FFF9C4" }}>
                    <td style={tdStyle}>{c.codigo}</td>
                    <td style={tdStyle}><input style={inputStyle} value={editForm.nombre} onChange={(e) => setEditForm({ ...editForm, nombre: e.target.value })} /></td>
                    <td style={tdStyle}><input style={inputStyle} value={editForm.area ?? ""} onChange={(e) => setEditForm({ ...editForm, area: e.target.value })} /></td>
                    <td style={tdStyle}><input style={inputStyle} value={editForm.cargo ?? ""} onChange={(e) => setEditForm({ ...editForm, cargo: e.target.value })} /></td>
                    <td style={tdStyle}>
                      <select style={inputStyle} value={editForm.tipo_pago} onChange={(e) => setEditForm({ ...editForm, tipo_pago: e.target.value as TipoPago })}>
                        <option>Jornal</option>
                        <option>Semanal</option>
                        <option>Mensual</option>
                      </select>
                    </td>
                    <td style={tdStyle}>
                      <input type="number" style={inputStyle} value={editForm.valor} onChange={(e) => setEditForm({ ...editForm, valor: parseFloat(e.target.value) || 0 })} />
                    </td>
                    <td style={tdStyle}>
                      <select style={inputStyle} value={editForm.tipo_jornada} onChange={(e) => setEditForm({ ...editForm, tipo_jornada: e.target.value as TipoJornada })}>
                        <option>Jornada Completa</option>
                        <option>Media Jornada</option>
                      </select>
                    </td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={saveEdit} style={{ border: "none", background: "#D5F5E3", color: "#145A32", borderRadius: 4, padding: 6, cursor: "pointer" }}><Save size={14} /></button>
                        <button onClick={() => { setEditingId(null); setEditForm(null); }} style={{ border: "none", background: "#FADBD8", color: "#922B21", borderRadius: 4, padding: 6, cursor: "pointer" }}><X size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={c.id} style={{ borderTop: "1px solid #eee" }}>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{c.codigo}</td>
                  <td style={tdStyle}>{c.nombre}</td>
                  <td style={tdStyle}>{c.area || "-"}</td>
                  <td style={tdStyle}>{c.cargo || "-"}</td>
                  <td style={tdStyle}>{c.tipo_pago}</td>
                  <td style={tdStyle}>{fmtMoneyEmp(c.valor)}</td>
                  <td style={tdStyle}>{c.tipo_jornada}</td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => startEdit(c)} title="Editar" style={{ border: "none", background: "transparent", color: GREEN, cursor: "pointer" }}><Pencil size={14} /></button>
                      <button onClick={() => onDelete(c.id)} title="Eliminar" style={{ border: "none", background: "transparent", color: "#C0392B", cursor: "pointer" }}><Trash2 size={14} /></button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ background: "#F8F9FA", border: "1px solid #eee", borderRadius: 8, padding: 14 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: GREEN, marginBottom: 10 }}>Parámetros de horas extra</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700 }}>Horas jornada completa</label>
            <input type="number" step="0.01" style={inputStyle} value={parametros.horas_completa} onChange={(e) => onUpdateParametros({ horas_completa: parseFloat(e.target.value) || 0 })} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700 }}>Horas media jornada</label>
            <input type="number" step="0.01" style={inputStyle} value={parametros.horas_media} onChange={(e) => onUpdateParametros({ horas_media: parseFloat(e.target.value) || 0 })} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700 }}>Recargo HE 50%</label>
            <input type="number" step="0.01" style={inputStyle} value={parametros.recargo_50} onChange={(e) => onUpdateParametros({ recargo_50: parseFloat(e.target.value) || 0 })} />
          </div>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700 }}>Recargo HE 100%</label>
            <input type="number" step="0.01" style={inputStyle} value={parametros.recargo_100} onChange={(e) => onUpdateParametros({ recargo_100: parseFloat(e.target.value) || 0 })} />
          </div>
        </div>
      </div>
    </div>
  );
}
