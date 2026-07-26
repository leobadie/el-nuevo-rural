"use client";

import { useMemo, useState } from "react";
import { Plus, Trash2, X } from "lucide-react";
import { textoPedido, waUrlParaPedido } from "@/lib/ingresos-egresos/pedidos";
import { RED, inputStyle } from "@/lib/ingresos-egresos/estilos";
import type { ItemPedido, NuevoPedido, Pedido, Proveedor } from "@/lib/ingresos-egresos/types";

let nextItemId = 2;

async function copiarTexto(texto: string, mensajeOk: string) {
  try {
    await navigator.clipboard.writeText(texto);
    window.alert(mensajeOk);
  } catch {
    const ta = document.createElement("textarea");
    ta.value = texto;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand("copy");
      window.alert(mensajeOk);
    } catch {
      window.alert("No se pudo copiar automáticamente. Seleccioná el texto manualmente.");
    }
    document.body.removeChild(ta);
  }
}

export default function PedidosTab({
  pedidos,
  proveedores,
  onGuardarEnviado,
  onToggleConfirmado,
  onDelete,
}: {
  pedidos: Pedido[];
  proveedores: Proveedor[];
  onGuardarEnviado: (nuevo: NuevoPedido) => Promise<void>;
  onToggleConfirmado: (id: string, confirmado: boolean) => Promise<void>;
  onDelete: (id: string) => void;
}) {
  const [proveedor, setProveedor] = useState("");
  const [items, setItems] = useState<ItemPedido[]>([{ id: 1, producto: "", cantidad: "", unidad: "" }]);
  const [notas, setNotas] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [buscar, setBuscar] = useState("");
  const [showPegar, setShowPegar] = useState(false);
  const [pasteText, setPasteText] = useState("");

  const texto = useMemo(() => textoPedido(proveedor || "(sin proveedor)", items, notas), [proveedor, items, notas]);
  const telefono = useMemo(() => proveedores.find((p) => p.nombre === proveedor)?.telefono || "", [proveedores, proveedor]);

  function agregarItem() {
    nextItemId += 1;
    setItems((prev) => [...prev, { id: nextItemId, producto: "", cantidad: "", unidad: "" }]);
  }
  function quitarItem(id: number) {
    setItems((prev) => (prev.length > 1 ? prev.filter((i) => i.id !== id) : prev));
  }
  function actualizarItem(id: number, patch: Partial<ItemPedido>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }
  function agregarDesdeTexto() {
    const lineas = pasteText.split("\n").map((l) => l.trim()).filter(Boolean);
    if (lineas.length === 0) return;
    const nuevos: ItemPedido[] = lineas.map((linea) => {
      nextItemId += 1;
      return { id: nextItemId, producto: linea, cantidad: "", unidad: "" };
    });
    setItems((prev) => {
      const base = prev.filter((i) => i.producto.trim() || i.cantidad.trim() || i.unidad.trim());
      return [...base, ...nuevos];
    });
    setPasteText("");
    setShowPegar(false);
  }

  function validar(): boolean {
    if (!proveedor) {
      window.alert("Elegí un proveedor.");
      return false;
    }
    if (!items.some((i) => i.producto.trim())) {
      window.alert("Agregá al menos un producto.");
      return false;
    }
    return true;
  }

  async function guardarEnviado() {
    const itemsValidos = items.filter((i) => i.producto.trim());
    await onGuardarEnviado({
      proveedor,
      items: itemsValidos,
      notas: notas.trim() || null,
      texto: textoPedido(proveedor, itemsValidos, notas),
      telefono: telefono || null,
    });
    setItems([{ id: 1, producto: "", cantidad: "", unidad: "" }]);
    setNotas("");
  }

  function handleClickEnviar(e: React.MouseEvent<HTMLAnchorElement>) {
    if (!validar()) {
      e.preventDefault();
      return;
    }
    guardarEnviado();
  }

  const ultimosEnviados = pedidos.slice(0, 5);
  const historialFiltrado = useMemo(() => {
    if (!buscar.trim()) return pedidos;
    const q = buscar.trim().toLowerCase();
    return pedidos.filter(
      (p) => p.proveedor.toLowerCase().includes(q) || p.items.some((i) => i.producto.toLowerCase().includes(q)),
    );
  }, [pedidos, buscar]);

  return (
    <div>
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0,1fr) minmax(0,1fr)", gap: 16, marginBottom: 24 }}>
        <div style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: RED, marginBottom: 10 }}>Armar pedido</div>
          <label style={{ fontSize: 11, fontWeight: 700 }}>Proveedor</label>
          <select style={{ ...inputStyle, marginBottom: 10 }} value={proveedor} onChange={(e) => setProveedor(e.target.value)}>
            <option value="">Elegir...</option>
            {proveedores.map((p) => (
              <option key={p.id}>{p.nombre}</option>
            ))}
          </select>

          <label style={{ fontSize: 11, fontWeight: 700 }}>Productos</label>
          {items.map((item) => (
            <div key={item.id} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
              <input placeholder="Producto" style={{ ...inputStyle, flex: 2 }} value={item.producto} onChange={(e) => actualizarItem(item.id, { producto: e.target.value })} />
              <input placeholder="Cant." style={{ ...inputStyle, flex: 1 }} value={item.cantidad} onChange={(e) => actualizarItem(item.id, { cantidad: e.target.value })} />
              <input placeholder="Unidad" style={{ ...inputStyle, flex: 1 }} value={item.unidad} onChange={(e) => actualizarItem(item.id, { unidad: e.target.value })} />
              <button onClick={() => quitarItem(item.id)} style={{ border: "none", background: "transparent", color: "#C0392B", cursor: "pointer" }}><X size={16} /></button>
            </div>
          ))}
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <button onClick={agregarItem} style={{ display: "flex", alignItems: "center", gap: 4, background: "transparent", color: RED, border: "1px dashed #ccc", borderRadius: 6, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              <Plus size={13} /> Agregar producto
            </button>
            <button onClick={() => setShowPegar((s) => !s)} style={{ background: "transparent", color: RED, border: "1px dashed #ccc", borderRadius: 6, padding: "6px 10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
              {showPegar ? "Cerrar" : "Pegar lista de productos"}
            </button>
          </div>

          {showPegar && (
            <div style={{ background: "#F8F9FA", border: "1px solid #eee", borderRadius: 8, padding: 10, marginBottom: 10 }}>
              <label style={{ fontSize: 11, color: "#666" }}>Pegá la lista, un producto por línea</label>
              <textarea
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={"2kg Harina 0000\n1 docena Huevos\n3 Coca-Cola 2L"}
                style={{ ...inputStyle, minHeight: 90, boxSizing: "border-box", marginTop: 4, marginBottom: 8 }}
              />
              <button onClick={agregarDesdeTexto} style={{ background: RED, color: "white", border: "none", borderRadius: 6, padding: "6px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                Agregar a la lista
              </button>
            </div>
          )}

          <label style={{ fontSize: 11, fontWeight: 700 }}>Notas</label>
          <textarea value={notas} onChange={(e) => setNotas(e.target.value)} style={{ ...inputStyle, minHeight: 60, boxSizing: "border-box" }} />
        </div>

        <div style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 10, padding: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: RED, marginBottom: 10 }}>Vista previa</div>
          <pre style={{ whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: 12, background: "#F8F9FA", border: "1px solid #eee", borderRadius: 8, padding: 10, minHeight: 120 }}>{texto}</pre>
          {!telefono && proveedor && (
            <p style={{ fontSize: 11, color: "#888", marginTop: 4 }}>Sin teléfono guardado para este proveedor — se abrirá WhatsApp para elegir el contacto.</p>
          )}
          <div style={{ display: "flex", gap: 10, marginTop: 10 }}>
            <a
              href={waUrlParaPedido(telefono, texto)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={handleClickEnviar}
              style={{ background: "#25D366", color: "white", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 700, textDecoration: "none" }}
            >
              Enviar por WhatsApp
            </a>
            <button onClick={() => copiarTexto(texto, "Copiado. Ya lo podés pegar donde quieras.")} style={{ background: "white", color: "#333", border: "1px solid #ccc", borderRadius: 6, padding: "8px 14px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
              Copiar texto
            </button>
          </div>

          {ultimosEnviados.length > 0 && (
            <div style={{ marginTop: 16 }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: "#666", marginBottom: 6 }}>Últimos enviados</div>
              {ultimosEnviados.map((p) => (
                <div key={p.id} style={{ fontSize: 11, padding: "6px 0", borderTop: "1px solid #eee" }}>
                  <strong>{p.proveedor}</strong> — {new Date(p.enviado_el).toLocaleString("es-AR")}
                  {p.confirmado && <span style={{ marginLeft: 6, background: "#D5F5E3", color: "#145A32", padding: "1px 6px", borderRadius: 8, fontSize: 10 }}>Confirmado</span>}
                  <div style={{ color: "#888" }}>{p.items.map((i) => i.producto).join(", ")}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div style={{ fontSize: 12, fontWeight: 700, color: RED, marginBottom: 8 }}>Historial de pedidos</div>
      <input placeholder="Buscar proveedor o producto..." value={buscar} onChange={(e) => setBuscar(e.target.value)} style={{ ...inputStyle, maxWidth: 300, marginBottom: 10 }} />

      {historialFiltrado.length === 0 && <p style={{ fontSize: 12, color: "#888" }}>Todavía no hay pedidos.</p>}
      {historialFiltrado.map((p) => (
        <div key={p.id} style={{ border: "1px solid #eee", borderRadius: 8, padding: 12, marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
            <div>
              <strong>{p.proveedor}</strong>
              <span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>{new Date(p.enviado_el).toLocaleString("es-AR")}</span>
              {!p.telefono && <span style={{ fontSize: 11, color: "#888", marginLeft: 8 }}>Sin teléfono guardado</span>}
              <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>{p.items.map((i) => i.producto).join(", ")}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <label style={{ fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                <input type="checkbox" checked={p.confirmado} onChange={(e) => onToggleConfirmado(p.id, e.target.checked)} />
                Confirmado
              </label>
              <button onClick={() => setExpandedId(expandedId === p.id ? null : p.id)} style={{ background: "transparent", border: "none", color: RED, fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                {expandedId === p.id ? "Ocultar texto" : "Ver texto completo"}
              </button>
              <a href={waUrlParaPedido(p.telefono, p.texto)} target="_blank" rel="noopener noreferrer" style={{ fontSize: 11, fontWeight: 700, color: "#25D366" }}>
                Reenviar
              </a>
              <button onClick={() => copiarTexto(p.texto, "Copiado.")} style={{ background: "transparent", border: "none", color: "#666", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                Copiar
              </button>
              <button onClick={() => onDelete(p.id)} style={{ border: "none", background: "transparent", color: "#C0392B", cursor: "pointer" }}>
                <Trash2 size={14} />
              </button>
            </div>
          </div>
          {expandedId === p.id && (
            <pre style={{ whiteSpace: "pre-wrap", fontFamily: "monospace", fontSize: 12, background: "#F8F9FA", border: "1px solid #eee", borderRadius: 8, padding: 10, marginTop: 8 }}>{p.texto}</pre>
          )}
        </div>
      ))}
    </div>
  );
}
