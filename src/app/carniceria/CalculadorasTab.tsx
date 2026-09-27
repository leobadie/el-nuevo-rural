"use client";

import { useState } from "react";
import { ArrowDown, ArrowUp, Plus } from "lucide-react";
import type { ModuloCalculado, ResultadoCarniceria } from "@/lib/carniceria/calculos";
import type { Corte, Parametros } from "@/lib/carniceria/types";
import {
  AMARILLO,
  FilaCampo,
  InputNumero,
  ROJO,
  ROJO_CLARO,
  Secundario,
  TablaScroll,
  botonPrimario,
  botonSecundario,
  conUnidad,
  num,
  tarjeta,
  tdStyle,
  thStyle,
} from "./ui";

export interface AccionesCalculadoras {
  guardarParametro: (clave: string, valor: number | null) => void;
  guardarCorte: (corte: Omit<Corte, "id"> & { id?: string }) => void;
  guardarGasto: (gastoFijoId: string, incluido: boolean) => void;
}

export default function CalculadorasTab({
  res,
  parametros,
  cortes,
  acciones,
}: {
  res: ResultadoCarniceria;
  parametros: Parametros;
  cortes: Corte[];
  acciones: AccionesCalculadoras;
}) {
  // 0 = datos generales. Se arranca por el 1, como pide el instructivo.
  const [elegido, setElegido] = useState(1);
  const modulo = res.modulos.find((m) => m.numero === elegido);

  function elegir(n: number) {
    setElegido(n);
    // En el celular el menú queda arriba: se baja hasta el módulo.
    requestAnimationFrame(() => document.getElementById("modulo-elegido")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 14 }}>
      <nav aria-label="Módulos" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 150px), 1fr))", gap: 8 }}>
        <BotonMenu activo={elegido === 0} onClick={() => elegir(0)} numero="★" titulo="Datos generales" sub="kilos, días, medias" dataTest="menu-0" />
        {res.modulos.map((m) => (
          <BotonMenu
            key={m.numero}
            activo={elegido === m.numero}
            onClick={() => elegir(m.numero)}
            numero={String(m.numero)}
            titulo={m.titulo}
            sub={conUnidad(m.principal.valor, m.principal.unidad, m.principal.decimales)}
            dataTest={`menu-${m.numero}`}
          />
        ))}
      </nav>

      <div id="modulo-elegido" style={{ scrollMarginTop: 10 }}>
        {elegido === 0 || !modulo ? (
          <DatosGenerales res={res} acciones={acciones} />
        ) : (
          <VistaModulo modulo={modulo} res={res} parametros={parametros} cortes={cortes} acciones={acciones} />
        )}
      </div>
    </div>
  );
}

function BotonMenu({ activo, onClick, numero, titulo, sub, dataTest }: { activo: boolean; onClick: () => void; numero: string; titulo: string; sub: string; dataTest: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-test={dataTest}
      aria-pressed={activo}
      style={{
        textAlign: "left",
        background: activo ? ROJO : "white",
        color: activo ? "white" : "#1A1A2E",
        border: `1px solid ${activo ? ROJO : "#ddd"}`,
        borderRadius: 8,
        padding: "8px 10px",
        cursor: "pointer",
        minWidth: 0,
      }}
    >
      <div style={{ fontSize: 12, fontWeight: 800 }}>
        {numero} · {titulo}
      </div>
      <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{sub}</div>
    </button>
  );
}

function DatosGenerales({ res, acciones }: { res: ResultadoCarniceria; acciones: AccionesCalculadoras }) {
  return (
    <section style={tarjeta} data-test="datos-generales">
      <h2 style={{ margin: 0, fontSize: 17, color: ROJO }}>Datos generales</h2>
      <p style={{ margin: "4px 0 10px", fontSize: 13, color: "#555" }}>
        Los usan varios módulos. En la planilla estaban repetidos en cada pestaña; acá se cargan una vez. Las medias
        reses por mes salen solas del historial si cargaste alguna en los últimos 30 días.
      </p>
      {res.generales.map((c) => (
        <FilaCampo key={c.clave} campo={c} onGuardar={acciones.guardarParametro} />
      ))}
    </section>
  );
}

function VistaModulo({
  modulo,
  res,
  parametros,
  cortes,
  acciones,
}: {
  modulo: ModuloCalculado;
  res: ResultadoCarniceria;
  parametros: Parametros;
  cortes: Corte[];
  acciones: AccionesCalculadoras;
}) {
  const p = modulo.principal;
  return (
    <section data-test={`modulo-${modulo.numero}`} style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 12 }}>
      <div style={{ background: ROJO, color: "white", borderRadius: 10, padding: "12px 16px" }}>
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1, opacity: 0.85 }}>MÓDULO {String(modulo.numero).padStart(2, "0")}</div>
        <h2 style={{ margin: "2px 0 0", fontSize: 19 }}>{modulo.titulo}</h2>
        <div style={{ fontSize: 13, opacity: 0.9, marginTop: 2 }}>{modulo.pregunta}</div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 12, alignItems: "start" }}>
        <div style={tarjeta}>
          <h3 style={{ margin: "0 0 4px", fontSize: 13, color: "#555", letterSpacing: 0.5 }}>DATOS QUE CARGÁS VOS</h3>
          {modulo.numero === 10 && <ControlLuz res={res} parametros={parametros} acciones={acciones} />}
          {modulo.campos.map((c) => (
            <FilaCampo key={c.clave} campo={c} onGuardar={acciones.guardarParametro} />
          ))}
        </div>

        <div style={{ ...tarjeta, background: ROJO_CLARO, borderColor: "#F5B7B1" }}>
          <h3 style={{ margin: "0 0 4px", fontSize: 13, color: ROJO, letterSpacing: 0.5 }}>RESULTADO</h3>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#555", textTransform: "uppercase" }}>{p.etiqueta}</div>
          <div data-test="resultado-principal" style={{ fontSize: 32, fontWeight: 800, color: p.valor < 0 ? "#C0392B" : ROJO, lineHeight: 1.15, margin: "2px 0 8px" }}>
            {conUnidad(p.valor, p.unidad, p.decimales)}
          </div>
          <p data-test="frase" style={{ margin: "0 0 12px", fontSize: 14, lineHeight: 1.5, color: "#1A1A2E" }}>
            {modulo.frase}
          </p>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 140px), 1fr))", gap: 8 }}>
            {modulo.secundarios.map((s) => (
              <Secundario key={s.etiqueta} r={s} />
            ))}
          </div>
        </div>
      </div>

      {modulo.numero === 3 && <TablaEscandallo res={res} cortes={cortes} acciones={acciones} />}
      {modulo.numero === 4 && <TablaProrrateo res={res} cortes={cortes} acciones={acciones} />}
      {modulo.numero === 7 && <TablaPollo res={res} acciones={acciones} />}
      {modulo.numero === 10 && <TablaGastos res={res} acciones={acciones} />}

      <div style={{ ...tarjeta, background: "#FBFBF7", fontSize: 13, lineHeight: 1.55, color: "#444" }} data-test="consejo">
        {modulo.consejo}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------------------
// Módulo 3: la lista de cortes con kilos y precios
// ---------------------------------------------------------------------------

function TablaEscandallo({ res, cortes, acciones }: { res: ResultadoCarniceria; cortes: Corte[]; acciones: AccionesCalculadoras }) {
  const [editandoLista, setEditandoLista] = useState(false);
  const porId = new Map(cortes.map((c) => [c.id, c]));
  const campo = (clave: string) => res.modulos.find((m) => m.numero === 3)?.campos.find((c) => c.clave === clave);
  const filas = res.escandallo;
  const total = {
    kilos: filas.reduce((s, x) => s + x.kilos, 0),
    plata: filas.reduce((s, x) => s + x.plata, 0),
    pctPeso: filas.reduce((s, x) => s + x.pctPeso, 0),
  };

  return (
    <div style={tarjeta}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>Corte por corte</h3>
        <button type="button" style={botonSecundario} onClick={() => setEditandoLista((x) => !x)} data-test="editar-cortes">
          {editandoLista ? "Listo" : "Editar la lista de cortes"}
        </button>
      </div>
      <p style={{ margin: "0 0 8px", fontSize: 12, color: "#666" }}>
        Los kilos son los de un desposte completo de una media res; los precios, los de tu pizarra. Esta lista la usa
        también el módulo 4.
      </p>

      {editandoLista ? (
        <EditorCortes cortes={cortes} acciones={acciones} />
      ) : (
        <TablaScroll>
          <table style={{ width: "100%", borderCollapse: "collapse" }} data-test="tabla-escandallo">
            <thead>
              <tr>
                <th style={thStyle}>Corte</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Kilos</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Pizarra $/kg</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Plata que entra</th>
                <th style={{ ...thStyle, textAlign: "right" }}>% peso</th>
                <th style={{ ...thStyle, textAlign: "right" }}>% plata</th>
              </tr>
            </thead>
            <tbody>
              {filas.map((f) => {
                const corte = porId.get(f.id);
                // Grasa y hueso no son cortes: sus kilos y el precio del grasero son datos del módulo 3
                // (m3.grasa, m3.hueso, m3.grasero), que por defecto salen del módulo 1.
                const claveKilos = f.id === "grasa" ? "m3.grasa" : f.id === "hueso" ? "m3.hueso" : null;
                const clavePrecio = f.id === "grasa" ? "m3.grasero" : null;
                const origenKilos = claveKilos ? campo(claveKilos)?.origen : null;
                return (
                  <tr key={f.id} data-test="fila-corte" style={{ background: f.derivada ? "#F8F9FA" : undefined }}>
                    <td style={{ ...tdStyle, minWidth: 90 }}>
                      {f.nombre}
                      {f.derivada && (
                        <div style={{ fontSize: 10, color: origenKilos === "manual" ? "#555" : "#1E7B34" }}>
                          {origenKilos === "manual" ? "cargado por vos" : "sale del módulo 1"}
                        </div>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      {corte ? (
                        <InputNumero ancho={62} valor={f.kilos} ariaLabel={`Kilos de ${f.nombre}`} dataTest="kilos-corte" onCommit={(v) => acciones.guardarCorte({ ...corte, kilos_desposte: v ?? 0 })} />
                      ) : claveKilos ? (
                        <InputNumero ancho={62} valor={f.kilos} ariaLabel={`Kilos de ${f.nombre}`} dataTest={`kilos-${f.id}`} amarillo={origenKilos !== "auto"} onCommit={(v) => acciones.guardarParametro(claveKilos, v ?? 0)} />
                      ) : (
                        num(f.kilos, 1)
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>
                      {corte ? (
                        <InputNumero ancho={86} valor={f.precio} ariaLabel={`Precio de ${f.nombre}`} dataTest="precio-corte" onCommit={(v) => acciones.guardarCorte({ ...corte, precio_pizarra: v ?? 0 })} />
                      ) : clavePrecio ? (
                        <InputNumero ancho={86} valor={f.precio} ariaLabel={`Precio de ${f.nombre}`} dataTest={`precio-${f.id}`} amarillo={campo(clavePrecio)?.origen !== "auto"} onCommit={(v) => acciones.guardarParametro(clavePrecio, v ?? 0)} />
                      ) : (
                        <span title="El hueso no se vende">{num(f.precio)}</span>
                      )}
                    </td>
                    <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>$ {num(f.plata)}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{num(f.pctPeso, 1, 1)}</td>
                    <td style={{ ...tdStyle, textAlign: "right" }}>{num(f.pctPlata, 1, 1)}</td>
                  </tr>
                );
              })}
              <tr style={{ fontWeight: 800, background: "#F2F3F4" }}>
                <td style={tdStyle}>TOTAL</td>
                <td style={{ ...tdStyle, textAlign: "right" }} data-test="total-kilos">{num(total.kilos, 1)}</td>
                <td style={tdStyle} />
                <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }} data-test="total-plata">$ {num(total.plata)}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{num(total.pctPeso, 1, 1)}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>100,0</td>
              </tr>
            </tbody>
          </table>
        </TablaScroll>
      )}
    </div>
  );
}

function EditorCortes({ cortes, acciones }: { cortes: Corte[]; acciones: AccionesCalculadoras }) {
  const [nuevo, setNuevo] = useState("");
  const ordenados = [...cortes].sort((a, b) => a.orden - b.orden);
  const activos = ordenados.filter((c) => c.activo);
  const inactivos = ordenados.filter((c) => !c.activo);

  function mover(i: number, delta: number) {
    const a = activos[i];
    const b = activos[i + delta];
    if (!a || !b) return;
    acciones.guardarCorte({ ...a, orden: b.orden });
    acciones.guardarCorte({ ...b, orden: a.orden });
  }

  function agregar() {
    const nombre = nuevo.trim();
    if (!nombre) return;
    const orden = Math.max(0, ...cortes.map((c) => c.orden)) + 1;
    acciones.guardarCorte({ nombre, precio_pizarra: 0, kilos_desposte: 0, fijo: false, orden, activo: true });
    setNuevo("");
  }

  return (
    <div data-test="editor-cortes" style={{ display: "grid", gap: 6 }}>
      {activos.map((c, i) => (
        <div key={c.id} style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
          <input
            defaultValue={c.nombre}
            aria-label="Nombre del corte"
            onBlur={(e) => {
              const nombre = e.target.value.trim();
              if (nombre && nombre !== c.nombre) acciones.guardarCorte({ ...c, nombre });
              else e.target.value = c.nombre;
            }}
            style={{ flex: "1 1 160px", minWidth: 0, padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6, fontSize: 14 }}
          />
          <button type="button" style={botonSecundario} aria-label={`Subir ${c.nombre}`} disabled={i === 0} onClick={() => mover(i, -1)}>
            <ArrowUp size={14} />
          </button>
          <button type="button" style={botonSecundario} aria-label={`Bajar ${c.nombre}`} disabled={i === activos.length - 1} onClick={() => mover(i, 1)}>
            <ArrowDown size={14} />
          </button>
          <button type="button" style={botonSecundario} onClick={() => acciones.guardarCorte({ ...c, activo: false })}>
            Sacar
          </button>
        </div>
      ))}
      <div style={{ display: "flex", gap: 6, marginTop: 6, flexWrap: "wrap" }}>
        <input
          value={nuevo}
          onChange={(e) => setNuevo(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && agregar()}
          placeholder="Nombre del corte nuevo"
          aria-label="Nombre del corte nuevo"
          data-test="nuevo-corte"
          style={{ flex: "1 1 160px", minWidth: 0, padding: "6px 8px", border: "1px solid #ccc", borderRadius: 6, fontSize: 14 }}
        />
        <button type="button" style={{ ...botonPrimario, display: "flex", alignItems: "center", gap: 4 }} onClick={agregar} data-test="agregar-corte">
          <Plus size={14} /> Agregar
        </button>
      </div>
      {inactivos.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 12, color: "#666" }}>
          Sacados de la lista:{" "}
          {inactivos.map((c) => (
            <button key={c.id} type="button" onClick={() => acciones.guardarCorte({ ...c, activo: true })} style={{ ...botonSecundario, margin: "2px 4px 2px 0", fontWeight: 400 }}>
              {c.nombre} ↺
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Módulo 4: qué cortes quedan fijos y el precio nuevo del resto
// ---------------------------------------------------------------------------

function TablaProrrateo({ res, cortes, acciones }: { res: ResultadoCarniceria; cortes: Corte[]; acciones: AccionesCalculadoras }) {
  const porId = new Map(cortes.map((c) => [c.id, c]));
  return (
    <div style={tarjeta}>
      <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>Pizarra nueva</h3>
      <p style={{ margin: "0 0 8px", fontSize: 12, color: "#666" }}>
        Tildá los cortes que no podés subir. Los kilos y los precios de hoy se cargan en el módulo 3.
      </p>
      <TablaScroll>
        <table style={{ width: "100%", borderCollapse: "collapse" }} data-test="tabla-prorrateo">
          <thead>
            <tr>
              <th style={thStyle}>Corte</th>
              <th style={{ ...thStyle, textAlign: "center" }}>¿Queda fijo?</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Kilos</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Pizarra hoy</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Pizarra nueva</th>
            </tr>
          </thead>
          <tbody>
            {res.prorrateo.map((f) => {
              const corte = porId.get(f.id);
              const sube = f.precioNuevo - f.precio;
              return (
                <tr key={f.id} data-test="fila-prorrateo">
                  <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{f.nombre}</td>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={f.fijo}
                      aria-label={`${f.nombre} queda fijo`}
                      data-test="fijo-corte"
                      onChange={(e) => corte && acciones.guardarCorte({ ...corte, fijo: e.target.checked })}
                      style={{ width: 18, height: 18 }}
                    />
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right" }}>{num(f.kilos, 1)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>$ {num(f.precio)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", fontWeight: 700, color: f.fijo ? "#777" : sube > 0 ? ROJO : "#1E7B34" }} data-test="precio-nuevo">
                    $ {num(f.precioNuevo)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TablaScroll>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Módulo 7: las partes del pollo
// ---------------------------------------------------------------------------

function TablaPollo({ res, acciones }: { res: ResultadoCarniceria; acciones: AccionesCalculadoras }) {
  const total = res.pollo.reduce((a, x) => ({ rinde: a.rinde + x.rinde, kilos: a.kilos + x.kilos, plata: a.plata + x.plata }), { rinde: 0, kilos: 0, plata: 0 });
  return (
    <div style={tarjeta}>
      <h3 style={{ margin: "0 0 8px", fontSize: 15 }}>El cajón trozado</h3>
      <TablaScroll>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Parte</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Rinde %</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Precio $/kg</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Kilos</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Plata</th>
            </tr>
          </thead>
          <tbody>
            {res.pollo.map((x) => (
              <tr key={x.parte}>
                <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{x.parte}</td>
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  <InputNumero ancho={70} valor={x.rinde} ariaLabel={`Rinde de ${x.parte}`} onCommit={(v) => acciones.guardarParametro(x.claveRinde, v)} />
                </td>
                <td style={{ ...tdStyle, textAlign: "right" }}>
                  <InputNumero ancho={90} valor={x.precio} ariaLabel={`Precio de ${x.parte}`} onCommit={(v) => acciones.guardarParametro(x.clavePrecio, v)} />
                </td>
                <td style={{ ...tdStyle, textAlign: "right" }}>{num(x.kilos, 2)}</td>
                <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>$ {num(x.plata)}</td>
              </tr>
            ))}
            <tr style={{ fontWeight: 800, background: "#F2F3F4" }}>
              <td style={tdStyle}>TOTAL</td>
              <td style={{ ...tdStyle, textAlign: "right" }}>{num(total.rinde, 1)}</td>
              <td style={tdStyle} />
              <td style={{ ...tdStyle, textAlign: "right" }}>{num(total.kilos, 2)}</td>
              <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>$ {num(total.plata)}</td>
            </tr>
          </tbody>
        </table>
      </TablaScroll>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Módulo 10: gastos fijos de Ingresos y Egresos y la luz del módulo 9
// ---------------------------------------------------------------------------

function ControlLuz({ res, parametros, acciones }: { res: ResultadoCarniceria; parametros: Parametros; acciones: AccionesCalculadoras }) {
  const usar = (parametros["m10.usar_luz_m9"] ?? 1) >= 0.5;
  return (
    <div style={{ padding: "8px 0", borderBottom: "1px dashed #eee" }}>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 13, cursor: "pointer" }}>
        <input
          type="checkbox"
          checked={usar}
          data-test="usar-luz-m9"
          onChange={(e) => acciones.guardarParametro("m10.usar_luz_m9", e.target.checked ? 1 : 0)}
          style={{ width: 18, height: 18 }}
        />
        Sumar la luz del frío que calcula el módulo 9
      </label>
      {res.avisoLuzDoble && (
        <div data-test="aviso-luz" style={{ marginTop: 6, background: "#FDEBD0", color: "#784212", padding: "8px 10px", borderRadius: 6, fontSize: 12 }}>
          {res.avisoLuzDoble}
        </div>
      )}
    </div>
  );
}

function TablaGastos({ res, acciones }: { res: ResultadoCarniceria; acciones: AccionesCalculadoras }) {
  const total = res.gastos.reduce((s, g) => s + g.parte, 0);
  return (
    <div style={tarjeta}>
      <h3 style={{ margin: "0 0 4px", fontSize: 15 }}>Gastos fijos del súper</h3>
      <p style={{ margin: "0 0 8px", fontSize: 12, color: "#666" }}>
        Salen de Ingresos y Egresos → Gastos fijos (los activos). Destildá los que no tienen nada que ver con la
        carnicería; a los tildados se les aplica el % de arriba.
      </p>
      {res.gastos.length === 0 ? (
        <div style={{ background: AMARILLO, padding: 10, borderRadius: 6, fontSize: 13 }} data-test="sin-gastos">
          No hay gastos fijos activos en Ingresos y Egresos. Cargalos ahí, o poné los montos de la carnicería en
          «Otros gastos propios».
        </div>
      ) : (
        <TablaScroll>
          <table style={{ width: "100%", borderCollapse: "collapse" }} data-test="tabla-gastos">
            <thead>
              <tr>
                <th style={{ ...thStyle, textAlign: "center" }}>Cuenta</th>
                <th style={thStyle}>Gasto</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Monto</th>
                <th style={{ ...thStyle, textAlign: "right" }}>Le toca</th>
              </tr>
            </thead>
            <tbody>
              {res.gastos.map((g) => (
                <tr key={g.id} data-test="fila-gasto" style={{ opacity: g.incluido ? 1 : 0.55 }}>
                  <td style={{ ...tdStyle, textAlign: "center" }}>
                    <input
                      type="checkbox"
                      checked={g.incluido}
                      aria-label={`Incluir ${g.descripcion}`}
                      data-test="incluir-gasto"
                      onChange={(e) => acciones.guardarGasto(g.id, e.target.checked)}
                      style={{ width: 18, height: 18 }}
                    />
                  </td>
                  <td style={tdStyle}>
                    {g.descripcion}
                    <div style={{ fontSize: 10, color: "#888" }}>{g.categoria}</div>
                  </td>
                  <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>$ {num(g.monto)}</td>
                  <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", fontWeight: 700 }}>$ {num(g.parte)}</td>
                </tr>
              ))}
              <tr style={{ fontWeight: 800, background: "#F2F3F4" }}>
                <td style={tdStyle} />
                <td style={tdStyle}>TOTAL</td>
                <td style={tdStyle} />
                <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }} data-test="total-gastos">$ {num(total)}</td>
              </tr>
            </tbody>
          </table>
        </TablaScroll>
      )}
    </div>
  );
}
