"use client";

import { useMemo, useState, useSyncExternalStore, type CSSProperties } from "react";
import { ArrowDown, ArrowUp, Plus, X } from "lucide-react";
import { MAX_PRODUCTOS, nombreArchivo, validarFlyer } from "@/lib/flyer/calculos";
import { SECCIONES_SUGERIDAS, fmtPrecio } from "@/lib/cartel/placas";
import { hoyISO } from "@/lib/fechas";
import {
  CLAVE_FLYER_VIEJO,
  armarFlyer,
  leerFlyerViejo,
  moverEnFlyer,
  ofertasDelFlyer,
  type ConfigFlyer,
} from "@/lib/ofertas/flyer";
import type { Placa } from "@/lib/cartel/types";
import type { FormatoFlyer } from "@/lib/flyer/tipos";
import FlyerPrevia from "./FlyerPrevia";

const AZUL = "#1F3864";
const ROJO = "#922B21";

export interface AccionesFlyer {
  /** Marca o desmarca una oferta para el flyer. */
  alternarEnFlyer: (placa: Placa, enFlyer: boolean) => Promise<void>;
  /** Guarda los nuevos orden_flyer de las ofertas que se cruzaron. */
  reordenar: (cambios: { id: string; orden_flyer: number }[]) => Promise<void>;
  /** Guarda el encabezado y el pie. Devuelve el error a mostrar, o null. */
  guardarConfig: (config: ConfigFlyer) => Promise<string | null>;
  /** Lleva a la pestaña Ofertas con esa placa abierta para editar. */
  editar: (placa: Placa) => void;
  /** A dónde se le pide el PNG. La pantalla real usa /api/flyer. */
  endpoint: string;
}

/* El flyer viejo vivía en localStorage. Se lee con useSyncExternalStore para que el HTML del
   servidor (que no tiene localStorage) y el del navegador no discrepen al hidratar. */
const sinSuscripcion = () => () => {};
function leerGuardado(): string | null {
  try {
    return localStorage.getItem(CLAVE_FLYER_VIEJO);
  } catch {
    return null;
  }
}

export default function FlyerTab({
  placas,
  configInicial,
  faltaMigracion,
  acciones,
}: {
  placas: Placa[];
  configInicial: ConfigFlyer;
  faltaMigracion: boolean;
  acciones: AccionesFlyer;
}) {
  const [config, setConfig] = useState(configInicial);
  const [formato, setFormato] = useState<FormatoFlyer>("redes");
  const [error, setError] = useState("");
  const [bajando, setBajando] = useState<FormatoFlyer | null>(null);
  const [descartado, setDescartado] = useState(false);

  const hoy = hoyISO();
  const { entran, afuera, noVigentes, disponibles } = useMemo(() => ofertasDelFlyer(placas, hoy), [placas, hoy]);
  const flyer = useMemo(() => armarFlyer(config, entran), [config, entran]);

  const guardado = useSyncExternalStore(sinSuscripcion, leerGuardado, () => null);
  const viejo = descartado ? null : leerFlyerViejo(guardado);

  const set = (campo: keyof ConfigFlyer, valor: string) => setConfig((c) => ({ ...c, [campo]: valor }));

  /** Se guarda al salir del campo: escribir no dispara un guardado por letra. */
  async function guardarConfig(nueva: ConfigFlyer = config) {
    const e = await acciones.guardarConfig(nueva);
    if (e) setError(e);
  }

  async function traerViejo() {
    if (!viejo) return;
    setConfig(viejo.config);
    const e = await acciones.guardarConfig(viejo.config);
    if (e) {
      setError(e);
      return;
    }
    olvidarViejo();
  }

  function olvidarViejo() {
    try {
      localStorage.removeItem(CLAVE_FLYER_VIEJO);
    } catch {
      /* si no se puede borrar, al menos no se vuelve a mostrar en esta visita */
    }
    setDescartado(true);
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
      const res = await fetch(acciones.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flyer, formato: f }),
      });
      if (!res.ok) {
        const cuerpo = await res.json().catch(() => null);
        setError(cuerpo?.error ?? `No se pudo generar la imagen (${res.status}).`);
        return;
      }
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = nombreArchivo(f, hoy);
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

  const campo = (clave: keyof ConfigFlyer, etiqueta: string, extra: { placeholder?: string; list?: string; flex?: string } = {}) => (
    <div style={{ flex: extra.flex ?? "1 1 160px", minWidth: 0 }}>
      <label style={labelStyle}>{etiqueta}</label>
      <input
        style={inputStyle}
        value={config[clave]}
        placeholder={extra.placeholder}
        list={extra.list}
        onChange={(e) => set(clave, e.target.value)}
        onBlur={() => void guardarConfig()}
        data-test={`flyer-${clave}`}
      />
    </div>
  );

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 14 }}>
      {faltaMigracion && (
        <div style={{ background: "#FDEBD0", color: "#784212", padding: "12px 14px", borderRadius: 8, fontSize: 13 }} data-test="falta-migracion-flyer">
          <strong>Falta crear la tabla del flyer.</strong> Hay que pegar <code>supabase/023_ofertas_flyer.sql</code> en el
          editor SQL de Supabase y recargar. Mientras tanto no se puede marcar ofertas ni guardar el encabezado.
        </div>
      )}

      {viejo && (
        <div style={{ background: "#EAF2FB", border: "1px solid #AFC8E6", padding: "12px 14px", borderRadius: 8, fontSize: 13 }} data-test="aviso-flyer-viejo">
          <strong>En este navegador había un flyer armado antes de unificar.</strong>{" "}
          Podés traer el título y los datos del local.
          {viejo.productos.length > 0 && (
            <>
              {" "}Tenía estos productos, que ahora se eligen de la lista de ofertas: <strong>{viejo.productos.join(", ")}</strong>.
            </>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
            <button onClick={() => void traerViejo()} style={{ ...boton, background: AZUL, color: "white" }} data-test="traer-flyer-viejo">
              Traer título y datos del local
            </button>
            <button onClick={olvidarViejo} style={{ ...boton, background: "white", color: "#333", border: "1px solid #ccc" }}>
              No, gracias
            </button>
          </div>
        </div>
      )}

      {error && (
        <div style={{ background: "#FADBD8", color: ROJO, padding: "10px 12px", borderRadius: 8, fontSize: 13 }} data-test="flyer-error">
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 20, flexWrap: "wrap", alignItems: "flex-start", minWidth: 0 }}>
        <div style={{ flex: "1 1 360px", minWidth: 0, display: "grid", gap: 14 }}>
          <div style={tarjeta}>
            <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
              {campo("titulo", "Título", { flex: "2 1 200px" })}
              {campo("seccion", "Sección (pinta el color)", { placeholder: "Carnicería…", list: "secciones-flyer", flex: "1 1 140px" })}
              {campo("vigencia", "Vigencia (opcional)", { placeholder: "Válidas hasta el sábado" })}
            </div>
            <datalist id="secciones-flyer">
              {SECCIONES_SUGERIDAS.map((s) => (
                <option key={s} value={s} />
              ))}
            </datalist>
            <details style={{ marginTop: 12 }}>
              <summary style={{ cursor: "pointer", fontSize: 13, fontWeight: 700, color: "#555" }}>Datos del local (salen en el pie del flyer)</summary>
              <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 10 }}>
                {campo("direccion", "Dirección")}
                {campo("telefono", "Teléfono", { placeholder: "opcional", flex: "1 1 130px" })}
                {campo("instagram", "Instagram", { flex: "1 1 130px" })}
                {campo("horarios", "Horarios", { flex: "1 1 100%" })}
              </div>
            </details>
          </div>

          <div style={tarjeta}>
            <strong style={{ fontSize: 14, color: AZUL }}>
              En el flyer ({entran.length}/{MAX_PRODUCTOS})
            </strong>
            <p style={{ fontSize: 12, color: "#666", margin: "4px 0 10px" }}>
              Las ofertas marcadas que están vigentes hoy. Cuando una vence, sale sola del flyer y del televisor.
            </p>
            {entran.length === 0 && (
              <p style={{ fontSize: 13, color: "#888", padding: "8px 0" }} data-test="sin-productos">
                Todavía no hay ofertas en el flyer. Sumalas de la lista de abajo, o tildá «Va en el flyer» al cargar una oferta.
              </p>
            )}
            <div style={{ display: "grid", gap: 6 }}>
              {entran.map((p, i) => (
                <FilaOferta key={p.id} placa={p} data-test="fila-flyer">
                  <button onClick={() => void mover(p, -1)} disabled={i === 0} aria-label={`Subir ${p.titulo}`} style={{ ...icono, opacity: i === 0 ? 0.35 : 1 }}>
                    <ArrowUp size={14} />
                  </button>
                  <button onClick={() => void mover(p, 1)} disabled={i === entran.length - 1} aria-label={`Bajar ${p.titulo}`} style={{ ...icono, opacity: i === entran.length - 1 ? 0.35 : 1 }}>
                    <ArrowDown size={14} />
                  </button>
                  <button onClick={() => acciones.editar(p)} style={{ ...icono, width: "auto", padding: "0 8px", fontSize: 12, fontWeight: 700 }}>
                    Editar
                  </button>
                  <button onClick={() => void acciones.alternarEnFlyer(p, false)} aria-label={`Sacar ${p.titulo} del flyer`} style={{ ...icono, color: ROJO }} data-test="sacar-del-flyer">
                    <X size={14} />
                  </button>
                </FilaOferta>
              ))}
            </div>

            {afuera.length > 0 && (
              <div style={{ marginTop: 10, background: "#FEF5E7", color: "#7E5109", padding: "8px 10px", borderRadius: 6, fontSize: 12 }} data-test="aviso-afuera">
                En un flyer entran hasta {MAX_PRODUCTOS} productos. Quedan afuera: <strong>{afuera.map((p) => p.titulo).join(", ")}</strong>. Sacá alguna de las de arriba para que entren.
              </div>
            )}
            {noVigentes.length > 0 && (
              <p style={{ fontSize: 12, color: "#777", margin: "10px 0 0" }} data-test="aviso-no-vigentes">
                Marcadas pero no vigentes hoy (apagadas o fuera de fecha): {noVigentes.map((p) => p.titulo).join(", ")}. Vuelven solas cuando estén vigentes.
              </p>
            )}
          </div>

          <div style={tarjeta}>
            <strong style={{ fontSize: 14, color: AZUL }}>Ofertas que podés sumar</strong>
            {disponibles.length === 0 ? (
              <p style={{ fontSize: 12, color: "#888", margin: "6px 0 0" }} data-test="sin-disponibles">
                No hay otras ofertas vigentes con precio. Se cargan en la pestaña Ofertas.
              </p>
            ) : (
              <div style={{ display: "grid", gap: 6, marginTop: 8 }}>
                {disponibles.map((p) => (
                  <FilaOferta key={p.id} placa={p} data-test="fila-disponible">
                    <button
                      onClick={() => void acciones.alternarEnFlyer(p, true)}
                      disabled={faltaMigracion}
                      style={{ ...icono, width: "auto", padding: "0 10px", fontSize: 12, fontWeight: 700, color: AZUL, gap: 4 }}
                      data-test="sumar-al-flyer"
                    >
                      <Plus size={13} /> Sumar
                    </button>
                  </FilaOferta>
                ))}
              </div>
            )}
          </div>
        </div>

        <FlyerPrevia flyer={flyer} formato={formato} onFormato={setFormato} onDescargar={(f) => void descargar(f)} bajando={bajando} puede={entran.length > 0} />
      </div>
    </div>
  );

  async function mover(p: Placa, delta: -1 | 1) {
    const cambios = moverEnFlyer(entran, p.id, delta);
    if (cambios) await acciones.reordenar(cambios);
  }
}

function FilaOferta({ placa, children, "data-test": dataTest }: { placa: Placa; children: React.ReactNode; "data-test": string }) {
  return (
    <div style={{ display: "flex", gap: 8, alignItems: "center", border: "1px solid #e3e3e3", borderRadius: 8, padding: "7px 9px" }} data-test={dataTest}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, overflowWrap: "anywhere" }}>{placa.titulo}</div>
        <div style={{ fontSize: 11, color: "#777" }}>
          {placa.precio != null ? fmtPrecio(Number(placa.precio)) : "sin precio"}
          {placa.unidad ? ` ${placa.unidad}` : ""}
          {placa.seccion ? ` · ${placa.seccion}` : ""}
          {placa.vigencia_hasta ? ` · hasta ${placa.vigencia_hasta.split("-").reverse().join("/")}` : ""}
        </div>
      </div>
      <div style={{ display: "flex", gap: 4, flex: "0 0 auto" }}>{children}</div>
    </div>
  );
}

const tarjeta: CSSProperties = { background: "white", border: "1px solid #e0e0e0", borderRadius: 10, padding: 14 };
const labelStyle = { fontSize: 11, fontWeight: 700, color: "#666", display: "block", marginBottom: 3 } as const;
const inputStyle: CSSProperties = {
  width: "100%",
  padding: "8px 10px",
  border: "1px solid #ccc",
  borderRadius: 6,
  fontSize: 14,
  boxSizing: "border-box",
  minWidth: 0,
  fontFamily: "inherit",
  // Explícito: con el sistema en modo oscuro el body hereda letra clara.
  color: "#1A1A2E",
  background: "white",
};
const boton: CSSProperties = { border: "none", borderRadius: 6, padding: "8px 12px", fontSize: 13, fontWeight: 700, cursor: "pointer" };
const icono: CSSProperties = {
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
