"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, Pencil, Save, X, AlertTriangle, Search, Copy } from "lucide-react";
import { fmtDateIE, fmtMoneyIE, getSortValueIE } from "@/lib/ingresos-egresos/calculos";
import { RED, inputStyle, thStyle, tdStyle } from "@/lib/ingresos-egresos/estilos";
import type {
  Categoria,
  Movimiento,
  MovimientoEnriquecido,
  NuevoMovimiento,
  Proveedor,
  SortConfigIE,
} from "@/lib/ingresos-egresos/types";

const OTRO = "Otro";

const emptyForm: NuevoMovimiento = {
  fecha: "",
  descripcion: "",
  categoria: "",
  ingreso: null,
  egreso: null,
  proveedor: "",
  medio_pago: "Efectivo",
  n_cheque_pago: "",
  fecha_cobro_cheque_pago: "",
  gasto_fijo_id: null,
};

function descargarArchivo(contenido: string, nombre: string, tipo: string) {
  const blob = new Blob([contenido], { type: tipo });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nombre;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
function fechaArchivo() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function csvEscape(v: unknown) {
  const s = String(v ?? "");
  return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function MovimientosTab({
  movs,
  enriched,
  esAdmin,
  categorias,
  proveedores,
  limites,
  onAdd,
  onUpdate,
  onDelete,
  onRestaurarBackup,
  onAddCategoria,
  onDeleteCategoria,
  onAddProveedor,
  onRenameProveedor,
  onDeleteProveedor,
  onSetTelefonoProveedor,
}: {
  movs: Movimiento[];
  enriched: MovimientoEnriquecido[];
  esAdmin: boolean;
  categorias: Categoria[];
  proveedores: Proveedor[];
  limites: Record<string, number>;
  onAdd: (nuevo: NuevoMovimiento) => Promise<Movimiento | null>;
  onUpdate: (id: string, patch: Movimiento) => Promise<void>;
  onDelete: (id: string) => void;
  onRestaurarBackup: (movs: unknown[], limites: Record<string, number>) => Promise<void>;
  onAddCategoria: (nombre: string) => Promise<void>;
  onDeleteCategoria: (id: string) => void;
  onAddProveedor: (nombre: string) => Promise<void>;
  onRenameProveedor: (id: string, nombreViejo: string, nombreNuevo: string) => Promise<void>;
  onDeleteProveedor: (id: string) => void;
  onSetTelefonoProveedor: (id: string, telefono: string) => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NuevoMovimiento>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Movimiento | null>(null);
  const [search, setSearch] = useState("");
  const [sortConfig, setSortConfig] = useState<SortConfigIE>({ key: null, dir: "asc" });
  const [showCategorias, setShowCategorias] = useState(false);
  const [nuevaCategoria, setNuevaCategoria] = useState("");
  const [showProveedores, setShowProveedores] = useState(false);
  const [nuevoProveedor, setNuevoProveedor] = useState("");
  const [editandoProveedorId, setEditandoProveedorId] = useState<string | null>(null);
  const [editProveedorValor, setEditProveedorValor] = useState("");

  const nombresCategorias = useMemo(() => categorias.map((c) => c.nombre), [categorias]);
  const nombresProveedoresSelect = useMemo(() => [...proveedores.map((p) => p.nombre), OTRO], [proveedores]);

  const totales = useMemo(() => {
    const ingresos = movs.reduce((s, m) => s + (Number(m.ingreso) || 0), 0);
    const egresosCaja = movs.filter((m) => m.medio_pago !== "Cheque").reduce((s, m) => s + (Number(m.egreso) || 0), 0);
    const egresosTotales = movs.reduce((s, m) => s + (Number(m.egreso) || 0), 0);
    return { ingresos, egresos: egresosCaja, pagadoConChequeTotal: egresosTotales - egresosCaja, saldo: ingresos - egresosCaja };
  }, [movs]);

  const alertas = useMemo(() => {
    let sinCategoria = 0, pagoSinProveedor = 0, sinMonto = 0;
    movs.forEach((m) => {
      if (m.fecha && !m.categoria) sinCategoria++;
      if (m.categoria === "Pago a Proveedor" && !m.proveedor) pagoSinProveedor++;
      if (m.fecha && !(Number(m.ingreso) > 0) && !(Number(m.egreso) > 0)) sinMonto++;
    });
    return { sinCategoria, pagoSinProveedor, sinMonto };
  }, [movs]);

  const filtered = useMemo(() => {
    let list = enriched;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (m) =>
          (m.descripcion || "").toLowerCase().includes(q) ||
          (m.categoria || "").toLowerCase().includes(q) ||
          (m.proveedor || "").toLowerCase().includes(q),
      );
    }
    if (sortConfig.key) {
      const dir = sortConfig.dir === "asc" ? 1 : -1;
      return [...list].sort((a, b) => {
        const va = getSortValueIE(a, sortConfig.key!);
        const vb = getSortValueIE(b, sortConfig.key!);
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
        return 0;
      });
    }
    return [...list].sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
  }, [enriched, search, sortConfig]);

  function toggleSort(key: string) {
    setSortConfig((prev) => {
      if (prev.key !== key) return { key, dir: "asc" };
      if (prev.dir === "asc") return { key, dir: "desc" };
      return { key: null, dir: "asc" };
    });
  }
  function sortableHeader(label: string, key: string) {
    const active = sortConfig.key === key;
    return (
      <th style={{ ...thStyle, cursor: "pointer", userSelect: "none" }} onClick={() => toggleSort(key)} title="Tocá para ordenar">
        {label} {active ? (sortConfig.dir === "asc" ? "▲" : "▼") : ""}
      </th>
    );
  }

  async function addMov() {
    if (!form.fecha || (!form.ingreso && !form.egreso)) {
      window.alert("Completá al menos la fecha y un monto (ingreso o egreso).");
      return;
    }
    const nuevo = await onAdd(form);
    if (nuevo) {
      setForm(emptyForm);
      setShowForm(false);
    }
  }

  function startEdit(m: MovimientoEnriquecido) {
    setEditingId(m.id);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- strip the enriched-only field
    const { saldoAcumulado, ...mov } = m;
    setEditForm(mov);
  }
  async function saveEdit() {
    if (!editForm) return;
    await onUpdate(editForm.id, editForm);
    setEditingId(null);
    setEditForm(null);
  }

  async function duplicarMov(m: MovimientoEnriquecido) {
    await onAdd({
      fecha: new Date().toISOString().slice(0, 10),
      descripcion: m.descripcion,
      categoria: m.categoria,
      ingreso: null,
      egreso: m.egreso,
      proveedor: m.proveedor,
      medio_pago: null,
      n_cheque_pago: null,
      fecha_cobro_cheque_pago: null,
      gasto_fijo_id: null,
    });
  }

  function exportarBackup() {
    descargarArchivo(
      JSON.stringify({ movs, limites, exportadoEl: new Date().toISOString() }, null, 2),
      `backup-ingresos-egresos-${fechaArchivo()}.json`,
      "application/json",
    );
  }
  function exportarCSV() {
    const headers = ["Fecha", "Descripcion", "Categoria", "Ingreso", "Egreso", "Proveedor", "Saldo Acumulado"];
    const lineas = [headers.join(";")];
    enriched.forEach((m) => {
      lineas.push(
        [csvEscape(m.fecha), csvEscape(m.descripcion), csvEscape(m.categoria), csvEscape(m.ingreso), csvEscape(m.egreso), csvEscape(m.proveedor), csvEscape(m.saldoAcumulado)].join(";"),
      );
    });
    descargarArchivo("﻿" + lineas.join("\n"), `ingresos-egresos-${fechaArchivo()}.csv`, "text/csv;charset=utf-8");
  }
  function restaurarBackup(file: File) {
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const data = JSON.parse(String(reader.result));
        if (!Array.isArray(data.movs)) throw new Error("formato inválido");
        await onRestaurarBackup(data.movs, data.limites || {});
      } catch {
        window.alert("El archivo no es un backup válido de esta app.");
      }
    };
    reader.readAsText(file);
  }

  async function agregarCategoria() {
    if (!nuevaCategoria.trim()) return;
    await onAddCategoria(nuevaCategoria.trim());
    setNuevaCategoria("");
  }
  async function agregarProveedor() {
    if (!nuevoProveedor.trim()) return;
    if (proveedores.some((p) => p.nombre.toLowerCase() === nuevoProveedor.trim().toLowerCase())) return;
    await onAddProveedor(nuevoProveedor.trim());
    setNuevoProveedor("");
  }
  function empezarEditarProveedor(p: Proveedor) {
    setEditandoProveedorId(p.id);
    setEditProveedorValor(p.nombre);
  }
  async function guardarEditProveedor(p: Proveedor) {
    if (editProveedorValor.trim() && editProveedorValor.trim() !== p.nombre) {
      await onRenameProveedor(p.id, p.nombre, editProveedorValor.trim());
    }
    setEditandoProveedorId(null);
  }

  const mostrarMedioPago = !!form.egreso;
  const mostrarChequeCampos = form.medio_pago === "Cheque" && mostrarMedioPago;

  return (
    <>
      {(alertas.sinCategoria > 0 || alertas.pagoSinProveedor > 0 || alertas.sinMonto > 0) && (
        <div style={{ background: "#FADBD8", color: "#922B21", padding: "10px 14px", borderRadius: 8, marginBottom: 16, display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700, flexWrap: "wrap" }}>
          <AlertTriangle size={16} />
          {alertas.sinCategoria > 0 && <span>{alertas.sinCategoria} sin categoría</span>}
          {alertas.pagoSinProveedor > 0 && <span>{alertas.pagoSinProveedor} pago a proveedor sin proveedor</span>}
          {alertas.sinMonto > 0 && <span>{alertas.sinMonto} sin monto</span>}
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10, marginBottom: 12 }}>
        <div style={{ background: "#EAFAF1", color: "#1E7B34", borderRadius: 8, padding: "12px 10px" }}>
          <div style={{ fontSize: 10, fontWeight: 700 }}>TOTAL INGRESOS</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{fmtMoneyIE(totales.ingresos)}</div>
        </div>
        <div style={{ background: "#FDEDEC", color: "#8C0000", borderRadius: 8, padding: "12px 10px" }}>
          <div style={{ fontSize: 10, fontWeight: 700 }}>EGRESOS EN CAJA</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{fmtMoneyIE(totales.egresos)}</div>
        </div>
        <div style={{ background: "#EBF2FA", color: "#1F4E78", borderRadius: 8, padding: "12px 10px" }}>
          <div style={{ fontSize: 10, fontWeight: 700 }}>SALDO</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{fmtMoneyIE(totales.saldo)}</div>
        </div>
      </div>

      {totales.pagadoConChequeTotal > 0 && (
        <div style={{ background: "#E6F1FB", color: "#0C447C", padding: "8px 12px", borderRadius: 6, marginBottom: 16, fontSize: 12 }}>
          Hay {fmtMoneyIE(totales.pagadoConChequeTotal)} pagados con cheque que todavía no salieron de la caja.
        </div>
      )}

      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={() => setShowForm((s) => !s)} style={{ display: "flex", alignItems: "center", gap: 6, background: RED, color: "white", border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          <Plus size={15} /> {showForm ? "Cerrar" : "Nuevo movimiento"}
        </button>
        <button onClick={exportarBackup} style={{ background: "white", color: "#145A32", border: "1px solid #145A32", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Descargar backup
        </button>
        <button onClick={exportarCSV} style={{ background: "white", color: "#145A32", border: "1px solid #145A32", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Exportar CSV
        </button>
        {esAdmin && (
          <label style={{ display: "flex", alignItems: "center", gap: 6, background: "white", color: "#784212", border: "1px solid #784212", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Restaurar backup
            <input
              type="file"
              accept="application/json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) restaurarBackup(file);
                e.target.value = "";
              }}
              style={{ display: "none" }}
            />
          </label>
        )}
        <button onClick={() => setShowProveedores((s) => !s)} style={{ background: "white", color: RED, border: `1px solid ${RED}`, borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Gestionar proveedores
        </button>
        <button onClick={() => setShowCategorias((s) => !s)} style={{ background: "white", color: RED, border: `1px solid ${RED}`, borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Gestionar categorías
        </button>
        <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 260 }}>
          <Search size={14} style={{ position: "absolute", left: 8, top: 9, color: "#888" }} />
          <input placeholder="Buscar descripción, categoría, proveedor..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...inputStyle, paddingLeft: 28 }} />
        </div>
      </div>

      {showCategorias && (
        <div style={{ background: "#F8F9FA", border: "1px solid #eee", borderRadius: 8, padding: 14, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input
              placeholder="Nueva categoría"
              value={nuevaCategoria}
              onChange={(e) => setNuevaCategoria(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && agregarCategoria()}
              style={{ ...inputStyle, maxWidth: 240 }}
            />
            <button onClick={agregarCategoria} style={{ background: RED, color: "white", border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Agregar
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {categorias.map((c) => (
              <span key={c.id} style={{ background: "white", border: "1px solid #ccc", borderRadius: 14, padding: "4px 10px", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                {c.nombre}
                <X size={12} style={{ cursor: "pointer" }} onClick={() => onDeleteCategoria(c.id)} />
              </span>
            ))}
          </div>
        </div>
      )}

      {showProveedores && (
        <div style={{ background: "#F8F9FA", border: "1px solid #eee", borderRadius: 8, padding: 14, marginBottom: 16 }}>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input
              placeholder="Nuevo proveedor"
              value={nuevoProveedor}
              onChange={(e) => setNuevoProveedor(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && agregarProveedor()}
              style={{ ...inputStyle, maxWidth: 240 }}
            />
            <button onClick={agregarProveedor} style={{ background: RED, color: "white", border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Agregar
            </button>
          </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
            {proveedores.map((p) =>
              editandoProveedorId === p.id ? (
                <span key={p.id} style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <input value={editProveedorValor} onChange={(e) => setEditProveedorValor(e.target.value)} style={{ ...inputStyle, width: 160 }} />
                  <Save size={14} style={{ cursor: "pointer", color: "#145A32" }} onClick={() => guardarEditProveedor(p)} />
                  <X size={14} style={{ cursor: "pointer" }} onClick={() => setEditandoProveedorId(null)} />
                </span>
              ) : (
                <span key={p.id} style={{ background: "white", border: "1px solid #ccc", borderRadius: 14, padding: "4px 10px", fontSize: 12, display: "flex", alignItems: "center", gap: 6 }}>
                  {p.nombre}
                  <Pencil size={11} style={{ cursor: "pointer" }} onClick={() => empezarEditarProveedor(p)} />
                  <X size={12} style={{ cursor: "pointer" }} onClick={() => onDeleteProveedor(p.id)} />
                </span>
              ),
            )}
          </div>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#666", marginBottom: 8 }}>Teléfonos (para pedidos por WhatsApp)</div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 8 }}>
            {proveedores.map((p) => (
              <div key={p.id}>
                <label style={{ fontSize: 11 }}>{p.nombre}</label>
                <input
                  defaultValue={p.telefono || ""}
                  placeholder="+54 9..."
                  onBlur={(e) => onSetTelefonoProveedor(p.id, e.target.value)}
                  style={inputStyle}
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {showForm && (
        <div style={{ background: "#FFF9C4", border: "1px solid #e6dc8f", borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700 }}>Fecha</label>
              <input type="date" style={inputStyle} value={form.fecha} onChange={(e) => setForm({ ...form, fecha: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700 }}>Descripción</label>
              <input style={inputStyle} value={form.descripcion ?? ""} onChange={(e) => setForm({ ...form, descripcion: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700 }}>Categoría</label>
              <select style={inputStyle} value={form.categoria ?? ""} onChange={(e) => setForm({ ...form, categoria: e.target.value })}>
                <option value="">Elegir...</option>
                {nombresCategorias.map((c) => (
                  <option key={c}>{c}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700 }}>Monto Ingreso</label>
              <input type="number" style={inputStyle} value={form.ingreso ?? ""} onChange={(e) => setForm({ ...form, ingreso: parseFloat(e.target.value) || null })} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700 }}>Monto Egreso</label>
              <input type="number" style={inputStyle} value={form.egreso ?? ""} onChange={(e) => setForm({ ...form, egreso: parseFloat(e.target.value) || null })} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700 }}>Proveedor</label>
              <select style={inputStyle} value={form.proveedor ?? ""} onChange={(e) => setForm({ ...form, proveedor: e.target.value })}>
                <option value="">Sin proveedor</option>
                {nombresProveedoresSelect.map((p) => (
                  <option key={p}>{p}</option>
                ))}
              </select>
            </div>
            {mostrarMedioPago && (
              <div>
                <label style={{ fontSize: 11, fontWeight: 700 }}>Medio de pago</label>
                <select style={inputStyle} value={form.medio_pago ?? "Efectivo"} onChange={(e) => setForm({ ...form, medio_pago: e.target.value as NuevoMovimiento["medio_pago"] })}>
                  <option>Efectivo</option>
                  <option>Transferencia</option>
                  {esAdmin && <option>Cheque</option>}
                </select>
              </div>
            )}
            {mostrarChequeCampos && (
              <>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700 }}>N° de Cheque</label>
                  <input style={inputStyle} value={form.n_cheque_pago ?? ""} onChange={(e) => setForm({ ...form, n_cheque_pago: e.target.value })} />
                </div>
                <div>
                  <label style={{ fontSize: 11, fontWeight: 700 }}>Fecha de cobro del cheque</label>
                  <input type="date" style={inputStyle} value={form.fecha_cobro_cheque_pago ?? ""} onChange={(e) => setForm({ ...form, fecha_cobro_cheque_pago: e.target.value })} />
                </div>
              </>
            )}
          </div>
          {mostrarChequeCampos && (
            <div style={{ background: "#E6F1FB", color: "#0C447C", padding: "8px 12px", borderRadius: 6, marginTop: 10, fontSize: 12 }}>
              Este pago no va a contar en la caja de hoy y se va a crear automáticamente un cheque en Control de Cheques.
            </div>
          )}
          <button onClick={addMov} style={{ marginTop: 12, background: RED, color: "white", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Guardar movimiento
          </button>
        </div>
      )}

      <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {sortableHeader("Fecha", "fecha")}
              {sortableHeader("Descripción", "descripcion")}
              {sortableHeader("Categoría", "categoria")}
              {sortableHeader("Ingreso", "ingreso")}
              {sortableHeader("Egreso", "egreso")}
              {sortableHeader("Proveedor", "proveedor")}
              {sortableHeader("Saldo Acum.", "saldoAcumulado")}
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} style={{ ...tdStyle, textAlign: "center", color: "#888", padding: 24 }}>
                  {movs.length === 0 ? "Todavía no cargaste ningún movimiento." : "Ningún movimiento coincide con el filtro."}
                </td>
              </tr>
            )}
            {filtered.map((m) => {
              const isEditing = editingId === m.id;
              if (isEditing && editForm) {
                const editMostrarMedioPago = !!editForm.egreso;
                const editMostrarCheque = editForm.medio_pago === "Cheque" && editMostrarMedioPago;
                return (
                  <tr key={m.id} style={{ background: "#FFF9C4" }}>
                    <td style={tdStyle}><input type="date" style={inputStyle} value={editForm.fecha} onChange={(e) => setEditForm({ ...editForm, fecha: e.target.value })} /></td>
                    <td style={tdStyle}><input style={inputStyle} value={editForm.descripcion ?? ""} onChange={(e) => setEditForm({ ...editForm, descripcion: e.target.value })} /></td>
                    <td style={tdStyle}>
                      <select style={inputStyle} value={editForm.categoria ?? ""} onChange={(e) => setEditForm({ ...editForm, categoria: e.target.value })}>
                        <option value="">Elegir...</option>
                        {nombresCategorias.map((c) => (
                          <option key={c}>{c}</option>
                        ))}
                      </select>
                    </td>
                    <td style={tdStyle}><input type="number" style={inputStyle} value={editForm.ingreso ?? ""} onChange={(e) => setEditForm({ ...editForm, ingreso: parseFloat(e.target.value) || null })} /></td>
                    <td style={tdStyle}>
                      <input type="number" style={inputStyle} value={editForm.egreso ?? ""} onChange={(e) => setEditForm({ ...editForm, egreso: parseFloat(e.target.value) || null })} />
                      {editMostrarMedioPago && (
                        <select style={{ ...inputStyle, marginTop: 4 }} value={editForm.medio_pago ?? "Efectivo"} onChange={(e) => setEditForm({ ...editForm, medio_pago: e.target.value as Movimiento["medio_pago"] })}>
                          <option>Efectivo</option>
                          <option>Transferencia</option>
                          {(esAdmin || editForm.medio_pago === "Cheque") && <option>Cheque</option>}
                        </select>
                      )}
                      {editMostrarCheque && (
                        <>
                          <input placeholder="N° cheque" style={{ ...inputStyle, marginTop: 4 }} value={editForm.n_cheque_pago ?? ""} onChange={(e) => setEditForm({ ...editForm, n_cheque_pago: e.target.value })} />
                          <input type="date" style={{ ...inputStyle, marginTop: 4 }} value={editForm.fecha_cobro_cheque_pago ?? ""} onChange={(e) => setEditForm({ ...editForm, fecha_cobro_cheque_pago: e.target.value })} />
                        </>
                      )}
                    </td>
                    <td style={tdStyle}>
                      <select style={inputStyle} value={editForm.proveedor ?? ""} onChange={(e) => setEditForm({ ...editForm, proveedor: e.target.value })}>
                        <option value="">Sin proveedor</option>
                        {nombresProveedoresSelect.map((p) => (
                          <option key={p}>{p}</option>
                        ))}
                      </select>
                    </td>
                    <td style={tdStyle}>-</td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={saveEdit} style={{ border: "none", background: "#D5F5E3", color: "#145A32", borderRadius: 4, padding: 6, cursor: "pointer" }}><Save size={14} /></button>
                        <button onClick={() => { setEditingId(null); setEditForm(null); }} style={{ border: "none", background: "#FADBD8", color: "#922B21", borderRadius: 4, padding: 6, cursor: "pointer" }}><X size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              }
              const sinMonto = !(Number(m.ingreso) > 0) && !(Number(m.egreso) > 0);
              const faltaProveedor = m.categoria === "Pago a Proveedor" && !m.proveedor;
              const faltaCategoria = !m.categoria;
              const bg = sinMonto ? "#F5B7B1" : faltaProveedor ? "#FADBD8" : faltaCategoria ? "#FDEBD0" : "white";
              return (
                <tr key={m.id} style={{ background: bg, borderTop: "1px solid #eee" }}>
                  <td style={tdStyle}>{fmtDateIE(m.fecha)}</td>
                  <td style={tdStyle}>{m.descripcion || "-"}</td>
                  <td style={tdStyle}>{m.categoria || "-"}</td>
                  <td style={tdStyle}>{m.ingreso ? fmtMoneyIE(m.ingreso) : "-"}</td>
                  <td style={tdStyle}>
                    {m.egreso ? fmtMoneyIE(m.egreso) : "-"}
                    {m.medio_pago === "Cheque" && (
                      <span style={{ marginLeft: 6, background: "#8C0000", color: "white", fontSize: 9, padding: "1px 5px", borderRadius: 4 }}>CHEQUE</span>
                    )}
                  </td>
                  <td style={tdStyle}>{m.proveedor || "-"}</td>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>{fmtMoneyIE(m.saldoAcumulado)}</td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => startEdit(m)} title="Editar" style={{ border: "none", background: "transparent", color: RED, cursor: "pointer" }}><Pencil size={14} /></button>
                      <button onClick={() => duplicarMov(m)} title="Duplicar" style={{ border: "none", background: "transparent", color: "#5F5E5A", cursor: "pointer" }}><Copy size={14} /></button>
                      {esAdmin && (
                        <button onClick={() => onDelete(m.id)} title="Eliminar" style={{ border: "none", background: "transparent", color: "#C0392B", cursor: "pointer" }}><Trash2 size={14} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
