"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { Check, Copy, Monitor, Pencil, X } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { NAVY, SECCIONES_SUGERIDAS } from "@/lib/cartel/placas";
import type { Pantalla } from "@/lib/cartel/types";

/**
 * Alta y baja de televisores.
 *
 * Cada pantalla es un TV del salón con su propia dirección. Lo que más se usa de
 * acá no es el formulario sino el botón de copiar: la dirección hay que tipearla
 * en el navegador del televisor, y copiarla bien es la mitad del trabajo.
 */

/** El slug va en la URL que se tipea con el control remoto: corto y sin acentos. */
function aSlug(texto: string): string {
  return texto
    .trim()
    .toLowerCase()
    .normalize("NFD")
    // NFD separa la letra de su tilde; esto borra las tildes sueltas para que
    // "Carnicería" quede "carniceria" y no "carnicer-a".
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
}

const VACIO = { slug: "", nombre: "", seccion: "", activa: true, orden: 0 };

export default function PantallasPanel({
  pantallasIniciales,
  userId,
  onError,
  onAviso,
}: {
  pantallasIniciales: Pantalla[];
  userId: string;
  onError: (m: string | null) => void;
  onAviso: (m: string | null) => void;
}) {
  const supabase = useMemo(() => createClient(), []);

  const [pantallas, setPantallas] = useState<Pantalla[]>(pantallasIniciales);
  const [form, setForm] = useState<typeof VACIO>(VACIO);
  const [editando, setEditando] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);

  // El slug se arma solo desde el nombre mientras se da de alta. Al editar no se
  // toca: cambiarlo dejaría al televisor apuntando a una dirección que ya no
  // existe, y nadie se enteraría hasta pasar por el local.
  const slugPropuesto = editando ?? (form.slug || aSlug(form.nombre));

  function limpiar() {
    setForm(VACIO);
    setEditando(null);
  }

  function direccion(slug: string): string {
    const base = typeof window === "undefined" ? "" : window.location.origin;
    return `${base}/cartel/tv/${slug}`;
  }

  async function copiar(slug: string) {
    try {
      await navigator.clipboard.writeText(direccion(slug));
      setCopiado(slug);
      window.setTimeout(() => setCopiado((s) => (s === slug ? null : s)), 2000);
    } catch {
      // Sin permiso de portapapeles no hay drama: la dirección está a la vista
      // para copiarla a mano.
      onError("No se pudo copiar sola. La dirección está escrita al lado.");
    }
  }

  async function guardar() {
    const nombre = form.nombre.trim();
    const slug = editando ?? aSlug(form.slug || nombre);

    if (!nombre) {
      onError("Poné un nombre: es cómo vas a reconocer el televisor en esta lista.");
      return;
    }
    if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) || slug.length < 2) {
      onError("La dirección quedó vacía o con caracteres raros. Probá con un nombre más simple.");
      return;
    }

    const payload = {
      nombre,
      seccion: form.seccion.trim() || null,
      activa: form.activa,
      orden: Number(form.orden) || 0,
    };

    setGuardando(true);
    onError(null);

    try {
      if (editando) {
        const { data, error } = await supabase
          .from("cartel_pantallas")
          .update(payload)
          .eq("slug", editando)
          .select()
          .single();

        if (error) throw error;
        setPantallas((ps) => ps.map((p) => (p.slug === editando ? (data as Pantalla) : p)));
        onAviso("Televisor actualizado.");
      } else {
        const { data, error } = await supabase
          .from("cartel_pantallas")
          .insert({ ...payload, slug, creado_por: userId })
          .select()
          .single();

        if (error) throw error;
        setPantallas((ps) => [...ps, data as Pantalla]);
        onAviso(`Televisor creado. Su dirección es /cartel/tv/${slug}`);
      }
      limpiar();
    } catch (e) {
      const msg = (e as Error).message;
      onError(
        msg.includes("duplicate") || msg.includes("cartel_pantallas_pkey")
          ? `Ya existe un televisor con la dirección /cartel/tv/${slug}.`
          : `No se pudo guardar: ${msg}`,
      );
    } finally {
      setGuardando(false);
    }
  }

  async function alternar(p: Pantalla) {
    const { data, error } = await supabase
      .from("cartel_pantallas")
      .update({ activa: !p.activa })
      .eq("slug", p.slug)
      .select()
      .single();

    if (error) {
      onError(`No se pudo cambiar: ${error.message}`);
      return;
    }
    setPantallas((ps) => ps.map((x) => (x.slug === p.slug ? (data as Pantalla) : x)));
    onAviso(
      data.activa
        ? `${data.nombre} vuelve a mostrar el cartel.`
        : `${data.nombre} queda apagado: su dirección devuelve 404.`,
    );
  }

  const ordenadas = [...pantallas].sort(
    (a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"),
  );

  return (
    <section style={tarjeta}>
      <h2 style={subtitulo}>
        <Monitor size={16} /> Televisores del local
      </h2>

      <p style={{ fontSize: 13, color: "#666", margin: "0 0 12px" }}>
        Cada televisor abre su propia dirección y muestra lo de su sector. Los que no
        tienen sector muestran todo lo que no esté asignado a otro.
      </p>

      {/* ---------- Lista ---------- */}
      <div style={{ display: "grid", gap: 8, marginBottom: 16 }}>
        {ordenadas.length === 0 && (
          <p style={{ fontSize: 13, color: "#888", margin: 0 }}>
            Todavía no hay televisores cargados.
          </p>
        )}

        {ordenadas.map((p) => (
          <div
            key={p.slug}
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid #E2E8F0",
              background: p.activa ? "#fff" : "#F8FAFC",
              opacity: p.activa ? 1 : 0.65,
            }}
          >
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, color: NAVY, fontSize: 14 }}>
                {p.nombre}
                {!p.activa && <span style={{ color: "#94A3B8", fontWeight: 500 }}> · apagado</span>}
              </div>
              <div style={{ fontSize: 12, color: "#64748B", wordBreak: "break-all" }}>
                /cartel/tv/{p.slug}
                {p.seccion ? ` · ${p.seccion}` : " · todas las secciones"}
              </div>
            </div>

            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              <button
                type="button"
                onClick={() => copiar(p.slug)}
                style={iconoBoton}
                title="Copiar la dirección para tipearla en el televisor"
              >
                {copiado === p.slug ? <Check size={15} color="#1E7B4D" /> : <Copy size={15} />}
              </button>
              <button
                type="button"
                onClick={() => {
                  setEditando(p.slug);
                  setForm({
                    slug: p.slug,
                    nombre: p.nombre,
                    seccion: p.seccion ?? "",
                    activa: p.activa,
                    orden: p.orden,
                  });
                }}
                style={iconoBoton}
                title="Editar"
              >
                <Pencil size={15} />
              </button>
              <button
                type="button"
                onClick={() => alternar(p)}
                style={iconoBoton}
                title={p.activa ? "Apagar este televisor" : "Volver a prenderlo"}
              >
                {p.activa ? <X size={15} /> : <Check size={15} />}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* ---------- Alta / edición ---------- */}
      <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))" }}>
        <label style={{ display: "grid", gap: 4 }}>
          <span style={etiqueta}>Nombre del televisor</span>
          <input
            style={input}
            value={form.nombre}
            onChange={(e) => setForm((f) => ({ ...f, nombre: e.target.value }))}
            placeholder="Carnicería 1"
          />
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          <span style={etiqueta}>Sector que muestra</span>
          <input
            style={input}
            list="secciones-pantalla"
            value={form.seccion}
            onChange={(e) => setForm((f) => ({ ...f, seccion: e.target.value }))}
            placeholder="Vacío = muestra todo"
          />
          <datalist id="secciones-pantalla">
            {SECCIONES_SUGERIDAS.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
        </label>

        <label style={{ display: "grid", gap: 4 }}>
          <span style={etiqueta}>Orden en la lista</span>
          <input
            style={input}
            type="number"
            value={form.orden}
            onChange={(e) => setForm((f) => ({ ...f, orden: Number(e.target.value) }))}
          />
        </label>
      </div>

      <p style={{ fontSize: 12, color: "#64748B", margin: "8px 0 0" }}>
        {editando ? (
          <>
            Dirección: <strong>/cartel/tv/{editando}</strong> (no se cambia, para no dejar el
            televisor apuntando a una que ya no existe)
          </>
        ) : (
          <>
            Dirección que va a quedar: <strong>/cartel/tv/{slugPropuesto || "…"}</strong>
          </>
        )}
      </p>

      <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
        <button type="button" onClick={guardar} disabled={guardando} style={botonPrimario}>
          {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Agregar televisor"}
        </button>
        {editando && (
          <button type="button" onClick={limpiar} style={botonSecundario}>
            Cancelar
          </button>
        )}
      </div>
    </section>
  );
}

const tarjeta: CSSProperties = {
  background: "#fff",
  borderRadius: 12,
  padding: 16,
  boxShadow: "0 1px 3px rgba(15,23,42,.08)",
  marginBottom: 16,
};

const subtitulo: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 15,
  fontWeight: 800,
  color: NAVY,
  margin: "0 0 4px",
};

const etiqueta: CSSProperties = { fontSize: 12, fontWeight: 600, color: "#475569" };

const input: CSSProperties = {
  border: "1px solid #CBD5E1",
  borderRadius: 8,
  padding: "8px 10px",
  fontSize: 14,
  width: "100%",
  boxSizing: "border-box",
};

const botonPrimario: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: NAVY,
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "9px 14px",
  fontSize: 14,
  fontWeight: 700,
  cursor: "pointer",
};

const botonSecundario: CSSProperties = {
  ...botonPrimario,
  background: "#fff",
  color: NAVY,
  border: "1px solid #CBD5E1",
};

const iconoBoton: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  width: 30,
  height: 30,
  border: "1px solid #CBD5E1",
  borderRadius: 8,
  background: "#fff",
  cursor: "pointer",
  color: NAVY,
};

