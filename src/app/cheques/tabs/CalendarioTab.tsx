"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { fmtDate, fmtMoney, todayMidnight } from "@/lib/cheques/calculos";
import {
  DIAS_CORTOS,
  ESTADOS_CHEQUE,
  ESTADOS_POR_DEFECTO,
  NIVEL_STYLES,
  agruparPorFechaCobro,
  agruparTercerosPorFecha,
  buildCalendarioMes,
  contarExcluidosPorEstado,
  contarSinFechaCobro,
  mapaNoHabiles,
  margenDia,
  montoCheque,
  nivelDia,
  proximosDiasDisponibles,
  tieneDiferenciaDebito,
  usoDia,
  type DiaCalendario,
  type EstadosContados,
  type TopesDiarios,
} from "@/lib/cheques/calendario";
import type { Feriado } from "@/lib/cheques/feriados";
import { ESTADO_STYLES, NAVY, inputStyle, thStyle, tdStyle } from "@/lib/cheques/estilos";
import type { ChequeEnriquecido, ChequeTercero } from "@/lib/cheques/types";

const STORAGE_KEY = "cheques.calendario.prefs";
const STORAGE_KEY_TOPES_VIEJA = "cheques.topesDiarios";

const SIN_TOPES: TopesDiarios = { monto: null, cantidad: null };

const FERIADO_COLOR = "#6C3483";
const FERIADO_BG = "#F2EDF9";
const INGRESO_COLOR = "#0E6655";

interface Preferencias {
  topes: TopesDiarios;
  estados: EstadosContados;
  mostrarIngresos: boolean;
  diasPropios: Feriado[];
}

const PREFS_INICIALES: Preferencias = {
  topes: SIN_TOPES,
  estados: ESTADOS_POR_DEFECTO,
  mostrarIngresos: true,
  diasPropios: [],
};

function numeroPositivo(v: unknown): number | null {
  const n = Number(v);
  return n > 0 ? n : null;
}

function leerPreferencias(): Preferencias {
  if (typeof window === "undefined") return PREFS_INICIALES;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Migración: antes solo se guardaban los topes, bajo otra clave.
      const viejo = window.localStorage.getItem(STORAGE_KEY_TOPES_VIEJA);
      if (!viejo) return PREFS_INICIALES;
      const t = JSON.parse(viejo) as { monto?: unknown; cantidad?: unknown };
      return {
        ...PREFS_INICIALES,
        topes: { monto: numeroPositivo(t.monto), cantidad: numeroPositivo(t.cantidad) },
      };
    }
    const parsed = JSON.parse(raw) as Partial<{
      topes: { monto?: unknown; cantidad?: unknown };
      estados: Partial<EstadosContados>;
      mostrarIngresos: unknown;
      diasPropios: unknown;
    }>;
    const diasPropios = Array.isArray(parsed.diasPropios)
      ? (parsed.diasPropios as Feriado[]).filter(
          (d) => d && typeof d.fecha === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.fecha),
        )
      : [];
    return {
      topes: {
        monto: numeroPositivo(parsed.topes?.monto),
        cantidad: numeroPositivo(parsed.topes?.cantidad),
      },
      estados: { ...ESTADOS_POR_DEFECTO, ...(parsed.estados ?? {}) },
      mostrarIngresos: parsed.mostrarIngresos !== false,
      diasPropios,
    };
  } catch {
    return PREFS_INICIALES;
  }
}

/*
 * Las preferencias viven en localStorage, que es un sistema externo a React. Se leen con
 * useSyncExternalStore para que el servidor y la hidratación usen siempre los valores por
 * defecto y el valor guardado se aplique recién después de montar: leerlo durante el
 * primer render haría que el HTML del cliente no coincida con el del servidor.
 * El snapshot se cachea porque useSyncExternalStore exige un valor estable.
 */
const suscriptores = new Set<() => void>();
let snapshotPrefs: Preferencias | null = null;

function suscribir(alCambiar: () => void): () => void {
  suscriptores.add(alCambiar);
  return () => {
    suscriptores.delete(alCambiar);
  };
}

function snapshotCliente(): Preferencias {
  if (snapshotPrefs === null) snapshotPrefs = leerPreferencias();
  return snapshotPrefs;
}

function snapshotServidor(): Preferencias {
  return PREFS_INICIALES;
}

function guardarPreferencias(cambio: Partial<Preferencias>) {
  const next = { ...snapshotCliente(), ...cambio };
  snapshotPrefs = next;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* localStorage no disponible: las preferencias valen solo para esta sesión */
  }
  suscriptores.forEach((alCambiar) => alCambiar());
}

export default function CalendarioTab({
  enriched,
  terceros = [],
}: {
  enriched: ChequeEnriquecido[];
  terceros?: ChequeTercero[];
}) {
  const hoy = useMemo(() => todayMidnight(), []);
  const [anio, setAnio] = useState(() => hoy.getFullYear());
  const [mes, setMes] = useState(() => hoy.getMonth());
  const [diaSel, setDiaSel] = useState<string | null>(null);
  const [soloHabiles, setSoloHabiles] = useState(true);
  const [nuevoDiaPropio, setNuevoDiaPropio] = useState("");
  const [nombreDiaPropio, setNombreDiaPropio] = useState("");

  const prefs = useSyncExternalStore(suscribir, snapshotCliente, snapshotServidor);
  const { topes, estados, mostrarIngresos, diasPropios } = prefs;

  const noHabiles = useMemo(() => mapaNoHabiles(anio, diasPropios), [anio, diasPropios]);
  const porFecha = useMemo(() => agruparPorFechaCobro(enriched, estados), [enriched, estados]);
  const porFechaTerceros = useMemo(
    () => (mostrarIngresos ? agruparTercerosPorFecha(terceros) : new Map<string, ChequeTercero[]>()),
    [terceros, mostrarIngresos],
  );
  const sinFecha = useMemo(() => contarSinFechaCobro(enriched, estados), [enriched, estados]);
  const excluidos = useMemo(() => contarExcluidosPorEstado(enriched, estados), [enriched, estados]);
  const calendario = useMemo(
    () => buildCalendarioMes({ porFecha, anio, mes, porFechaTerceros, noHabiles }),
    [porFecha, anio, mes, porFechaTerceros, noHabiles],
  );
  const sugerencias = useMemo(
    () =>
      proximosDiasDisponibles(porFecha, topes, {
        soloHabiles,
        porFechaTerceros,
        noHabiles: anio === hoy.getFullYear() ? noHabiles : undefined,
      }),
    [porFecha, topes, soloHabiles, porFechaTerceros, noHabiles, anio, hoy],
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

  function agregarDiaPropio() {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(nuevoDiaPropio)) return;
    if (diasPropios.some((d) => d.fecha === nuevoDiaPropio)) return;
    const nuevo: Feriado = {
      fecha: nuevoDiaPropio,
      nombre: nombreDiaPropio.trim() || "Día no hábil",
      tipo: "propio",
    };
    guardarPreferencias({
      diasPropios: [...diasPropios, nuevo].sort((a, b) => (a.fecha < b.fecha ? -1 : 1)),
    });
    setNuevoDiaPropio("");
    setNombreDiaPropio("");
  }

  function quitarDiaPropio(fecha: string) {
    guardarPreferencias({ diasPropios: diasPropios.filter((d) => d.fecha !== fecha) });
  }

  const hayTopes = Boolean(topes.monto || topes.cantidad);
  const hayTerceros = terceros.length > 0;
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
  const panel = {
    background: "#fff",
    border: "1px solid #e0e0e0",
    borderRadius: 10,
    padding: "14px 16px",
    marginBottom: 16,
  } as const;
  const tituloPanel = { fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 10 } as const;

  return (
    // Grilla de una sola columna que puede encogerse (minmax(0,1fr)): sin esto, el ancho
    // mínimo de la grilla del mes empuja el ancho de la página y hace scrollear en horizontal
    // toda la pantalla en móvil, en lugar de scrollear solo el calendario.
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)" }}>
      {/* Topes */}
      <div style={panel}>
        <div style={tituloPanel}>Topes por día (para calcular el margen de emisión)</div>
        <div style={{ display: "flex", gap: 16, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ fontSize: 12, color: "#555", minWidth: 190, flex: "1 1 190px" }}>
            Monto máximo por día
            <input
              type="number"
              min={0}
              step={1000}
              value={topes.monto ?? ""}
              placeholder="Sin límite"
              onChange={(e) =>
                guardarPreferencias({
                  topes: { ...topes, monto: numeroPositivo(parseFloat(e.target.value)) },
                })
              }
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
              onChange={(e) =>
                guardarPreferencias({
                  topes: { ...topes, cantidad: numeroPositivo(parseInt(e.target.value, 10)) },
                })
              }
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
          <span style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 11, color: "#555" }}>
            <span style={{ width: 12, height: 12, borderRadius: 3, background: FERIADO_BG, border: `1px solid ${FERIADO_COLOR}` }} />
            Feriado o día no hábil
          </span>
        </div>
      </div>

      {/* Qué se cuenta */}
      <div style={panel} data-testid="panel-estados">
        <div style={tituloPanel}>Qué cheques se cuentan</div>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {ESTADOS_CHEQUE.map((est) => {
            const style = ESTADO_STYLES[est];
            return (
              <label
                key={est}
                style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#555", cursor: "pointer" }}
              >
                <input
                  type="checkbox"
                  data-estado={est}
                  checked={estados[est]}
                  onChange={(e) =>
                    guardarPreferencias({ estados: { ...estados, [est]: e.target.checked } })
                  }
                />
                <span style={{ background: style.bg, color: style.text, fontSize: 11, fontWeight: 700, padding: "2px 8px", borderRadius: 10 }}>
                  {style.label}
                </span>
              </label>
            );
          })}
        </div>
        {hayTerceros && (
          <label style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 12, color: "#555", marginTop: 12, cursor: "pointer" }}>
            <input
              type="checkbox"
              data-testid="check-ingresos"
              checked={mostrarIngresos}
              onChange={(e) => guardarPreferencias({ mostrarIngresos: e.target.checked })}
            />
            Mostrar lo que entra por cheques de terceros ({terceros.length} cargados)
          </label>
        )}
        {excluidos > 0 && (
          <div data-testid="aviso-excluidos" style={{ fontSize: 12, color: "#7E5109", marginTop: 10 }}>
            {excluidos} {excluidos === 1 ? "cheque queda" : "cheques quedan"} afuera del calendario
            por el filtro de estados.
          </div>
        )}
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
          {mostrarIngresos && calendario.totalEntrada > 0 && (
            <>
              {" · entra "}
              <strong style={{ color: INGRESO_COLOR }}>{fmtMoney(calendario.totalEntrada)}</strong>
            </>
          )}
        </div>
      </div>

      {sinFecha > 0 && (
        <div style={{ background: "#FDEBD0", color: "#784212", padding: "8px 12px", borderRadius: 6, marginBottom: 12, fontSize: 12 }}>
          {sinFecha} {sinFecha === 1 ? "cheque no tiene" : "cheques no tienen"} fecha de cobro, así que no
          {sinFecha === 1 ? " aparece" : " aparecen"} en el calendario.
        </div>
      )}

      {calendario.totalMontoNominal !== calendario.totalMonto && (
        <div data-testid="aviso-debito" style={{ background: "#FCF3CF", color: "#7D6608", padding: "8px 12px", borderRadius: 6, marginBottom: 12, fontSize: 12 }}>
          El banco debitó {fmtMoney(calendario.totalMonto)} contra{" "}
          {fmtMoney(calendario.totalMontoNominal)} emitidos este mes. El calendario usa lo
          que realmente debitó.
        </div>
      )}

      {calendario.diasNoHabilesConCheques.length > 0 && (
        <div data-testid="aviso-no-habil" style={{ background: FERIADO_BG, color: FERIADO_COLOR, padding: "8px 12px", borderRadius: 6, marginBottom: 12, fontSize: 12 }}>
          {calendario.diasNoHabilesConCheques.length}{" "}
          {calendario.diasNoHabilesConCheques.length === 1 ? "día tiene" : "días tienen"} cheques
          con fecha de cobro en día no hábil, así que el cobro pasa al día hábil siguiente:{" "}
          {calendario.diasNoHabilesConCheques
            .slice(0, 4)
            .map((d) => `${fmtDate(d.fecha)} → ${fmtDate(d.proximoHabil)}`)
            .join(" · ")}
          {calendario.diasNoHabilesConCheques.length > 4 && " …"}
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
                  return <div key={di} style={{ minHeight: 92, background: "#FAFAFA", borderTop: "1px solid #eee", borderRight: di < 6 ? "1px solid #eee" : "none" }} />;
                }
                const nivel = nivelDia(dia, topes);
                const est = NIVEL_STYLES[nivel];
                const uso = usoDia(dia, topes);
                const seleccionado = diaSel === dia.fecha;
                const esFeriado = dia.noHabil && !dia.finDeSemana;
                const fondo =
                  dia.cantidad > 0
                    ? est.bg
                    : esFeriado
                      ? FERIADO_BG
                      : dia.finDeSemana
                        ? "#F0F0F0"
                        : est.bg;
                return (
                  <div
                    key={di}
                    data-fecha={dia.fecha}
                    data-dia={dia.dia}
                    data-nivel={nivel}
                    data-nohabil={dia.noHabil ? "1" : "0"}
                    data-feriado={esFeriado ? "1" : "0"}
                    onClick={() => setDiaSel(seleccionado ? null : dia.fecha)}
                    style={{
                      minHeight: 92,
                      padding: "6px 7px",
                      background: fondo,
                      borderTop: "1px solid #eee",
                      borderRight: di < 6 ? "1px solid #eee" : "none",
                      cursor: dia.cantidad > 0 || dia.cantidadEntrada > 0 ? "pointer" : "default",
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
                    {esFeriado && (
                      <div
                        title={dia.nombreNoHabil ?? ""}
                        style={{ fontSize: 9, fontWeight: 700, color: FERIADO_COLOR, marginTop: 3, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}
                      >
                        {dia.nombreNoHabil}
                      </div>
                    )}
                    {dia.cantidad > 0 && (
                      <>
                        <div style={{ fontSize: 11, fontWeight: 700, color: est.text, marginTop: 4, wordBreak: "break-all" }}>
                          {fmtMoney(dia.monto)}
                        </div>
                        {uso !== null && (
                          <div style={{ fontSize: 10, color: est.text, opacity: 0.85 }}>
                            {Math.round(uso * 100)}% del tope
                          </div>
                        )}
                      </>
                    )}
                    {mostrarIngresos && dia.montoEntrada > 0 && (
                      <div data-testid="celda-ingreso" style={{ fontSize: 10, fontWeight: 700, color: INGRESO_COLOR, marginTop: 2, wordBreak: "break-all" }}>
                        + {fmtMoney(dia.montoEntrada)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Detalle del día */}
      {detalle && (detalle.cantidad > 0 || detalle.cantidadEntrada > 0) && (
        <div style={panel} data-testid="detalle-dia">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: NAVY }}>
              {fmtDate(detalle.fecha)}
              {detalle.cantidad > 0 && (
                <>
                  {" · "}
                  {detalle.cantidad} {detalle.cantidad === 1 ? "cheque" : "cheques"} ·{" "}
                  {fmtMoney(detalle.monto)}
                </>
              )}
            </div>
            <button onClick={() => setDiaSel(null)} style={{ ...navBtn, padding: "4px 10px" }}>Cerrar</button>
          </div>

          {detalle.noHabil && (
            <div style={{ fontSize: 12, color: FERIADO_COLOR, background: FERIADO_BG, padding: "6px 10px", borderRadius: 6, marginBottom: 10 }}>
              {detalle.nombreNoHabil}: el banco no opera.
              {detalle.proximoHabil && (
                <> Cobro efectivo: <strong>{fmtDate(detalle.proximoHabil)}</strong>.</>
              )}
            </div>
          )}

          {detalle.montoNominal !== detalle.monto && (
            <div style={{ fontSize: 12, color: "#7D6608", marginBottom: 10 }}>
              Emitido {fmtMoney(detalle.montoNominal)} · debitado por el banco{" "}
              <strong>{fmtMoney(detalle.monto)}</strong>
            </div>
          )}

          {hayTopes && detalle.cantidad > 0 && (
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

          {detalle.cantidad > 0 && (
            <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={thStyle}>N° cheque</th>
                    <th style={thStyle}>Proveedor</th>
                    <th style={thStyle}>Tipo</th>
                    <th style={thStyle}>Importe</th>
                    <th style={thStyle}>Debitado</th>
                    <th style={thStyle}>Estado</th>
                  </tr>
                </thead>
                <tbody>
                  {detalle.cheques.map((c, i) => {
                    const est = ESTADO_STYLES[c.estado];
                    const difiere = tieneDiferenciaDebito(c);
                    return (
                      <tr key={c.id} style={{ background: i % 2 === 1 ? "#F2F6FC" : "white", borderTop: "1px solid #eee" }}>
                        <td style={tdStyle}>{c.n_cheque || "-"}</td>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{c.proveedor || "Sin nombre"}</td>
                        <td style={tdStyle}>{c.tipo}</td>
                        <td style={tdStyle}>{fmtMoney(c.importe)}</td>
                        <td style={{ ...tdStyle, color: difiere ? "#7D6608" : "#555", fontWeight: difiere ? 700 : 400 }}>
                          {Number(c.debito_banco) > 0 ? fmtMoney(montoCheque(c)) : "-"}
                        </td>
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
          )}

          {mostrarIngresos && detalle.cantidadEntrada > 0 && (
            <div style={{ marginTop: 14 }} data-testid="detalle-terceros">
              <div style={{ fontSize: 12, fontWeight: 700, color: INGRESO_COLOR, marginBottom: 8 }}>
                Entra por cheques de terceros: {fmtMoney(detalle.montoEntrada)}
                {detalle.cantidad > 0 && (
                  <span style={{ color: "#555", fontWeight: 400 }}>
                    {" · neto del día "}
                    <strong style={{ color: detalle.neto >= 0 ? INGRESO_COLOR : "#922B21" }}>
                      {detalle.neto >= 0 ? "+" : "−"}
                      {fmtMoney(Math.abs(detalle.neto))}
                    </strong>
                  </span>
                )}
              </div>
              <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr>
                      <th style={thStyle}>N° cheque</th>
                      <th style={thStyle}>Librador</th>
                      <th style={thStyle}>Banco</th>
                      <th style={thStyle}>Importe</th>
                      <th style={thStyle}>Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {detalle.terceros.map((t, i) => (
                      <tr key={t.id} style={{ background: i % 2 === 1 ? "#F2F6FC" : "white", borderTop: "1px solid #eee" }}>
                        <td style={tdStyle}>{t.n_cheque || "-"}</td>
                        <td style={{ ...tdStyle, fontWeight: 700 }}>{t.librador || "Sin nombre"}</td>
                        <td style={tdStyle}>{t.banco || "-"}</td>
                        <td style={{ ...tdStyle, color: INGRESO_COLOR, fontWeight: 700 }}>{fmtMoney(t.importe)}</td>
                        <td style={tdStyle}>{t.estado}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Próximos días disponibles */}
      <div style={panel}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: NAVY }}>Próximos días con margen para emitir</div>
          <label style={{ fontSize: 12, color: "#555", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <input
              type="checkbox"
              data-testid="check-habiles"
              checked={soloHabiles}
              onChange={(e) => setSoloHabiles(e.target.checked)}
            />
            Solo días hábiles (sin fines de semana ni feriados)
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
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} data-testid="sugerencias">
            {sugerencias.map((s) => {
              const est = NIVEL_STYLES[s.nivel];
              const partes: string[] = [];
              if (s.margen.monto !== null) partes.push(fmtMoney(s.margen.monto));
              if (s.margen.cantidad !== null) partes.push(`${s.margen.cantidad} ch.`);
              return (
                <button
                  key={s.fecha}
                  data-fecha={s.fecha}
                  onClick={() => {
                    const [y, m] = s.fecha.split("-");
                    setAnio(parseInt(y, 10));
                    setMes(parseInt(m, 10) - 1);
                    setDiaSel(s.cantidad > 0 || s.montoEntrada > 0 ? s.fecha : null);
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
                  {mostrarIngresos && s.montoEntrada > 0 && (
                    <div style={{ fontSize: 10, fontWeight: 700, color: INGRESO_COLOR, marginTop: 2 }}>
                      + {fmtMoney(s.montoEntrada)}
                    </div>
                  )}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Días no hábiles propios */}
      <div style={panel}>
        <details data-testid="editor-dias-propios">
          <summary style={{ fontSize: 12, fontWeight: 700, color: NAVY, cursor: "pointer" }}>
            Días no hábiles propios ({diasPropios.length})
          </summary>
          <div style={{ fontSize: 11, color: "#777", margin: "10px 0" }}>
            Los feriados nacionales ya están calculados. Acá se agregan los que el Gobierno
            fija por decreto cada año (los &quot;puentes&quot; turísticos) y cualquier día en que
            el banco no opere.
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ fontSize: 12, color: "#555" }}>
              Fecha
              <input
                type="date"
                data-testid="input-dia-propio"
                value={nuevoDiaPropio}
                onChange={(e) => setNuevoDiaPropio(e.target.value)}
                style={{ ...inputStyle, marginTop: 4 }}
              />
            </label>
            <label style={{ fontSize: 12, color: "#555", flex: "1 1 180px" }}>
              Motivo (opcional)
              <input
                type="text"
                data-testid="input-motivo-dia-propio"
                value={nombreDiaPropio}
                placeholder="Puente turístico"
                onChange={(e) => setNombreDiaPropio(e.target.value)}
                style={{ ...inputStyle, marginTop: 4 }}
              />
            </label>
            <button data-testid="btn-agregar-dia-propio" onClick={agregarDiaPropio} style={navBtn}>
              Agregar
            </button>
          </div>
          {diasPropios.length > 0 && (
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }} data-testid="lista-dias-propios">
              {diasPropios.map((d) => (
                <span
                  key={d.fecha}
                  data-fecha={d.fecha}
                  style={{ display: "inline-flex", alignItems: "center", gap: 8, background: FERIADO_BG, color: FERIADO_COLOR, border: `1px solid ${FERIADO_COLOR}`, borderRadius: 8, padding: "4px 8px", fontSize: 11, fontWeight: 700 }}
                >
                  {fmtDate(d.fecha)} · {d.nombre}
                  <button
                    onClick={() => quitarDiaPropio(d.fecha)}
                    aria-label={`Quitar ${d.fecha}`}
                    style={{ border: "none", background: "transparent", color: FERIADO_COLOR, cursor: "pointer", fontSize: 13, fontWeight: 800, padding: 0 }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </details>
      </div>
    </div>
  );
}
