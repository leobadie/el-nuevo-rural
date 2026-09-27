"use client";

import { useMemo, useState, type CSSProperties } from "react";
import { Pencil, Trash2 } from "lucide-react";
import {
  NOMBRE_PRODUCTO_POLLO,
  filtrarPollo,
  parseNumero,
  polloUltimoMes,
  resumenPolloPorMes,
  resumenPolloPorProducto,
  resumenPolloPorProveedor,
  resumirPollo,
  type ResumenPollo,
} from "@/lib/carniceria/calculos";
import { hoyISO } from "@/lib/fechas";
import type { IngresoPollo, NuevoIngresoPollo, ProductoPollo } from "@/lib/carniceria/types";
import { ROJO, Secundario, TablaScroll, botonPrimario, botonSecundario, num, tarjeta, tdStyle, thStyle } from "./ui";

export interface AccionesPollo {
  guardarPollo: (datos: NuevoIngresoPollo, id?: string) => Promise<string | null>;
  eliminarPollo: (id: string) => void;
}

type Formulario = Record<"fecha" | "proveedor" | "cajones" | "kg_total" | "precio_kg" | "notas", string> & { producto: ProductoPollo };

const vacio = (producto: ProductoPollo = "entero"): Formulario => ({ fecha: hoyISO(), proveedor: "", producto, cajones: "", kg_total: "", precio_kg: "", notas: "" });
const PRODUCTOS = Object.keys(NOMBRE_PRODUCTO_POLLO) as ProductoPollo[];
const productoDe = (x: IngresoPollo): ProductoPollo => x.producto ?? "entero";
const aTexto = (n: number) => String(n).replace(".", ",");
const fechaCorta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(2, 4)}`;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (ym: string) => `${MESES[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;

/** Los cajones de pollo que entran (SPEC 19 a 23). Alimentan el módulo 7. */
export default function PolloSeccion({
  pollo,
  acciones,
  pedirConfirmacion,
  faltaMigracion,
}: {
  pollo: IngresoPollo[];
  acciones: AccionesPollo;
  pedirConfirmacion: (mensaje: string, onConfirm: () => void) => void;
  faltaMigracion: boolean;
}) {
  const [form, setForm] = useState<Formulario>(vacio);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [abierto, setAbierto] = useState(false);
  // null = todos los productos (SPEC 25).
  const [filtro, setFiltro] = useState<ProductoPollo | null>(null);

  const hoy = hoyISO();
  const filtrado = useMemo(() => filtrarPollo(pollo, filtro), [pollo, filtro]);
  const ordenados = useMemo(
    () => [...filtrado].sort((a, b) => b.fecha.localeCompare(a.fecha) || (b.creado_el ?? "").localeCompare(a.creado_el ?? "")),
    [filtrado],
  );
  const mes = useMemo(() => resumirPollo("30 días", polloUltimoMes(filtrado, hoy)), [filtrado, hoy]);
  const porProducto = useMemo(() => resumenPolloPorProducto(pollo, hoy), [pollo, hoy]);
  const porMes = useMemo(() => resumenPolloPorMes(filtrado), [filtrado]);
  const porProveedor = useMemo(() => resumenPolloPorProveedor(filtrado), [filtrado]);
  const proveedores = useMemo(() => [...new Set(pollo.map((x) => x.proveedor?.trim()).filter(Boolean))].sort() as string[], [pollo]);

  if (faltaMigracion) {
    return (
      <div style={{ background: "#FDEBD0", color: "#784212", padding: "14px 16px", borderRadius: 8, fontSize: 14 }} data-test="falta-migracion-pollo">
        <strong>Falta crear la tabla del pollo.</strong> Hay que pegar <code>supabase/021_carniceria_pollo.sql</code> en el
        editor SQL de Supabase y recargar esta página.
      </div>
    );
  }

  const set = (k: keyof Formulario) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  function editar(x: IngresoPollo) {
    setEditandoId(x.id);
    setForm({ fecha: x.fecha, proveedor: x.proveedor ?? "", producto: productoDe(x), cajones: String(x.cajones), kg_total: aTexto(x.kg_total), precio_kg: aTexto(x.precio_kg), notas: x.notas ?? "" });
    setError(null);
    setAbierto(true);
    requestAnimationFrame(() => document.getElementById("form-pollo")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  function cancelar() {
    setEditandoId(null);
    setForm(vacio(filtro ?? "entero"));
    setError(null);
    setAbierto(false);
  }

  async function guardar() {
    const cajones = parseNumero(form.cajones);
    const kg = parseNumero(form.kg_total);
    const precio = parseNumero(form.precio_kg);
    if (!form.fecha) return setError("Falta la fecha.");
    if (form.fecha > hoy) return setError("La fecha no puede ser futura.");
    if (cajones == null || !Number.isInteger(cajones) || cajones <= 0) return setError("La cantidad de cajones tiene que ser un número entero mayor que cero.");
    if (kg == null || kg <= 0) return setError("Faltan los kilos totales de la factura.");
    if (precio == null || precio < 0) return setError("Falta el precio por kilo.");

    setGuardando(true);
    const err = await acciones.guardarPollo(
      { fecha: form.fecha, proveedor: form.proveedor.trim() || null, producto: form.producto, cajones, kg_total: kg, precio_kg: precio, notas: form.notas.trim() || null },
      editandoId ?? undefined,
    );
    setGuardando(false);
    if (err) return setError(err);
    // Queda el proveedor y el precio: el próximo ingreso suele ser del mismo.
    setForm((f) => ({ ...vacio(f.producto), fecha: f.fecha, proveedor: f.proveedor, precio_kg: f.precio_kg }));
    setEditandoId(null);
    setError(null);
  }

  const vista = previsualizar(form);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 14 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }} role="tablist" aria-label="Producto">
        {([null, ...PRODUCTOS] as (ProductoPollo | null)[]).map((p) => {
          const activo = filtro === p;
          const cantidad = filtrarPollo(pollo, p).length;
          return (
            <button
              key={p ?? "todos"}
              type="button"
              role="tab"
              aria-selected={activo}
              data-test={`producto-${p ?? "todos"}`}
              onClick={() => {
                setFiltro(p);
                if (!editandoId) setForm((f) => ({ ...f, producto: p ?? f.producto }));
              }}
              style={{ ...botonSecundario, padding: "6px 12px", background: activo ? "#FDEDEC" : "white", borderColor: activo ? ROJO : "#ccc", color: activo ? ROJO : "#1A1A2E" }}
            >
              {p ? NOMBRE_PRODUCTO_POLLO[p] : "Todos"} ({cantidad})
            </button>
          );
        })}
      </div>

      {filtro == null && porProducto.length > 1 && (
        <div style={tarjeta}>
          <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>Últimos 30 días, por producto</h3>
          <TablaScroll>
            <table style={{ width: "100%", borderCollapse: "collapse" }} data-test="tabla-pollo-por-producto">
              <thead>
                <tr>
                  <th style={thStyle}>Producto</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Cajones</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Kilos</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Kg/cajón</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>$/kg prom.</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
                </tr>
              </thead>
              <tbody>
                {porProducto.map((g) => (
                  <tr key={g.producto} data-test="fila-pollo-producto">
                    <td style={{ ...tdStyle, whiteSpace: "nowrap", fontWeight: 700 }}>{g.clave}</td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>{g.cajones}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{num(g.kg, 1)}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{g.kgPorCajon == null ? "—" : num(g.kgPorCajon, 1)}</td>
                    <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>{g.precioPromedio == null ? "—" : num(g.precioPromedio)}</td>
                    <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", fontWeight: 700 }}>$ {num(g.total)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TablaScroll>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 160px), 1fr))", gap: 8 }} data-test="resumen-pollo-30">
        <Secundario r={{ etiqueta: "Cajones (30 días)", valor: mes.cajones, unidad: "", decimales: 0 }} />
        <Secundario r={{ etiqueta: "Kilos (30 días)", valor: mes.kg, unidad: "kg", decimales: 1 }} />
        <Secundario r={{ etiqueta: "Kilos por cajón", valor: mes.kgPorCajon ?? NaN, unidad: "kg", decimales: 1 }} />
        <Secundario r={{ etiqueta: "Precio promedio", valor: mes.precioPromedio ?? NaN, unidad: "$/kg", decimales: 0 }} />
        <Secundario r={{ etiqueta: "Total pagado (30 días)", valor: mes.total, unidad: "$", decimales: 0 }} />
      </div>

      <div style={tarjeta} id="form-pollo">
        {!abierto ? (
          <button type="button" style={botonPrimario} onClick={() => setAbierto(true)} data-test="abrir-form-pollo">
            + Cargar cajones de pollo
          </button>
        ) : (
          <div data-test="form-pollo">
            <h3 style={{ margin: "0 0 8px", fontSize: 15, color: ROJO }}>{editandoId ? "Editar ingreso de pollo" : "Cajones que entraron"}</h3>
            <div style={grillaForm}>
              <Campo etiqueta="Fecha">
                <input type="date" value={form.fecha} max={hoy} onChange={set("fecha")} style={inputForm} data-test="p-fecha" />
              </Campo>
              <Campo etiqueta="Producto">
                <select value={form.producto} onChange={(e) => setForm((f) => ({ ...f, producto: e.target.value as ProductoPollo }))} style={inputForm} data-test="p-producto">
                  {PRODUCTOS.map((p) => (
                    <option key={p} value={p}>
                      {NOMBRE_PRODUCTO_POLLO[p]}
                    </option>
                  ))}
                </select>
              </Campo>
              <Campo etiqueta="Proveedor">
                <input list="proveedores-pollo" value={form.proveedor} onChange={set("proveedor")} style={inputForm} data-test="p-proveedor" placeholder="Avícola…" />
                <datalist id="proveedores-pollo">
                  {proveedores.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </Campo>
              <Campo etiqueta="Cantidad de cajones *">
                <input inputMode="numeric" value={form.cajones} onChange={set("cajones")} style={inputForm} data-test="p-cajones" />
              </Campo>
              <Campo etiqueta="Kilos totales de la factura *">
                <input inputMode="decimal" value={form.kg_total} onChange={set("kg_total")} style={inputForm} data-test="p-kg_total" />
              </Campo>
              <Campo etiqueta="Precio por kilo (con IVA) *">
                <input inputMode="decimal" value={form.precio_kg} onChange={set("precio_kg")} style={inputForm} data-test="p-precio_kg" />
              </Campo>
              <Campo etiqueta="Notas">
                <input value={form.notas} onChange={set("notas")} style={inputForm} data-test="p-notas" />
              </Campo>
            </div>
            {vista && (
              <div style={{ marginTop: 10, background: "#F8F9FA", borderRadius: 8, padding: "8px 10px", fontSize: 13 }} data-test="vista-previa-pollo">
                {vista}
              </div>
            )}
            {error && (
              <div role="alert" data-test="error-pollo" style={{ marginTop: 10, background: "#FADBD8", color: "#922B21", padding: "8px 10px", borderRadius: 6, fontSize: 13 }}>
                {error}
              </div>
            )}
            <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
              <button type="button" style={botonPrimario} onClick={guardar} disabled={guardando} data-test="guardar-pollo">
                {guardando ? "Guardando…" : editandoId ? "Guardar cambios" : "Guardar"}
              </button>
              <button type="button" style={botonSecundario} onClick={cancelar}>
                {editandoId ? "Cancelar" : "Cerrar"}
              </button>
            </div>
          </div>
        )}
      </div>

      <div style={tarjeta}>
        <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>Cada ingreso</h3>
        {ordenados.length === 0 ? (
          <p style={{ margin: 0, fontSize: 13, color: "#666" }} data-test="sin-pollo">
            Todavía no cargaste pollo. Con la próxima factura anotá los cajones, los kilos y el precio: el módulo 7 los usa
            para decirte si te conviene vender entero o trozado.
          </p>
        ) : (
          <TablaScroll>
            <table style={{ width: "100%", borderCollapse: "collapse" }} data-test="tabla-pollo">
              <thead>
                <tr>
                  <th style={thStyle}>Fecha</th>
                  <th style={thStyle}>Producto</th>
                  <th style={thStyle}>Proveedor</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Cajones</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Kilos</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Kg/cajón</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>$/kg</th>
                  <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
                  <th style={thStyle} />
                </tr>
              </thead>
              <tbody>
                {ordenados.map((x) => (
                  <tr key={x.id} data-test="fila-pollo">
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{fechaCorta(x.fecha)}</td>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }} data-test="producto-fila">{NOMBRE_PRODUCTO_POLLO[productoDe(x)]}</td>
                    <td style={tdStyle}>
                      {x.proveedor ?? "—"}
                      {x.notas && <div style={{ fontSize: 10, color: "#888" }}>{x.notas}</div>}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>{x.cajones}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{num(x.kg_total, 1)}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }} data-test="kg-por-cajon">{num(x.kg_total / x.cajones, 1)}</td>
                    <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>{num(x.precio_kg)}</td>
                    <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", fontWeight: 700 }}>$ {num(x.kg_total * x.precio_kg)}</td>
                    <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                      <button type="button" onClick={() => editar(x)} aria-label="Editar" style={iconoBtn} data-test="editar-pollo">
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        aria-label="Eliminar"
                        style={iconoBtn}
                        data-test="eliminar-pollo"
                        onClick={() =>
                          pedirConfirmacion(`¿Eliminar los ${x.cajones} cajones de ${NOMBRE_PRODUCTO_POLLO[productoDe(x)].toLowerCase()} del ${fechaCorta(x.fecha)}${x.proveedor ? ` de ${x.proveedor}` : ""}?`, () => acciones.eliminarPollo(x.id))
                        }
                      >
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TablaScroll>
        )}
      </div>

      {porMes.length > 0 && <TablaResumen titulo="Mes a mes" columna="Mes" grupos={porMes} etiqueta={nombreMes} dataTest="tabla-pollo-por-mes" />}
      {porProveedor.length > 0 && <TablaResumen titulo="Por proveedor" columna="Proveedor" grupos={porProveedor} etiqueta={(x) => x} dataTest="tabla-pollo-por-proveedor" />}
    </div>
  );
}

function TablaResumen({ titulo, columna, grupos, etiqueta, dataTest }: { titulo: string; columna: string; grupos: ResumenPollo[]; etiqueta: (k: string) => string; dataTest: string }) {
  return (
    <div style={tarjeta}>
      <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>{titulo}</h3>
      <TablaScroll>
        <table style={{ width: "100%", borderCollapse: "collapse" }} data-test={dataTest}>
          <thead>
            <tr>
              <th style={thStyle}>{columna}</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Cajones</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Kilos</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Kg/cajón</th>
              <th style={{ ...thStyle, textAlign: "right" }}>$/kg prom.</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
            </tr>
          </thead>
          <tbody>
            {grupos.map((g) => (
              <tr key={g.clave} data-test="fila-resumen-pollo">
                <td style={{ ...tdStyle, whiteSpace: "nowrap", fontWeight: 700 }}>{etiqueta(g.clave)}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700 }}>{g.cajones}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{num(g.kg, 1)}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{g.kgPorCajon == null ? "—" : num(g.kgPorCajon, 1)}</td>
                <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>{g.precioPromedio == null ? "—" : num(g.precioPromedio)}</td>
                <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", fontWeight: 700 }}>$ {num(g.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </TablaScroll>
    </div>
  );
}

function previsualizar(form: Formulario): string | null {
  const cajones = parseNumero(form.cajones);
  const kg = parseNumero(form.kg_total);
  const precio = parseNumero(form.precio_kg);
  if (!cajones || !kg || cajones <= 0) return null;
  const partes = [`${num(kg / cajones, 1)} kg por cajón.`];
  if (precio != null) partes.push(`Pagás $ ${num(kg * precio)}: $ ${num((kg * precio) / cajones)} por cajón.`);
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
