"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Image as ImageIcon, Plus, Trash2 } from "lucide-react";
import FlyerArte from "@/lib/flyer/FlyerArte";
import { MAX_PRODUCTOS, MEDIDAS, nombreArchivo, validarFlyer } from "@/lib/flyer/calculos";
import { SECCIONES_SUGERIDAS } from "@/lib/cartel/placas";
import { hoyISO } from "@/lib/fechas";
import type { Flyer, FormatoFlyer, ProductoFlyer } from "@/lib/flyer/tipos";

const AZUL = "#1F3864";
const ROJO = "#922B21";
const CLAVE = "flyer-el-nuevo-rural-v1";

const inputStyle = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #ccc",
  borderRadius: 6,
  fontSize: 14,
  boxSizing: "border-box" as const,
  minWidth: 0,
  fontFamily: "inherit",
};

const botonStyle = {
  border: "none",
  borderRadius: 6,
  padding: "9px 14px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
};

const labelStyle = { fontSize: 11, fontWeight: 700, color: "#666", display: "block", marginBottom: 3 } as const;

/** Lo que trae un flyer recién abierto: los datos del local ya cargados, sin productos. */
export const FLYER_INICIAL: Flyer = {
  titulo: "Ofertas de la semana",
  seccion: "",
  vigencia: "",
  productos: [],
  pie: {
    direccion: "Alvear N°637",
    telefono: "",
    horarios: "Lunes a sábados de 08:15 a 13:30 y de 17:00 a 22:00 · Domingos de 09:00 a 13:30",
    instagram: "@elnuevorural.super",
  },
};

const nuevoProducto = (): ProductoFlyer => ({
  id: crypto.randomUUID(),
  nombre: "",
  precio: null,
  precio_anterior: null,
  unidad: "el kilo",
  imagen_url: null,
});

/** Un monto tipeado a número; vacío es null para poder distinguirlo de un 0. */
const num = (s: string): number | null => {
  const t = s.trim();
  if (!t) return null;
  const n = parseFloat(t.replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const texto = (n: number | null): string => (n == null ? "" : String(n));

export interface HandlersFlyer {
  /** Sube la foto y devuelve su dirección pública, o el error a mostrar. */
  onSubirFoto: (archivo: File) => Promise<{ url: string } | { error: string }>;
  /** A dónde se le pide el PNG. La pantalla real usa /api/flyer. */
  endpoint: string;
}

/**
 * Lo último que quedó cargado (R3.7). Se lee al construir el estado y no en un efecto: así no
 * hay un primer dibujo vacío que después pisa lo guardado. Si el navegador no deja leer (modo
 * privado, permisos), se arranca en blanco y la pantalla funciona igual.
 *
 * Quien monta esta vista la carga sin render en el servidor, que es lo que permite mirar
 * localStorage acá sin que el HTML del servidor y el del navegador difieran.
 */
function flyerGuardado(): Flyer {
  try {
    const guardado = localStorage.getItem(CLAVE);
    if (guardado) {
      const parsed = JSON.parse(guardado) as Flyer;
      if (parsed && Array.isArray(parsed.productos)) {
        return { ...FLYER_INICIAL, ...parsed, pie: { ...FLYER_INICIAL.pie, ...parsed.pie } };
      }
    }
  } catch {
    /* sin memoria: se arranca con el flyer vacío */
  }
  return FLYER_INICIAL;
}

export default function FlyerVista({ handlers }: { handlers: HandlersFlyer }) {
  const [flyer, setFlyer] = useState<Flyer>(flyerGuardado);
  const [formato, setFormato] = useState<FormatoFlyer>("redes");
  const [error, setError] = useState("");
  const [subiendo, setSubiendo] = useState<string | null>(null);
  const [bajando, setBajando] = useState<FormatoFlyer | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(CLAVE, JSON.stringify(flyer));
    } catch {
      /* si no se puede guardar, no es motivo para romper la pantalla */
    }
  }, [flyer]);

  const set = <K extends keyof Flyer>(campo: K, valor: Flyer[K]) => setFlyer((f) => ({ ...f, [campo]: valor }));
  const setPie = (campo: keyof Flyer["pie"], valor: string) =>
    setFlyer((f) => ({ ...f, pie: { ...f.pie, [campo]: valor } }));

  const setProducto = (id: string, campo: keyof ProductoFlyer, valor: unknown) =>
    setFlyer((f) => ({
      ...f,
      productos: f.productos.map((p) => (p.id === id ? { ...p, [campo]: valor } : p)),
    }));

  const agregar = () =>
    setFlyer((f) => (f.productos.length >= MAX_PRODUCTOS ? f : { ...f, productos: [...f.productos, nuevoProducto()] }));

  const quitar = (id: string) => setFlyer((f) => ({ ...f, productos: f.productos.filter((p) => p.id !== id) }));

  const mover = (i: number, delta: number) =>
    setFlyer((f) => {
      const destino = i + delta;
      if (destino < 0 || destino >= f.productos.length) return f;
      const ps = [...f.productos];
      [ps[i], ps[destino]] = [ps[destino], ps[i]];
      return { ...f, productos: ps };
    });

  async function subirFoto(id: string, archivo: File) {
    setSubiendo(id);
    setError("");
    const res = await handlers.onSubirFoto(archivo);
    setSubiendo(null);
    if ("error" in res) setError(res.error);
    else setProducto(id, "imagen_url", res.url);
  }

  async function descargar(f: FormatoFlyer) {
    const problema = validarFlyer(flyer);
    if (problema) {
      setError(problema);
      return;
    }
    setError("");
    setBajando(f);
    try {
      const res = await fetch(handlers.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flyer, formato: f }),
      });
      if (!res.ok) {
        const cuerpo = await res.json().catch(() => null);
        setError(cuerpo?.error ?? `No se pudo generar la imagen (${res.status}).`);
        return;
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = nombreArchivo(f, hoyISO());
      document.body.appendChild(a);
      a.click();
      a.remove();
      // Sin esto el blob queda en memoria del navegador hasta cerrar la pestaña.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(`No se pudo generar la imagen: ${(e as Error).message}`);
    } finally {
      setBajando(null);
    }
  }

  return (
    <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start", minWidth: 0 }}>
      <div style={{ flex: "1 1 360px", minWidth: 0 }}>
        {error && (
          <div style={{ background: "#FADBD8", color: ROJO, padding: "10px 12px", borderRadius: 8, fontSize: 13, marginBottom: 12 }} data-test="flyer-error">
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginBottom: 14 }}>
          <div style={{ flex: "2 1 200px", minWidth: 0 }}>
            <label style={labelStyle}>Título</label>
            <input style={inputStyle} value={flyer.titulo} onChange={(e) => set("titulo", e.target.value)} data-test="flyer-titulo" />
          </div>
          <div style={{ flex: "1 1 140px", minWidth: 0 }}>
            <label style={labelStyle}>Sección (pinta el color)</label>
            <input
              style={inputStyle}
              value={flyer.seccion}
              onChange={(e) => set("seccion", e.target.value)}
              list="secciones-flyer"
              placeholder="Carnicería…"
              data-test="flyer-seccion"
            />
            <datalist id="secciones-flyer">
              {SECCIONES_SUGERIDAS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
          </div>
          <div style={{ flex: "1 1 160px", minWidth: 0 }}>
            <label style={labelStyle}>Vigencia (opcional)</label>
            <input style={inputStyle} value={flyer.vigencia} onChange={(e) => set("vigencia", e.target.value)} placeholder="Válidas hasta el sábado" data-test="flyer-vigencia" />
          </div>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 14 }}>
            Productos ({flyer.productos.length}/{MAX_PRODUCTOS})
          </strong>
          <button
            onClick={agregar}
            disabled={flyer.productos.length >= MAX_PRODUCTOS}
            style={{
              ...botonStyle,
              background: flyer.productos.length >= MAX_PRODUCTOS ? "#DDD" : AZUL,
              color: flyer.productos.length >= MAX_PRODUCTOS ? "#888" : "white",
              display: "inline-flex",
              alignItems: "center",
              gap: 5,
              cursor: flyer.productos.length >= MAX_PRODUCTOS ? "default" : "pointer",
            }}
            data-test="btn-agregar-producto"
          >
            <Plus size={14} /> Agregar
          </button>
        </div>

        {flyer.productos.length === 0 && (
          <p style={{ fontSize: 13, color: "#888", padding: "14px 0" }} data-test="sin-productos">
            Agregá el primer producto y vas a ver el flyer armarse al costado.
          </p>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {flyer.productos.map((p, i) => (
            <div key={p.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 10 }} data-test="fila-producto">
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
                <div style={{ flex: "2 1 150px", minWidth: 0 }}>
                  <label style={labelStyle}>Producto</label>
                  <input
                    style={inputStyle}
                    value={p.nombre}
                    onChange={(e) => setProducto(p.id, "nombre", e.target.value)}
                    placeholder="Asado"
                    data-test="producto-nombre"
                  />
                </div>
                <div style={{ flex: "1 1 96px", minWidth: 0 }}>
                  <label style={labelStyle}>Precio</label>
                  <input
                    style={inputStyle}
                    inputMode="decimal"
                    value={texto(p.precio)}
                    onChange={(e) => setProducto(p.id, "precio", num(e.target.value))}
                    data-test="producto-precio"
                  />
                </div>
                <div style={{ flex: "1 1 96px", minWidth: 0 }}>
                  <label style={labelStyle}>Antes (opc.)</label>
                  <input
                    style={inputStyle}
                    inputMode="decimal"
                    value={texto(p.precio_anterior)}
                    onChange={(e) => setProducto(p.id, "precio_anterior", num(e.target.value))}
                    data-test="producto-anterior"
                  />
                </div>
                <div style={{ flex: "1 1 96px", minWidth: 0 }}>
                  <label style={labelStyle}>Unidad</label>
                  <input
                    style={inputStyle}
                    value={p.unidad ?? ""}
                    onChange={(e) => setProducto(p.id, "unidad", e.target.value)}
                    data-test="producto-unidad"
                  />
                </div>
              </div>

              <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
                <label
                  style={{ ...botonStyle, background: "#F0F0F0", color: "#1A1A2E", display: "inline-flex", alignItems: "center", gap: 5 }}
                >
                  <ImageIcon size={14} />
                  {subiendo === p.id ? "Subiendo…" : p.imagen_url ? "Cambiar foto" : "Subir foto"}
                  <input
                    type="file"
                    accept="image/*"
                    style={{ display: "none" }}
                    disabled={subiendo !== null}
                    onChange={(e) => {
                      const archivo = e.target.files?.[0];
                      e.target.value = "";
                      if (archivo) void subirFoto(p.id, archivo);
                    }}
                    data-test="producto-foto"
                  />
                </label>
                {p.imagen_url && (
                  <button onClick={() => setProducto(p.id, "imagen_url", null)} style={{ ...botonStyle, background: "transparent", color: ROJO }}>
                    Quitar foto
                  </button>
                )}
                <div style={{ marginLeft: "auto", display: "flex", gap: 4 }}>
                  <button onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir producto" style={{ ...botonStyle, background: "#F0F0F0", color: "#1A1A2E", padding: "7px 9px", opacity: i === 0 ? 0.4 : 1 }}>
                    <ArrowUp size={13} />
                  </button>
                  <button onClick={() => mover(i, 1)} disabled={i === flyer.productos.length - 1} aria-label="Bajar producto" style={{ ...botonStyle, background: "#F0F0F0", color: "#1A1A2E", padding: "7px 9px", opacity: i === flyer.productos.length - 1 ? 0.4 : 1 }}>
                    <ArrowDown size={13} />
                  </button>
                  <button onClick={() => quitar(p.id)} aria-label="Quitar producto" style={{ ...botonStyle, background: "transparent", color: ROJO, padding: "7px 9px" }} data-test="btn-quitar-producto">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        <details style={{ marginTop: 16 }}>
          <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#555" }}>
            Datos del local (salen en el pie del flyer)
          </summary>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
            <div style={{ flex: "1 1 160px", minWidth: 0 }}>
              <label style={labelStyle}>Dirección</label>
              <input style={inputStyle} value={flyer.pie.direccion} onChange={(e) => setPie("direccion", e.target.value)} data-test="pie-direccion" />
            </div>
            <div style={{ flex: "1 1 130px", minWidth: 0 }}>
              <label style={labelStyle}>Teléfono</label>
              <input style={inputStyle} value={flyer.pie.telefono} onChange={(e) => setPie("telefono", e.target.value)} placeholder="opcional" />
            </div>
            <div style={{ flex: "1 1 130px", minWidth: 0 }}>
              <label style={labelStyle}>Instagram</label>
              <input style={inputStyle} value={flyer.pie.instagram} onChange={(e) => setPie("instagram", e.target.value)} />
            </div>
            <div style={{ flex: "1 1 100%", minWidth: 0 }}>
              <label style={labelStyle}>Horarios</label>
              <input style={inputStyle} value={flyer.pie.horarios} onChange={(e) => setPie("horarios", e.target.value)} />
            </div>
          </div>
        </details>
      </div>

      <Previa
        flyer={flyer}
        formato={formato}
        onFormato={setFormato}
        onDescargar={descargar}
        bajando={bajando}
        puede={flyer.productos.length > 0}
      />
    </div>
  );
}

/** La vista previa y los botones de descarga. */
function Previa({
  flyer,
  formato,
  onFormato,
  onDescargar,
  bajando,
  puede,
}: {
  flyer: Flyer;
  formato: FormatoFlyer;
  onFormato: (f: FormatoFlyer) => void;
  onDescargar: (f: FormatoFlyer) => void;
  bajando: FormatoFlyer | null;
  puede: boolean;
}) {
  const caja = useRef<HTMLDivElement>(null);
  const [ancho, setAncho] = useState(0);
  const medida = MEDIDAS[formato];

  // El arte se dibuja siempre a 1080 de ancho y se achica con scale: así la previa es el PNG
  // en chiquito, y no una maqueta parecida que después no coincide.
  const medir = useCallback(() => {
    if (caja.current) setAncho(caja.current.getBoundingClientRect().width);
  }, []);

  useEffect(() => {
    medir();
    const obs = new ResizeObserver(medir);
    if (caja.current) obs.observe(caja.current);
    return () => obs.disconnect();
  }, [medir]);

  const escala = ancho > 0 ? ancho / medida.ancho : 0;

  return (
    <div style={{ flex: "1 1 300px", minWidth: 0, maxWidth: 420, position: "sticky", top: 16 }}>
      <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
        {(Object.keys(MEDIDAS) as FormatoFlyer[]).map((f) => (
          <button
            key={f}
            onClick={() => onFormato(f)}
            style={{ ...botonStyle, background: formato === f ? AZUL : "#F0F0F0", color: formato === f ? "white" : "#1A1A2E" }}
            data-test={`formato-${f}`}
          >
            {MEDIDAS[f].etiqueta}
          </button>
        ))}
      </div>

      <div ref={caja} style={{ width: "100%", minWidth: 0 }}>
        <div
          style={{ width: "100%", height: escala ? medida.alto * escala : 0, overflow: "hidden", borderRadius: 10, border: "1px solid #ddd" }}
          data-test="flyer-previa"
          data-formato={formato}
        >
          {escala > 0 && (
            <div style={{ width: medida.ancho, height: medida.alto, transform: `scale(${escala})`, transformOrigin: "top left" }}>
              <FlyerArte flyer={flyer} formato={formato} />
            </div>
          )}
        </div>
      </div>

      <p style={{ fontSize: 11, color: "#888", margin: "8px 0 10px" }}>
        {medida.ancho}×{medida.alto} px · {medida.destino}
      </p>

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {(Object.keys(MEDIDAS) as FormatoFlyer[]).map((f) => (
          <button
            key={f}
            onClick={() => onDescargar(f)}
            disabled={!puede || bajando !== null}
            style={{
              ...botonStyle,
              background: puede ? AZUL : "#DDD",
              color: puede ? "white" : "#888",
              padding: "11px 14px",
              cursor: puede && bajando === null ? "pointer" : "default",
            }}
            data-test={`btn-descargar-${f}`}
          >
            {bajando === f ? "Armando la imagen…" : `Descargar para ${MEDIDAS[f].etiqueta}`}
          </button>
        ))}
      </div>
    </div>
  );
}
