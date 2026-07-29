"use client";

import { useEffect, useRef, useState } from "react";
import { fmtDate, fmtMoney } from "@/lib/cheques/calculos";
import { NAVY, inputStyle, thStyle, tdStyle } from "@/lib/cheques/estilos";
import { formatearCuit, tipoDeCuit, validarCuit } from "@/lib/bcra/cuit";
import { situacionBcra, veredicto } from "@/lib/bcra/situaciones";
import {
  consultarChequeDenunciado,
  consultarChequesRechazados,
  consultarDeudas,
  consultarDeudasHistoricas,
  consultarEntidades,
  evolucionPorPeriodo,
  nombrePeriodo,
  pesosDesdeMiles,
  resumirRechazos,
  resumirUltimoPeriodo,
  type ChequeDenunciado,
  type ChequesRechazados,
  type Deudas,
  type EntidadBancaria,
  type Resultado,
} from "@/lib/bcra/api";

interface Consulta {
  cuit: string;
  deudas: Resultado<Deudas>;
  rechazados: Resultado<ChequesRechazados>;
  historicas: Resultado<Deudas>;
}

const panel = {
  background: "#fff",
  border: "1px solid #e0e0e0",
  borderRadius: 10,
  padding: "14px 16px",
  marginBottom: 16,
} as const;

const tituloPanel = { fontSize: 12, fontWeight: 700, color: NAVY, marginBottom: 10 } as const;

const boton = {
  border: "none",
  background: NAVY,
  color: "white",
  borderRadius: 6,
  padding: "8px 16px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
} as const;

function ChipSituacion({ nivel }: { nivel: number }) {
  const s = situacionBcra(nivel);
  return (
    <span
      title={s.detalle}
      data-situacion={s.nivel}
      style={{
        background: s.bg,
        color: s.text,
        fontSize: 11,
        fontWeight: 700,
        padding: "2px 8px",
        borderRadius: 10,
        whiteSpace: "nowrap",
      }}
    >
      {s.nivel > 0 ? `${s.nivel} · ${s.label}` : s.label}
    </span>
  );
}

/** Marcas booleanas de la API: solo se muestran las que están activas. */
function Marcas({
  marcas,
}: {
  marcas: { etiqueta: string; activa: boolean }[];
}) {
  const activas = marcas.filter((m) => m.activa);
  if (activas.length === 0) return <span style={{ color: "#999" }}>—</span>;
  return (
    <span style={{ display: "inline-flex", gap: 4, flexWrap: "wrap" }}>
      {activas.map((m) => (
        <span
          key={m.etiqueta}
          style={{ background: "#FDEBD0", color: "#784212", fontSize: 10, fontWeight: 700, padding: "1px 6px", borderRadius: 8 }}
        >
          {m.etiqueta}
        </span>
      ))}
    </span>
  );
}

export default function VerificacionTab({ cuitInicial = "" }: { cuitInicial?: string }) {
  const [cuitTexto, setCuitTexto] = useState(cuitInicial);
  const [errorCuit, setErrorCuit] = useState("");
  const [consultando, setConsultando] = useState(false);
  const [consulta, setConsulta] = useState<Consulta | null>(null);

  const [entidades, setEntidades] = useState<EntidadBancaria[]>([]);
  const [errorEntidades, setErrorEntidades] = useState("");
  const [bancoSel, setBancoSel] = useState("");
  const [nroCheque, setNroCheque] = useState("");
  const [verificandoCheque, setVerificandoCheque] = useState(false);
  const [errorCheque, setErrorCheque] = useState("");
  const [chequeConsultado, setChequeConsultado] = useState<ChequeDenunciado | null>(null);

  /* El catálogo de bancos se carga cuando hace falta (al consultar un CUIT o al abrir el
     panel de cheques denunciados), no al montar: así no se gasta una consulta si no se usa. */
  async function cargarEntidades(): Promise<EntidadBancaria[]> {
    if (entidades.length > 0) return entidades;
    const r = await consultarEntidades();
    if (r.estado === "ok") {
      const ordenadas = [...r.datos].sort((a, b) =>
        a.denominacion.localeCompare(b.denominacion, "es"),
      );
      setEntidades(ordenadas);
      setErrorEntidades("");
      return ordenadas;
    }
    setErrorEntidades(
      r.estado === "error" ? r.mensaje : "El BCRA no devolvió la lista de bancos.",
    );
    return [];
  }

  async function consultarCuit(texto?: string) {
    const entrada = texto ?? cuitTexto;
    const v = validarCuit(entrada);
    if (!v.valido) {
      setErrorCuit(v.motivo);
      setConsulta(null);
      return;
    }
    setErrorCuit("");
    setConsultando(true);
    try {
      // Las tres consultas van en paralelo y cada una guarda su propio resultado:
      // si una falla, las otras se muestran igual.
      const [deudas, rechazados, historicas] = await Promise.all([
        consultarDeudas(v.cuit),
        consultarChequesRechazados(v.cuit),
        consultarDeudasHistoricas(v.cuit),
      ]);
      setConsulta({ cuit: v.cuit, deudas, rechazados, historicas });
      void cargarEntidades(); // para poder nombrar los bancos de los rechazos
    } finally {
      setConsultando(false);
    }
  }

  async function verificarCheque() {
    const codigo = parseInt(bancoSel, 10);
    const numero = parseInt(nroCheque.replace(/\D/g, ""), 10);
    if (!codigo) {
      setErrorCheque("Elegí el banco del cheque.");
      return;
    }
    if (!numero) {
      setErrorCheque("Escribí el número del cheque.");
      return;
    }
    setErrorCheque("");
    setVerificandoCheque(true);
    setChequeConsultado(null);
    try {
      const r = await consultarChequeDenunciado(codigo, numero);
      if (r.estado === "ok") setChequeConsultado(r.datos);
      else if (r.estado === "sinDatos")
        setErrorCheque("El BCRA no tiene información de ese cheque.");
      else setErrorCheque(r.mensaje);
    } finally {
      setVerificandoCheque(false);
    }
  }

  /* Cuando se llega desde "Verificar" en Cheques de Terceros, el CUIT viene precargado y la
     consulta se dispara sola. Es una llamada a un servicio externo al montar, que es
     justamente para lo que sirve un efecto. La ref evita repetirla en el modo estricto. */
  const yaConsultado = useRef(false);
  useEffect(() => {
    if (!cuitInicial || yaConsultado.current) return;
    yaConsultado.current = true;
    void consultarCuit(cuitInicial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cuitInicial]);

  function nombreEntidad(codigo: number): string {
    return entidades.find((e) => e.codigoEntidad === codigo)?.denominacion ?? `Entidad ${codigo}`;
  }

  const resumen =
    consulta?.deudas.estado === "ok" ? resumirUltimoPeriodo(consulta.deudas.datos) : null;
  const rechazos =
    consulta?.rechazados.estado === "ok" ? resumirRechazos(consulta.rechazados.datos) : null;
  const denominacion =
    consulta?.deudas.estado === "ok"
      ? consulta.deudas.datos.denominacion
      : consulta?.rechazados.estado === "ok"
        ? consulta.rechazados.datos.denominacion
        : null;

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)" }}>
      {/* Consulta por CUIT */}
      <div style={panel}>
        <div style={tituloPanel}>Verificar un CUIT en el BCRA</div>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
          <label style={{ fontSize: 12, color: "#555", flex: "1 1 220px" }}>
            CUIT o CUIL del librador
            <input
              type="text"
              data-testid="input-cuit"
              value={cuitTexto}
              placeholder="30-54668997-9"
              onChange={(e) => {
                setCuitTexto(e.target.value);
                setErrorCuit("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !consultando) void consultarCuit();
              }}
              style={{ ...inputStyle, marginTop: 4 }}
            />
          </label>
          <button
            data-testid="btn-consultar"
            onClick={() => void consultarCuit()}
            disabled={consultando}
            style={{ ...boton, opacity: consultando ? 0.6 : 1, cursor: consultando ? "wait" : "pointer" }}
          >
            {consultando ? "Consultando…" : "Consultar"}
          </button>
        </div>
        {errorCuit && (
          <div data-testid="error-cuit" style={{ fontSize: 12, color: "#922B21", marginTop: 8 }}>
            {errorCuit}
          </div>
        )}
        <div style={{ fontSize: 11, color: "#777", marginTop: 10, lineHeight: 1.5 }}>
          Datos públicos del BCRA. La Central de Deudores se actualiza <strong>una vez por
          mes</strong>, así que puede tener uno o dos meses de atraso; los cheques denunciados
          se actualizan todos los días. Los importes los informa el BCRA en miles de pesos y
          acá se muestran ya convertidos.
        </div>
      </div>

      {/* Resultado de la consulta */}
      {consulta && (
        <div data-testid="resultado-cuit">
          <div style={panel}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, color: NAVY }} data-testid="denominacion">
                  {denominacion ?? "Sin datos en el BCRA"}
                </div>
                <div style={{ fontSize: 12, color: "#555", marginTop: 2 }}>
                  {formatearCuit(consulta.cuit)} ·{" "}
                  {tipoDeCuit(consulta.cuit) === "empresa"
                    ? "empresa"
                    : tipoDeCuit(consulta.cuit) === "persona"
                      ? "persona física"
                      : "otro tipo"}
                </div>
              </div>
              {(() => {
                const v = veredicto({
                  peorSituacion: resumen?.peorSituacion ?? 0,
                  cantidadRechazos: rechazos?.cantidad ?? 0,
                  proporcionIrregular: resumen?.proporcionIrregular ?? 0,
                  entidadPeor: resumen?.entidadesIrregulares[0]?.entidad ?? null,
                });
                return (
                  <div
                    data-testid="veredicto"
                    style={{ background: v.bg, color: v.text, borderRadius: 8, padding: "8px 12px", maxWidth: 420 }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 800 }}>{v.titulo}</div>
                    <div style={{ fontSize: 11, marginTop: 2 }}>{v.detalle}</div>
                  </div>
                );
              })()}
            </div>
          </div>

          {/* Deudas */}
          <div style={panel}>
            <div style={tituloPanel}>Situación en el sistema financiero</div>
            {consulta.deudas.estado === "error" && (
              <div data-testid="error-deudas" style={{ fontSize: 12, color: "#922B21" }}>
                {consulta.deudas.mensaje}
              </div>
            )}
            {consulta.deudas.estado === "sinDatos" && (
              <div data-testid="sin-deudas" style={{ fontSize: 12, color: "#555" }}>
                No registra deudas informadas en la Central de Deudores.
              </div>
            )}
            {consulta.deudas.estado === "ok" && resumen && (
              <>
                <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 12, fontSize: 12, color: "#555" }}>
                  <span>
                    Período informado:{" "}
                    <strong data-testid="periodo">{nombrePeriodo(resumen.periodo)}</strong>
                  </span>
                  <span>
                    Deuda total: <strong>{fmtMoney(pesosDesdeMiles(resumen.totalMiles))}</strong>
                  </span>
                  <span>
                    Entidades: <strong>{resumen.cantidadEntidades}</strong>
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    Peor situación: <ChipSituacion nivel={resumen.peorSituacion} />
                  </span>
                </div>
                {resumen.irregularMiles > 0 && (
                  <div
                    data-testid="deuda-irregular"
                    style={{ fontSize: 12, color: "#7D6608", background: "#FCF3CF", padding: "8px 12px", borderRadius: 6, marginBottom: 12 }}
                  >
                    En situación irregular (3 o peor):{" "}
                    <strong>{fmtMoney(pesosDesdeMiles(resumen.irregularMiles))}</strong> en{" "}
                    {resumen.entidadesIrregulares.length}{" "}
                    {resumen.entidadesIrregulares.length === 1 ? "entidad" : "entidades"}, o sea el{" "}
                    <strong>
                      {resumen.proporcionIrregular < 0.01
                        ? "menos del 1"
                        : Math.round(resumen.proporcionIrregular * 100)}
                      %
                    </strong>{" "}
                    de su deuda total. El resto está en situación normal.
                  </div>
                )}
                <div style={{ fontSize: 11, color: "#777", marginBottom: 8 }}>
                  Ordenado por gravedad: las situaciones peores aparecen primero.
                </div>
                <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={thStyle}>Entidad</th>
                        <th style={thStyle}>Situación</th>
                        <th style={thStyle}>Monto</th>
                        <th style={thStyle}>Días de atraso</th>
                        <th style={thStyle}>Marcas</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resumen.entidades.map((e, i) => (
                        <tr key={`${e.entidad}-${i}`} style={{ background: i % 2 === 1 ? "#F2F6FC" : "white", borderTop: "1px solid #eee" }}>
                          <td style={{ ...tdStyle, fontWeight: 700 }}>{e.entidad}</td>
                          <td style={tdStyle}><ChipSituacion nivel={e.situacion} /></td>
                          <td style={tdStyle}>{fmtMoney(pesosDesdeMiles(e.monto))}</td>
                          <td style={tdStyle}>{e.diasAtrasoPago || 0}</td>
                          <td style={tdStyle}>
                            <Marcas
                              marcas={[
                                { etiqueta: "refinanciado", activa: e.refinanciaciones },
                                { etiqueta: "recategorización obligatoria", activa: e.recategorizacionOblig },
                                { etiqueta: "situación jurídica", activa: e.situacionJuridica },
                                { etiqueta: "proceso judicial", activa: e.procesoJud },
                                { etiqueta: "en revisión", activa: e.enRevision },
                                { etiqueta: "irrecuperable por disp. técnica", activa: e.irrecDisposicionTecnica },
                              ]}
                            />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </div>

          {/* Cheques rechazados */}
          <div style={panel}>
            <div style={tituloPanel}>Cheques rechazados</div>
            {consulta.rechazados.estado === "error" && (
              <div data-testid="error-rechazados" style={{ fontSize: 12, color: "#922B21" }}>
                {consulta.rechazados.mensaje}
              </div>
            )}
            {consulta.rechazados.estado === "sinDatos" && (
              <div data-testid="sin-rechazados" style={{ fontSize: 12, color: "#145A32", background: "#D5F5E3", padding: "8px 12px", borderRadius: 6 }}>
                No registra cheques rechazados en el BCRA.
              </div>
            )}
            {consulta.rechazados.estado === "ok" && rechazos && (
              <>
                <div style={{ display: "flex", gap: 20, flexWrap: "wrap", marginBottom: 12, fontSize: 12, color: "#555" }}>
                  <span>
                    Cheques rechazados: <strong data-testid="cantidad-rechazos">{rechazos.cantidad}</strong>
                  </span>
                  <span>
                    Monto total: <strong>{fmtMoney(pesosDesdeMiles(rechazos.totalMiles))}</strong>
                  </span>
                  <span>
                    Sin pagar después del rechazo: <strong>{rechazos.sinPagar}</strong>
                  </span>
                </div>
                {(consulta.rechazados.datos.causales ?? []).map((causal, ci) => (
                  <div key={ci} style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: "#922B21", marginBottom: 6 }}>
                      {causal.causal}
                    </div>
                    {(causal.entidades ?? []).map((ent, ei) => (
                      <div key={ei} style={{ marginBottom: 8 }}>
                        <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>
                          {nombreEntidad(ent.entidad)}
                        </div>
                        <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
                          <table style={{ width: "100%", borderCollapse: "collapse" }}>
                            <thead>
                              <tr>
                                <th style={thStyle}>N° cheque</th>
                                <th style={thStyle}>Rechazado el</th>
                                <th style={thStyle}>Monto</th>
                                <th style={thStyle}>Pagado el</th>
                                <th style={thStyle}>Multa</th>
                                <th style={thStyle}>Marcas</th>
                              </tr>
                            </thead>
                            <tbody>
                              {(ent.detalle ?? []).map((d, di) => (
                                <tr key={di} style={{ background: di % 2 === 1 ? "#F2F6FC" : "white", borderTop: "1px solid #eee" }}>
                                  <td style={tdStyle}>{d.nroCheque}</td>
                                  <td style={tdStyle}>{fmtDate(d.fechaRechazo)}</td>
                                  <td style={tdStyle}>{fmtMoney(pesosDesdeMiles(d.monto))}</td>
                                  <td style={{ ...tdStyle, color: d.fechaPago ? "#145A32" : "#922B21", fontWeight: 700 }}>
                                    {d.fechaPago ? fmtDate(d.fechaPago) : "Sin pagar"}
                                  </td>
                                  <td style={tdStyle}>
                                    {d.estadoMulta || "—"}
                                    {d.fechaPagoMulta && ` (${fmtDate(d.fechaPagoMulta)})`}
                                  </td>
                                  <td style={tdStyle}>
                                    <Marcas
                                      marcas={[
                                        { etiqueta: "cuenta personal", activa: d.ctaPersonal },
                                        { etiqueta: "proceso judicial", activa: d.procesoJud },
                                        { etiqueta: "en revisión", activa: d.enRevision },
                                      ]}
                                    />
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Evolución */}
          <div style={panel}>
            <div style={tituloPanel}>Cómo viene mes a mes</div>
            {consulta.historicas.estado === "ok" ? (
              (() => {
                const evo = evolucionPorPeriodo(consulta.historicas.datos).slice(0, 12);
                if (evo.length === 0) {
                  return <div style={{ fontSize: 12, color: "#555" }}>Sin períodos informados.</div>;
                }
                return (
                  <>
                    <div style={{ fontSize: 11, color: "#777", marginBottom: 8 }}>
                      El chip es la <strong>peor</strong> situación del mes. Debajo, la deuda total
                      y cuánta de esa plata estaba en situación irregular: un mismo atraso chico se
                      repite mes a mes y sin el monto parece que todo el período estuvo mal.
                    </div>
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }} data-testid="evolucion">
                      {evo.map((p) => (
                        <div
                          key={p.periodo}
                          style={{ border: "1px solid #e0e0e0", borderRadius: 8, padding: "8px 10px", minWidth: 130 }}
                        >
                          <div style={{ fontSize: 11, color: "#555", marginBottom: 4 }}>
                            {nombrePeriodo(p.periodo)}
                          </div>
                          <ChipSituacion nivel={p.peorSituacion} />
                          <div style={{ fontSize: 11, color: "#555", marginTop: 4 }}>
                            {fmtMoney(pesosDesdeMiles(p.totalMiles))}
                          </div>
                          {p.irregularMiles > 0 && (
                            <div
                              data-testid="evolucion-irregular"
                              style={{ fontSize: 10, color: "#784212", marginTop: 2 }}
                            >
                              irregular: {fmtMoney(pesosDesdeMiles(p.irregularMiles))} (
                              {p.proporcionIrregular < 0.01
                                ? "menos del 1%"
                                : `${Math.round(p.proporcionIrregular * 100)}%`}
                              )
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </>
                );
              })()
            ) : (
              <div data-testid="sin-historico" style={{ fontSize: 12, color: "#555" }}>
                {consulta.historicas.estado === "error"
                  ? consulta.historicas.mensaje
                  : "El BCRA no informa histórico para este CUIT."}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Cheque denunciado */}
      <div style={panel}>
        <details
          data-testid="panel-denunciados"
          onToggle={(e) => {
            if ((e.currentTarget as HTMLDetailsElement).open) void cargarEntidades();
          }}
        >
          <summary style={{ fontSize: 12, fontWeight: 700, color: NAVY, cursor: "pointer" }}>
            ¿Este cheque está denunciado? (robo o extravío)
          </summary>
          <div style={{ fontSize: 11, color: "#777", margin: "10px 0" }}>
            Este dato el BCRA lo actualiza todos los días. Sirve para chequear un cheque
            puntual antes de aceptarlo.
          </div>
          {errorEntidades && (
            <div style={{ fontSize: 12, color: "#922B21", marginBottom: 8 }}>{errorEntidades}</div>
          )}
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "flex-end" }}>
            <label style={{ fontSize: 12, color: "#555", flex: "1 1 240px" }}>
              Banco
              <select
                data-testid="select-banco"
                value={bancoSel}
                onChange={(e) => setBancoSel(e.target.value)}
                style={{ ...inputStyle, marginTop: 4 }}
              >
                <option value="">
                  {entidades.length ? "Elegí el banco" : "Cargando bancos…"}
                </option>
                {entidades.map((e) => (
                  <option key={e.codigoEntidad} value={e.codigoEntidad}>
                    {e.denominacion}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12, color: "#555", flex: "1 1 160px" }}>
              N° de cheque
              <input
                type="text"
                inputMode="numeric"
                data-testid="input-nro-cheque"
                value={nroCheque}
                placeholder="12345678"
                onChange={(e) => setNroCheque(e.target.value)}
                style={{ ...inputStyle, marginTop: 4 }}
              />
            </label>
            <button
              data-testid="btn-verificar-cheque"
              onClick={() => void verificarCheque()}
              disabled={verificandoCheque}
              style={{ ...boton, opacity: verificandoCheque ? 0.6 : 1 }}
            >
              {verificandoCheque ? "Verificando…" : "Verificar"}
            </button>
          </div>
          {errorCheque && (
            <div data-testid="error-cheque" style={{ fontSize: 12, color: "#922B21", marginTop: 8 }}>
              {errorCheque}
            </div>
          )}
          {chequeConsultado && (
            <div
              data-testid="resultado-cheque"
              data-denunciado={chequeConsultado.denunciado ? "1" : "0"}
              style={{
                marginTop: 12,
                background: chequeConsultado.denunciado ? "#FADBD8" : "#D5F5E3",
                color: chequeConsultado.denunciado ? "#922B21" : "#145A32",
                borderRadius: 8,
                padding: "10px 12px",
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 800 }}>
                {chequeConsultado.denunciado
                  ? "DENUNCIADO: no lo aceptes"
                  : "No figura denunciado"}
              </div>
              <div style={{ fontSize: 11, marginTop: 4 }}>
                Cheque {chequeConsultado.numeroCheque} · {chequeConsultado.denominacionEntidad} ·
                dato del {fmtDate(chequeConsultado.fechaProcesamiento)}
              </div>
              {chequeConsultado.detalles.length > 0 && (
                <div style={{ fontSize: 11, marginTop: 6 }}>
                  {chequeConsultado.detalles.map((d, i) => (
                    <div key={i}>
                      {Object.entries(d)
                        .map(([k, v]) => `${k}: ${String(v)}`)
                        .join(" · ")}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </details>
      </div>
    </div>
  );
}
