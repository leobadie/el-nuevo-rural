"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { fmtDate, fmtMoney, todayMidnight } from "@/lib/cheques/calculos";
import {
  DIAS_CORTOS,
  NIVEL_STYLES,
  agruparPorFechaCobro,
  buildCalendarioMes,
  contarSinFechaCobro,
  margenDia,
  nivelDia,
  proximosDiasDisponibles,
  usoDia,
  type DiaCalendario,
  type TopesDiarios,
} from "@/lib/cheques/calendario";
import { ESTADO_STYLES, NAVY, inputStyle, thStyle, tdStyle } from "@/lib/cheques/estilos";
import type { ChequeEnriquecido } from "@/lib/cheques/types";

const STORAGE_KEY = "cheques.topesDiarios";

const SIN_TOPES: TopesDiarios = { monto: null, cantidad: null };

function leerTopes(): TopesDiarios {
  if (typeof window === "undefined") return SIN_TOPES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return SIN_TOPES;
    const parsed = JSON.parse(raw) as { monto?: unknown; cantidad?: unknown };
    const monto = Number(parsed.monto);
    const cantidad = Number(parsed.cantidad);
    return {
      monto: monto > 0 ? monto : null,
      cantidad: cantidad > 0 ? cantidad : null,
    };
  } catch {
    return SIN_TOPES;
  }
}

/*
 * Los topes viven en localStorage, que es un sistema externo a React. Se leen con
 * useSyncExternalStore para que el servidor y la hidratación usen siempre SIN_TOPES
 * y React aplique el valor guardado recién después de montar: leerlo durante el
 * primer render haría que el HTML del cliente no coincida con el del servidor.
 * El snapshot se cachea porque useSyncExternalStore exige un valor estable.
 */
const suscriptores = new Set<() => void>();
let snapshotTopes: TopesDiarios | null = null;

function suscribirTopes(alCambiar: () => void): () => void {
  suscriptores.add(alCambiar);
  return () => {
    suscriptores.delete(alCambiar);
  };
}

function snapshotCliente(): TopesDiarios {
  if (snapshotTopes === null) snapshotTopes = leerTopes();
  return snapshotTopes;
}

function snapshotServidor(): TopesDiarios {
  return SIN_TOPES;
}

function guardarTopes(next: TopesDiarios) {
  snapshotTopes = next;
  try {
    window.localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ monto: next.monto ?? 0, cantidad: next.cantidad ?? 0 }),
    );
  } catch {
    /* localStorage no disponible: los topes valen solo para esta sesión */
  }
  suscriptores.forEach((alCambiar) => alCambiar());
}

export default function CalendarioTab({ enriched }: { enriched: ChequeEnriquecido[] }) {
  const hoy = useMemo(() => todayMidnight(), []);
  const [anio, setAnio] = useState(() => hoy.getFullYear());
  const [mes, setMes] = useState(() => hoy.getMonth());
  const topes = useSyncExternalStore(suscribirTopes, snapshotCliente, snapshotServidor);
  const [diaSel, setDiaSel] = useState<string | null>(null);
  const [soloHabiles, setSoloHabiles] = useState(true);

  const actualizarTopes = guardarTopes;

  const porFecha = useMemo(() => agruparPorFechaCobro(enriched), [enriched]);
  const sinFecha = useMemo(() => contarSinFechaCobro(enriched), [enriched]);
  const calendario = useMemo(() => buildCalendarioMes(porFecha, anio, mes), [porFecha, anio, mes]);
  const sugerencias = useMemo(
    () => proximosDiasDisponibles(porFecha, topes, { soloHabiles }),
    [porFecha, topes, soloHabiles],
  );

  const detalle: DiaCalendario | null = useMemo(() => {
    if (!diaSel) return null;
    for (const semana of calendario.semanas) {
      for (const d of semana) if (d && d.fecha === diaSel) return d;
    }
    return null;
  }, [diaSel, calendario]);

  function moverMes(delta: number) {
    const d = new Date(anio, mes + delta, 1);
    setAnio(d.getFullYear());
    setMes(d.getMonth());
    setDiaSel(null);
  }

  function irAHoy() {
    setAnio(hoy.getFullYear());
    setMes(hoy.getMonth());
    setDiaSel(null);
  }

  const hayTopes = Boolean(topes.monto || topes.cantidad);
  const navBtn = {
    border: "1px solid #ccc",
    background: "white",
    borderRadius: 6,
    padding: "6px 12px",
    fontSize: 13,
    fontWeight: 700,
    color: NAVY,
    cursor: "pointer",
  } as const;

  return (
    // Grilla de una sola columna que puede encogerse (minmax(0,1fr)): sin esto, el ancho
    // mínimo de la grilla del mes empuja el ancho de la página y hace scrollear en horizontal
    // toda la pantalla en móvil, en lugar de scrollear solo el calendario.
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)" }}>
      {/* Topes */}
      <div style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 10 }}>
          Topes por día (para calcular el margen de emisión)
        </div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ fontSize: 12, color: "#555", minWidth: 190, flex: "1 1 190px" }}>
            Monto máximo por día
            <input
              type="number"
              min={0}
              step={1000}
              value={topes.monto ?? ""}
              placeholder="Sin límite"
              onChange={(e) => {
                const v = parseFloat(e.target.value);
                actualizarTopes({ ...topes, monto: v > 0 ? v : null });
              }}
              style={{ ...inputStyle, marginTop: 4 }}
            />
          </label>
          <label style={{ fontSize: 12, color: "#555", minWidth: 190, flex: "1 1 190px" }}>
            Cantidad máxima de cheques por día
            <input
              type="number"
              min={0}
              step={1}
              value={topes.cantidad ?? ""}
              placeholder="Sin límite"
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                actualizarTopes({ ...topes, cantidad: v > 0 ? v : null });
              }}
              style={{ ...inputStyle, marginTop: 4 }}
            />
          </label>
        </div>
        {!hayTopes && (
          <div style={{ fontSize: 12, color: "#7E5109", marginTop: 10 }}>
            Definí al menos un tope para ver qué días tienen margen para emitir.
          </div>
        )}
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap", marginTop: 12 }}>
          {(["libre", "margen", "sinMargen", "sinTope"] as const).map((n) => (
            <span key={n} style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "#555" }}>
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  background: NIVEL_STYLES[n].bg,
                  border: `1px solid ${NIVEL_STYLES[n].border}`,
                }}
              />
              {n === "libre" && "Libre (sin cheques)"}
              {n === "margen" && "Con margen"}
              {n === "sinMargen" && "Sin margen (tope alcanzado)"}
              {n === "sinTope" && "Con cheques (sin tope definido)"}
            </span>
          ))}
        </div>
      </div>

      {/* Navegación de mes */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 12 }}>
        <button onClick={() => moverMes(-1)} style={navBtn} aria-label="Mes anterior">‹</button>
        <div style={{ fontSize: 16, fontWeight: 800, color: NAVY, minWidth: 150, textAlign: "center" }}>
          {calendario.label}
        </div>
        <button onClick={() => moverMes(1)} style={navBtn} aria-label="Mes siguiente">›</button>
        <button onClick={irAHoy} style={navBtn}>Hoy</button>
        <div style={{ flex: 1 }} />
        <div style={{ fontSize: 12, color: "#555" }}>
          <strong>{calendario.totalCantidad}</strong> cheques en el mes ·{" "}
          <strong>{fmtMoney(calendario.totalMonto)}</strong>
        </div>
      </div>

      {sinFecha > 0 && (
        <div style={{ background: "#FDEBD0", color: "#784212", padding: "8px 12px", borderRadius: 6, marginBottom: 12, fontSize: 12 }}>
          {sinFecha} {sinFecha === 1 ? "cheque no tiene" : "cheques no tienen"} fecha de cobro, así que no
          {sinFecha === 1 ? " aparece" : " aparecen"} en el calendario.
        </div>
      )}

      {/* Grilla */}
      <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8, marginBottom: 16 }}>
        <div style={{ minWidth: 560 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", background: NAVY }}>
            {DIAS_CORTOS.map((d, i) => (
              <div key={i} style={{ color: "white", fontSize: 11, fontWeight: 700, textAlign: "center", padding: "8px 0" }}>
                {d}
              </div>
            ))}
          </div>
          {calendario.semanas.map((semana, si) => (
            <div key={si} style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)" }}>
              {semana.map((dia, di) => {
                if (!dia) {
                  return <div key={di} style={{ minHeight: 78, background: "#FAFAFA", borderTop: "1px solid #eee", borderRight: di < 6 ? "1px solid #eee" : "none" }} />;
                }
                const nivel = nivelDia(dia, topes);
                const est = NIVEL_STYLES[nivel];
                const uso = usoDia(dia, topes);
                const seleccionado = diaSel === dia.fecha;
                return (
                  <div
                    key={di}
                    onClick={() => setDiaSel(seleccionado ? null : dia.fecha)}
                    style={{
                      minHeight: 78,
                      padding: "6px 7px",
                      background: dia.finDeSemana && nivel === "libre" ? "#F0F0F0" : est.bg,
                      borderTop: "1px solid #eee",
                      borderRight: di < 6 ? "1px solid #eee" : "none",
                      cursor: dia.cantidad > 0 ? "pointer" : "default",
                      outline: seleccionado ? `2px solid ${NAVY}` : dia.esHoy ? `2px solid #D97757` : "none",
                      outlineOffset: -2,
                      opacity: dia.finDeSemana ? 0.85 : 1,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ fontSize: 13, fontWeight: dia.esHoy ? 800 : 700, color: dia.esHoy ? "#D97757" : "#1A1A2E" }}>
                        {dia.dia}
                      </span>
                      {dia.cantidad > 0 && (
                        <span
                          style={{
                            fontSize: 10,
                            fontWeight: 700,
                            background: est.text,
                            color: "white",
                            borderRadius: 10,
                            padding: "1px 6px",
                          }}
                        >
                          {dia.cantidad}
                        </span>
                      )}
                    </div>
                    {dia.cantidad > 0 && (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 700, color: est.text, marginTop: 6, wordBreak: "break-all" }}>
                          {fmtMoney(dia.monto)}
                        </div>
                        {uso !== null && (
                          <div style={{ fontSize: 10, color: est.text, opacity: 0.85, marginTop: 2 }}>
                            {Math.round(uso * 100)}% del tope
                          </div>
                        )}
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Detalle del día */}
      {detalle && detalle.cantidad > 0 && (
        <div style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 10, padding: "14px 16px", marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>
              {fmtDate(detalle.fecha)} · {detalle.cantidad} {detalle.cantidad === 1 ? "cheque" : "cheques"} ·{" "}
              {fmtMoney(detalle.monto)}
            </div>
            <button onClick={() => setDiaSel(null)} style={{ ...navBtn, padding: "4px 10px" }}>Cerrar</button>
          </div>
          {hayTopes && (
            <div style={{ fontSize: 12, color: "#555", marginBottom: 10 }}>
              Margen restante:{" "}
              {(() => {
                const m = margenDia(detalle, topes);
                const partes: string[] = [];
                if (m.monto !== null) partes.push(fmtMoney(m.monto));
                if (m.cantidad !== null) partes.push(`${m.cantidad} ${m.cantidad === 1 ? "cheque" : "cheques"}`);
                return <strong>{partes.join(" · ")}</strong>;
              })()}
            </div>
          )}
          <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
            <table style={{ width: "100%", borderCollapse: "collapse" }}>
              <thead>
                <tr>
                  <th style={thStyle}>N° cheque</th>
                  <th style={thStyle}>Proveedor</th>
                  <th style={thStyle}>Tipo</th>
                  <th style={thStyle}>Importe</th>
                  <th style={thStyle}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {detalle.cheques.map((c, i) => {
                  const est = ESTADO_STYLES[c.estado];
                  return (
                    <tr key={c.id} style={{ background: i % 2 === 1 ? "#F2F6FC" : "white", borderTop: "1px solid #eee" }}>
                      <td style={tdStyle}>{c.n_cheque || "-"}</td>
                      <td style={{ ...tdStyle, fontWeight: 700 }}>{c.proveedor || "Sin nombre"}</td>
                      <td style={tdStyle}>{c.tipo}</td>
                      <td style={tdStyle}>{fmtMoney(c.importe)}</td>
                      <td style={tdStyle}>
                        <span style={{ background: est.bg, color: est.text, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10 }}>
                          {est.label}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Próximos días disponibles */}
      <div style={{ background: "#fff", border: "1px solid #e0e0e0", borderRadius: 10, padding: "14px 16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>Próximos días con margen para emitir</div>
          <label style={{ fontSize: 12, color: "#555", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input type="checkbox" checked={soloHabiles} onChange={(e) => setSoloHabiles(e.target.checked)} />
            Solo días hábiles
          </label>
        </div>
        {!hayTopes ? (
          <div style={{ fontSize: 12, color: "#888" }}>
            Cargá un tope de monto o de cantidad arriba para ver sugerencias con margen calculado.
            Por ahora se listan los días sin ningún cheque.
          </div>
        ) : null}
        {sugerencias.length === 0 ? (
          <div style={{ fontSize: 12, color: "#888", padding: "10px 0" }}>
            No hay días con margen en los próximos 60 días.
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {sugerencias.map((s) => {
              const est = NIVEL_STYLES[s.nivel];
              const partes: string[] = [];
              if (s.margen.monto !== null) partes.push(fmtMoney(s.margen.monto));
              if (s.margen.cantidad !== null) partes.push(`${s.margen.cantidad} ch.`);
              return (
                <button
                  key={s.fecha}
                  onClick={() => {
                    const [y, m] = s.fecha.split("-");
                    setAnio(parseInt(y, 10));
                    setMes(parseInt(m, 10) - 1);
                    setDiaSel(s.cantidad > 0 ? s.fecha : null);
                  }}
                  style={{
                    background: est.bg,
                    border: `1px solid ${est.border}`,
                    borderRadius: 8,
                    padding: "8px 10px",
                    textAlign: "left",
                    cursor: "pointer",
                    minWidth: 116,
                  }}
                >
                  <div style={{ fontSize: 12, fontWeight: 700, color: est.text }}>{fmtDate(s.fecha)}</div>
                  <div style={{ fontSize: 10, color: est.text, opacity: 0.9, marginTop: 2 }}>
                    {s.cantidad === 0 ? "Sin cheques" : `${s.cantidad} cheque${s.cantidad === 1 ? "" : "s"}`}
                    {partes.length > 0 && ` · queda ${partes.join(" / ")}`}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
