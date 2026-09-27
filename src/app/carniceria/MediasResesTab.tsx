"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { Pencil, Trash2 } from "lucide-react";
import {
  calcularMediaRes,
  parseNumero,
  resumir,
  resumenPorAbastecedor,
  resumenPorMes,
  ultimoMes,
  type ResumenGrupo,
} from "@/lib/carniceria/calculos";
import { hoyISO } from "@/lib/fechas";
import type { Especie, IngresoPollo, MediaRes, NuevaMediaRes } from "@/lib/carniceria/types";
import PolloSeccion, { type AccionesPollo } from "./PolloSeccion";
import { ROJO, Secundario, TablaScroll, botonPrimario, botonSecundario, num, tarjeta, tdStyle, thStyle } from "./ui";

export interface AccionesMedias {
  guardarMedia: (datos: NuevaMediaRes, id?: string) => Promise<string | null>;
  eliminarMedia: (id: string) => void;
}

type Formulario = Record<
  "fecha" | "abastecedor" | "kg_factura" | "precio_kg" | "kg_balanza" | "dias_camara" | "hueso_kg" | "grasa_kg" | "merma_kg" | "precio_grasero" | "notas",
  string
>;

const vacio = (): Formulario => ({
  fecha: hoyISO(),
  abastecedor: "",
  kg_factura: "",
  precio_kg: "",
  kg_balanza: "",
  dias_camara: "",
  hueso_kg: "",
  grasa_kg: "",
  merma_kg: "",
  precio_grasero: "",
  notas: "",
});

const aTexto = (n: number | null) => (n == null ? "" : String(n).replace(".", ","));

function fechaCorta(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (ym: string) => `${MESES[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;

export default function MediasResesTab({
  medias,
  pollo,
  acciones,
  accionesPollo,
  pedirConfirmacion,
  faltaMigracionPollo,
}: {
  medias: MediaRes[];
  pollo: IngresoPollo[];
  acciones: AccionesMedias;
  accionesPollo: AccionesPollo;
  pedirConfirmacion: (mensaje: string, onConfirm: () => void) => void;
  faltaMigracionPollo: boolean;
}) {
  // Vaca y cerdo son medias reses; el pollo tiene su propia sección (cajones, no desposte).
  const [seleccion, setSeleccion] = useState<Especie | "pollo">("vaca");
  const especie: Especie = seleccion === "pollo" ? "vaca" : seleccion;
  const setEspecie = (e: Especie) => setSeleccion(e);
  const [form, setForm] = useState<Formulario>(vacio);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [abierto, setAbierto] = useState(false);

  const hoy = hoyISO();
  const deEspecie = useMemo(
    () => medias.filter((m) => m.especie === especie).sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creado_el ?? "").localeCompare(a.creado_el ?? "")),
    [medias, especie],
  );
  const ultimos30 = useMemo(() => ultimoMes(medias, especie, hoy), [medias, especie, hoy]);
  const resumen30 = useMemo(() => (ultimos30.length ? resumir("30 días", ultimos30) : null), [ultimos30]);
  const porMes = useMemo(() => resumenPorMes(medias, especie), [medias, especie]);
  const porAbastecedor = useMemo(() => resumenPorAbastecedor(medias, especie), [medias, especie]);
  const abastecedores = useMemo(() => [...new Set(medias.map((m) => m.abastecedor?.trim()).filter(Boolean))].sort() as string[], [medias]);

  const set = (k: keyof Formulario) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function editar(m: MediaRes) {
    setEditandoId(m.id);
    setEspecie(m.especie);
    setForm({
      fecha: m.fecha,
      abastecedor: m.abastecedor ?? "",
      kg_factura: aTexto(m.kg_factura),
      precio_kg: aTexto(m.precio_kg),
      kg_balanza: aTexto(m.kg_balanza),
      dias_camara: aTexto(m.dias_camara),
      hueso_kg: aTexto(m.hueso_kg),
      grasa_kg: aTexto(m.grasa_kg),
      merma_kg: aTexto(m.merma_kg),
      precio_grasero: aTexto(m.precio_grasero),
      notas: m.notas ?? "",
    });
    setError(null);
    setAbierto(true);
    requestAnimationFrame(() => document.getElementById("form-media")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function cancelar() {
    setEditandoId(null);
    setForm(vacio());
    setError(null);
    setAbierto(false);
  }

  async function guardar() {
    const leer = (k: keyof Formulario, nombre: string, obligatorio = false): number | null | "error" => {
      const t = form[k].trim();
      if (!t) {
        if (obligatorio) {
          setError(`Falta ${nombre}.`);
          return "error";
        }
        return null;
      }
      const n = parseNumero(t);
      if (n == null || n < 0) {
        setError(`${nombre[0].toUpperCase()}${nombre.slice(1)} no es un número válido.`);
        return "error";
      }
      return n;
    };
    const kg = leer("kg_factura", "los kilos de la factura", true);
    if (kg === "error") return;
    const precio = leer("precio_kg", "el precio por kilo", true);
    if (precio === "error") return;
    const balanza = leer("kg_balanza", "los kilos de tu balanza");
    if (balanza === "error") return;
    const dias = leer("dias_camara", "los días en cámara");
    if (dias === "error") return;
    const hueso = leer("hueso_kg", "el hueso");
    if (hueso === "error") return;
    const grasa = leer("grasa_kg", "la grasa");
    if (grasa === "error") return;
    const merma = leer("merma_kg", "la merma");
    if (merma === "error") return;
    const grasero = leer("precio_grasero", "el precio del grasero");
    if (grasero === "error") return;

    if (!form.fecha) return setError("Falta la fecha.");
    if (form.fecha > hoy) return setError("La fecha no puede ser futura.");
    if (!kg || kg <= 0) return setError("Los kilos de la factura tienen que ser más que cero.");
    if (balanza != null && balanza <= 0) return setError("Los kilos de tu balanza tienen que ser más que cero.");
    const desposte = [hueso, grasa, merma];
    const algunoDesposte = desposte.some((x) => x != null);
    if (algunoDesposte && desposte.some((x) => x == null)) {
      return setError("Para el desposte cargá las tres cosas: hueso, grasa y merma (puede ser 0).");
    }
    if (algunoDesposte && (hueso! + grasa! + merma!) >= kg) {
      return setError("El hueso, la grasa y la merma no pueden pesar tanto como la media res.");
    }

    const datos: NuevaMediaRes = {
      fecha: form.fecha,
      abastecedor: form.abastecedor.trim() || null,
      especie,
      kg_factura: kg,
      precio_kg: precio!,
      kg_balanza: balanza,
      dias_camara: dias,
      hueso_kg: hueso,
      grasa_kg: grasa,
      merma_kg: merma,
      precio_grasero: grasero,
      notas: form.notas.trim() || null,
    };
    setGuardando(true);
    const err = await acciones.guardarMedia(datos, editandoId ?? undefined);
    setGuardando(false);
    if (err) return setError(err);
    // Queda el abastecedor y el precio: lo normal es cargar varias del mismo camión seguidas.
    setForm((f) => ({ ...vacio(), fecha: f.fecha, abastecedor: f.abastecedor, precio_kg: f.precio_kg, precio_grasero: f.precio_grasero }));
    setEditandoId(null);
    setError(null);
  }

  const selector = (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} role="tablist" aria-label="Especie">
      {(["vaca", "cerdo", "pollo"] as const).map((e) => {
        const cantidad = e === "pollo" ? pollo.length : medias.filter((m) => m.especie === e).length;
        const activo = seleccion === e;
        return (
          <button
            key={e}
            type="button"
            role="tab"
            aria-selected={activo}
            data-test={`especie-${e}`}
            onClick={() => setSeleccion(e)}
            style={{ ...botonSecundario, background: activo ? ROJO : "white", color: activo ? "white" : "#1A1A2E", borderColor: activo ? ROJO : "#ccc", padding: "8px 16px", fontSize: 13 }}
          >
            {e === "vaca" ? "Vaca" : e === "cerdo" ? "Cerdo" : "Pollo"} ({cantidad})
          </button>
        );
      })}
    </div>
  );

  if (seleccion === "pollo") {
    return (
      <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 14 }}>
        {selector}
        <PolloSeccion pollo={pollo} acciones={accionesPollo} pedirConfirmacion={pedirConfirmacion} faltaMigracion={faltaMigracionPollo} />
      </div>
    );
  }

  const vista = previsualizar(form, especie);
  const etiquetaGrasa = especie === "vaca" ? "Grasa y sebo" : "Cuero, grasa y tocino";

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 14 }}>
      {selector}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 160px), 1fr))", gap: 8 }} data-test="resumen-30">
        <Secundario r={{ etiqueta: "Medias reses (30 días)", valor: ultimos30.length, unidad: "", decimales: 0 }} />
        <Secundario r={{ etiqueta: "Costo real del kilo", valor: resumen30?.costoReal ?? NaN, unidad: "$/kg", decimales: 0 }} />
        <Secundario r={{ etiqueta: "Rendimiento", valor: resumen30?.rendimiento ?? NaN, unidad: "%", decimales: 1 }} />
        <Secundario r={{ etiqueta: "Romana: kilos que no llegan", valor: resumen30?.romanaPct ?? NaN, unidad: "%", decimales: 2 }} />
        <Secundario r={{ etiqueta: "Romana: plata perdida", valor: resumen30 ? resumen30.romanaPlata : NaN, unidad: "$", decimales: 0 }} />
      </div>

      <div style={tarjeta} id="form-media">
        {!abierto ? (
          <button type="button" style={botonPrimario} onClick={() => setAbierto(true)} data-test="abrir-form-media">
            + Cargar {especie === "vaca" ? "una media res" : "una media res de cerdo"}
          </button>
        ) : (
          <div data-test="form-media">
            <h3 style={{ margin: "0 0 8px", fontSize: 15, color: ROJO }}>
              {editandoId ? "Editar media res" : `Nueva media res de ${especie}`}
            </h3>
            <div style={grillaForm}>
              <Campo etiqueta="Fecha">
                <input type="date" value={form.fecha} max={hoy} onChange={set("fecha")} style={inputForm} data-test="f-fecha" />
              </Campo>
              <Campo etiqueta="Abastecedor">
                <input list="abastecedores" value={form.abastecedor} onChange={set("abastecedor")} style={inputForm} data-test="f-abastecedor" placeholder="Frigorífico…" />
                <datalist id="abastecedores">
                  {abastecedores.map((a) => (
                    <option key={a} value={a} />
                  ))}
                </datalist>
              </Campo>
              <Campo etiqueta="Kilos de la factura *">
                <input inputMode="decimal" value={form.kg_factura} onChange={set("kg_factura")} style={inputForm} data-test="f-kg_factura" />
              </Campo>
              <Campo etiqueta="Precio por kilo de la factura *">
                <input inputMode="decimal" value={form.precio_kg} onChange={set("precio_kg")} style={inputForm} data-test="f-precio_kg" />
              </Campo>
              <Campo etiqueta="Kilos que marcó tu balanza">
                <input inputMode="decimal" value={form.kg_balanza} onChange={set("kg_balanza")} style={inputForm} data-test="f-kg_balanza" />
              </Campo>
              <Campo etiqueta="Días en cámara antes de despostar">
                <input inputMode="decimal" value={form.dias_camara} onChange={set("dias_camara")} style={inputForm} data-test="f-dias_camara" />
              </Campo>
            </div>

            <h4 style={{ margin: "14px 0 4px", fontSize: 13 }}>Desposte (si la pesaste)</h4>
            <p style={{ margin: "0 0 6px", fontSize: 12, color: "#666" }}>
              La merma es todo lo que no es hueso, grasa ni carne para vender: romana, oreo, sierra y recorte chico. Si no
              la pesás, es la factura menos el hueso, la grasa y la carne que pusiste en la exhibidora.
            </p>
            <div style={grillaForm}>
              <Campo etiqueta="Hueso (kg)">
                <input inputMode="decimal" value={form.hueso_kg} onChange={set("hueso_kg")} style={inputForm} data-test="f-hueso_kg" />
              </Campo>
              <Campo etiqueta={`${etiquetaGrasa} (kg)`}>
                <input inputMode="decimal" value={form.grasa_kg} onChange={set("grasa_kg")} style={inputForm} data-test="f-grasa_kg" />
              </Campo>
              <Campo etiqueta="Merma (kg)">
                <input inputMode="decimal" value={form.merma_kg} onChange={set("merma_kg")} style={inputForm} data-test="f-merma_kg" />
              </Campo>
              <Campo etiqueta={especie === "vaca" ? "Lo que paga el grasero ($/kg)" : "Lo que recuperás por kilo ($/kg)"}>
                <input inputMode="decimal" value={form.precio_grasero} onChange={set("precio_grasero")} style={inputForm} data-test="f-precio_grasero" />
              </Campo>
            </div>
            <Campo etiqueta="Notas">
              <input value={form.notas} onChange={set("notas")} style={inputForm} data-test="f-notas" />
            </Campo>

            {vista && (
              <div style={{ marginTop: 10, background: "#F8F9FA", borderRadius: 8, padding: "8px 10px", fontSize: 13 }} data-test="vista-previa">
                {vista}
              </div>
            )}
            {error && (
              <div role="alert" data-test="error-media" style={{ marginTop: 10, background: "#FADBD8", color: "#922B21", padding: "8px 10px", borderRadius: 6, fontSize: 13 }}>
                {error}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button type="button" style={botonPrimario} onClick={guardar} disabled={guardando} data-test="guardar-media">
                {guardando ? "Guardando…" : editandoId ? "Guardar cambios" : "Guardar media res"}
              </button>
              <button type="button" style={botonSecundario} onClick={cancelar}>
                {editandoId ? "Cancelar" : "Cerrar"}
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={tarjeta}>
        <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>Cada media res</h3>
        {deEspecie.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "#666" }} data-test="sin-medias">
            Todavía no cargaste ninguna. Pesá la próxima cuando baja del camión y, cuando la despostes, el hueso, la grasa
            y el recorte.
          </p>
        ) : (
          <TablaScroll>
            <table style={{ width: "100%", borderCollapse: "collapse" }} data-test="tabla-medias">
              <thead>
                <tr>
                  <th style={thStyle}>Fecha</th>
                  <th style={thStyle}>Abastecedor</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Kg factura</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>$/kg</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Romana</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Rinde</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Costo real</th>
                  <th style={thStyle} />
                </tr>
              </thead>
              <tbody>
                {deEspecie.map((m) => {
                  const c = calcularMediaRes(m);
                  return (
                    <tr key={m.id} data-test="fila-media">
                      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{fechaCorta(m.fecha)}</td>
                      <td style={tdStyle}>
                        {m.abastecedor ?? "—"}
                        {m.notas && <div style={{ fontSize: 10, color: "#888" }}>{m.notas}</div>}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{num(Number(m.kg_factura), 1)}</td>
                      <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>{num(Number(m.precio_kg))}</td>
                      <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", color: (c.romanaKg ?? 0) > 0 ? ROJO : undefined }}>
                        {c.romanaKg == null ? "—" : `${num(c.romanaKg, 2)} kg`}
                        {c.romanaPlata != null && c.romanaPlata !== 0 && <div style={{ fontSize: 10 }}>$ {num(c.romanaPlata)}</div>}
                      </td>
                      <td style={{ ...tdStyle, textAlign: "right" }}>{c.rendimiento == null ? "—" : `${num(c.rendimiento, 1, 1)} %`}</td>
                      <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", fontWeight: 700 }} data-test="costo-real-media">
                        {c.costoReal == null ? "—" : `$ ${num(c.costoReal)}`}
                      </td>
                      <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                        <button type="button" onClick={() => editar(m)} aria-label="Editar" style={iconoBtn} data-test="editar-media">
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          aria-label="Eliminar"
                          style={iconoBtn}
                          data-test="eliminar-media"
                          onClick={() =>
                            pedirConfirmacion(`¿Eliminar la media res del ${fechaCorta(m.fecha)}${m.abastecedor ? ` de ${m.abastecedor}` : ""}?`, () => acciones.eliminarMedia(m.id))
                          }
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </TablaScroll>
        )}
      </div>

      {porMes.length > 0 && <TablaResumen titulo="Mes a mes" columna="Mes" grupos={porMes} etiqueta={nombreMes} dataTest="tabla-por-mes" />}
      {porAbastecedor.length > 0 && (
        <TablaResumen
          titulo="Por abastecedor"
          subtitulo="Para hablar con el abastecedor con los números en la mano: la romana de todas las medias reses que te mandó."
          columna="Abastecedor"
          grupos={porAbastecedor}
          etiqueta={(x) => x}
          dataTest="tabla-por-abastecedor"
        />
      )}
    </div>
  );
}

function TablaResumen({
  titulo,
  subtitulo,
  columna,
  grupos,
  etiqueta,
  dataTest,
}: {
  titulo: string;
  subtitulo?: string;
  columna: string;
  grupos: ResumenGrupo[];
  etiqueta: (clave: string) => string;
  dataTest: string;
}) {
  return (
    <div style={tarjeta}>
      <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>{titulo}</h3>
      {subtitulo && <p style={{ margin: "0 0 8px", fontSize: 12, color: "#666" }}>{subtitulo}</p>}
      <TablaScroll>
        <table style={{ width: "100%", borderCollapse: "collapse" }} data-test={dataTest}>
          <thead>
            <tr>
              <th style={thStyle}>{columna}</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Medias</th>
              <th style={{ ...thStyle, textAlign: "right" }}>$/kg prom.</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Romana</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Plata en romana</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Rinde</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Costo real</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => (
              <tr key={g.clave} data-test="fila-resumen">
                <td style={{ ...tdStyle, whiteSpace: "nowrap", fontWeight: 700 }}>{etiqueta(g.clave)}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{g.cantidad}</td>
                <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>{num(g.precioPromedio)}</td>
                <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                  {g.romanaPct == null ? "—" : `${num(g.romanaPct, 2, 2)} %`}
                  {g.romanaKgPromedio != null && <div style={{ fontSize: 10, color: "#666" }}>{num(g.romanaKgPromedio, 2)} kg por media</div>}
                </td>
                <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>$ {num(g.romanaPlata)}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{g.rendimiento == null ? "—" : `${num(g.rendimiento, 1, 1)} %`}</td>
                <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", fontWeight: 700 }}>{g.costoReal == null ? "—" : `$ ${num(g.costoReal)}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TablaScroll>
    </div>
  );
}

/** Lo que va a dar la media res antes de guardarla, con la cuenta del módulo 1. */
function previsualizar(form: Formulario, especie: Especie): string | null {
  const n = (k: keyof Formulario) => parseNumero(form[k]);
  const kg = n("kg_factura");
  const precio = n("precio_kg");
  if (!kg || precio == null) return null;
  const c = calcularMediaRes({
    id: "",
    fecha: form.fecha,
    abastecedor: null,
    especie,
    kg_factura: kg,
    precio_kg: precio,
    kg_balanza: n("kg_balanza"),
    dias_camara: n("dias_camara"),
    hueso_kg: n("hueso_kg"),
    grasa_kg: n("grasa_kg"),
    merma_kg: n("merma_kg"),
    precio_grasero: n("precio_grasero"),
    notas: null,
  });
  const partes: string[] = [`Pagás $ ${num(kg * precio)}.`];
  if (c.romanaKg != null) partes.push(`Tu balanza marca ${num(c.romanaKg, 2)} kg ${c.romanaKg >= 0 ? "menos" : "más"}: $ ${num(Math.abs(c.romanaPlata ?? 0))}.`);
  if (c.costoReal != null && c.vendibles != null && c.vendibles > 0) {
    partes.push(`Llegan ${num(c.vendibles, 1)} kg al mostrador (rinde ${num(c.rendimiento ?? 0, 1)} %): cada kilo que vendés te cuesta $ ${num(c.costoReal)}.`);
  }
  return partes.join(" ");
}

function Campo({ etiqueta, children }: { etiqueta: string; children: React.ReactNode }) {
  return (
    <label style={{ display: "grid", gap: 3, fontSize: 12, color: "#444", fontWeight: 700, minWidth: 0 }}>
      {etiqueta}
      {children}
    </label>
  );
}

const grillaForm: CSSProperties = { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 190px), 1fr))", gap: 10 };
const inputForm: CSSProperties = { padding: "8px 9px", fontSize: 15, border: "1px solid #ccc", borderRadius: 6, width: "100%", boxSizing: "border-box", fontWeight: 400, fontFamily: "inherit" };
const iconoBtn: CSSProperties = { background: "none", border: "none", cursor: "pointer", color: "#555", padding: 4 };
