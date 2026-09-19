"use client";

import { Fragment, useMemo, useState } from "react";
import { ChevronRight, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  agruparPorEntrega,
  centavos,
  claveNumeroFactura,
  cobrosConSaldo,
  facturasConSaldo,
  filtrarFacturas,
  repartirFIFO,
  repartirTodoFIFO,
  resumenMunicipalidad,
  validarAplicaciones,
} from "@/lib/municipalidad/calculos";
import { fmtDate, fmtMoney } from "@/lib/cheques/calculos";
import { inputStyle, tdStyle } from "@/lib/ingresos-egresos/estilos";
import { hoyISO } from "@/lib/fechas";
import { useConfirmDialog } from "../useConfirmDialog";
import type {
  AplicacionCobro,
  CobroConSaldo,
  CobroMunicipalidad,
  EstadoFactura,
  FacturaConSaldo,
  FacturaMunicipalidad,
  GrupoFacturas,
  ImputacionCobro,
  MedioCobro,
  NuevaFacturaMunicipalidad,
  NuevoCobroMunicipalidad,
} from "@/lib/municipalidad/types";

export const COLOR_MUNI = "#117A65";
const VERDE = "#145A32";
const VERDE_BG = "#D5F5E3";
const ROJO_BG = "#FADBD8";
const ROJO_TX = "#922B21";
const AMBAR_BG = "#FDEBD0";
const AMBAR_TX = "#784212";

const thStyle = {
  background: COLOR_MUNI,
  color: "white",
  fontWeight: 700,
  fontSize: 12,
  padding: "10px 8px",
  textAlign: "left",
  whiteSpace: "nowrap",
} as const;

const botonStyle = {
  border: "none",
  borderRadius: 6,
  padding: "7px 12px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
} as const;

const labelStyle = { fontSize: 11, fontWeight: 700, color: "#666" } as const;

const COLOR_ESTADO: Record<EstadoFactura, { bg: string; tx: string }> = {
  Cobrada: { bg: VERDE_BG, tx: VERDE },
  Parcial: { bg: AMBAR_BG, tx: AMBAR_TX },
  Pendiente: { bg: ROJO_BG, tx: ROJO_TX },
};

const MEDIOS: MedioCobro[] = ["Transferencia", "Cheque", "Efectivo"];

/** Un monto tipeado a número; vacío o inválido es 0. */
const num = (s: string): number => {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
};

/** Handlers que resuelve quien monta la vista (Supabase en la app, memoria en el preview). Devuelven el error o null. */
export interface HandlersMunicipalidad {
  onGuardarFactura: (datos: NuevaFacturaMunicipalidad, id?: string) => Promise<string | null>;
  onEliminarFactura: (id: string) => Promise<string | null>;
  onRegistrarCobro: (datos: NuevoCobroMunicipalidad, aplicaciones: { factura_id: string; monto: number }[]) => Promise<string | null>;
  onEliminarCobro: (id: string) => Promise<string | null>;
  onImputar: (aplicaciones: AplicacionCobro[]) => Promise<string | null>;
  onDesimputar: (imputacionIds: string[]) => Promise<string | null>;
}

function Chip({ estado }: { estado: EstadoFactura }) {
  const c = COLOR_ESTADO[estado];
  return (
    <span style={{ background: c.bg, color: c.tx, fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 12, whiteSpace: "nowrap" }}>
      {estado}
    </span>
  );
}

/** El encabezado clickeable de un día de entrega: abre y cierra las facturas de ese día. */
function CabeceraDia({ grupo, abierto, onToggle, test }: { grupo: GrupoFacturas; abierto: boolean; onToggle: () => void; test: string }) {
  const n = grupo.facturas.length;
  return (
    <button
      onClick={onToggle}
      aria-expanded={abierto}
      style={{
        width: "100%",
        display: "flex",
        alignItems: "center",
        gap: 8,
        flexWrap: "wrap",
        background: abierto ? "#DDEEE9" : "#F0F5F4",
        border: "none",
        borderRadius: 6,
        padding: "9px 10px",
        cursor: "pointer",
        textAlign: "left",
        color: "#1A1A2E",
        fontFamily: "inherit",
      }}
      data-test={test}
    >
      <ChevronRight size={15} style={{ flexShrink: 0, transform: abierto ? "rotate(90deg)" : "none", transition: "transform .15s" }} />
      <strong style={{ fontSize: 13, whiteSpace: "nowrap" }}>{fmtDate(grupo.fecha)}</strong>
      <span style={{ fontSize: 12, color: "#555", whiteSpace: "nowrap" }}>{n === 1 ? "1 factura" : `${n} facturas`}</span>
      <span style={{ fontSize: 12, color: "#555", marginLeft: "auto", whiteSpace: "nowrap" }}>
        {fmtMoney(grupo.montoC / 100)} · saldo{" "}
        <strong style={{ color: grupo.saldoC > 0 ? ROJO_TX : VERDE }} data-test="dia-saldo">{fmtMoney(grupo.saldoC / 100)}</strong>
      </span>
    </button>
  );
}

function Kpi({ titulo, valor, sub, bg = "#F8F9FA", tx = "#1A1A2E", test }: { titulo: string; valor: string; sub?: string; bg?: string; tx?: string; test?: string }) {
  return (
    <div style={{ background: bg, color: tx, borderRadius: 10, padding: "12px 18px", flex: "1 1 180px", minWidth: 0 }}>
      <div style={{ fontSize: 11, fontWeight: 700, opacity: 0.85 }}>{titulo}</div>
      <div style={{ fontSize: 22, fontWeight: 800 }} data-test={test}>{valor}</div>
      {sub && <div style={{ fontSize: 11, marginTop: 2, opacity: 0.85 }}>{sub}</div>}
    </div>
  );
}

export default function MunicipalidadVista({
  facturas,
  cobros,
  imputaciones,
  esAdmin,
  handlers,
}: {
  facturas: FacturaMunicipalidad[];
  cobros: CobroMunicipalidad[];
  imputaciones: ImputacionCobro[];
  esAdmin: boolean;
  handlers: HandlersMunicipalidad;
}) {
  const { pedirConfirmacion, ConfirmModal } = useConfirmDialog();
  const [tab, setTab] = useState<"facturas" | "cobros">("facturas");
  const [error, setError] = useState("");
  /** "nueva" abre el formulario vacío; una factura lo abre para editarla. */
  const [formFactura, setFormFactura] = useState<"nueva" | FacturaMunicipalidad | null>(null);
  /** Abierto con una factura, ésta viene tildada; con null, el cobro arranca sin facturas. */
  const [modalCobro, setModalCobro] = useState<{ facturaId: string | null } | null>(null);
  const [trabajando, setTrabajando] = useState(false);

  const hoy = hoyISO();
  const conSaldo = useMemo(() => facturasConSaldo(facturas, imputaciones, hoy), [facturas, imputaciones, hoy]);
  const pendientes = useMemo(() => conSaldo.filter((f) => f.estado !== "Cobrada"), [conSaldo]);
  const cobrosSaldo = useMemo(() => cobrosConSaldo(cobros, imputaciones, facturas), [cobros, imputaciones, facturas]);
  const resumen = useMemo(() => resumenMunicipalidad(facturas, cobros, imputaciones, hoy), [facturas, cobros, imputaciones, hoy]);

  /** Corre una acción y muestra su error arriba, si lo hay. */
  async function ejecutar(accion: () => Promise<string | null>): Promise<boolean> {
    setTrabajando(true);
    const err = await accion();
    setTrabajando(false);
    setError(err ?? "");
    return !err;
  }

  function repartirTodo() {
    const aplicaciones = repartirTodoFIFO(cobrosSaldo.filter((c) => c.disponible > 0), pendientes);
    void ejecutar(() => handlers.onImputar(aplicaciones));
  }

  return (
    <div style={{ minWidth: 0 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <Kpi
          titulo="TE DEBE LA MUNICIPALIDAD"
          valor={fmtMoney(resumen.teDebe)}
          bg={resumen.teDebe > 0 ? ROJO_BG : VERDE_BG}
          tx={resumen.teDebe > 0 ? ROJO_TX : VERDE}
          test="kpi-te-debe"
        />
        <Kpi
          titulo="FACTURAS PENDIENTES"
          valor={String(resumen.facturasPendientes)}
          sub={resumen.diasMasVieja != null ? `la más vieja tiene ${resumen.diasMasVieja} día(s)` : "no hay nada por cobrar"}
          test="kpi-pendientes"
        />
        <Kpi
          titulo="COBRADO (TOTAL)"
          valor={fmtMoney(resumen.cobrado)}
          sub={resumen.retenido > 0 ? `incluye ${fmtMoney(resumen.retenido)} de retenciones` : `de ${fmtMoney(resumen.facturado)} facturado`}
          test="kpi-cobrado"
        />
        {resumen.sinAplicar > 0 && (
          <Kpi titulo="COBROS SIN APLICAR" valor={fmtMoney(resumen.sinAplicar)} bg={AMBAR_BG} tx={AMBAR_TX} test="kpi-sin-aplicar" />
        )}
      </div>

      {resumen.sinAplicar > 0 && pendientes.length > 0 && (
        <div
          style={{ background: AMBAR_BG, color: AMBAR_TX, borderRadius: 8, padding: "10px 14px", marginBottom: 16, fontSize: 13, display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}
          data-test="aviso-sin-aplicar"
        >
          <span style={{ flex: "1 1 240px" }}>
            Hay <strong>{fmtMoney(resumen.sinAplicar)}</strong> cobrados que todavía no se aplicaron a ninguna factura.
          </span>
          <button onClick={repartirTodo} disabled={trabajando} style={{ ...botonStyle, background: AMBAR_TX, color: "white" }} data-test="btn-repartir-todo">
            Aplicar a las facturas más viejas
          </button>
        </div>
      )}

      {error && (
        <div style={{ background: ROJO_BG, color: ROJO_TX, padding: "8px 12px", borderRadius: 6, marginBottom: 12, fontSize: 13, fontWeight: 700 }} data-test="error-general">
          {error}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 14 }}>
        <button onClick={() => { setFormFactura("nueva"); setTab("facturas"); }} style={{ ...botonStyle, background: COLOR_MUNI, color: "white", display: "inline-flex", alignItems: "center", gap: 6 }} data-test="btn-nueva-factura">
          <Plus size={14} /> Cargar factura
        </button>
        <button onClick={() => setModalCobro({ facturaId: null })} style={{ ...botonStyle, background: "white", color: COLOR_MUNI, border: `1px solid ${COLOR_MUNI}`, display: "inline-flex", alignItems: "center", gap: 6 }} data-test="btn-nuevo-cobro">
          <Plus size={14} /> Registrar cobro
        </button>
      </div>

      {formFactura && (
        <FacturaForm
          // La key reinicia el formulario al pasar de una factura a otra.
          key={formFactura === "nueva" ? "nueva" : formFactura.id}
          factura={formFactura === "nueva" ? null : formFactura}
          facturas={facturas}
          onCancelar={() => setFormFactura(null)}
          onGuardar={async (datos, id) => {
            const err = await handlers.onGuardarFactura(datos, id);
            if (!err) setFormFactura(null);
            return err;
          }}
        />
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 14, borderBottom: "1px solid #ddd", flexWrap: "wrap" }}>
        {([
          ["facturas", `Facturas (${facturas.length})`],
          ["cobros", `Cobros (${cobros.length})`],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              border: "none",
              background: "transparent",
              padding: "10px 14px",
              fontSize: 13,
              fontWeight: 700,
              color: tab === key ? COLOR_MUNI : "#888",
              borderBottom: tab === key ? `2px solid ${COLOR_MUNI}` : "2px solid transparent",
              cursor: "pointer",
            }}
            data-test={`tab-${key}`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "facturas" ? (
        <TablaFacturas
          facturas={conSaldo}
          esAdmin={esAdmin}
          onCobrar={(f) => setModalCobro({ facturaId: f.id })}
          onEditar={(f) => {
            setFormFactura(facturas.find((x) => x.id === f.id) ?? null);
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          onEliminar={(f) =>
            pedirConfirmacion(
              `¿Eliminar la factura ${f.numero_factura ?? "sin número"} por ${fmtMoney(f.monto)}? ` +
                (f.cobrado > 0 ? "Se deshacen los cobros aplicados a ella (los cobros en sí no se borran)." : ""),
              () => void ejecutar(() => handlers.onEliminarFactura(f.id)),
            )
          }
        />
      ) : (
        <TablaCobros
          cobros={cobrosSaldo}
          hayPendientes={pendientes.length > 0}
          esAdmin={esAdmin}
          trabajando={trabajando}
          onAplicar={(c) =>
            void ejecutar(() =>
              handlers.onImputar(repartirFIFO(c.disponible, pendientes).map((a) => ({ ...a, cobro_id: c.id }))),
            )
          }
          onDesimputar={(ids) => void ejecutar(() => handlers.onDesimputar(ids))}
          onEliminar={(c) =>
            pedirConfirmacion(
              `¿Eliminar el cobro del ${fmtDate(c.fecha)} por ${fmtMoney(c.total)}? Las facturas que cancelaba vuelven a quedar pendientes.`,
              () => void ejecutar(() => handlers.onEliminarCobro(c.id)),
            )
          }
        />
      )}

      {modalCobro && (
        <CobroModal
          pendientes={pendientes}
          facturaInicial={modalCobro.facturaId}
          onCerrar={() => setModalCobro(null)}
          onGuardar={async (datos, aplicaciones) => {
            const err = await handlers.onRegistrarCobro(datos, aplicaciones);
            if (!err) {
              setModalCobro(null);
              setError("");
            }
            return err;
          }}
        />
      )}

      <ConfirmModal />
    </div>
  );
}

function FacturaForm({
  factura,
  facturas,
  onGuardar,
  onCancelar,
}: {
  factura: FacturaMunicipalidad | null;
  facturas: FacturaMunicipalidad[];
  onGuardar: (datos: NuevaFacturaMunicipalidad, id?: string) => Promise<string | null>;
  onCancelar: () => void;
}) {
  const [fechaEntrega, setFechaEntrega] = useState(factura?.fecha_entrega ?? hoyISO());
  const [numero, setNumero] = useState(factura?.numero_factura ?? "");
  const [fechaFactura, setFechaFactura] = useState(factura?.fecha_factura ?? "");
  const [monto, setMonto] = useState(factura ? String(Number(factura.monto)) : "");
  const [orden, setOrden] = useState(factura?.orden_compra ?? "");
  const [lugar, setLugar] = useState(factura?.lugar_entrega ?? "");
  const [detalle, setDetalle] = useState(factura?.detalle ?? "");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    if (!fechaEntrega) return setError("Poné la fecha de entrega.");
    if (!(num(monto) > 0)) return setError("El monto tiene que ser mayor a cero.");
    const clave = claveNumeroFactura(numero);
    if (clave && facturas.some((f) => f.id !== factura?.id && claveNumeroFactura(f.numero_factura) === clave)) {
      return setError(`Ya hay una factura cargada con el número ${numero.trim()}.`);
    }
    setGuardando(true);
    const err = await onGuardar(
      {
        fecha_entrega: fechaEntrega,
        numero_factura: numero.trim() || null,
        fecha_factura: fechaFactura || null,
        monto: Math.round(num(monto) * 100) / 100,
        orden_compra: orden.trim() || null,
        lugar_entrega: lugar.trim() || null,
        detalle: detalle.trim() || null,
      },
      factura?.id,
    );
    setGuardando(false);
    setError(err ?? "");
  }

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 14, marginBottom: 16, background: "#FAFBFC" }} data-test="form-factura">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <strong style={{ fontSize: 14 }}>{factura ? `Editar factura ${factura.numero_factura ?? ""}` : "Nueva factura"}</strong>
        <button onClick={onCancelar} aria-label="Cerrar" style={{ border: "none", background: "transparent", cursor: "pointer", color: "#888" }}>
          <X size={16} />
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        <label style={labelStyle}>
          Fecha de entrega *
          <input type="date" value={fechaEntrega} onChange={(e) => setFechaEntrega(e.target.value)} style={inputStyle} data-test="factura-fecha-entrega" />
        </label>
        <label style={labelStyle}>
          Nº de factura
          <input value={numero} onChange={(e) => setNumero(e.target.value)} placeholder="ej. 0001-00001234" style={inputStyle} data-test="factura-numero" />
        </label>
        <label style={labelStyle}>
          Fecha de factura
          <input type="date" value={fechaFactura} onChange={(e) => setFechaFactura(e.target.value)} style={inputStyle} data-test="factura-fecha" />
        </label>
        <label style={labelStyle}>
          Monto *
          <input type="number" inputMode="decimal" min="0" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0" style={inputStyle} data-test="factura-monto" />
        </label>
        <label style={labelStyle}>
          Orden de compra / expediente
          <input value={orden} onChange={(e) => setOrden(e.target.value)} placeholder="opcional" style={inputStyle} data-test="factura-orden" />
        </label>
        <label style={labelStyle}>
          Lugar de entrega
          <input value={lugar} onChange={(e) => setLugar(e.target.value)} placeholder="escuela / establecimiento" style={inputStyle} data-test="factura-lugar" />
        </label>
      </div>
      <label style={{ ...labelStyle, display: "block", marginTop: 10 }}>
        Detalle
        <textarea value={detalle} onChange={(e) => setDetalle(e.target.value)} rows={2} placeholder="qué se entregó, período, observaciones…" style={{ ...inputStyle, resize: "vertical" }} data-test="factura-detalle" />
      </label>
      {error && (
        <div style={{ color: ROJO_TX, fontSize: 12, marginTop: 8, fontWeight: 700 }} data-test="factura-error">
          {error}
        </div>
      )}
      <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
        <button onClick={guardar} disabled={guardando} style={{ ...botonStyle, background: COLOR_MUNI, color: "white", opacity: guardando ? 0.6 : 1 }} data-test="factura-guardar">
          {guardando ? "Guardando…" : factura ? "Guardar cambios" : "Guardar factura"}
        </button>
        <button onClick={onCancelar} style={{ ...botonStyle, background: "#F0F0F0", color: "#1A1A2E" }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function TablaFacturas({
  facturas,
  esAdmin,
  onCobrar,
  onEditar,
  onEliminar,
}: {
  facturas: FacturaConSaldo[];
  esAdmin: boolean;
  onCobrar: (f: FacturaConSaldo) => void;
  onEditar: (f: FacturaConSaldo) => void;
  onEliminar: (f: FacturaConSaldo) => void;
}) {
  const [estado, setEstado] = useState<"pendientes" | "cobradas" | "todas">("pendientes");
  const [texto, setTexto] = useState("");
  // Lo que el usuario abrió o cerró a mano. Lo que no tocó sigue el default de abajo.
  const [plegado, setPlegado] = useState<Record<string, boolean>>({});
  // Las más nuevas arriba: es lo que se busca al cargar o cobrar. El cálculo las da al revés.
  const visibles = useMemo(() => filtrarFacturas(facturas, estado, texto).reverse(), [facturas, estado, texto]);
  const grupos = useMemo(() => agruparPorEntrega(visibles), [visibles]);
  const buscando = texto.trim() !== "";
  // Sólo el día más nuevo arranca abierto; buscando arrancan todos, o el resultado quedaría tapado.
  const estaAbierto = (fecha: string, i: number) => plegado[fecha] ?? (buscando || i === 0);
  const alternar = (fecha: string, i: number) => setPlegado((p) => ({ ...p, [fecha]: !estaAbierto(fecha, i) }));
  const tot = grupos.reduce(
    (a, g) => ({ monto: a.monto + g.montoC, cobrado: a.cobrado + g.cobradoC, saldo: a.saldo + g.saldoC }),
    { monto: 0, cobrado: 0, saldo: 0 },
  );

  return (
    <div>
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10, alignItems: "center" }}>
        {([
          ["pendientes", "Pendientes"],
          ["cobradas", "Cobradas"],
          ["todas", "Todas"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setEstado(key)}
            style={{ ...botonStyle, background: estado === key ? COLOR_MUNI : "#F0F0F0", color: estado === key ? "white" : "#1A1A2E" }}
            data-test={`filtro-${key}`}
          >
            {label}
          </button>
        ))}
        <input
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder="Buscar nº, orden, lugar…"
          style={{ ...inputStyle, width: "auto", flex: "1 1 180px", minWidth: 0 }}
          data-test="buscar-factura"
        />
      </div>

      {/* En el teléfono la tabla escondía saldo, estado y "Cobrar" a la derecha: ahí van tarjetas. */}
      <div className="hidden sm:block" style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Entrega</th>
              <th style={thStyle}>Nº factura</th>
              <th style={thStyle}>Orden / Expte.</th>
              <th style={thStyle}>Lugar</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Monto</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Cobrado</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Saldo</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Días</th>
              <th style={thStyle}>Estado</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {visibles.length === 0 && (
              <tr>
                <td colSpan={10} style={{ ...tdStyle, textAlign: "center", color: "#888", padding: 24 }}>
                  {facturas.length === 0
                    ? "Todavía no hay facturas cargadas. Empezá con \"Cargar factura\"."
                    : "No hay facturas con este filtro."}
                </td>
              </tr>
            )}
            {grupos.map((g, gi) => (
              <Fragment key={g.fecha}>
                <tr>
                  <td colSpan={10} style={{ padding: "4px 6px", borderTop: gi === 0 ? "none" : "1px solid #ddd" }}>
                    <CabeceraDia grupo={g} abierto={estaAbierto(g.fecha, gi)} onToggle={() => alternar(g.fecha, gi)} test="cabecera-dia" />
                  </td>
                </tr>
                {estaAbierto(g.fecha, gi) && g.facturas.map((f, i) => (
              <tr key={f.id} style={{ background: i % 2 === 1 ? "#F2F8F6" : "white", borderTop: "1px solid #eee" }} data-test="fila-factura">
                <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>
                  {fmtDate(f.fecha_entrega)}
                  {f.fecha_factura && f.fecha_factura !== f.fecha_entrega && (
                    <div style={{ fontSize: 10, color: "#888" }}>fact. {fmtDate(f.fecha_factura)}</div>
                  )}
                </td>
                <td style={{ ...tdStyle, fontWeight: 700, whiteSpace: "nowrap" }} data-test="factura-numero-celda">
                  {f.numero_factura ?? <span style={{ color: AMBAR_TX, fontWeight: 400, fontStyle: "italic" }}>sin número</span>}
                  {f.detalle && <div style={{ fontSize: 11, color: "#666", fontWeight: 400, whiteSpace: "normal", maxWidth: 220 }}>{f.detalle}</div>}
                </td>
                <td style={tdStyle}>{f.orden_compra ?? "—"}</td>
                <td style={tdStyle}>{f.lugar_entrega ?? "—"}</td>
                <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>{fmtMoney(f.monto)}</td>
                <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", color: f.cobrado > 0 ? VERDE : "#888" }}>{f.cobrado > 0 ? fmtMoney(f.cobrado) : "—"}</td>
                <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", fontWeight: 800, color: f.saldo > 0 ? ROJO_TX : VERDE }} data-test="factura-saldo">
                  {fmtMoney(f.saldo)}
                </td>
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 700, color: f.dias == null ? "#888" : f.dias > 60 ? ROJO_TX : f.dias > 30 ? AMBAR_TX : "#1A1A2E" }}>
                  {f.dias ?? "—"}
                </td>
                <td style={tdStyle} data-test="factura-estado">
                  <Chip estado={f.estado} />
                </td>
                <td style={{ ...tdStyle, whiteSpace: "nowrap", textAlign: "right" }}>
                  {f.estado !== "Cobrada" && (
                    <button onClick={() => onCobrar(f)} style={{ ...botonStyle, background: COLOR_MUNI, color: "white", marginRight: 6 }} data-test="btn-cobrar">
                      Cobrar
                    </button>
                  )}
                  <button onClick={() => onEditar(f)} aria-label="Editar factura" title="Editar" style={{ ...botonStyle, background: "#F0F0F0", color: "#1A1A2E", padding: "6px 8px" }} data-test="btn-editar-factura">
                    <Pencil size={13} />
                  </button>
                  {esAdmin && (
                    <button onClick={() => onEliminar(f)} aria-label="Eliminar factura" title="Eliminar" style={{ ...botonStyle, background: "transparent", color: ROJO_TX, padding: "6px 8px" }} data-test="btn-eliminar-factura">
                      <Trash2 size={13} />
                    </button>
                  )}
                </td>
              </tr>
                ))}
              </Fragment>
            ))}
          </tbody>
          {visibles.length > 0 && (
            <tfoot>
              <tr style={{ borderTop: "2px solid #ccc", background: "#F8F9FA" }}>
                <td colSpan={4} style={{ ...tdStyle, fontWeight: 800 }}>Total ({visibles.length})</td>
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 800, whiteSpace: "nowrap" }} data-test="total-monto">{fmtMoney(tot.monto / 100)}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 800, whiteSpace: "nowrap" }} data-test="total-cobrado">{fmtMoney(tot.cobrado / 100)}</td>
                <td style={{ ...tdStyle, textAlign: "right", fontWeight: 800, whiteSpace: "nowrap", color: tot.saldo > 0 ? ROJO_TX : VERDE }} data-test="total-saldo">{fmtMoney(tot.saldo / 100)}</td>
                <td colSpan={3} style={tdStyle}></td>
              </tr>
            </tfoot>
          )}
        </table>
      </div>

      <div className="solo-movil">
        {visibles.length === 0 && (
          <p style={{ textAlign: "center", color: "#888", fontSize: 13, padding: 16 }}>
            {facturas.length === 0 ? "Todavía no hay facturas cargadas." : "No hay facturas con este filtro."}
          </p>
        )}
        {grupos.map((g, gi) => (
          <div key={g.fecha} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <CabeceraDia grupo={g} abierto={estaAbierto(g.fecha, gi)} onToggle={() => alternar(g.fecha, gi)} test="tarjeta-cabecera-dia" />
            {estaAbierto(g.fecha, gi) && g.facturas.map((f) => (
          <div key={f.id} style={{ border: "1px solid #ddd", borderLeft: `4px solid ${COLOR_ESTADO[f.estado].tx}`, borderRadius: 8, padding: 12 }} data-test="tarjeta-factura">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8, alignItems: "flex-start" }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>
                  {f.numero_factura ?? <span style={{ color: AMBAR_TX, fontWeight: 400, fontStyle: "italic" }}>sin número</span>}
                </div>
                <div style={{ fontSize: 12, color: "#666" }}>
                  Entrega {fmtDate(f.fecha_entrega)}
                  {f.lugar_entrega ? ` · ${f.lugar_entrega}` : ""}
                  {f.orden_compra ? ` · ${f.orden_compra}` : ""}
                </div>
                {f.detalle && <div style={{ fontSize: 12, color: "#666" }}>{f.detalle}</div>}
              </div>
              <Chip estado={f.estado} />
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 8, gap: 8, flexWrap: "wrap" }}>
              <div style={{ fontSize: 12, color: "#666" }}>
                Monto {fmtMoney(f.monto)}
                {f.cobrado > 0 && <> · cobrado {fmtMoney(f.cobrado)}</>}
                {f.dias != null && <> · <strong style={{ color: f.dias > 60 ? ROJO_TX : f.dias > 30 ? AMBAR_TX : "#1A1A2E" }}>{f.dias} días</strong></>}
              </div>
              <div style={{ fontSize: 18, fontWeight: 800, color: f.saldo > 0 ? ROJO_TX : VERDE }} data-test="tarjeta-factura-saldo">
                {fmtMoney(f.saldo)}
              </div>
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 10, justifyContent: "flex-end" }}>
              {f.estado !== "Cobrada" && (
                <button onClick={() => onCobrar(f)} style={{ ...botonStyle, background: COLOR_MUNI, color: "white", flex: 1 }} data-test="tarjeta-btn-cobrar">
                  Cobrar
                </button>
              )}
              <button onClick={() => onEditar(f)} style={{ ...botonStyle, background: "#F0F0F0", color: "#1A1A2E", display: "inline-flex", alignItems: "center", gap: 4 }}>
                <Pencil size={13} /> Editar
              </button>
              {esAdmin && (
                <button onClick={() => onEliminar(f)} aria-label="Eliminar factura" style={{ ...botonStyle, background: "transparent", color: ROJO_TX, padding: "6px 8px" }}>
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>
            ))}
          </div>
        ))}
        {visibles.length > 0 && (
          <div style={{ background: "#F8F9FA", borderRadius: 8, padding: "10px 12px", fontSize: 13, display: "flex", justifyContent: "space-between", gap: 8, flexWrap: "wrap" }}>
            <strong>Total ({visibles.length})</strong>
            <span>
              {fmtMoney(tot.monto / 100)} · saldo{" "}
              <strong style={{ color: tot.saldo > 0 ? ROJO_TX : VERDE }} data-test="tarjeta-total-saldo">{fmtMoney(tot.saldo / 100)}</strong>
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

/** Las facturas que cancela un cobro, cada una con su ✕ para deshacer la aplicación. */
function ChipsAplicacion({ cobro, trabajando, onDesimputar }: { cobro: CobroConSaldo; trabajando: boolean; onDesimputar: (ids: string[]) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
      {cobro.aplicaciones.length === 0 && <span style={{ color: "#888" }}>—</span>}
      {cobro.aplicaciones.map((a) => (
        <span key={a.factura_id} style={{ background: VERDE_BG, color: VERDE, fontSize: 11, fontWeight: 700, borderRadius: 12, padding: "2px 4px 2px 8px", display: "inline-flex", alignItems: "center", gap: 4, whiteSpace: "nowrap" }} data-test="chip-aplicacion">
          {a.numero_factura ?? "s/n"} · {fmtMoney(a.monto)}
          <button
            onClick={() => onDesimputar(a.imputacion_ids)}
            disabled={trabajando}
            aria-label="Deshacer esta aplicación"
            title="Deshacer esta aplicación"
            style={{ border: "none", background: "transparent", color: VERDE, cursor: "pointer", padding: 0, display: "inline-flex" }}
            data-test="btn-desimputar"
          >
            <X size={12} />
          </button>
        </span>
      ))}
    </div>
  );
}

function TablaCobros({
  cobros,
  hayPendientes,
  esAdmin,
  trabajando,
  onAplicar,
  onDesimputar,
  onEliminar,
}: {
  cobros: CobroConSaldo[];
  hayPendientes: boolean;
  esAdmin: boolean;
  trabajando: boolean;
  onAplicar: (c: CobroConSaldo) => void;
  onDesimputar: (imputacionIds: string[]) => void;
  onEliminar: (c: CobroConSaldo) => void;
}) {
  const acciones = (c: CobroConSaldo, test: string) => (
    <>
      {c.disponible > 0 && hayPendientes && (
        <button onClick={() => onAplicar(c)} disabled={trabajando} title="Aplicar a las facturas pendientes más viejas" style={{ ...botonStyle, background: AMBAR_TX, color: "white", marginRight: 6 }} data-test={test}>
          Aplicar
        </button>
      )}
      {esAdmin && (
        <button onClick={() => onEliminar(c)} aria-label="Eliminar cobro" title="Eliminar" style={{ ...botonStyle, background: "transparent", color: ROJO_TX, padding: "6px 8px" }} data-test="btn-eliminar-cobro">
          <Trash2 size={13} />
        </button>
      )}
    </>
  );

  return (
    <>
      <div className="hidden sm:block" style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Fecha</th>
              <th style={thStyle}>Comprobante</th>
              <th style={thStyle}>Medio</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Cobrado</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Retenciones</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Total</th>
              <th style={thStyle}>Facturas que cancela</th>
              <th style={{ ...thStyle, textAlign: "right" }}>Sin aplicar</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {cobros.length === 0 && (
              <tr>
                <td colSpan={9} style={{ ...tdStyle, textAlign: "center", color: "#888", padding: 24 }}>
                  Todavía no hay cobros registrados.
                </td>
              </tr>
            )}
            {cobros.map((c, i) => (
              <tr key={c.id} style={{ background: i % 2 === 1 ? "#F2F8F6" : "white", borderTop: "1px solid #eee" }} data-test="fila-cobro">
                <td style={{ ...tdStyle, whiteSpace: "nowrap" }}>{fmtDate(c.fecha)}</td>
                <td style={tdStyle}>
                  {c.comprobante ?? "—"}
                  {c.detalle && <div style={{ fontSize: 11, color: "#666" }}>{c.detalle}</div>}
                </td>
                <td style={tdStyle}>{c.medio_pago ?? "—"}</td>
                <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>{fmtMoney(c.monto_cobrado)}</td>
                <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", color: c.retenciones > 0 ? AMBAR_TX : "#888" }}>
                  {c.retenciones > 0 ? fmtMoney(c.retenciones) : "—"}
                </td>
                <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", fontWeight: 800 }}>{fmtMoney(c.total)}</td>
                <td style={{ ...tdStyle, minWidth: 160 }}>
                  <ChipsAplicacion cobro={c} trabajando={trabajando} onDesimputar={onDesimputar} />
                </td>
                <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap", fontWeight: 700, color: c.disponible > 0 ? AMBAR_TX : "#888" }} data-test="cobro-disponible">
                  {c.disponible > 0 ? fmtMoney(c.disponible) : "—"}
                </td>
                <td style={{ ...tdStyle, whiteSpace: "nowrap", textAlign: "right" }}>{acciones(c, "btn-aplicar-cobro")}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="solo-movil">
        {cobros.length === 0 && <p style={{ textAlign: "center", color: "#888", fontSize: 13, padding: 16 }}>Todavía no hay cobros registrados.</p>}
        {cobros.map((c) => (
          <div key={c.id} style={{ border: "1px solid #ddd", borderRadius: 8, padding: 12 }} data-test="tarjeta-cobro">
            <div style={{ display: "flex", justifyContent: "space-between", gap: 8 }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 800, fontSize: 14 }}>{c.comprobante ?? "Cobro"}</div>
                <div style={{ fontSize: 12, color: "#666" }}>
                  {fmtDate(c.fecha)}
                  {c.medio_pago ? ` · ${c.medio_pago}` : ""}
                </div>
                {c.detalle && <div style={{ fontSize: 12, color: "#666" }}>{c.detalle}</div>}
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontSize: 18, fontWeight: 800 }}>{fmtMoney(c.total)}</div>
                {c.retenciones > 0 && (
                  <div style={{ fontSize: 11, color: AMBAR_TX }}>
                    {fmtMoney(c.monto_cobrado)} + {fmtMoney(c.retenciones)} ret.
                  </div>
                )}
              </div>
            </div>
            <div style={{ marginTop: 8 }}>
              <ChipsAplicacion cobro={c} trabajando={trabajando} onDesimputar={onDesimputar} />
            </div>
            {(c.disponible > 0 || esAdmin) && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8, gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: AMBAR_TX }}>{c.disponible > 0 ? `Sin aplicar ${fmtMoney(c.disponible)}` : ""}</span>
                <span>{acciones(c, "tarjeta-btn-aplicar-cobro")}</span>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

function CobroModal({
  pendientes,
  facturaInicial,
  onCerrar,
  onGuardar,
}: {
  pendientes: FacturaConSaldo[];
  facturaInicial: string | null;
  onCerrar: () => void;
  onGuardar: (datos: NuevoCobroMunicipalidad, aplicaciones: { factura_id: string; monto: number }[]) => Promise<string | null>;
}) {
  const inicial = pendientes.find((f) => f.id === facturaInicial);
  const [fecha, setFecha] = useState(hoyISO());
  const [cobrado, setCobrado] = useState(inicial ? String(inicial.saldo) : "");
  const [retenciones, setRetenciones] = useState("");
  const [medio, setMedio] = useState<MedioCobro>("Transferencia");
  const [comprobante, setComprobante] = useState("");
  const [detalle, setDetalle] = useState("");
  /** factura_id → monto tipeado. Estar en el mapa es estar tildada. */
  const [sel, setSel] = useState<Record<string, string>>(inicial ? { [inicial.id]: String(inicial.saldo) } : {});
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  const totalC = centavos(num(cobrado)) + centavos(num(retenciones));
  const aplicadoC = Object.values(sel).reduce((a, v) => a + centavos(num(v)), 0);
  const restanteC = totalC - aplicadoC;

  // Con el cobro abierto desde una factura, ésa va primero; el resto de la más vieja a la más nueva.
  const lista = inicial ? [inicial, ...pendientes.filter((f) => f.id !== inicial.id)] : pendientes;

  function tildar(f: FacturaConSaldo) {
    setSel((prev) => {
      const next = { ...prev };
      if (f.id in next) {
        delete next[f.id];
      } else {
        const libreC = totalC - Object.values(prev).reduce((a, v) => a + centavos(num(v)), 0);
        next[f.id] = String((libreC > 0 ? Math.min(libreC, centavos(f.saldo)) : centavos(f.saldo)) / 100);
      }
      return next;
    });
  }

  function repartir() {
    setSel(Object.fromEntries(repartirFIFO(totalC / 100, pendientes).map((a) => [a.factura_id, String(a.monto)])));
  }

  async function guardar() {
    if (!fecha) return setError("Poné la fecha del cobro.");
    if (num(cobrado) < 0 || num(retenciones) < 0) return setError("Los montos no pueden ser negativos.");
    if (totalC <= 0) return setError("Cargá cuánto se cobró (o las retenciones).");
    const aplicaciones = Object.entries(sel).map(([factura_id, v]) => ({ factura_id, monto: centavos(num(v)) / 100 }));
    const err = validarAplicaciones(totalC / 100, aplicaciones, pendientes);
    if (err) return setError(err);
    setGuardando(true);
    const errServidor = await onGuardar(
      {
        fecha,
        monto_cobrado: centavos(num(cobrado)) / 100,
        retenciones: centavos(num(retenciones)) / 100,
        medio_pago: medio,
        comprobante: comprobante.trim() || null,
        detalle: detalle.trim() || null,
      },
      aplicaciones,
    );
    setGuardando(false);
    if (errServidor) setError(errServidor);
  }

  return (
    <div
      onClick={onCerrar}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", zIndex: 900, overflowY: "auto", padding: 16, display: "flex", justifyContent: "center", alignItems: "flex-start" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "white", borderRadius: 10, padding: 18, width: "100%", maxWidth: 620, minWidth: 0, marginTop: 20, boxSizing: "border-box" }}
        data-test="modal-cobro"
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <strong style={{ fontSize: 16 }}>Registrar cobro de la Municipalidad</strong>
          <button onClick={onCerrar} aria-label="Cerrar" style={{ border: "none", background: "transparent", cursor: "pointer", color: "#888" }}>
            <X size={18} />
          </button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
          <label style={labelStyle}>
            Fecha *
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={inputStyle} data-test="cobro-fecha" />
          </label>
          <label style={labelStyle}>
            Monto cobrado (lo que entró)
            <input type="number" inputMode="decimal" min="0" step="0.01" value={cobrado} onChange={(e) => setCobrado(e.target.value)} placeholder="0" style={inputStyle} data-test="cobro-monto" />
          </label>
          <label style={labelStyle}>
            Retenciones
            <input type="number" inputMode="decimal" min="0" step="0.01" value={retenciones} onChange={(e) => setRetenciones(e.target.value)} placeholder="0 (opcional)" style={inputStyle} data-test="cobro-retenciones" />
          </label>
          <label style={labelStyle}>
            Medio
            <select value={medio} onChange={(e) => setMedio(e.target.value as MedioCobro)} style={inputStyle} data-test="cobro-medio">
              {MEDIOS.map((m) => (
                <option key={m} value={m}>{m}</option>
              ))}
            </select>
          </label>
          <label style={labelStyle}>
            Comprobante / orden de pago
            <input value={comprobante} onChange={(e) => setComprobante(e.target.value)} placeholder="opcional" style={inputStyle} data-test="cobro-comprobante" />
          </label>
          <label style={labelStyle}>
            Detalle
            <input value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="opcional" style={inputStyle} />
          </label>
        </div>

        <div style={{ background: "#F8F9FA", borderRadius: 8, padding: "8px 12px", marginTop: 12, fontSize: 13 }}>
          Total del cobro: <strong data-test="cobro-total">{fmtMoney(totalC / 100)}</strong>
          {centavos(num(retenciones)) > 0 && <span style={{ color: "#666" }}> (cobrado + retenciones)</span>}
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 14, marginBottom: 6, gap: 8, flexWrap: "wrap" }}>
          <strong style={{ fontSize: 13 }}>Facturas que cancela</strong>
          {pendientes.length > 0 && (
            <button onClick={repartir} disabled={totalC <= 0} style={{ ...botonStyle, background: "#F0F0F0", color: "#1A1A2E", opacity: totalC <= 0 ? 0.5 : 1 }} data-test="cobro-repartir">
              Repartir automático (más viejas primero)
            </button>
          )}
        </div>

        {pendientes.length === 0 ? (
          <p style={{ fontSize: 12, color: "#888", margin: "4px 0" }}>No hay facturas pendientes: el cobro queda sin aplicar.</p>
        ) : (
          <div style={{ border: "1px solid #eee", borderRadius: 8, maxHeight: 280, overflowY: "auto" }}>
            {lista.map((f) => {
              const tildada = f.id in sel;
              return (
                <div key={f.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 10px", borderTop: "1px solid #f0f0f0", flexWrap: "wrap", background: tildada ? "#F2F8F6" : "white" }} data-test="cobro-factura">
                  <label style={{ display: "flex", alignItems: "center", gap: 8, flex: "1 1 220px", minWidth: 0, cursor: "pointer", fontSize: 13 }}>
                    <input type="checkbox" checked={tildada} onChange={() => tildar(f)} data-test="cobro-factura-check" />
                    <span style={{ minWidth: 0 }}>
                      <strong>{f.numero_factura ?? "sin número"}</strong>
                      <span style={{ color: "#666" }}> · {fmtDate(f.fecha_entrega)}{f.lugar_entrega ? ` · ${f.lugar_entrega}` : ""}</span>
                      <div style={{ fontSize: 11, color: ROJO_TX }}>saldo {fmtMoney(f.saldo)}</div>
                    </span>
                  </label>
                  {tildada && (
                    <input
                      type="number"
                      inputMode="decimal"
                      min="0"
                      step="0.01"
                      value={sel[f.id]}
                      onChange={(e) => setSel((prev) => ({ ...prev, [f.id]: e.target.value }))}
                      aria-label={`Monto a aplicar a ${f.numero_factura ?? "la factura"}`}
                      style={{ ...inputStyle, width: 130 }}
                      data-test="cobro-factura-monto"
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}

        <div style={{ marginTop: 10, fontSize: 12 }} data-test="cobro-restante">
          {restanteC > 0 && totalC > 0 && (
            <span style={{ color: AMBAR_TX, fontWeight: 700 }}>
              Quedan {fmtMoney(restanteC / 100)} sin aplicar: el cobro se guarda igual y lo podés aplicar después.
            </span>
          )}
          {restanteC < 0 && (
            <span style={{ color: ROJO_TX, fontWeight: 700 }}>
              Estás aplicando {fmtMoney(-restanteC / 100)} más que el total del cobro.
            </span>
          )}
        </div>

        {error && (
          <div style={{ color: ROJO_TX, fontSize: 12, marginTop: 8, fontWeight: 700 }} data-test="cobro-error">
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
          <button onClick={guardar} disabled={guardando} style={{ ...botonStyle, background: COLOR_MUNI, color: "white", opacity: guardando ? 0.6 : 1 }} data-test="cobro-guardar">
            {guardando ? "Guardando…" : "Guardar cobro"}
          </button>
          <button onClick={onCerrar} style={{ ...botonStyle, background: "#F0F0F0", color: "#1A1A2E" }}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
