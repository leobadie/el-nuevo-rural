"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  type DenunciaCheque,
  type Deudas,
  type EntidadBancaria,
  type Resultado,
} from "@/lib/bcra/api";
import { COLORES_DENUNCIA, evaluarDenuncia } from "@/lib/bcra/denuncias";
import { consultarRegistroSociedad, type ResultadoRegistro } from "@/lib/registros/consulta";
import BloqueQuienEs from "./BloqueQuienEs";

interface Consulta {
  cuit: string;
  deudas: Resultado<Deudas>;
  rechazados: Resultado<ChequesRechazados>;
  historicas: Resultado<Deudas>;
  registro: ResultadoRegistro;
}

/** Una lÃ­nea legible por denuncia, con respaldo genÃ©rico si la API cambia los campos. */
function textoDenuncia(d: DenunciaCheque): string {
  const partes: string[] = [];
  if (d.numeroCuenta !== undefined) partes.push(`cuenta ${d.numeroCuenta}`);
  if (d.sucursal !== undefined) partes.push(`sucursal ${d.sucursal}`);
  if (typeof d.causal === "string") partes.push(d.causal);
  if (partes.length > 0) return partes.join(" Â· ");
  return Object.entries(d)
    .map(([k, v]) => `${k}: ${String(v)}`)
    .join(" Â· ");
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
      {s.nivel > 0 ? `${s.nivel} Â· ${s.label}` : s.label}
    </span>
  );
}

/** Marcas booleanas de la API: solo se muestran las que estÃ¡n activas. */
function Marcas({
  marcas,
}: {
  marcas: { etiqueta: string; activa: boolean }[];
}) {
  const activas = marcas.filter((m) => m.activa);
  if (activas.length === 0) return <span style={{ color: "#999" }}>â€”</span>;
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
  const [nroCuenta, setNroCuenta] = useState("");
  const [verificandoCheque, setVerificandoCheque] = useState(false);
  const [errorCheque, setErrorCheque] = useState("");
  const [chequeConsultado, setChequeConsultado] = useState<ChequeDenunciado | null>(null);

  /* El catÃ¡logo de bancos se carga cuando hace falta (al consultar un CUIT o al abrir el
     panel de cheques denunciados), no al montar: asÃ­ no se gasta una consulta si no se usa. */
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
      r.estado === "error" ? r.mensaje : "El BCRA no devolviÃ³ la lista de bancos.",
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
      // Las consultas van en paralelo y cada una guarda su propio resultado: si una falla,
      // las otras se muestran igual. El registro de sociedades sale de la base propia, no
      // del BCRA, pero se pide junto para no encadenar esperas.
      const [deudas, rechazados, historicas, registro] = await Promise.all([
        consultarDeudas(v.cuit),
        consultarChequesRechazados(v.cuit),
        consultarDeudasHistoricas(v.cuit),
        consultarRegistroSociedad(v.cuit),
      ]);
      setConsulta({ cuit: v.cuit, deudas, rechazados, historicas, registro });
      void cargarEntidades(); // para poder nombrar los bancos de los rechazos
    } finally {
      setConsultando(false);
    }
  }

  async function verificarCheque() {
    const codigo = parseInt(bancoSel, 10);
    const numero = parseInt(nroCheque.replace(/\D/g, ""), 10);
    /* Cualquier corte deja la pantalla sin veredicto: si quedara el de la consulta anterior,
       se leerÃ­a como la respuesta a lo que estÃ¡ escrito ahora, que es otro cheque. */
    const cortar = (motivo: string) => {
      setErrorCheque(motivo);
      setChequeConsultado(null);
    };
    if (!codigo) return cortar("ElegÃ­ el banco del cheque.");
    if (!numero) return cortar("EscribÃ­ el nÃºmero del cheque.");
    /* Sin la cuenta la respuesta no servirÃ­a: dirÃ­a si alguna chequera del banco denunciÃ³ ese
       nÃºmero, que no es la pregunta. Se exige antes de gastar la consulta. */
    if (!nroCuenta.replace(/\D/g, "")) {
      return cortar(
        "EscribÃ­ el nÃºmero de cuenta del cheque: estÃ¡ impreso abajo, en la lÃ­nea de nÃºmeros. " +
          "Sin la cuenta el BCRA no puede decir si es este cheque el denunciado.",
      );
    }
    setErrorCheque("");
    setVerificandoCheque(true);
    setChequeConsultado(null);
    try {
      const r = await consultarChequeDenunciado(codigo, numero);
      if (r.estado === "ok") setChequeConsultado(r.datos);
      else if (r.estado === "sinDatos")
        setErrorCheque("El BCRA no tiene informaciÃ³n de ese cheque.");
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

  /* El filtro por cuenta es local: la API ya devolviÃ³ todas las denuncias de ese nÃºmero, asÃ­
     que corregir la cuenta recalcula el veredicto sin gastar otra consulta. */
  const veredictoDenuncia = useMemo(
    () => (chequeConsultado ? evaluarDenuncia(chequeConsultado, nroCuenta) : null),
    [chequeConsultado, nroCuenta],
  );

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
            {consultando ? "Consultandoâ€¦" : "Consultar"}
          </button>
        </div>
        {errorCuit && (
          <div data-testid="error-cuit" style={{ fontSize: 12, color: "#922B21", marginTop: 8 }}>
            {errorCuit}
          </div>
        )}
        <div style={{ fontSize: 11, color: "#777", marginTop: 10, lineHeight: 1.5 }}>
          Datos pÃºblicos del BCRA. La Central de Deudores se actualiza <strong>una vez por
          mes</strong>, asÃ­ que puede tener uno o dos meses de atraso; los cheques denunciados
          se actualizan todos los dÃ­as. Los importes los informa el BCRA en miles de pesos y
          acÃ¡ se muestran ya convertidos.
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
                  {formatearCuit(consulta.cuit)} Â·{" "}
                  {tipoDeCuit(consulta.cuit) === "empresa"
                    ? "empresa"
                    : tipoDeCuit(consulta.cuit) === "persona"
                      ? "persona fÃ­sica"
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

          {/* QuiÃ©n estÃ¡ detrÃ¡s del CUIT */}
          <BloqueQuienEs cuit={consulta.cuit} registro={consulta.registro} />

          {/* Deudas */}
          <div style={panel}>
            <div style={tituloPanel}>SituaciÃ³n en el sistema financiero</div>
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
                    PerÃ­odo informado:{" "}
                    <strong data-testid="periodo">{nombrePeriodo(resumen.periodo)}</strong>
                  </span>
                  <span>
                    Deuda total: <strong>{fmtMoney(pesosDesdeMiles(resumen.totalMiles))}</strong>
                  </span>
                  <span>
                    Entidades: <strong>{resumen.cantidadEntidades}</strong>
                  </span>
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    Peor situaciÃ³n: <ChipSituacion nivel={resumen.peorSituacion} />
                  </span>
                </div>
                {resumen.irregularMiles > 0 && (
                  <div
                    data-testid="deuda-irregular"
                    style={{ fontSize: 12, color: "#7D6608", background: "#FCF3CF", padding: "8px 12px", borderRadius: 6, marginBottom: 12 }}
                  >
                    En situaciÃ³n irregular (3 o peor):{" "}
                    <strong>{fmtMoney(pesosDesdeMiles(resumen.irregularMiles))}</strong> en{" "}
                    {resumen.entidadesIrregulares.length}{" "}
                    {resumen.entidadesIrregulares.length === 1 ? "entidad" : "entidades"}, o sea el{" "}
                    <strong>
                      {resumen.proporcionIrregular < 0.01
                        ? "menos del 1"
                        : Math.round(resumen.proporcionIrregular * 100)}
                      %
                    </strong>{" "}
                    de su deuda total. El resto estÃ¡ en situaciÃ³n normal.
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
                        <th style={thStyle}>SituaciÃ³n</th>
                        <th style={thStyle}>Monto</th>
                        <th style={thStyle}>DÃ­as de atraso</th>
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
                                { etiqueta: "recategorizaciÃ³n obligatoria", activa: e.recategorizacionOblig },
                                { etiqueta: "situaciÃ³n jurÃ­dica", activa: e.situacionJuridica },
                                { etiqueta: "proceso judicial", activa: e.procesoJud },
                                { etiqueta: "en revisiÃ³n", activa: e.enRevision },
                                { etiqueta: "irrecuperable por disp. tÃ©cnica", activa: e.irrecDisposicionTecnica },
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
                    Sin pagar despuÃ©s del rechazo: <strong>{rechazos.sinPagar}</strong>
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
                                <th style={thStyle}>NÂ° cheque</th>
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
                                    {d.estadoMulta || "â€”"}
                                    {d.fechaPagoMulta && ` (${fmtDate(d.fechaPagoMulta)})`}
                                  </td>
                                  <td style={tdStyle}>
                                    <Marcas
                                      marcas={[
                                        { etiqueta: "cuenta personal", activa: d.ctaPersonal },
                                        { etiqueta: "proceso judicial", activa: d.procesoJud },
                                        { etiqueta: "en revisiÃ³n", activa: d.enRevision },
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

          {/* EvoluciÃ³n */}
          <div style={panel}>
            <div style={tituloPanel}>CÃ³mo viene mes a mes</div>
            {consulta.historicas.estado === "ok" ? (
              (() => {
                const evo = evolucionPorPeriodo(consulta.historicas.datos).slice(0, 12);
                if (evo.length === 0) {
                  return <div style={{ fontSize: 12, color: "#555" }}>Sin perÃ­odos informados.</div>;
                }
                return (
                  <>
                    <div style={{ fontSize: 11, color: "#777", marginBottom: 8 }}>
                      El chip es la <strong>peor</strong> situaciÃ³n del mes. Debajo, la deuda total
                      y cuÃ¡nta de esa plata estaba en situaciÃ³n irregular: un mismo atraso chico se
                      repite mes a mes y sin el monto parece que todo el perÃ­odo estuvo mal.
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
                  : "El BCRA no informa histÃ³rico para este CUIT."}
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
            Â¿Este cheque estÃ¡ denunciado? (robo o extravÃ­o)
          </summary>
          <div style={{ fontSize: 11, color: "#777", margin: "10px 0" }}>
            Este dato el BCRA lo actualiza todos los dÃ­as. CargÃ¡ los tres datos del cheque que
            tenÃ©s en la mano â€”banco, nÃºmero y <strong>cuenta</strong>, los tres impresos en Ã©lâ€”
            y el resultado dice si <em>ese</em> cheque estÃ¡ denunciado. La cuenta hace falta
            porque el mismo nÃºmero de cheque existe en cada chequera del banco.
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
                onChange={(e) => {
                  setBancoSel(e.target.value);
                  setChequeConsultado(null); // el veredicto era de otro cheque
                }}
                style={{ ...inputStyle, marginTop: 4 }}
              >
                <option value="">
                  {entidades.length ? "ElegÃ­ el banco" : "Cargando bancosâ€¦"}
                </option>
                {entidades.map((e) => (
                  <option key={e.codigoEntidad} value={e.codigoEntidad}>
                    {e.denominacion}
                  </option>
                ))}
              </select>
            </label>
            <label style={{ fontSize: 12, color: "#555", flex: "1 1 160px" }}>
              NÂ° de cheque
              <input
                type="text"
                inputMode="numeric"
                data-testid="input-nro-cheque"
                value={nroCheque}
                placeholder="12345678"
                onChange={(e) => {
                  setNroCheque(e.target.value);
                  setChequeConsultado(null); // hay que volver a consultar: es otro cheque
                }}
                style={{ ...inputStyle, marginTop: 4 }}
              />
            </label>
            <label style={{ fontSize: 12, color: "#555", flex: "1 1 180px" }}>
              NÂ° de cuenta del cheque
              <span style={{ color: "#922B21" }}> *</span>
              <input
                type="text"
                inputMode="numeric"
                data-testid="input-nro-cuenta"
                value={nroCuenta}
                placeholder="890036218"
                onChange={(e) => setNroCuenta(e.target.value)}
                style={{ ...inputStyle, marginTop: 4 }}
              />
            </label>
            <button
              data-testid="btn-verificar-cheque"
              onClick={() => void verificarCheque()}
              disabled={verificandoCheque}
              style={{ ...boton, opacity: verificandoCheque ? 0.6 : 1 }}
            >
              {verificandoCheque ? "Verificandoâ€¦" : "Verificar"}
            </button>
          </div>
          {errorCheque && (
            <div data-testid="error-cheque" style={{ fontSize: 12, color: "#922B21", marginTop: 8 }}>
              {errorCheque}
            </div>
          )}
          {chequeConsultado && veredictoDenuncia && (
            <div
              data-testid="resultado-cheque"
              data-nivel={veredictoDenuncia.nivel}
              data-denunciado={veredictoDenuncia.nivel === "denunciado" ? "1" : "0"}
              style={{
                marginTop: 12,
                background: COLORES_DENUNCIA[veredictoDenuncia.nivel].fondo,
                color: COLORES_DENUNCIA[veredictoDenuncia.nivel].texto,
                borderRadius: 8,
                padding: "10px 12px",
              }}
            >
              <div
                data-testid="titulo-denuncia"
                style={{ fontSize: 18, fontWeight: 800, letterSpacing: -0.2 }}
              >
                {veredictoDenuncia.nivel === "denunciado" ? "âœ•" : "âœ“"} {veredictoDenuncia.titulo}
              </div>
              <div style={{ fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>
                {veredictoDenuncia.detalle}
              </div>
              {/* Solo las denuncias que pueden ser este cheque; el resto no aporta a la
                  decisiÃ³n y, siendo hasta 229, taparÃ­a el veredicto. */}
              {veredictoDenuncia.coincidencias.length > 0 && (
                <div data-testid="lista-denuncias" style={{ fontSize: 11, marginTop: 8 }}>
                  {veredictoDenuncia.coincidencias.map((d, i) => (
                    <div key={i} data-coincide="1" style={{ fontWeight: 700 }}>
                      {textoDenuncia(d)}
                    </div>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 11, marginTop: 8, opacity: 0.85 }}>
                Cheque NÂ° {chequeConsultado.numeroCheque} Â· cuenta {nroCuenta.trim()} Â·{" "}
                {chequeConsultado.denominacionEntidad} Â· denuncias del BCRA al{" "}
                {fmtDate(chequeConsultado.fechaProcesamiento)}
              </div>
              {veredictoDenuncia.nota && (
                <div data-testid="nota-denuncia" style={{ fontSize: 10, marginTop: 6, opacity: 0.7 }}>
                  {veredictoDenuncia.nota}
                </div>
              )}
            </div>
          )}
        </details>
      </div>
    </div>
  );
}
