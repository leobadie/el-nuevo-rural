"use client";

import { useEffect, useMemo, useState, useSyncExternalStore, type CSSProperties } from "react";
import { Check, Copy, Eye, Link2, Monitor, Pencil, X } from "lucide-react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";
import { NAVY, SECCIONES_SUGERIDAS, estadoTv, navegadorCorto } from "@/lib/cartel/placas";
import type { Dispositivo, Latido, Pantalla } from "@/lib/cartel/types";

/** Cada cuánto el admin vuelve a mirar qué televisores están prendidos. */
const MIRAR_LATIDOS_MS = 60 * 1000;

/**
 * Cada cuánto se releen las teles vinculadas y las que esperan código. Corto:
 * quien vincula está parado frente a la tele esperando verla aparecer.
 */
const MIRAR_TELES_MS = 5 * 1000;

/** La dirección del sitio no cambia mientras la página está abierta. */
const sinSuscripcion = () => () => {};

/** "hace 20 s", "hace 3 min", "hace 2 h", "hace 4 días". */
function haceCuanto(iso: string, ahora: number): string {
  const seg = Math.max(0, Math.round((ahora - new Date(iso).getTime()) / 1000));
  if (seg < 60) return `hace ${seg} s`;
  if (seg < 3600) return `hace ${Math.round(seg / 60)} min`;
  if (seg < 86400) return `hace ${Math.round(seg / 3600)} h`;
  return `hace ${Math.round(seg / 86400)} días`;
}

/** Mensaje de error de las funciones de la base, sin el prefijo técnico. */
function mensajeDeBase(msg: string): string {
  if (msg.includes("cartel_vincular") && msg.includes("does not exist")) {
    return "Falta aplicar la migración 031 en Supabase.";
  }
  return msg;
}

function horaCorta(iso: string): string {
  const d = new Date(iso);
  const hoy = new Date();
  const hora = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  if (d.toDateString() === hoy.toDateString()) return `las ${hora}`;
  const dia = new Intl.DateTimeFormat("es-AR", {
    timeZone: "America/Argentina/Buenos_Aires",
    day: "numeric",
    month: "numeric",
  }).format(d);
  return `el ${dia} a las ${hora}`;
}

/** Punto de color y texto del estado de un televisor. */
function EstadoTvLinea({ latido, ahora }: { latido: Latido | undefined; ahora: number }) {
  const estado = estadoTv(latido?.visto_el, ahora);
  const color = estado === "conectado" ? "#1E7B4D" : estado === "sin-senal" ? "#B42318" : "#94A3B8";
  const texto =
    estado === "conectado"
      ? "Conectado"
      : estado === "sin-senal"
        ? `Sin señal desde ${horaCorta(latido!.visto_el)}`
        : "Nunca se conectó";

  return (
    <div
      style={{ fontSize: 12, color: "#475569", display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}
      title={latido?.navegador ?? undefined}
      data-estado-tv={estado}
    >
      <span style={{ width: 8, height: 8, borderRadius: "50%", background: color, flexShrink: 0 }} />
      <span style={{ color, fontWeight: 600 }}>{texto}</span>
      {latido && (
        <span>
          · {navegadorCorto(latido.navegador)}
          {latido.ancho && latido.alto ? ` · ${latido.ancho}×${latido.alto}` : ""}
        </span>
      )}
    </div>
  );
}

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

const VACIO = { slug: "", nombre: "", seccion: "", activa: true, orden: 0, rotacion: 0 };

/** Cómo está montado el TV, en palabras de quien lo mira y no en grados. */
const GIROS = [
  { valor: 0, texto: "Derecho (no girar)" },
  { valor: 270, texto: "Parado, girado a la izquierda" },
  { valor: 90, texto: "Parado, girado a la derecha" },
];

export default function PantallasPanel({
  pantallasIniciales,
  userId,
  onError,
  onAviso,
  cliente,
}: {
  pantallasIniciales: Pantalla[];
  userId: string;
  onError: (m: string | null) => void;
  onAviso: (m: string | null) => void;
  /** El mismo cliente del admin (en el banco de pruebas, una base en memoria). */
  cliente?: SupabaseClient;
}) {
  const supabase = useMemo(() => cliente ?? createClient(), [cliente]);

  const [pantallas, setPantallas] = useState<Pantalla[]>(pantallasIniciales);
  const [form, setForm] = useState<typeof VACIO>(VACIO);
  const [editando, setEditando] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [copiado, setCopiado] = useState<string | null>(null);
  const [latidos, setLatidos] = useState<Record<string, Latido>>({});
  const [ahora, setAhora] = useState(() => Date.now());
  // Hasta la primera lectura todos figuran "nunca": la marca le dice a la
  // verificación que ya puede creerle a lo que ve.
  const [latidosLeidos, setLatidosLeidos] = useState(false);

  // ---- Teles vinculadas por código (migración 031) ----
  // null = todavía no se leyó o falta la migración: la sección no se muestra.
  const [teles, setTeles] = useState<Dispositivo[] | null>(null);
  const [codigo, setCodigo] = useState("");
  const [destino, setDestino] = useState("");
  const [vinculando, setVinculando] = useState(false);
  const [vueltaTeles, setVueltaTeles] = useState(0);
  // En el servidor no hay window: vacío ahí, y React lo completa sin marcar diferencia.
  const host = useSyncExternalStore(
    sinSuscripcion,
    () => window.location.host,
    () => "",
  );

  useEffect(() => {
    let vivo = true;
    let id: number | undefined;
    async function mirar() {
      const { data, error } = await supabase
        .from("cartel_dispositivos")
        .select("codigo, pantalla_slug, visto_el, vinculado_el, navegador, ancho, alto");
      if (!vivo) return;
      if (error) {
        // Sin la migración 031 la tabla no existe: no se insiste cada 5 s.
        console.error("cartel/admin: no se pudieron leer las teles:", error.message);
        return;
      }
      setTeles((data ?? []) as Dispositivo[]);
      setAhora(Date.now());
      id = window.setTimeout(mirar, MIRAR_TELES_MS);
    }
    mirar();
    return () => {
      vivo = false;
      window.clearTimeout(id);
    };
  }, [supabase, vueltaTeles]);

  const esperando = (teles ?? [])
    .filter((t) => !t.pantalla_slug)
    .sort((a, b) => b.visto_el.localeCompare(a.visto_el));
  const activas = pantallas
    .filter((p) => p.activa)
    .sort((a, b) => a.orden - b.orden || a.nombre.localeCompare(b.nombre, "es"));

  async function vincular() {
    const cod = codigo.replace(/\D/g, "");
    if (cod.length !== 4) {
      onError("El código tiene 4 cifras: es el número grande que muestra la tele.");
      return;
    }
    if (!destino) {
      onError("Elegí qué televisor es.");
      return;
    }
    setVinculando(true);
    onError(null);
    const { error } = await supabase.rpc("cartel_vincular", { p_codigo: cod, p_slug: destino });
    setVinculando(false);
    if (error) {
      onError(`No se pudo vincular: ${mensajeDeBase(error.message)}`);
      return;
    }
    const nombre = pantallas.find((p) => p.slug === destino)?.nombre ?? destino;
    onAviso(`Listo: la tele ${cod} es ${nombre}. En unos segundos muestra su nombre en grande.`);
    setCodigo("");
    setDestino("");
    setVueltaTeles((v) => v + 1);
  }

  async function identificar(p: Pantalla) {
    const { error } = await supabase.rpc("cartel_identificar", { p_slug: p.slug });
    if (error) {
      onError(`No se pudo identificar: ${mensajeDeBase(error.message)}`);
      return;
    }
    onAviso(`${p.nombre}: en menos de 15 segundos muestra su nombre en grande, durante 30 segundos.`);
  }

  async function mover(t: Dispositivo, slug: string) {
    const { error } = await supabase
      .from("cartel_dispositivos")
      .update({ pantalla_slug: slug, vinculado_el: new Date().toISOString() })
      .eq("codigo", t.codigo);
    if (error) {
      onError(`No se pudo mover: ${error.message}`);
      return;
    }
    // Que muestre el nombre al llegar, igual que al vincularla.
    await supabase.rpc("cartel_identificar", { p_slug: slug });
    const nombre = pantallas.find((p) => p.slug === slug)?.nombre ?? slug;
    onAviso(`La tele ${t.codigo} pasa a mostrar ${nombre} en menos de 15 segundos.`);
    setVueltaTeles((v) => v + 1);
  }

  async function desvincular(t: Dispositivo) {
    if (!window.confirm(`¿Desvincular la tele ${t.codigo}? Va a volver a mostrar un código.`)) return;
    const { error } = await supabase.from("cartel_dispositivos").delete().eq("codigo", t.codigo);
    if (error) {
      onError(`No se pudo desvincular: ${error.message}`);
      return;
    }
    onAviso(`Tele ${t.codigo} desvinculada: en menos de 15 segundos muestra un código nuevo.`);
    setVueltaTeles((v) => v + 1);
  }

  // Qué televisores están prendidos. Si la migración 027 no está aplicada la
  // consulta falla y la lista sigue andando, solo que sin el estado.
  useEffect(() => {
    let vivo = true;
    async function mirar() {
      const { data, error } = await supabase
        .from("cartel_latidos")
        .select("pantalla_slug, visto_el, navegador, version, ancho, alto");
      if (!vivo) return;
      if (error) {
        console.error("cartel/admin: no se pudieron leer los latidos:", error.message);
      } else if (data) {
        setLatidos(Object.fromEntries((data as Latido[]).map((l) => [l.pantalla_slug, l])));
      }
      setAhora(Date.now());
      setLatidosLeidos(true);
    }
    mirar();
    const id = setInterval(mirar, MIRAR_LATIDOS_MS);
    return () => {
      vivo = false;
      clearInterval(id);
    };
  }, [supabase]);

  // El slug se arma solo desde el nombre mientras se da de alta. Al editar no se
  // toca: cambiarlo dejaría al televisor apuntando a una dirección que ya no
  // existe, y nadie se enteraría hasta pasar por el local.
  const slugPropuesto = editando ?? (form.slug || aSlug(form.nombre));
  // La fila trae el giro solo si la migración 028 está aplicada: recién ahí se
  // puede mandar siempre, incluso para volver a "derecho".
  const editandoConGiro = editando != null && pantallas.find((p) => p.slug === editando)?.rotacion !== undefined;

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
      // Solo se manda si hace falta: así guardar un televisor sigue andando aunque
      // la migración 028 todavía no esté aplicada.
      ...(form.rotacion || editandoConGiro ? { rotacion: form.rotacion } : {}),
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
    <section style={tarjeta} data-latidos={latidosLeidos ? "leidos" : "pendientes"}>
      <h2 style={subtitulo}>
        <Monitor size={16} /> Televisores del local
      </h2>

      <p style={{ fontSize: 13, color: "#666", margin: "0 0 12px" }}>
        Cada televisor muestra lo de su sector. Los que no tienen sector muestran todo
        lo que no esté asignado a otro. Con el ojo, la tele muestra su nombre en grande.
      </p>

      {/* ---------- Vincular por código ---------- */}
      {teles && (
        <div style={cajaVincular} data-test="vincular">
          <div style={{ fontWeight: 800, color: NAVY, fontSize: 14, display: "flex", alignItems: "center", gap: 6 }}>
            <Link2 size={15} /> Vincular una tele
          </div>
          <p style={{ fontSize: 12, color: "#475569", margin: "4px 0 10px" }}>
            En la tele abrí <strong>{host}/tv</strong>.
            Va a mostrar un número grande: escribilo acá y elegí qué televisor es.
          </p>
          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))" }}>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={etiqueta}>Código de la tele</span>
              <input
                style={{ ...input, fontSize: 18, fontWeight: 700, letterSpacing: 2 }}
                inputMode="numeric"
                maxLength={4}
                value={codigo}
                onChange={(e) => setCodigo(e.target.value.replace(/\D/g, "").slice(0, 4))}
                placeholder="0000"
                data-test="codigo"
              />
            </label>
            <label style={{ display: "grid", gap: 4 }}>
              <span style={etiqueta}>Es el televisor…</span>
              <select style={input} value={destino} onChange={(e) => setDestino(e.target.value)} data-test="destino">
                <option value="">Elegí</option>
                {activas.map((p) => (
                  <option key={p.slug} value={p.slug}>
                    {p.nombre}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <button
            type="button"
            onClick={vincular}
            disabled={vinculando}
            style={{ ...botonPrimario, marginTop: 10 }}
            data-test="vincular-boton"
          >
            {vinculando ? "Vinculando…" : "Vincular"}
          </button>

          <div style={{ marginTop: 12 }}>
            <div style={etiqueta}>Teles esperando que las vinculen</div>
            {esperando.length === 0 ? (
              <p style={{ fontSize: 12, color: "#94A3B8", margin: "4px 0 0" }}>
                Ninguna. Cuando una tele abra /tv aparece acá en unos segundos.
              </p>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                {esperando.map((t) => (
                  <button
                    key={t.codigo}
                    type="button"
                    onClick={() => setCodigo(t.codigo)}
                    style={{
                      ...chipTele,
                      borderColor: codigo === t.codigo ? NAVY : "#CBD5E1",
                    }}
                    title="Usar este código"
                    data-test="tele-esperando"
                  >
                    <strong style={{ fontSize: 16, letterSpacing: 1 }}>{t.codigo}</strong>
                    <span style={{ fontSize: 11, color: "#64748B" }}>
                      {t.ancho && t.alto ? `${t.ancho}×${t.alto} · ` : ""}
                      {haceCuanto(t.visto_el, ahora)}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

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
                {p.rotacion ? ` · ${GIROS.find((g) => g.valor === p.rotacion)?.texto.toLowerCase()}` : ""}
              </div>
              {p.activa && <EstadoTvLinea latido={latidos[p.slug]} ahora={ahora} />}
              {(teles ?? [])
                .filter((t) => t.pantalla_slug === p.slug)
                .map((t) => (
                  <div
                    key={t.codigo}
                    style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6, fontSize: 12, color: "#475569", marginTop: 4 }}
                    data-test="tele-vinculada"
                  >
                    <span>
                      Tele <strong>{t.codigo}</strong> · vista {haceCuanto(t.visto_el, ahora)}
                    </span>
                    <select
                      style={{ ...input, width: "auto", padding: "2px 6px", fontSize: 12 }}
                      value=""
                      onChange={(e) => e.target.value && mover(t, e.target.value)}
                      title="Pasar esta tele a otro televisor"
                    >
                      <option value="">Mover a…</option>
                      {activas
                        .filter((x) => x.slug !== p.slug)
                        .map((x) => (
                          <option key={x.slug} value={x.slug}>
                            {x.nombre}
                          </option>
                        ))}
                    </select>
                    <button type="button" onClick={() => desvincular(t)} style={botonChico}>
                      Desvincular
                    </button>
                  </div>
                ))}
            </div>

            <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
              {p.activa && (
                <button
                  type="button"
                  onClick={() => identificar(p)}
                  style={iconoBoton}
                  title="Identificar: la tele muestra su nombre en grande 30 segundos"
                  data-test={`identificar-${p.slug}`}
                >
                  <Eye size={15} />
                </button>
              )}
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
                    rotacion: p.rotacion ?? 0,
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
        <label style={{ display: "grid", gap: 4 }}>
          <span style={etiqueta}>Cómo está montado</span>
          <select
            style={input}
            value={form.rotacion}
            onChange={(e) => setForm((f) => ({ ...f, rotacion: Number(e.target.value) }))}
          >
            {GIROS.map((g) => (
              <option key={g.valor} value={g.valor}>
                {g.texto}
              </option>
            ))}
          </select>
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

const cajaVincular: CSSProperties = {
  border: "1px solid #FDE68A",
  background: "#FFFBEB",
  borderRadius: 10,
  padding: 12,
  marginBottom: 16,
};

const chipTele: CSSProperties = {
  display: "grid",
  gap: 2,
  justifyItems: "start",
  padding: "6px 10px",
  border: "1px solid #CBD5E1",
  borderRadius: 8,
  background: "#fff",
  color: NAVY,
  cursor: "pointer",
};

const botonChico: CSSProperties = {
  border: "1px solid #CBD5E1",
  borderRadius: 6,
  background: "#fff",
  color: "#B42318",
  fontSize: 12,
  padding: "2px 8px",
  cursor: "pointer",
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

