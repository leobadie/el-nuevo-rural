"use client";

import { useMemo, useState, type CSSProperties } from "react";
import Link from "next/link";
import {
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Eye,
  EyeOff,
  Home,
  Image as ImageIcon,
  Plus,
  Trash2,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { useConfirmDialog } from "@/app/useConfirmDialog";
import PlacaVista from "../PlacaVista";
import {
  NARANJA,
  NAVY,
  SECCIONES_SUGERIDAS,
  VERDE,
  fmtPrecio,
  hoyISO,
  estaVigente,
} from "@/lib/cartel/placas";
import type { Placa, TipoPlaca } from "@/lib/cartel/types";

const COLORES = [
  { nombre: "Azul (marca)", valor: NAVY },
  { nombre: "Verde", valor: VERDE },
  { nombre: "Naranja", valor: NARANJA },
  { nombre: "Rojo", valor: "#A62C2C" },
  { nombre: "Negro", valor: "#1A1A2E" },
];

type Form = {
  tipo: TipoPlaca;
  seccion: string;
  titulo: string;
  bajada: string;
  precio: string;
  precio_anterior: string;
  unidad: string;
  imagen_url: string;
  color: string;
  vigencia_desde: string;
  vigencia_hasta: string;
  duracion_seg: string;
  orden: string;
  activa: boolean;
};

const FORM_VACIO: Form = {
  tipo: "oferta",
  seccion: "",
  titulo: "",
  bajada: "",
  precio: "",
  precio_anterior: "",
  unidad: "el kilo",
  imagen_url: "",
  color: NAVY,
  vigencia_desde: "",
  vigencia_hasta: "",
  duracion_seg: "8",
  orden: "0",
  activa: true,
};

/** "1.234,50" y "1234.50" tienen que valer lo mismo: acá se carga a mano y rápido. */
function aNumero(texto: string): number | null {
  const limpio = texto.trim().replace(/\./g, "").replace(",", ".");
  if (limpio === "") return null;
  const n = Number(limpio);
  return Number.isFinite(n) ? n : null;
}

function formDesde(placa: Placa): Form {
  return {
    tipo: placa.tipo,
    seccion: placa.seccion ?? "",
    titulo: placa.titulo,
    bajada: placa.bajada ?? "",
    precio: placa.precio != null ? String(placa.precio) : "",
    precio_anterior: placa.precio_anterior != null ? String(placa.precio_anterior) : "",
    unidad: placa.unidad ?? "",
    imagen_url: placa.imagen_url ?? "",
    color: placa.color ?? NAVY,
    vigencia_desde: placa.vigencia_desde ?? "",
    vigencia_hasta: placa.vigencia_hasta ?? "",
    duracion_seg: String(placa.duracion_seg),
    orden: String(placa.orden),
    activa: placa.activa,
  };
}

export default function AdminShell({
  placasIniciales,
  userId,
  errorInicial,
}: {
  placasIniciales: Placa[];
  userId: string;
  errorInicial: string | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { pedirConfirmacion, ConfirmModal } = useConfirmDialog();

  const [placas, setPlacas] = useState<Placa[]>(placasIniciales);
  const [editando, setEditando] = useState<string | null>(null);
  const [form, setForm] = useState<Form>(FORM_VACIO);
  const [error, setError] = useState<string | null>(errorInicial);
  const [aviso, setAviso] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [subiendo, setSubiendo] = useState(false);

  const hoy = hoyISO();

  function set<K extends keyof Form>(campo: K, valor: Form[K]) {
    setForm((f) => ({ ...f, [campo]: valor }));
  }

  /** La placa que se está armando, tal como la vería el televisor. */
  const previa: Placa = {
    id: "previa",
    tipo: form.tipo,
    seccion: form.seccion.trim() || null,
    titulo: form.titulo.trim() || "Título de la placa",
    bajada: form.bajada.trim() || null,
    precio: aNumero(form.precio),
    precio_anterior: aNumero(form.precio_anterior),
    unidad: form.unidad.trim() || null,
    imagen_url: form.imagen_url.trim() || null,
    color: form.color || NAVY,
    vigencia_desde: form.vigencia_desde || null,
    vigencia_hasta: form.vigencia_hasta || null,
    duracion_seg: Number(form.duracion_seg) || 8,
    orden: Number(form.orden) || 0,
    activa: form.activa,
  };

  function limpiar() {
    setEditando(null);
    // El orden arranca después de la última para que la placa nueva caiga al
    // final del loop en vez de pisar el lugar de otra.
    const siguiente = placas.length > 0 ? Math.max(...placas.map((p) => p.orden)) + 1 : 1;
    setForm({ ...FORM_VACIO, orden: String(siguiente) });
    setError(null);
    setAviso(null);
  }

  async function guardar() {
    const titulo = form.titulo.trim();
    if (!titulo) {
      setError("Poné un título: es lo que se lee de lejos en el televisor.");
      return;
    }
    if (form.tipo === "imagen" && !form.imagen_url.trim()) {
      setError("Un cartel ya diseñado es la imagen: sin foto la pantalla queda en negro.");
      return;
    }
    if (form.vigencia_desde && form.vigencia_hasta && form.vigencia_hasta < form.vigencia_desde) {
      setError("La vigencia termina antes de empezar: la placa no se vería nunca.");
      return;
    }

    const payload = {
      tipo: form.tipo,
      seccion: form.seccion.trim() || null,
      titulo,
      bajada: form.bajada.trim() || null,
      precio: aNumero(form.precio),
      precio_anterior: aNumero(form.precio_anterior),
      unidad: form.unidad.trim() || null,
      imagen_url: form.imagen_url.trim() || null,
      color: form.color || null,
      vigencia_desde: form.vigencia_desde || null,
      vigencia_hasta: form.vigencia_hasta || null,
      duracion_seg: Number(form.duracion_seg) || 8,
      orden: Number(form.orden) || 0,
      activa: form.activa,
    };

    setGuardando(true);
    setError(null);

    try {
      if (editando) {
        const { data, error: e } = await supabase
          .from("cartel_placas")
          .update(payload)
          .eq("id", editando)
          .select()
          .single();

        if (e) throw e;
        setPlacas((ps) => ps.map((p) => (p.id === editando ? (data as Placa) : p)));
        setAviso("Placa actualizada. Los televisores la toman en 5 minutos como máximo.");
      } else {
        const { data, error: e } = await supabase
          .from("cartel_placas")
          .insert({ ...payload, creado_por: userId })
          .select()
          .single();

        if (e) throw e;
        setPlacas((ps) => [...ps, data as Placa]);
        setAviso("Placa creada. Los televisores la toman en 5 minutos como máximo.");
      }
      limpiar();
    } catch (e) {
      setError(`No se pudo guardar: ${(e as Error).message}`);
    } finally {
      setGuardando(false);
    }
  }

  function borrar(placa: Placa) {
    pedirConfirmacion(`¿Borrar la placa "${placa.titulo}"?`, async () => {
      const { error: e } = await supabase.from("cartel_placas").delete().eq("id", placa.id);
      if (e) {
        setError(`No se pudo borrar: ${e.message}`);
        return;
      }
      setPlacas((ps) => ps.filter((p) => p.id !== placa.id));
      if (editando === placa.id) limpiar();
    });
  }

  async function alternarActiva(placa: Placa) {
    const { error: e } = await supabase
      .from("cartel_placas")
      .update({ activa: !placa.activa })
      .eq("id", placa.id);

    if (e) {
      setError(`No se pudo cambiar: ${e.message}`);
      return;
    }
    setPlacas((ps) => ps.map((p) => (p.id === placa.id ? { ...p, activa: !p.activa } : p)));
  }

  /** Sube y baja una placa intercambiando el `orden` con su vecina. */
  async function mover(placa: Placa, delta: -1 | 1) {
    const ordenadas = [...placas].sort((a, b) => a.orden - b.orden);
    const i = ordenadas.findIndex((p) => p.id === placa.id);
    const vecina = ordenadas[i + delta];
    if (!vecina) return;

    const [ordenA, ordenB] = [placa.orden, vecina.orden];
    // Si dos placas quedaron con el mismo `orden`, intercambiarlo no cambia
    // nada; les damos posiciones distintas para que el movimiento se vea.
    const nuevoA = ordenA === ordenB ? ordenB + delta : ordenB;

    const [r1, r2] = await Promise.all([
      supabase.from("cartel_placas").update({ orden: nuevoA }).eq("id", placa.id),
      supabase.from("cartel_placas").update({ orden: ordenA }).eq("id", vecina.id),
    ]);

    if (r1.error || r2.error) {
      setError(`No se pudo reordenar: ${(r1.error ?? r2.error)!.message}`);
      return;
    }

    setPlacas((ps) =>
      ps.map((p) =>
        p.id === placa.id ? { ...p, orden: nuevoA } : p.id === vecina.id ? { ...p, orden: ordenA } : p,
      ),
    );
  }

  async function subirFoto(archivo: File) {
    setSubiendo(true);
    setError(null);
    try {
      const ext = archivo.name.split(".").pop()?.toLowerCase() || "jpg";
      const nombre = `${crypto.randomUUID()}.${ext}`;

      const { error: e } = await supabase.storage.from("cartel").upload(nombre, archivo, {
        cacheControl: "3600",
        upsert: false,
      });
      if (e) throw e;

      const { data } = supabase.storage.from("cartel").getPublicUrl(nombre);
      set("imagen_url", data.publicUrl);
    } catch (e) {
      setError(`No se pudo subir la foto: ${(e as Error).message}`);
    } finally {
      setSubiendo(false);
    }
  }

  const ordenadas = [...placas].sort((a, b) => a.orden - b.orden || a.titulo.localeCompare(b.titulo, "es"));
  const enPantalla = ordenadas.filter((p) => estaVigente(p, hoy)).length;

  return (
    <div style={{ background: "#F2F6FC", minHeight: "100vh", padding: 16 }}>
      <ConfirmModal />

      <div style={{ maxWidth: 1200, margin: "0 auto" }}>
        {/* ---------- Encabezado ---------- */}
        <div
          style={{
            display: "flex",
            flexWrap: "wrap",
            gap: 12,
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: NAVY, margin: 0 }}>
              Cartel de los televisores
            </h1>
            <p style={{ fontSize: 13, color: "#666", margin: "4px 0 0" }}>
              {enPantalla > 0
                ? `${enPantalla} placa(s) rotando ahora en el local.`
                : "No hay placas vigentes: el televisor está mostrando el contenido de ejemplo."}
            </p>
          </div>

          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Link href="/" style={{ ...botonSecundario, textDecoration: "none" }}>
              <Home size={15} /> Inicio
            </Link>
            <a href="/cartel" target="_blank" rel="noreferrer" style={{ ...botonPrimario, textDecoration: "none" }}>
              <ExternalLink size={15} /> Abrir el cartel
            </a>
          </div>
        </div>

        {error && <Banner tono="error" texto={error} onCerrar={() => setError(null)} />}
        {aviso && <Banner tono="ok" texto={aviso} onCerrar={() => setAviso(null)} />}

        <div
          style={{
            display: "grid",
            // min(360px, 100%) evita que en un celular angosto la columna
            // ensanche el documento entero y deje los botones fuera de la vista.
            gridTemplateColumns: "repeat(auto-fit, minmax(min(360px, 100%), 1fr))",
            gap: 16,
            alignItems: "start",
          }}
        >
          {/* ---------- Lista ---------- */}
          <section style={tarjeta}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
              <h2 style={subtitulo}>Placas ({ordenadas.length})</h2>
              <button onClick={limpiar} style={botonPrimario}>
                <Plus size={15} /> Nueva
              </button>
            </div>

            {ordenadas.length === 0 && (
              <p style={{ fontSize: 13, color: "#888", padding: "16px 0" }}>
                Todavía no cargaste ninguna placa. Mientras tanto el televisor muestra un cartel de
                ejemplo, así que nunca queda en negro.
              </p>
            )}

            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {ordenadas.map((p, i) => {
                const vigente = estaVigente(p, hoy);
                return (
                  <div
                    key={p.id}
                    style={{
                      border: `1px solid ${editando === p.id ? NAVY : "#e0e0e0"}`,
                      borderRadius: 8,
                      padding: 10,
                      background: vigente ? "white" : "#f7f7f7",
                      opacity: vigente ? 1 : 0.72,
                      display: "flex",
                      gap: 10,
                      alignItems: "center",
                    }}
                  >
                    <span
                      style={{
                        width: 26,
                        height: 26,
                        borderRadius: 6,
                        background: p.color || NAVY,
                        flex: "0 0 auto",
                      }}
                    />

                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 14, fontWeight: 700, color: "#1A1A2E", overflowWrap: "anywhere" }}>
                        {p.titulo}
                      </div>
                      <div style={{ fontSize: 11, color: "#777", marginTop: 2 }}>
                        {p.seccion ? `${p.seccion} · ${p.tipo}` : `${p.tipo} · todas las pantallas`}
                        {p.precio != null && ` · ${fmtPrecio(p.precio)}`}
                        {` · ${p.duracion_seg}s`}
                        {!p.activa && " · apagada"}
                        {p.activa && !vigente && " · fuera de vigencia"}
                      </div>
                    </div>

                    <div style={{ display: "flex", gap: 4, flex: "0 0 auto" }}>
                      <button onClick={() => mover(p, -1)} disabled={i === 0} style={iconoBoton} title="Subir">
                        <ArrowUp size={15} />
                      </button>
                      <button
                        onClick={() => mover(p, 1)}
                        disabled={i === ordenadas.length - 1}
                        style={iconoBoton}
                        title="Bajar"
                      >
                        <ArrowDown size={15} />
                      </button>
                      <button
                        onClick={() => alternarActiva(p)}
                        style={iconoBoton}
                        title={p.activa ? "Apagar" : "Prender"}
                      >
                        {p.activa ? <Eye size={15} /> : <EyeOff size={15} />}
                      </button>
                      <button
                        onClick={() => {
                          setEditando(p.id);
                          setForm(formDesde(p));
                          setAviso(null);
                          setError(null);
                        }}
                        style={{ ...iconoBoton, width: "auto", padding: "0 10px", fontSize: 12, fontWeight: 700 }}
                      >
                        Editar
                      </button>
                      <button onClick={() => borrar(p)} style={{ ...iconoBoton, color: "#C0392B" }} title="Borrar">
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* ---------- Formulario + previsualización ---------- */}
          <section style={tarjeta}>
            <h2 style={{ ...subtitulo, marginBottom: 12 }}>
              {editando ? "Editar placa" : "Nueva placa"}
            </h2>

            <div style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 260px", minWidth: 0, display: "flex", flexDirection: "column", gap: 10 }}>
                <Campo etiqueta="Tipo">
                  <select value={form.tipo} onChange={(e) => set("tipo", e.target.value as TipoPlaca)} style={input}>
                    <option value="oferta">Oferta con precio</option>
                    <option value="imagen">Cartel ya diseñado (imagen sola)</option>
                    <option value="institucional">Institucional</option>
                    <option value="aviso">Aviso</option>
                  </select>
                </Campo>

                <Campo etiqueta="Sección del local">
                  {/* Lista abierta: se sugieren las de siempre, pero se puede
                      escribir una nueva sin tocar la base ni el código. */}
                  <input
                    value={form.seccion}
                    onChange={(e) => set("seccion", e.target.value)}
                    list="secciones-cartel"
                    placeholder="Carnicería (vacío = se ve en todas las pantallas)"
                    style={input}
                  />
                  <datalist id="secciones-cartel">
                    {SECCIONES_SUGERIDAS.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </Campo>

                <Campo etiqueta={form.tipo === "oferta" ? "Producto" : "Título"}>
                  <input
                    value={form.titulo}
                    onChange={(e) => set("titulo", e.target.value)}
                    placeholder={form.tipo === "oferta" ? "Asado de tira" : "Aceptamos todos los medios de pago"}
                    style={input}
                  />
                </Campo>

                <Campo etiqueta={form.tipo === "oferta" ? "Sección o detalle" : "Bajada"}>
                  <input
                    value={form.bajada}
                    onChange={(e) => set("bajada", e.target.value)}
                    placeholder={form.tipo === "oferta" ? "Carnicería" : "Débito · Crédito · QR"}
                    style={input}
                  />
                </Campo>

                {form.tipo === "oferta" && (
                  <>
                    <div style={{ display: "flex", gap: 10 }}>
                      <Campo etiqueta="Precio">
                        <input
                          value={form.precio}
                          onChange={(e) => set("precio", e.target.value)}
                          inputMode="decimal"
                          placeholder="8990"
                          style={input}
                        />
                      </Campo>
                      <Campo etiqueta="Precio anterior">
                        <input
                          value={form.precio_anterior}
                          onChange={(e) => set("precio_anterior", e.target.value)}
                          inputMode="decimal"
                          placeholder="11500"
                          style={input}
                        />
                      </Campo>
                    </div>
                    <Campo etiqueta="Unidad">
                      <input
                        value={form.unidad}
                        onChange={(e) => set("unidad", e.target.value)}
                        placeholder="el kilo"
                        style={input}
                      />
                    </Campo>
                  </>
                )}

                <Campo etiqueta="Color de fondo">
                  <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                    {COLORES.map((c) => (
                      <button
                        key={c.valor}
                        onClick={() => set("color", c.valor)}
                        title={c.nombre}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: 8,
                          background: c.valor,
                          border: form.color === c.valor ? "3px solid #1A1A2E" : "1px solid #ccc",
                          cursor: "pointer",
                        }}
                      />
                    ))}
                  </div>
                </Campo>

                <Campo etiqueta="Foto (opcional)">
                  <label style={{ ...botonSecundario, display: "inline-flex", cursor: "pointer" }}>
                    <ImageIcon size={15} />
                    {subiendo ? "Subiendo…" : form.imagen_url ? "Cambiar foto" : "Subir foto"}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display: "none" }}
                      disabled={subiendo}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) subirFoto(f);
                        e.target.value = "";
                      }}
                    />
                  </label>
                  {form.imagen_url && (
                    <button
                      onClick={() => set("imagen_url", "")}
                      style={{ ...botonSecundario, marginLeft: 8, color: "#C0392B" }}
                    >
                      Quitar
                    </button>
                  )}
                </Campo>

                <div style={{ display: "flex", gap: 10 }}>
                  <Campo etiqueta="Desde (opcional)">
                    <input
                      type="date"
                      value={form.vigencia_desde}
                      onChange={(e) => set("vigencia_desde", e.target.value)}
                      style={input}
                    />
                  </Campo>
                  <Campo etiqueta="Hasta (opcional)">
                    <input
                      type="date"
                      value={form.vigencia_hasta}
                      onChange={(e) => set("vigencia_hasta", e.target.value)}
                      style={input}
                    />
                  </Campo>
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <Campo etiqueta="Segundos en pantalla">
                    <input
                      type="number"
                      min={3}
                      max={60}
                      value={form.duracion_seg}
                      onChange={(e) => set("duracion_seg", e.target.value)}
                      style={input}
                    />
                  </Campo>
                  <Campo etiqueta="Orden">
                    <input
                      type="number"
                      value={form.orden}
                      onChange={(e) => set("orden", e.target.value)}
                      style={input}
                    />
                  </Campo>
                </div>

                <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "#333" }}>
                  <input type="checkbox" checked={form.activa} onChange={(e) => set("activa", e.target.checked)} />
                  Mostrarla en el televisor
                </label>

                <div style={{ display: "flex", gap: 8, marginTop: 4 }}>
                  <button onClick={guardar} disabled={guardando} style={{ ...botonPrimario, flex: 1, justifyContent: "center" }}>
                    {guardando ? "Guardando…" : editando ? "Guardar cambios" : "Crear placa"}
                  </button>
                  {editando && (
                    <button onClick={limpiar} style={botonSecundario}>
                      Cancelar
                    </button>
                  )}
                </div>
              </div>

              {/* Previsualización: el mismo componente que dibuja el televisor,
                  escalado con un --u fijo en vez del tamaño de la pantalla. */}
              <div style={{ flex: "0 0 auto", margin: "0 auto" }}>
                <p style={{ fontSize: 11, color: "#888", marginBottom: 6, textAlign: "center" }}>
                  Así se ve en el TV
                </p>
                <div
                  className="cartel-marco"
                  style={
                    {
                      "--u": "0.24px",
                      background: previa.color || NAVY,
                      borderRadius: 10,
                      boxShadow: "0 4px 18px rgba(0,0,0,0.25)",
                    } as CSSProperties
                  }
                >
                  <header className="cartel-header">
                    <div className="cartel-marca">
                      {/* eslint-disable-next-line @next/next/no-img-element -- igual que en la pantalla */}
                      <img className="cartel-logo" src="/logo.jpg" alt="" />
                      <span className="cartel-marca-texto">
                        El Nuevo
                        <br />
                        Rural
                      </span>
                    </div>
                    <span className="cartel-hora">--:--</span>
                  </header>
                  <main className="cartel-cuerpo">
                    <PlacaVista placa={previa} />
                  </main>
                  <footer className="cartel-pie">
                    <div className="cartel-progreso">
                      <div className="cartel-progreso-barra" style={{ animation: "none", width: "42%" }} />
                    </div>
                  </footer>
                </div>
              </div>
            </div>
          </section>
        </div>

        <p style={{ fontSize: 11, color: "#888", marginTop: 16, textAlign: "center" }}>
          Poné <strong>/cartel</strong> en el navegador del televisor y dejalo en pantalla completa.
          Los cambios llegan solos, en 5 minutos como máximo.
        </p>
      </div>
    </div>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "block", flex: 1, minWidth: 0 }}>
      <span style={{ display: "block", fontSize: 11, fontWeight: 700, color: "#555", marginBottom: 4 }}>
        {etiqueta}
      </span>
      {children}
    </label>
  );
}

function Banner({
  tono,
  texto,
  onCerrar,
}: {
  tono: "error" | "ok";
  texto: string;
  onCerrar: () => void;
}) {
  const c = tono === "error" ? { bg: "#FADBD8", fg: "#922B21" } : { bg: "#D5F5E3", fg: "#145A32" };
  return (
    <div
      style={{
        background: c.bg,
        color: c.fg,
        padding: "10px 14px",
        borderRadius: 8,
        marginBottom: 12,
        fontSize: 13,
        fontWeight: 600,
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
      }}
    >
      <span style={{ overflowWrap: "anywhere" }}>{texto}</span>
      <button onClick={onCerrar} style={{ background: "none", border: "none", color: c.fg, cursor: "pointer", fontWeight: 800 }}>
        ✕
      </button>
    </div>
  );
}

const tarjeta: CSSProperties = {
  background: "white",
  border: "1px solid #e0e0e0",
  borderRadius: 10,
  padding: 16,
};

const subtitulo: CSSProperties = {
  fontSize: 15,
  fontWeight: 800,
  color: NAVY,
  margin: 0,
};

const input: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  borderRadius: 6,
  border: "1px solid #ccc",
  fontSize: 13,
  color: "#1A1A2E",
  background: "white",
};

const botonPrimario: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: NAVY,
  color: "white",
  border: "none",
  borderRadius: 6,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const botonSecundario: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  background: "white",
  color: "#333",
  border: "1px solid #ccc",
  borderRadius: 6,
  padding: "8px 14px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
};

const iconoBoton: CSSProperties = {
  width: 30,
  height: 30,
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  background: "white",
  border: "1px solid #ddd",
  borderRadius: 6,
  cursor: "pointer",
  color: "#333",
};
