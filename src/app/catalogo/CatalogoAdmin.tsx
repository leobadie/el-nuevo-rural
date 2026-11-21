"use client";

import { AlertTriangle, CheckCircle2, Clock, FileSpreadsheet, Loader2, Store, Truck } from "lucide-react";
import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import { createClient } from "@/lib/supabase/client";
import { DIAS, ORDEN_SEMANA, validarHorario, type Horario } from "@/lib/tienda/envio";
import { formatoPrecio } from "@/lib/tienda/formato";
import { HOJA_XRP, prepararFilas, type Preparado } from "@/lib/tienda/importar";
import { ErrorXlsx, leerHoja } from "@/lib/tienda/xlsx";
import { refrescarTienda } from "./acciones";

export type ConfigAdmin = {
  abierta: boolean;
  whatsapp: string | null;
  direccion_retiro: string | null;
  costo_envio_centavos: number | null;
  envio_gratis_desde_centavos: number | null;
  minimo_envio_centavos: number | null;
  horario: Horario | null;
};

/** Lo que se edita: 2 franjas por día, como texto "HH:MM" (vacío = sin franja). */
type HorarioEditable = Record<string, [[string, string], [string, string]]>;

const conCero = (h: string) => (/^\d:/.test(h) ? "0" + h : h); // <input type="time"> pide "08:00"

function aEditable(h: Horario | null): HorarioEditable {
  const e: HorarioEditable = {};
  for (let d = 0; d <= 6; d++) {
    const f = h?.[String(d) as keyof Horario] ?? [];
    e[String(d)] = [
      [conCero(f[0]?.[0] ?? ""), conCero(f[0]?.[1] ?? "")],
      [conCero(f[1]?.[0] ?? ""), conCero(f[1]?.[1] ?? "")],
    ];
  }
  return e;
}

/** "$ 1.500" / "1500" / "" → centavos (null si está vacío; NaN si no es un número). */
function pesosACentavos(v: string): number | null {
  const limpio = v.replace(/[$\s.]/g, "").replace(",", ".");
  if (!limpio) return null;
  const n = Number(limpio);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) : NaN;
}
const centavosAPesos = (c: number | null) => (c ? String(Math.round(c / 100)) : "");
export type UltimaImportacion = {
  archivo: string;
  filas: number;
  nuevos: number;
  cambios_de_precio: number;
  retirados: number;
  creado_el: string;
};

type Vista = {
  aplicado: boolean;
  filas: number;
  nuevos: number;
  cambios_de_precio: number;
  iguales: number;
  retirados: number;
  vuelven: number;
  ofertas_que_terminan: number;
  mayores_cambios: { codigo_xrp: string; nombre: string; antes: number; ahora: number; variacion: number }[];
};

const ROJO = "#B80F0A";
const caja: CSSProperties = { background: "white", border: "1px solid #e0e0e0", borderRadius: 10, padding: 16, marginBottom: 14 };
const boton = (fondo: string, deshabilitado = false): CSSProperties => ({
  background: fondo, color: "white", border: "none", borderRadius: 8, padding: "0 16px", height: 44,
  fontWeight: 700, fontSize: 14, cursor: deshabilitado ? "not-allowed" : "pointer", opacity: deshabilitado ? 0.5 : 1,
  display: "inline-flex", alignItems: "center", gap: 8,
});
const input: CSSProperties = { height: 44, border: "1px solid #8c7b6b", borderRadius: 8, padding: "0 12px", fontSize: 16, width: "100%", boxSizing: "border-box" };

function Dato({ etiqueta, valor, test, alerta }: { etiqueta: string; valor: ReactNode; test?: string; alerta?: boolean }) {
  return (
    <div style={{ background: alerta ? "#fff1d1" : "#F8F9FA", borderRadius: 8, padding: "10px 12px", minWidth: 0 }}>
      <div style={{ fontSize: 11, color: "#555", fontWeight: 700, textTransform: "uppercase" }}>{etiqueta}</div>
      <div data-test={test} style={{ fontSize: 22, fontWeight: 800 }}>{valor}</div>
    </div>
  );
}

const grilla: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 8 };

export function CatalogoAdmin({
  faltaMigracion,
  config: inicial,
  ultima: ultimaInicial,
  productosPublicados,
}: {
  faltaMigracion: boolean;
  config: ConfigAdmin;
  ultima: UltimaImportacion | null;
  productosPublicados: number;
}) {
  const sb = useMemo(() => createClient(), []);
  const [archivo, setArchivo] = useState<string | null>(null);
  const [preparado, setPreparado] = useState<Preparado | null>(null);
  const [vista, setVista] = useState<Vista | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [trabajando, setTrabajando] = useState<null | "leyendo" | "comparando" | "aplicando">(null);
  const [ultima, setUltima] = useState(ultimaInicial);
  const [publicados, setPublicados] = useState(productosPublicados);

  const [cfg, setCfg] = useState(inicial);
  const [guardandoCfg, setGuardandoCfg] = useState(false);
  const [msgCfg, setMsgCfg] = useState<{ ok: boolean; texto: string } | null>(null);
  const [costo, setCosto] = useState(centavosAPesos(inicial.costo_envio_centavos));
  const [gratisDesde, setGratisDesde] = useState(centavosAPesos(inicial.envio_gratis_desde_centavos));
  const [minimo, setMinimo] = useState(centavosAPesos(inicial.minimo_envio_centavos));
  const [horario, setHorario] = useState<HorarioEditable>(() => aEditable(inicial.horario));

  if (faltaMigracion) {
    return (
      <div style={{ ...caja, background: "#fff1d1" }} data-test="falta-migracion">
        <strong>Falta preparar la base.</strong> Hay que pegar <code>supabase/033_tienda.sql</code> en el editor SQL de
        Supabase y ejecutarlo. Después volvé a abrir esta pantalla.
      </div>
    );
  }

  const elegir = async (f: File | undefined) => {
    setError(null);
    setVista(null);
    setPreparado(null);
    if (!f) return;
    setArchivo(f.name);
    setTrabajando("leyendo");
    try {
      const hoja = await leerHoja(await f.arrayBuffer(), HOJA_XRP);
      const p = prepararFilas(hoja.filas);
      setPreparado(p);
      if (!p.filas.length) {
        setError(p.problemas[0]?.motivo ?? "La hoja no tiene productos.");
        return;
      }
      setTrabajando("comparando");
      const { data, error: e } = await sb.rpc("tienda_importar", { filas: p.filas, archivo: f.name, aplicar: false });
      if (e) throw new Error(e.message);
      setVista(data as Vista);
    } catch (e) {
      setError(e instanceof ErrorXlsx ? e.message : `No se pudo leer o comparar el Excel: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setTrabajando(null);
    }
  };

  const aplicar = async () => {
    if (!preparado || !archivo) return;
    setTrabajando("aplicando");
    setError(null);
    try {
      const { data, error: e } = await sb.rpc("tienda_importar", { filas: preparado.filas, archivo, aplicar: true });
      if (e) throw new Error(e.message);
      const v = data as Vista;
      setVista(v);
      setPublicados(preparado.filas.length);
      setUltima({ archivo, filas: v.filas, nuevos: v.nuevos, cambios_de_precio: v.cambios_de_precio, retirados: v.retirados, creado_el: new Date().toISOString() });
      await refrescarTienda();
    } catch (e) {
      setError(`No se pudo aplicar: ${e instanceof Error ? e.message : String(e)}. No se cambió nada.`);
    } finally {
      setTrabajando(null);
    }
  };

  const guardarCfg = async () => {
    setMsgCfg(null);
    const wa = (cfg.whatsapp ?? "").replace(/\D/g, "");
    if (wa && (wa.length < 10 || wa.length > 15)) {
      setMsgCfg({ ok: false, texto: "El WhatsApp tiene que tener entre 10 y 15 números (con 549 y el código de área)." });
      return;
    }
    if (cfg.abierta && !wa) {
      setMsgCfg({ ok: false, texto: "Para abrir la tienda primero cargá el número de WhatsApp: ahí llegan los pedidos." });
      return;
    }
    const montos = { costo: pesosACentavos(costo), gratis: pesosACentavos(gratisDesde), minimo: pesosACentavos(minimo) };
    if ([montos.costo, montos.gratis, montos.minimo].some((m) => Number.isNaN(m))) {
      setMsgCfg({ ok: false, texto: "Los montos del envío tienen que ser números en pesos, por ejemplo 1500." });
      return;
    }
    const h = validarHorario(horario);
    if (!h.ok) {
      setMsgCfg({ ok: false, texto: "Horario: " + h.error });
      return;
    }
    setGuardandoCfg(true);
    const { error: e } = await sb
      .from("tienda_config")
      .update({
        abierta: cfg.abierta,
        whatsapp: wa || null,
        direccion_retiro: cfg.direccion_retiro?.trim() || null,
        costo_envio_centavos: montos.costo || null,
        envio_gratis_desde_centavos: montos.gratis || null,
        minimo_envio_centavos: montos.minimo ?? 0,
        horario: Object.keys(h.horario).length ? h.horario : null,
      })
      .eq("id", true);
    setGuardandoCfg(false);
    if (e) {
      setMsgCfg({ ok: false, texto: `No se pudo guardar: ${e.message}` });
      return;
    }
    setCfg((c) => ({ ...c, whatsapp: wa || null }));
    setHorario(aEditable(h.horario));
    await refrescarTienda();
    setMsgCfg({ ok: true, texto: cfg.abierta ? "Guardado. La tienda está abierta." : "Guardado. La tienda está cerrada al público." });
  };

  const waNoArgentino = (cfg.whatsapp ?? "").replace(/\D/g, "") && !(cfg.whatsapp ?? "").replace(/\D/g, "").startsWith("549");

  return (
    <div style={{ minWidth: 0 }}>
      {/* ---------------------------------------------------------- Importar */}
      <section style={caja} aria-labelledby="t-importar">
        <h2 id="t-importar" style={{ margin: "0 0 4px", fontSize: 17, display: "flex", alignItems: "center", gap: 8 }}>
          <FileSpreadsheet size={20} color={ROJO} /> Productos y precios desde XRP
        </h2>
        <p style={{ margin: "0 0 12px", fontSize: 13, color: "#555", lineHeight: 1.5 }}>
          Elegí el Excel exportado de XRP. Se usa la hoja <strong>“{HOJA_XRP}”</strong>. El archivo se lee en esta
          compu; antes de guardar vas a ver qué cambia.
          {ultima ? (
            <>
              {" "}Última importación: <strong>{new Date(ultima.creado_el).toLocaleString("es-AR")}</strong> ({ultima.archivo}).{" "}
            </>
          ) : null}
          {" "}Publicados ahora: <strong data-test="publicados">{publicados}</strong>.
        </p>
        <label style={{ ...boton(ROJO, !!trabajando), position: "relative" }}>
          <input
            type="file"
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            onChange={(e) => {
              void elegir(e.target.files?.[0]);
              e.target.value = "";
            }}
            disabled={!!trabajando}
            data-test="archivo"
            style={{ position: "absolute", inset: 0, opacity: 0, cursor: "pointer" }}
          />
          Elegir Excel…
        </label>
        {archivo ? <span style={{ marginLeft: 10, fontSize: 13, color: "#555", overflowWrap: "anywhere" }}>{archivo}</span> : null}

        {trabajando ? (
          <p style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 14, marginTop: 12 }} role="status">
            <Loader2 size={18} className="animate-spin" />
            {trabajando === "leyendo" ? "Leyendo el Excel…" : trabajando === "comparando" ? "Comparando con lo publicado…" : "Guardando…"}
          </p>
        ) : null}

        {error ? (
          <p role="alert" data-test="error-import" style={{ background: "#fdecea", color: "#a3261c", borderRadius: 8, padding: 10, fontSize: 14, marginTop: 12 }}>
            {error}
          </p>
        ) : null}

        {preparado && preparado.filas.length ? (
          <div style={{ marginTop: 14 }}>
            <div style={grilla}>
              <Dato etiqueta="Productos en el Excel" valor={preparado.resumen.total} test="total" />
              <Dato etiqueta="Por kg: se pesan" valor={preparado.resumen.pesables} test="pesables" />
              <Dato etiqueta="Por kg: paquete" valor={preparado.resumen.paquetesKg} test="paquetes" />
              <Dato etiqueta="Categorías" valor={preparado.resumen.categorias} />
              <Dato etiqueta="Filas salteadas" valor={preparado.problemas.length} alerta={preparado.problemas.length > 0} test="salteadas" />
            </div>
            {preparado.problemas.length ? (
              <details style={{ marginTop: 8, fontSize: 13 }}>
                <summary style={{ cursor: "pointer", fontWeight: 700 }}>Ver filas salteadas</summary>
                <ul style={{ margin: "6px 0 0", paddingLeft: 18 }}>
                  {preparado.problemas.slice(0, 50).map((p, i) => (
                    <li key={i}>
                      Fila {p.fila}
                      {p.codigo ? ` (código ${p.codigo})` : ""}: {p.motivo}
                    </li>
                  ))}
                </ul>
              </details>
            ) : null}
          </div>
        ) : null}

        {vista ? (
          <div style={{ marginTop: 14 }} data-test="vista-previa">
            <h3 style={{ fontSize: 15, margin: "0 0 8px" }}>
              {vista.aplicado ? (
                <span style={{ color: "#1e6b45", display: "inline-flex", gap: 6, alignItems: "center" }} data-test="aplicado">
                  <CheckCircle2 size={18} /> Listo: la tienda ya muestra estos precios
                </span>
              ) : (
                "Qué va a cambiar"
              )}
            </h3>
            <div style={grilla}>
              <Dato etiqueta="Nuevos" valor={vista.nuevos} test="nuevos" />
              <Dato etiqueta="Cambian de precio" valor={vista.cambios_de_precio} test="cambios" />
              <Dato etiqueta="Iguales" valor={vista.iguales} test="iguales" />
              <Dato etiqueta="Ya no vienen (se ocultan)" valor={vista.retirados} test="retirados" alerta={vista.retirados > 0} />
              <Dato etiqueta="Vuelven" valor={vista.vuelven} />
              <Dato etiqueta="Ofertas que terminan" valor={vista.ofertas_que_terminan} alerta={vista.ofertas_que_terminan > 0} />
            </div>

            {vista.mayores_cambios.length ? (
              <div style={{ overflowX: "auto", marginTop: 10 }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, minWidth: 0 }}>
                  <caption style={{ textAlign: "left", fontWeight: 700, padding: "4px 0" }}>Los cambios de precio más grandes</caption>
                  <thead>
                    <tr style={{ textAlign: "left", color: "#555" }}>
                      <th style={{ padding: 6 }}>Producto</th>
                      <th style={{ padding: 6 }}>Antes</th>
                      <th style={{ padding: 6 }}>Ahora</th>
                      <th style={{ padding: 6 }}>Cambio</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vista.mayores_cambios.slice(0, 15).map((c) => (
                      <tr key={c.codigo_xrp} style={{ borderTop: "1px solid #eee", background: c.variacion > 50 ? "#fff1d1" : undefined }}>
                        <td style={{ padding: 6 }}>
                          {c.variacion > 50 ? <AlertTriangle size={13} color="#6a3d00" style={{ verticalAlign: -2, marginRight: 4 }} aria-label="Revisar" /> : null}
                          {c.nombre}
                        </td>
                        <td style={{ padding: 6, whiteSpace: "nowrap" }}>{formatoPrecio(c.antes)}</td>
                        <td style={{ padding: 6, whiteSpace: "nowrap" }}>{formatoPrecio(c.ahora)}</td>
                        <td style={{ padding: 6, whiteSpace: "nowrap" }}>{c.ahora > c.antes ? "+" : "−"}{c.variacion}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {vista.mayores_cambios.some((c) => c.variacion > 50) ? (
                  <p style={{ fontSize: 12, color: "#6a3d00" }}>Los marcados cambian más de 50%: revisá que el precio en XRP esté bien.</p>
                ) : null}
              </div>
            ) : null}

            {!vista.aplicado ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                <button type="button" onClick={aplicar} disabled={!!trabajando} style={boton("#1e6b45", !!trabajando)} data-test="aplicar">
                  Aplicar: publicar estos productos y precios
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVista(null);
                    setPreparado(null);
                    setArchivo(null);
                  }}
                  disabled={!!trabajando}
                  style={{ ...boton("#6b5a4e", !!trabajando) }}
                >
                  Cancelar
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>

      {/* ---------------------------------------------------------- Configuración */}
      <section style={caja} aria-labelledby="t-config">
        <h2 id="t-config" style={{ margin: "0 0 12px", fontSize: 17, display: "flex", alignItems: "center", gap: 8 }}>
          <Store size={20} color={ROJO} /> La tienda
        </h2>
        <div style={{ display: "grid", gap: 12, maxWidth: 560 }}>
          <label style={{ display: "flex", alignItems: "center", gap: 10, fontWeight: 700, fontSize: 15 }}>
            <input
              type="checkbox"
              checked={cfg.abierta}
              onChange={(e) => setCfg({ ...cfg, abierta: e.target.checked })}
              style={{ width: 22, height: 22 }}
              data-test="abierta"
            />
            Tienda abierta al público
          </label>
          <div>
            <label htmlFor="cfg-wa" style={{ fontSize: 13, fontWeight: 700 }}>
              WhatsApp donde llegan los pedidos
            </label>
            <input
              id="cfg-wa"
              inputMode="tel"
              placeholder="5493549123456"
              value={cfg.whatsapp ?? ""}
              onChange={(e) => setCfg({ ...cfg, whatsapp: e.target.value })}
              style={input}
              data-test="whatsapp"
            />
            <p style={{ fontSize: 12, color: waNoArgentino ? "#6a3d00" : "#555", margin: "4px 0 0" }}>
              Con 54 9 y el código de área, sin el 0 ni el 15. Ej.: 54 9 3549 123456.
              {waNoArgentino ? " Ojo: no empieza con 549." : ""}
            </p>
          </div>
          <div>
            <label htmlFor="cfg-dir" style={{ fontSize: 13, fontWeight: 700 }}>
              Dirección para retirar
            </label>
            <input
              id="cfg-dir"
              value={cfg.direccion_retiro ?? ""}
              onChange={(e) => setCfg({ ...cfg, direccion_retiro: e.target.value })}
              placeholder="Calle y número, Cruz del Eje"
              style={input}
              data-test="direccion"
            />
          </div>
          <fieldset style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: 12, margin: 0, minWidth: 0 }}>
            <legend style={{ fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", gap: 6, padding: "0 4px" }}>
              <Truck size={18} color={ROJO} /> Envío a domicilio
            </legend>
            <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}>
              <Monto id="cfg-costo" etiqueta="Costo del envío" valor={costo} onCambiar={setCosto} test="costo-envio" />
              <Monto id="cfg-gratis" etiqueta="Gratis desde" valor={gratisDesde} onCambiar={setGratisDesde} test="gratis-desde" />
              <Monto id="cfg-minimo" etiqueta="Compra mínima" valor={minimo} onCambiar={setMinimo} test="minimo-envio" />
            </div>
            <p style={{ fontSize: 12, color: "#555", margin: "6px 0 0" }}>
              En pesos. Vacío = no se aplica: sin costo, el envío queda &quot;a confirmar&quot; por WhatsApp. El mínimo es sólo
              para envío; retirar no tiene mínimo.
            </p>
          </fieldset>

          <fieldset style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: 12, margin: 0, minWidth: 0 }}>
            <legend style={{ fontSize: 14, fontWeight: 800, display: "flex", alignItems: "center", gap: 6, padding: "0 4px" }}>
              <Clock size={18} color={ROJO} /> Horario de atención
            </legend>
            <p style={{ fontSize: 12, color: "#555", margin: "0 0 8px" }}>
              Hasta dos franjas por día (mañana y tarde). Un día vacío = cerrado. Fuera de horario se puede pedir igual y la
              tienda avisa cuándo abren.
            </p>
            <div style={{ display: "grid", gap: 6 }}>
              {ORDEN_SEMANA.map((d) => (
                <div key={d} style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 6 }} data-test={"dia-" + d}>
                  <span style={{ width: 82, fontWeight: 700, fontSize: 14, textTransform: "capitalize" }}>{DIAS[d]}</span>
                  {([0, 1] as const).map((i) => (
                    <span key={i} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {([0, 1] as const).map((j) => (
                        <input
                          key={j}
                          type="time"
                          aria-label={DIAS[d] + ", franja " + (i + 1) + ", " + (j === 0 ? "abre" : "cierra")}
                          value={horario[String(d)][i][j]}
                          onChange={(e) =>
                            setHorario((h) => {
                              const copia = structuredClone(h);
                              copia[String(d)][i][j] = e.target.value;
                              return copia;
                            })
                          }
                          style={{ ...input, width: 104, padding: "0 6px" }}
                        />
                      ))}
                    </span>
                  ))}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={() =>
                setHorario((h) => {
                  const c = structuredClone(h);
                  for (const d of [2, 3, 4, 5, 6]) c[String(d)] = structuredClone(h["1"]);
                  return c;
                })
              }
              style={{ ...boton("#6b5a4e"), marginTop: 8 }}
              data-test="copiar-lunes"
            >
              Copiar el lunes de martes a sábado
            </button>
          </fieldset>

          <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" onClick={guardarCfg} disabled={guardandoCfg} style={boton(ROJO, guardandoCfg)} data-test="guardar-config">
              {guardandoCfg ? "Guardando…" : "Guardar"}
            </button>
            <a href="/tienda" target="_blank" rel="noreferrer" style={{ fontSize: 13, fontWeight: 700, color: ROJO }}>
              Ver la tienda ↗
            </a>
          </div>
          {msgCfg ? (
            <p role={msgCfg.ok ? "status" : "alert"} data-test="msg-config" style={{ margin: 0, fontSize: 14, color: msgCfg.ok ? "#1e6b45" : "#a3261c" }}>
              {msgCfg.texto}
            </p>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function Monto({ id, etiqueta, valor, onCambiar, test }: { id: string; etiqueta: string; valor: string; onCambiar: (v: string) => void; test: string }) {
  return (
    <div style={{ minWidth: 0 }}>
      <label htmlFor={id} style={{ fontSize: 13, fontWeight: 700 }}>
        {etiqueta}
      </label>
      <div style={{ position: "relative" }}>
        <span aria-hidden style={{ position: "absolute", left: 10, top: 11, color: "#555" }}>
          $
        </span>
        <input id={id} inputMode="numeric" value={valor} onChange={(e) => onCambiar(e.target.value)} placeholder="0" style={{ ...input, paddingLeft: 24 }} data-test={test} />
      </div>
    </div>
  );
}
