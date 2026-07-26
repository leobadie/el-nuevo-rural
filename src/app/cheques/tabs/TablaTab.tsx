"use client";

import { useMemo, useState } from "react";
import {
  Plus, Trash2, Pencil, Save, X, AlertTriangle, Search, Copy,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid,
} from "recharts";
import {
  buildWeeklyFlow, buildProviderConcentration, fmtMoney, fmtDate, getSortValue, toDate,
} from "@/lib/cheques/calculos";
import { ESTADO_STYLES, NAVY, PIE_COLORS, inputStyle, thStyle, tdStyle } from "@/lib/cheques/estilos";
import type { Cheque, ChequeEnriquecido, EstadoCheque, NuevoCheque, SortConfig } from "@/lib/cheques/types";

const emptyForm: NuevoCheque = {
  n_cheque: "",
  proveedor: "",
  fecha_emision: "",
  fecha_cobro: "",
  importe: 0,
  debito_banco: null,
  rechazado: false,
  observaciones: "",
  tipo: "Físico",
  entregado: false,
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

function generarTextoRecordatorio(enriched: ChequeEnriquecido[]) {
  const relevantes = enriched.filter((c) => c.estado === "Vencido" || c.estado === "Próximo");
  if (relevantes.length === 0) {
    return "No hay cheques vencidos ni por vencer en los próximos 7 días. 🎉";
  }
  const vencidos = relevantes.filter((c) => c.estado === "Vencido").sort((a, b) => (a.dias ?? 0) - (b.dias ?? 0));
  const proximos = relevantes.filter((c) => c.estado === "Próximo").sort((a, b) => (a.dias ?? 0) - (b.dias ?? 0));
  let texto = `*Cheques El Nuevo Rural — ${new Date().toLocaleDateString("es-AR")}*\n`;
  if (vencidos.length > 0) {
    texto += `\n🔴 *Vencidos (${vencidos.length})*\n`;
    vencidos.forEach((c) => {
      texto += `• ${c.proveedor} — ${fmtMoney(c.importe)} — hace ${Math.abs(c.dias ?? 0)} días (N° ${c.n_cheque || "-"})\n`;
    });
  }
  if (proximos.length > 0) {
    texto += `\n🟠 *Vencen esta semana (${proximos.length})*\n`;
    proximos.forEach((c) => {
      texto += `• ${c.proveedor} — ${fmtMoney(c.importe)} — ${fmtDate(c.fecha_cobro)} (N° ${c.n_cheque || "-"})\n`;
    });
  }
  const total = relevantes.reduce((s, c) => s + (Number(c.importe) || 0), 0);
  texto += `\n*Total a cubrir: ${fmtMoney(total)}*`;
  return texto;
}

export default function TablaTab({
  cheques,
  enriched,
  esAdmin,
  onAdd,
  onUpdate,
  onDelete,
  onDuplicate,
  onRestaurarBackup,
}: {
  cheques: Cheque[];
  enriched: ChequeEnriquecido[];
  esAdmin: boolean;
  onAdd: (nuevo: NuevoCheque) => Promise<Cheque | null>;
  onUpdate: (id: string, patch: Partial<Cheque>) => Promise<void>;
  onDelete: (id: string) => void;
  onDuplicate: (c: ChequeEnriquecido) => Promise<Cheque | null>;
  onRestaurarBackup: (file: File) => Promise<void>;
}) {
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState<NuevoCheque>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Cheque | null>(null);
  const [filterEstado, setFilterEstado] = useState<EstadoCheque | "Todos">("Todos");
  const [search, setSearch] = useState("");
  const [sortConfig, setSortConfig] = useState<SortConfig>({ key: null, dir: "asc" });
  const [showRecordatorio, setShowRecordatorio] = useState(false);

  const kpis = useMemo(() => {
    const total = enriched.reduce((s, c) => s + (Number(c.importe) || 0), 0);
    const byEstado = (est: EstadoCheque) =>
      enriched.filter((c) => c.estado === est).reduce((s, c) => s + (Number(c.importe) || 0), 0);
    return {
      total,
      pendiente: total - byEstado("Pagado"),
      vencido: byEstado("Vencido"),
      proximo: byEstado("Próximo"),
      rechazado: byEstado("Rechazado"),
      duplicados: new Set(enriched.filter((c) => c.dup).map((c) => (c.n_cheque || "").toLowerCase())).size,
    };
  }, [enriched]);

  const weeklyFlow = useMemo(() => buildWeeklyFlow(enriched), [enriched]);
  const providerConcentration = useMemo(() => buildProviderConcentration(enriched), [enriched]);

  const filtered = useMemo(() => {
    let list = enriched;
    if (filterEstado !== "Todos") list = list.filter((c) => c.estado === filterEstado);
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter(
        (c) =>
          (c.proveedor || "").toLowerCase().includes(q) ||
          (c.n_cheque || "").toLowerCase().includes(q) ||
          (c.observaciones || "").toLowerCase().includes(q),
      );
    }
    if (sortConfig.key) {
      const dir = sortConfig.dir === "asc" ? 1 : -1;
      return [...list].sort((a, b) => {
        const va = getSortValue(a, sortConfig.key!);
        const vb = getSortValue(b, sortConfig.key!);
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
        return 0;
      });
    }
    const priority: Record<string, number> = { Vencido: 0, Rechazado: 0, "Próximo": 1, Pendiente: 2, Pagado: 3 };
    return [...list].sort((a, b) => {
      const pa = priority[a.estado] ?? 4;
      const pb = priority[b.estado] ?? 4;
      if (pa !== pb) return pa - pb;
      const da = toDate(a.fecha_cobro);
      const db = toDate(b.fecha_cobro);
      if (da && db) return da.getTime() - db.getTime();
      if (da) return -1;
      if (db) return 1;
      return 0;
    });
  }, [enriched, filterEstado, search, sortConfig]);

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

  async function addCheque() {
    if (!form.proveedor.trim() || !form.importe) return;
    const nuevo = await onAdd(form);
    if (nuevo) {
      setForm(emptyForm);
      setShowForm(false);
    }
  }

  async function duplicarCheque(c: ChequeEnriquecido) {
    const copia = await onDuplicate(c);
    if (copia) {
      setEditingId(copia.id);
      setEditForm({ ...copia });
      setTimeout(() => {
        const el = document.getElementById(`cheque-row-${copia.id}`);
        if (el && typeof el.scrollIntoView === "function") el.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 60);
    }
  }

  function startEdit(c: ChequeEnriquecido) {
    setEditingId(c.id);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars -- strip the enriched-only fields, they aren't real columns
    const { estado, dias, dup, ...cheque } = c;
    setEditForm(cheque);
  }
  async function saveEdit() {
    if (!editForm) return;
    await onUpdate(editForm.id, editForm);
    setEditingId(null);
    setEditForm(null);
  }
  function cancelEdit() {
    setEditingId(null);
    setEditForm(null);
  }

  function exportarBackupJSON() {
    const payload = { cheques: enriched, exportadoEl: new Date().toISOString() };
    descargarArchivo(JSON.stringify(payload, null, 2), `backup-cheques-el-nuevo-rural-${fechaArchivo()}.json`, "application/json");
  }

  function exportarCSV() {
    const headers = ["N Cheque", "Proveedor", "Fecha Emision", "Fecha Cobro", "Importe", "Debito Banco", "Estado", "Dias", "Rechazado", "Observaciones"];
    const lineas = [headers.join(";")];
    enriched.forEach((c) => {
      lineas.push(
        [
          csvEscape(c.n_cheque), csvEscape(c.proveedor), csvEscape(c.fecha_emision), csvEscape(c.fecha_cobro),
          csvEscape(c.importe), csvEscape(c.debito_banco), csvEscape(c.estado), csvEscape(c.dias ?? ""),
          csvEscape(c.rechazado ? "Si" : "No"), csvEscape(c.observaciones),
        ].join(";"),
      );
    });
    descargarArchivo("﻿" + lineas.join("\n"), `cheques-el-nuevo-rural-${fechaArchivo()}.csv`, "text/csv;charset=utf-8");
  }

  async function copiarRecordatorio() {
    const texto = generarTextoRecordatorio(enriched);
    try {
      await navigator.clipboard.writeText(texto);
      window.alert("Copiado. Ya lo podés pegar en WhatsApp.");
    } catch {
      const ta = document.getElementById("recordatorio-textarea") as HTMLTextAreaElement | null;
      if (ta) {
        ta.select();
        try {
          document.execCommand("copy");
          window.alert("Copiado. Ya lo podés pegar en WhatsApp.");
        } catch {
          window.alert("No se pudo copiar automáticamente. Seleccioná el texto de abajo y copialo manualmente.");
        }
      }
    }
  }

  return (
    <>
      {kpis.duplicados > 0 && (
        <div style={{ background: "#FADBD8", color: "#922B21", padding: "10px 14px", borderRadius: 8, marginBottom: 16, display: "flex", alignItems: "center", gap: 8, fontSize: 13, fontWeight: 700 }}>
          <AlertTriangle size={16} />
          {kpis.duplicados} N° de cheque duplicado(s) detectado(s) — revisá la tabla.
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10, marginBottom: 20 }}>
        {(
          [
            ["TOTAL EMITIDO", kpis.total, "#1F3864", "white"],
            ["PENDIENTE", kpis.pendiente, "#F8F9FA", "#1A1A2E"],
            ["VENCIDO", kpis.vencido, "#FADBD8", "#922B21"],
            ["PRÓXIMO (7d)", kpis.proximo, "#FDEBD0", "#784212"],
            ["RECHAZADO", kpis.rechazado, "#E8DAEF", "#4A235A"],
          ] as [string, number, string, string][]
        ).map(([label, val, bg, fg]) => (
          <div key={label} style={{ background: bg, color: fg, borderRadius: 8, padding: "12px 10px", border: "1px solid #e0e0e0" }}>
            <div style={{ fontSize: 10, opacity: 0.8, fontWeight: 700, marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 16, fontWeight: 700 }}>{fmtMoney(val)}</div>
          </div>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1.3fr) minmax(0,1fr)", gap: 14, marginBottom: 20 }}>
        <div style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#1F3864", marginBottom: 8 }}>Flujo de caja proyectado</div>
          {cheques.length === 0 ? (
            <div style={{ fontSize: 12, color: "#888", padding: "30px 0", textAlign: "center" }}>Cargá cheques para ver el flujo proyectado.</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={weeklyFlow} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#eee" />
                <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={(v) => (v >= 1000000 ? `${Math.round(v / 1000000)}M` : v)} width={40} />
                <Tooltip formatter={(v) => fmtMoney(v as number)} labelStyle={{ fontSize: 12 }} contentStyle={{ fontSize: 12 }} />
                <Bar dataKey="monto" radius={[4, 4, 0, 0]}>
                  {weeklyFlow.map((entry, i) => (
                    <Cell key={i} fill={entry.label === "Vencido" ? "#C0392B" : "#1F3864"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>

        <div style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 10, padding: "14px 16px" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#1F3864", marginBottom: 8 }}>Concentración por proveedor</div>
          {providerConcentration.length === 0 ? (
            <div style={{ fontSize: 12, color: "#888", padding: "30px 0", textAlign: "center" }}>Sin exposición abierta todavía.</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={providerConcentration} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={75} label={(entry) => entry.name} labelLine={false} style={{ fontSize: 10 }}>
                  {providerConcentration.map((entry, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(v) => fmtMoney(v as number)} contentStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 12, flexWrap: "wrap", alignItems: "center" }}>
        <button onClick={() => setShowForm((s) => !s)} style={{ display: "flex", alignItems: "center", gap: 6, background: NAVY, color: "white", border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          <Plus size={15} /> {showForm ? "Cerrar" : "Nuevo cheque"}
        </button>

        <button onClick={exportarBackupJSON} title="Descarga un archivo con todos tus cheques, para tener un respaldo" style={{ display: "flex", alignItems: "center", gap: 6, background: "white", color: "#145A32", border: "1px solid #145A32", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Descargar backup
        </button>

        <button onClick={exportarCSV} title="Descarga los cheques en un archivo CSV para abrir en Excel o Google Sheets" style={{ display: "flex", alignItems: "center", gap: 6, background: "white", color: "#145A32", border: "1px solid #145A32", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          Exportar CSV
        </button>

        {esAdmin && (
          <label title="Restaura un backup descargado previamente" style={{ display: "flex", alignItems: "center", gap: 6, background: "white", color: "#784212", border: "1px solid #784212", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Restaurar backup
            <input
              type="file"
              accept="application/json"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) onRestaurarBackup(file);
                e.target.value = "";
              }}
              style={{ display: "none" }}
            />
          </label>
        )}

        <button onClick={() => setShowRecordatorio((s) => !s)} title="Genera un texto con los cheques vencidos y por vencer, listo para copiar y pegar" style={{ display: "flex", alignItems: "center", gap: 6, background: "white", color: "#0C447C", border: "1px solid #0C447C", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
          {showRecordatorio ? "Cerrar recordatorio" : "Recordatorio WhatsApp"}
        </button>

        <div style={{ position: "relative", flex: "1 1 200px", maxWidth: 260 }}>
          <Search size={14} style={{ position: "absolute", left: 8, top: 9, color: "#888" }} />
          <input placeholder="Buscar proveedor, N° cheque..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ ...inputStyle, paddingLeft: 28 }} />
        </div>

        <select value={filterEstado} onChange={(e) => setFilterEstado(e.target.value as EstadoCheque | "Todos")} style={{ ...inputStyle, width: "auto" }}>
          <option>Todos</option>
          <option>Pendiente</option>
          <option>Próximo</option>
          <option>Vencido</option>
          <option>Pagado</option>
          <option>Rechazado</option>
        </select>
      </div>

      {showRecordatorio && (
        <div style={{ background: "#E6F1FB", border: "1px solid #85B7EB", borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <textarea
            id="recordatorio-textarea"
            readOnly
            value={generarTextoRecordatorio(enriched)}
            style={{ width: "100%", minHeight: 160, padding: 10, borderRadius: 8, border: "1px solid #ccc", fontSize: 13, fontFamily: "Arial, sans-serif", boxSizing: "border-box", background: "white", color: "#1A1A2E" }}
          />
          <button onClick={copiarRecordatorio} style={{ marginTop: 10, background: "#0C447C", color: "white", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Copiar texto
          </button>
        </div>
      )}

      {showForm && (
        <div style={{ background: "#FFF9C4", border: "1px solid #e6dc8f", borderRadius: 8, padding: 16, marginBottom: 16 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))", gap: 10 }}>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700 }}>N° Cheque</label>
              <input style={inputStyle} value={form.n_cheque ?? ""} onChange={(e) => setForm({ ...form, n_cheque: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700 }}>Proveedor</label>
              <input style={inputStyle} value={form.proveedor} onChange={(e) => setForm({ ...form, proveedor: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700 }}>Fecha emisión</label>
              <input type="date" style={inputStyle} value={form.fecha_emision ?? ""} onChange={(e) => setForm({ ...form, fecha_emision: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700 }}>Fecha cobro</label>
              <input type="date" style={inputStyle} value={form.fecha_cobro ?? ""} onChange={(e) => setForm({ ...form, fecha_cobro: e.target.value })} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700 }}>Importe</label>
              <input type="number" style={inputStyle} value={form.importe || ""} onChange={(e) => setForm({ ...form, importe: parseFloat(e.target.value) || 0 })} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700 }}>Débito banco</label>
              <input type="number" style={inputStyle} value={form.debito_banco ?? ""} onChange={(e) => setForm({ ...form, debito_banco: parseFloat(e.target.value) || null })} />
            </div>
            <div>
              <label style={{ fontSize: 11, fontWeight: 700 }}>Tipo</label>
              <select style={inputStyle} value={form.tipo} onChange={(e) => setForm({ ...form, tipo: e.target.value as "Físico" | "E-cheque" })}>
                <option>Físico</option>
                <option>E-cheque</option>
              </select>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
              <input type="checkbox" id="rechazado-new" checked={form.rechazado} onChange={(e) => setForm({ ...form, rechazado: e.target.checked })} />
              <label htmlFor="rechazado-new" style={{ fontSize: 12, fontWeight: 700, color: "#4A235A" }}>Rechazado</label>
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 6 }}>
              <input type="checkbox" id="entregado-new" checked={form.entregado} onChange={(e) => setForm({ ...form, entregado: e.target.checked })} />
              <label htmlFor="entregado-new" style={{ fontSize: 12, fontWeight: 700, color: "#0C447C" }}>Entregado al proveedor</label>
            </div>
            <div style={{ gridColumn: "1 / -1" }}>
              <label style={{ fontSize: 11, fontWeight: 700 }}>Observaciones</label>
              <input style={inputStyle} value={form.observaciones ?? ""} onChange={(e) => setForm({ ...form, observaciones: e.target.value })} />
            </div>
          </div>
          <button onClick={addCheque} style={{ marginTop: 12, background: "#1F3864", color: "white", border: "none", borderRadius: 6, padding: "8px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
            Guardar cheque
          </button>
        </div>
      )}

      <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              {sortableHeader("N° Cheque", "nCheque")}
              {sortableHeader("Proveedor", "proveedor")}
              {sortableHeader("Tipo", "tipo")}
              {sortableHeader("F. Emisión", "fechaEmision")}
              {sortableHeader("F. Cobro", "fechaCobro")}
              {sortableHeader("Importe", "importe")}
              {sortableHeader("Débito", "debitoBanco")}
              {sortableHeader("Estado", "estado")}
              {sortableHeader("Días", "dias")}
              <th style={thStyle}>Observaciones</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr>
                <td colSpan={11} style={{ ...tdStyle, textAlign: "center", color: "#888", padding: 24 }}>
                  {cheques.length === 0 ? "Todavía no cargaste ningún cheque." : "Ningún cheque coincide con el filtro."}
                </td>
              </tr>
            )}
            {filtered.map((c) => {
              const isEditing = editingId === c.id;
              const style = ESTADO_STYLES[c.estado] || ESTADO_STYLES.Pendiente;
              if (isEditing && editForm) {
                return (
                  <tr key={c.id} id={`cheque-row-${c.id}`} style={{ background: "#FFF9C4" }}>
                    <td style={tdStyle}><input style={inputStyle} value={editForm.n_cheque ?? ""} onChange={(e) => setEditForm({ ...editForm, n_cheque: e.target.value })} /></td>
                    <td style={tdStyle}><input style={inputStyle} value={editForm.proveedor} onChange={(e) => setEditForm({ ...editForm, proveedor: e.target.value })} /></td>
                    <td style={tdStyle}>
                      <select style={inputStyle} value={editForm.tipo || "Físico"} onChange={(e) => setEditForm({ ...editForm, tipo: e.target.value as "Físico" | "E-cheque" })}>
                        <option>Físico</option>
                        <option>E-cheque</option>
                      </select>
                    </td>
                    <td style={tdStyle}><input type="date" style={inputStyle} value={editForm.fecha_emision ?? ""} onChange={(e) => setEditForm({ ...editForm, fecha_emision: e.target.value })} /></td>
                    <td style={tdStyle}><input type="date" style={inputStyle} value={editForm.fecha_cobro ?? ""} onChange={(e) => setEditForm({ ...editForm, fecha_cobro: e.target.value })} /></td>
                    <td style={tdStyle}><input type="number" style={inputStyle} value={editForm.importe} onChange={(e) => setEditForm({ ...editForm, importe: parseFloat(e.target.value) || 0 })} /></td>
                    <td style={tdStyle}><input type="number" style={inputStyle} value={editForm.debito_banco ?? ""} onChange={(e) => setEditForm({ ...editForm, debito_banco: parseFloat(e.target.value) || null })} /></td>
                    <td style={tdStyle}>
                      <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                        <input type="checkbox" checked={editForm.rechazado} onChange={(e) => setEditForm({ ...editForm, rechazado: e.target.checked })} />
                        Rechazado
                      </label>
                      <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4, marginTop: 4 }}>
                        <input type="checkbox" checked={editForm.entregado} onChange={(e) => setEditForm({ ...editForm, entregado: e.target.checked })} />
                        Entregado
                      </label>
                    </td>
                    <td style={tdStyle}>-</td>
                    <td style={tdStyle}><input style={inputStyle} value={editForm.observaciones ?? ""} onChange={(e) => setEditForm({ ...editForm, observaciones: e.target.value })} /></td>
                    <td style={tdStyle}>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button onClick={saveEdit} style={{ border: "none", background: "#D5F5E3", color: "#145A32", borderRadius: 4, padding: 6, cursor: "pointer" }}><Save size={14} /></button>
                        <button onClick={cancelEdit} style={{ border: "none", background: "#FADBD8", color: "#922B21", borderRadius: 4, padding: 6, cursor: "pointer" }}><X size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              }
              return (
                <tr key={c.id} style={{ background: style.bg, borderTop: "1px solid #eee" }}>
                  <td style={{ ...tdStyle, fontWeight: 700 }}>
                    {c.n_cheque || "-"}
                    {c.dup && <span style={{ marginLeft: 6, background: "#C0392B", color: "white", fontSize: 9, padding: "1px 5px", borderRadius: 4 }}>DUP</span>}
                  </td>
                  <td style={tdStyle}>{c.proveedor}</td>
                  <td style={tdStyle}>
                    <span style={{ background: c.tipo === "E-cheque" ? "#E6F1FB" : "#F1EFE8", color: c.tipo === "E-cheque" ? "#0C447C" : "#444441", fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 8 }}>
                      {c.tipo === "E-cheque" ? "E-cheque" : "Físico"}
                    </span>
                    {c.tipo !== "E-cheque" && (
                      <div style={{ marginTop: 3 }}>
                        <span
                          onClick={() => onUpdate(c.id, { entregado: !c.entregado })}
                          title="Tocá para cambiar"
                          style={{ background: c.entregado ? "#D5F5E3" : "#F1EFE8", color: c.entregado ? "#145A32" : "#888", fontSize: 9, fontWeight: 700, padding: "1px 6px", borderRadius: 8, cursor: "pointer" }}
                        >
                          {c.entregado ? "Entregado" : "En mi poder"}
                        </span>
                      </div>
                    )}
                  </td>
                  <td style={tdStyle}>{fmtDate(c.fecha_emision)}</td>
                  <td style={tdStyle}>{fmtDate(c.fecha_cobro)}</td>
                  <td style={tdStyle}>{fmtMoney(c.importe)}</td>
                  <td style={tdStyle}>{c.debito_banco ? fmtMoney(c.debito_banco) : "-"}</td>
                  <td style={tdStyle}>
                    <span style={{ background: style.bg, color: style.text, fontWeight: 700, fontSize: 11, padding: "3px 8px", borderRadius: 10, border: `1px solid ${style.text}33` }}>
                      {style.label}
                    </span>
                  </td>
                  <td style={tdStyle}>{c.dias === null ? "-" : c.dias}</td>
                  <td style={{ ...tdStyle, maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.observaciones || "-"}</td>
                  <td style={tdStyle}>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button onClick={() => startEdit(c)} title="Editar" style={{ border: "none", background: "transparent", color: "#1F3864", cursor: "pointer" }}><Pencil size={14} /></button>
                      <button onClick={() => duplicarCheque(c)} title="Duplicar" style={{ border: "none", background: "transparent", color: "#5F5E5A", cursor: "pointer" }}><Copy size={14} /></button>
                      {esAdmin && (
                        <button onClick={() => onDelete(c.id)} title="Eliminar" style={{ border: "none", background: "transparent", color: "#C0392B", cursor: "pointer" }}><Trash2 size={14} /></button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 11, color: "#888", marginTop: 12 }}>
        Tocá cualquier encabezado de columna para ordenar por ese dato, o dejalo en blanco para ver primero lo más urgente.
      </p>
    </>
  );
}
