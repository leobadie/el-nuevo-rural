"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Plus, Trash2, X } from "lucide-react";
import {
  buildCuentasProveedores,
  entregasConSaldo,
  pagosConSaldo,
  repartirFIFO,
} from "@/lib/ingresos-egresos/cuentaProveedores";
import { fmtDateIE, fmtMoneyIE } from "@/lib/ingresos-egresos/calculos";
import { RED, inputStyle, tdStyle, thStyle } from "@/lib/ingresos-egresos/estilos";
import type {
  EntregaConSaldo,
  EntregaProveedor,
  ImputacionPago,
  MedioPago,
  Movimiento,
  NuevaEntregaProveedor,
  Proveedor,
} from "@/lib/ingresos-egresos/types";

const VERDE = "#145A32";
const VERDE_BG = "#D5F5E3";
const ROJO_BG = "#FADBD8";
const ROJO_TX = "#922B21";
const AMBAR_BG = "#FDEBD0";
const AMBAR_TX = "#784212";

const hoyISO = () => new Date().toISOString().slice(0, 10);

const COLOR_ESTADO: Record<EntregaConSaldo["estado"], { bg: string; tx: string }> = {
  Pagada: { bg: VERDE_BG, tx: VERDE },
  Parcial: { bg: AMBAR_BG, tx: AMBAR_TX },
  Impaga: { bg: ROJO_BG, tx: ROJO_TX },
};

const botonStyle = {
  border: "none",
  borderRadius: 6,
  padding: "7px 12px",
  fontSize: 12,
  fontWeight: 700,
  cursor: "pointer",
} as const;

function Chip({ estado }: { estado: EntregaConSaldo["estado"] }) {
  const c = COLOR_ESTADO[estado];
  return (
    <span style={{ background: c.bg, color: c.tx, fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 12, whiteSpace: "nowrap" }}>
      {estado}
    </span>
  );
}

export default function CuentaProveedoresTab({
  movs,
  entregas,
  imputaciones,
  proveedores,
  esAdmin,
  onAddEntrega,
  onDeleteEntrega,
  onPagarEntrega,
  onImputar,
  onDesimputar,
}: {
  movs: Movimiento[];
  entregas: EntregaProveedor[];
  imputaciones: ImputacionPago[];
  proveedores: Proveedor[];
  esAdmin: boolean;
  onAddEntrega: (nueva: NuevaEntregaProveedor) => Promise<void>;
  onDeleteEntrega: (id: string) => void;
  onPagarEntrega: (datos: {
    proveedor: string;
    entregaId: string;
    fecha: string;
    monto: number;
    medioPago: MedioPago;
    descripcion: string;
  }) => Promise<void>;
  onImputar: (aplicaciones: { movimiento_id: string; entrega_id: string; monto: number }[]) => Promise<void>;
  onDesimputar: (id: string) => Promise<void>;
}) {
  const [seleccionado, setSeleccionado] = useState<string | null>(null);

  const cuentas = useMemo(
    () => buildCuentasProveedores(entregas, movs, imputaciones),
    [entregas, movs, imputaciones],
  );
  const deudaTotal = useMemo(() => cuentas.reduce((acc, c) => acc + Math.max(c.saldo, 0), 0), [cuentas]);

  if (seleccionado) {
    return (
      <FichaProveedor
        proveedor={seleccionado}
        movs={movs}
        entregas={entregas}
        imputaciones={imputaciones}
        esAdmin={esAdmin}
        onVolver={() => setSeleccionado(null)}
        onAddEntrega={onAddEntrega}
        onDeleteEntrega={onDeleteEntrega}
        onPagarEntrega={onPagarEntrega}
        onImputar={onImputar}
        onDesimputar={onDesimputar}
      />
    );
  }

  return (
    <div>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <div style={{ background: deudaTotal > 0 ? ROJO_BG : VERDE_BG, color: deudaTotal > 0 ? ROJO_TX : VERDE, borderRadius: 10, padding: "12px 18px", flex: "1 1 200px", minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700 }}>DEUDA TOTAL CON PROVEEDORES</div>
          <div style={{ fontSize: 22, fontWeight: 800 }} data-test="deuda-total">{fmtMoneyIE(deudaTotal)}</div>
        </div>
        <div style={{ background: "#F8F9FA", borderRadius: 10, padding: "12px 18px", flex: "1 1 200px", minWidth: 0 }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: "#666" }}>PROVEEDORES CON DEUDA</div>
          <div style={{ fontSize: 22, fontWeight: 800, color: "#1A1A2E" }}>{cuentas.filter((c) => c.saldo > 0).length}</div>
        </div>
      </div>

      <NuevaEntregaForm proveedores={proveedores} onAddEntrega={onAddEntrega} />

      <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Proveedor</th>
              <th style={thStyle}>Entregado</th>
              <th style={thStyle}>Pagado</th>
              <th style={thStyle}>Saldo</th>
              <th style={thStyle}>A cuenta</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {cuentas.length === 0 && (
              <tr>
                <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "#888", padding: 24 }}>
                  Todavía no hay entregas ni pagos cargados. Empezá cargando una entrega arriba.
                </td>
              </tr>
            )}
            {cuentas.map((c, i) => (
              <tr
                key={c.proveedor}
                onClick={() => setSeleccionado(c.proveedor)}
                style={{ background: i % 2 === 1 ? "#F2F6FC" : "white", borderTop: "1px solid #eee", cursor: "pointer" }}
                data-test="fila-cuenta"
              >
                <td style={{ ...tdStyle, fontWeight: 700 }}>
                  {c.proveedor}
                  {c.cantEntregasPendientes > 0 && (
                    <span style={{ color: "#888", fontWeight: 400, fontSize: 11, marginLeft: 6 }}>
                      · {c.cantEntregasPendientes} pendiente(s)
                    </span>
                  )}
                </td>
                <td style={tdStyle}>{fmtMoneyIE(c.entregado)}</td>
                <td style={tdStyle}>{fmtMoneyIE(c.pagado)}</td>
                <td style={{ ...tdStyle, fontWeight: 800, color: c.saldo > 0 ? ROJO_TX : VERDE }} data-test="cuenta-saldo">
                  {fmtMoneyIE(c.saldo)}
                </td>
                <td style={{ ...tdStyle, color: c.aCuenta > 0 ? AMBAR_TX : "#888" }}>
                  {c.aCuenta > 0 ? fmtMoneyIE(c.aCuenta) : "—"}
                </td>
                <td style={{ ...tdStyle, textAlign: "right", color: RED, fontWeight: 700, fontSize: 12, whiteSpace: "nowrap" }}>
                  Ver detalle →
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p style={{ fontSize: 11, color: "#888", marginTop: 10 }}>
        El saldo es lo entregado menos todo lo que le pagaste. &quot;A cuenta&quot; es plata que ya le diste
        pero que todavía no aplicaste a ninguna entrega: entrá al detalle para aplicarla.
      </p>
    </div>
  );
}

function NuevaEntregaForm({
  proveedores,
  onAddEntrega,
  proveedorFijo,
}: {
  proveedores: Proveedor[];
  onAddEntrega: (nueva: NuevaEntregaProveedor) => Promise<void>;
  proveedorFijo?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  const [proveedor, setProveedor] = useState("");
  const [fecha, setFecha] = useState(hoyISO);
  const [monto, setMonto] = useState("");
  const [comprobante, setComprobante] = useState("");
  const [detalle, setDetalle] = useState("");
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function guardar() {
    const nombre = proveedorFijo || proveedor;
    if (!nombre) {
      setError("Elegí un proveedor.");
      return;
    }
    const num = parseFloat(monto);
    if (!(num > 0)) {
      setError("El monto tiene que ser mayor a cero.");
      return;
    }
    if (!fecha) {
      setError("Poné la fecha de la entrega.");
      return;
    }
    setGuardando(true);
    await onAddEntrega({
      proveedor: nombre,
      fecha,
      monto: num,
      comprobante: comprobante.trim() || null,
      detalle: detalle.trim() || null,
    });
    setGuardando(false);
    setMonto("");
    setComprobante("");
    setDetalle("");
    setError("");
    setAbierto(false);
  }

  if (!abierto) {
    return (
      <button
        onClick={() => setAbierto(true)}
        style={{ ...botonStyle, background: RED, color: "white", marginBottom: 16, display: "inline-flex", alignItems: "center", gap: 6 }}
        data-test="abrir-nueva-entrega"
      >
        <Plus size={14} /> Cargar entrega
      </button>
    );
  }

  return (
    <div style={{ border: "1px solid #ddd", borderRadius: 8, padding: 14, marginBottom: 16, background: "#FAFBFC" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <strong style={{ fontSize: 14 }}>Nueva entrega{proveedorFijo ? ` — ${proveedorFijo}` : ""}</strong>
        <button onClick={() => setAbierto(false)} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#888" }}>
          <X size={16} />
        </button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
        {!proveedorFijo && (
          <label style={{ fontSize: 11, fontWeight: 700, color: "#666" }}>
            Proveedor
            <select value={proveedor} onChange={(e) => setProveedor(e.target.value)} style={inputStyle} data-test="entrega-proveedor">
              <option value="">— elegir —</option>
              {proveedores.map((p) => (
                <option key={p.id} value={p.nombre}>
                  {p.nombre}
                </option>
              ))}
            </select>
          </label>
        )}
        <label style={{ fontSize: 11, fontWeight: 700, color: "#666" }}>
          Fecha
          <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={inputStyle} data-test="entrega-fecha" />
        </label>
        <label style={{ fontSize: 11, fontWeight: 700, color: "#666" }}>
          Monto
          <input type="number" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="0" style={inputStyle} data-test="entrega-monto" />
        </label>
        <label style={{ fontSize: 11, fontWeight: 700, color: "#666" }}>
          Remito / Factura
          <input value={comprobante} onChange={(e) => setComprobante(e.target.value)} placeholder="opcional" style={inputStyle} data-test="entrega-comprobante" />
        </label>
        <label style={{ fontSize: 11, fontWeight: 700, color: "#666" }}>
          Detalle
          <input value={detalle} onChange={(e) => setDetalle(e.target.value)} placeholder="opcional" style={inputStyle} />
        </label>
      </div>
      {error && (
        <div style={{ color: ROJO_TX, fontSize: 12, marginTop: 8, fontWeight: 700 }} data-test="entrega-error">
          {error}
        </div>
      )}
      <button
        onClick={guardar}
        disabled={guardando}
        style={{ ...botonStyle, background: RED, color: "white", marginTop: 12, opacity: guardando ? 0.6 : 1 }}
        data-test="guardar-entrega"
      >
        {guardando ? "Guardando…" : "Guardar entrega"}
      </button>
    </div>
  );
}

function FichaProveedor({
  proveedor,
  movs,
  entregas,
  imputaciones,
  esAdmin,
  onVolver,
  onAddEntrega,
  onDeleteEntrega,
  onPagarEntrega,
  onImputar,
  onDesimputar,
}: {
  proveedor: string;
  movs: Movimiento[];
  entregas: EntregaProveedor[];
  imputaciones: ImputacionPago[];
  esAdmin: boolean;
  onVolver: () => void;
  onAddEntrega: (nueva: NuevaEntregaProveedor) => Promise<void>;
  onDeleteEntrega: (id: string) => void;
  onPagarEntrega: (datos: {
    proveedor: string;
    entregaId: string;
    fecha: string;
    monto: number;
    medioPago: MedioPago;
    descripcion: string;
  }) => Promise<void>;
  onImputar: (aplicaciones: { movimiento_id: string; entrega_id: string; monto: number }[]) => Promise<void>;
  onDesimputar: (id: string) => Promise<void>;
}) {
  const [pagando, setPagando] = useState<EntregaConSaldo | null>(null);
  const [aplicando, setAplicando] = useState<string | null>(null);

  const lista = useMemo(() => entregasConSaldo(entregas, imputaciones, proveedor), [entregas, imputaciones, proveedor]);
  const pagos = useMemo(() => pagosConSaldo(movs, imputaciones, proveedor), [movs, imputaciones, proveedor]);
  const pendientes = useMemo(() => lista.filter((e) => e.saldo > 0), [lista]);
  const aplicaciones = useMemo(
    () => imputaciones.filter((im) => lista.some((e) => e.id === im.entrega_id)),
    [imputaciones, lista],
  );

  const entregado = lista.reduce((a, e) => a + e.monto, 0);
  const pagado = pagos.reduce((a, p) => a + p.monto, 0);
  const saldo = entregado - pagado;
  const aCuenta = pagos.reduce((a, p) => a + p.disponible, 0);

  const pagoAplicando = pagos.find((p) => p.id === aplicando);

  async function aplicarAuto(pagoId: string, disponible: number) {
    const reparto = repartirFIFO(disponible, pendientes);
    if (reparto.length === 0) {
      window.alert("Este proveedor no tiene entregas pendientes a las que aplicar el pago.");
      return;
    }
    await onImputar(reparto.map((r) => ({ movimiento_id: pagoId, entrega_id: r.entrega_id, monto: r.monto })));
  }

  return (
    <div>
      <button
        onClick={onVolver}
        style={{ ...botonStyle, background: "#F0F0F0", color: "#1A1A2E", marginBottom: 14, display: "inline-flex", alignItems: "center", gap: 6 }}
        data-test="volver-lista"
      >
        <ArrowLeft size={14} /> Volver a todos los proveedores
      </button>

      <h2 style={{ fontSize: 20, fontWeight: 800, margin: "0 0 12px" }}>{proveedor}</h2>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, marginBottom: 18 }}>
        <div style={{ background: "#F8F9FA", borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#666" }}>ENTREGADO</div>
          <div style={{ fontSize: 16, fontWeight: 700 }} data-test="ficha-entregado">{fmtMoneyIE(entregado)}</div>
        </div>
        <div style={{ background: "#F8F9FA", borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: "#666" }}>PAGADO</div>
          <div style={{ fontSize: 16, fontWeight: 700 }} data-test="ficha-pagado">{fmtMoneyIE(pagado)}</div>
        </div>
        <div style={{ background: saldo > 0 ? ROJO_BG : VERDE_BG, color: saldo > 0 ? ROJO_TX : VERDE, borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700 }}>SALDO</div>
          <div style={{ fontSize: 16, fontWeight: 800 }} data-test="ficha-saldo">{fmtMoneyIE(saldo)}</div>
        </div>
        <div style={{ background: aCuenta > 0 ? AMBAR_BG : "#F8F9FA", color: aCuenta > 0 ? AMBAR_TX : "#666", borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 10, fontWeight: 700 }}>A CUENTA</div>
          <div style={{ fontSize: 16, fontWeight: 700 }} data-test="ficha-acuenta">{fmtMoneyIE(aCuenta)}</div>
        </div>
      </div>

      <NuevaEntregaForm proveedores={[]} proveedorFijo={proveedor} onAddEntrega={onAddEntrega} />

      <h3 style={{ fontSize: 14, fontWeight: 800, margin: "18px 0 8px" }}>Entregas</h3>
      <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Fecha</th>
              <th style={thStyle}>Comprobante</th>
              <th style={thStyle}>Monto</th>
              <th style={thStyle}>Pagado</th>
              <th style={thStyle}>Saldo</th>
              <th style={thStyle}>Estado</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {lista.length === 0 && (
              <tr>
                <td colSpan={7} style={{ ...tdStyle, textAlign: "center", color: "#888", padding: 20 }}>
                  Sin entregas cargadas para este proveedor.
                </td>
              </tr>
            )}
            {lista.map((e, i) => (
              <tr key={e.id} style={{ background: i % 2 === 1 ? "#F2F6FC" : "white", borderTop: "1px solid #eee" }} data-test="fila-entrega">
                <td style={tdStyle}>{fmtDateIE(e.fecha)}</td>
                <td style={tdStyle}>
                  {e.comprobante || "—"}
                  {e.detalle && <div style={{ fontSize: 11, color: "#888" }}>{e.detalle}</div>}
                </td>
                <td style={{ ...tdStyle, fontWeight: 700 }}>{fmtMoneyIE(e.monto)}</td>
                <td style={tdStyle}>{fmtMoneyIE(e.pagado)}</td>
                <td style={{ ...tdStyle, fontWeight: 700, color: e.saldo > 0 ? ROJO_TX : VERDE }} data-test="entrega-saldo">
                  {fmtMoneyIE(e.saldo)}
                </td>
                <td style={tdStyle}>
                  <Chip estado={e.estado} />
                </td>
                <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                  {e.saldo > 0 && (
                    <button onClick={() => setPagando(e)} style={{ ...botonStyle, background: RED, color: "white" }} data-test="btn-pagar">
                      Pagar
                    </button>
                  )}
                  {esAdmin && (
                    <button
                      onClick={() => onDeleteEntrega(e.id)}
                      title="Eliminar entrega"
                      style={{ ...botonStyle, background: "transparent", color: "#C0392B", padding: "7px 6px" }}
                    >
                      <Trash2 size={14} />
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h3 style={{ fontSize: 14, fontWeight: 800, margin: "22px 0 8px" }}>Pagos</h3>
      <div style={{ overflowX: "auto", border: "1px solid #ddd", borderRadius: 8 }}>
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr>
              <th style={thStyle}>Fecha</th>
              <th style={thStyle}>Descripción</th>
              <th style={thStyle}>Monto</th>
              <th style={thStyle}>Aplicado</th>
              <th style={thStyle}>Sin aplicar</th>
              <th style={thStyle}></th>
            </tr>
          </thead>
          <tbody>
            {pagos.length === 0 && (
              <tr>
                <td colSpan={6} style={{ ...tdStyle, textAlign: "center", color: "#888", padding: 20 }}>
                  Sin pagos registrados para este proveedor.
                </td>
              </tr>
            )}
            {pagos.map((p, i) => (
              <tr key={p.id} style={{ background: i % 2 === 1 ? "#F2F6FC" : "white", borderTop: "1px solid #eee" }} data-test="fila-pago">
                <td style={tdStyle}>{fmtDateIE(p.fecha)}</td>
                <td style={tdStyle}>
                  {p.descripcion || "—"}
                  {p.medio_pago && <div style={{ fontSize: 11, color: "#888" }}>{p.medio_pago}</div>}
                </td>
                <td style={{ ...tdStyle, fontWeight: 700 }}>{fmtMoneyIE(p.monto)}</td>
                <td style={tdStyle}>{fmtMoneyIE(p.imputado)}</td>
                <td style={{ ...tdStyle, fontWeight: 700, color: p.disponible > 0 ? AMBAR_TX : "#888" }} data-test="pago-disponible">
                  {p.disponible > 0 ? fmtMoneyIE(p.disponible) : "—"}
                </td>
                <td style={{ ...tdStyle, textAlign: "right", whiteSpace: "nowrap" }}>
                  {p.disponible > 0 && pendientes.length > 0 && (
                    <>
                      <button onClick={() => aplicarAuto(p.id, p.disponible)} style={{ ...botonStyle, background: RED, color: "white" }} data-test="btn-aplicar-auto">
                        Aplicar automático
                      </button>
                      <button
                        onClick={() => setAplicando(aplicando === p.id ? null : p.id)}
                        style={{ ...botonStyle, background: "#F0F0F0", color: "#1A1A2E", marginLeft: 6 }}
                        data-test="btn-aplicar-elegir"
                      >
                        Elegir
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pagoAplicando && (
        <AplicarPagoForm
          key={pagoAplicando.id}
          pago={pagoAplicando}
          pendientes={pendientes}
          onCancelar={() => setAplicando(null)}
          onConfirmar={async (entregaId, monto) => {
            await onImputar([{ movimiento_id: pagoAplicando.id, entrega_id: entregaId, monto }]);
            setAplicando(null);
          }}
        />
      )}

      <h3 style={{ fontSize: 14, fontWeight: 800, margin: "22px 0 8px" }}>Aplicaciones</h3>
      {aplicaciones.length === 0 ? (
        <p style={{ fontSize: 12, color: "#888" }}>Todavía no aplicaste ningún pago a una entrega.</p>
      ) : (
        <ul style={{ listStyle: "none", padding: 0, margin: 0, border: "1px solid #ddd", borderRadius: 8 }}>
          {aplicaciones.map((im) => {
            const e = lista.find((x) => x.id === im.entrega_id);
            const p = pagos.find((x) => x.id === im.movimiento_id);
            return (
              <li
                key={im.id}
                style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, padding: "8px 12px", borderTop: "1px solid #eee", fontSize: 12, flexWrap: "wrap" }}
                data-test="fila-aplicacion"
              >
                <span>
                  <strong>{fmtMoneyIE(Number(im.monto))}</strong> del pago del {p ? fmtDateIE(p.fecha) : "?"} → entrega del{" "}
                  {e ? fmtDateIE(e.fecha) : "?"}
                  {e?.comprobante ? ` (${e.comprobante})` : ""}
                </span>
                <button
                  onClick={() => onDesimputar(im.id)}
                  style={{ ...botonStyle, background: "transparent", color: "#C0392B", padding: "4px 6px" }}
                  data-test="btn-desimputar"
                >
                  Deshacer
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {pagando && (
        <PagarEntregaModal
          entrega={pagando}
          proveedor={proveedor}
          onCerrar={() => setPagando(null)}
          onConfirmar={async (datos) => {
            await onPagarEntrega({ ...datos, proveedor, entregaId: pagando.id });
            setPagando(null);
          }}
        />
      )}
    </div>
  );
}

function AplicarPagoForm({
  pago,
  pendientes,
  onCancelar,
  onConfirmar,
}: {
  pago: { id: string; disponible: number };
  pendientes: EntregaConSaldo[];
  onCancelar: () => void;
  onConfirmar: (entregaId: string, monto: number) => Promise<void>;
}) {
  const [entregaId, setEntregaId] = useState(pendientes[0]?.id ?? "");
  const entrega = pendientes.find((e) => e.id === entregaId);
  const tope = Math.min(pago.disponible, entrega?.saldo ?? 0);
  const [monto, setMonto] = useState(String(tope));
  const [error, setError] = useState("");

  async function confirmar() {
    const num = parseFloat(monto);
    if (!(num > 0)) {
      setError("El monto tiene que ser mayor a cero.");
      return;
    }
    if (num > tope + 0.005) {
      setError(`No podés aplicar más de ${fmtMoneyIE(tope)}.`);
      return;
    }
    await onConfirmar(entregaId, num);
  }

  return (
    <div style={{ border: `1px solid ${RED}`, borderRadius: 8, padding: 14, marginTop: 12, background: "#FFF8F8" }}>
      <strong style={{ fontSize: 13 }}>Aplicar {fmtMoneyIE(pago.disponible)} disponibles</strong>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 10, marginTop: 10 }}>
        <label style={{ fontSize: 11, fontWeight: 700, color: "#666" }}>
          Entrega
          <select
            value={entregaId}
            onChange={(e) => {
              setEntregaId(e.target.value);
              const nueva = pendientes.find((x) => x.id === e.target.value);
              setMonto(String(Math.min(pago.disponible, nueva?.saldo ?? 0)));
            }}
            style={inputStyle}
            data-test="aplicar-entrega"
          >
            {pendientes.map((e) => (
              <option key={e.id} value={e.id}>
                {fmtDateIE(e.fecha)} — {e.comprobante || "sin comprobante"} — debe {fmtMoneyIE(e.saldo)}
              </option>
            ))}
          </select>
        </label>
        <label style={{ fontSize: 11, fontWeight: 700, color: "#666" }}>
          Monto a aplicar
          <input type="number" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} style={inputStyle} data-test="aplicar-monto" />
        </label>
      </div>
      {error && (
        <div style={{ color: ROJO_TX, fontSize: 12, marginTop: 8, fontWeight: 700 }} data-test="aplicar-error">
          {error}
        </div>
      )}
      <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
        <button onClick={confirmar} style={{ ...botonStyle, background: RED, color: "white" }} data-test="aplicar-confirmar">
          Aplicar
        </button>
        <button onClick={onCancelar} style={{ ...botonStyle, background: "#F0F0F0", color: "#1A1A2E" }}>
          Cancelar
        </button>
      </div>
    </div>
  );
}

function PagarEntregaModal({
  entrega,
  proveedor,
  onCerrar,
  onConfirmar,
}: {
  entrega: EntregaConSaldo;
  proveedor: string;
  onCerrar: () => void;
  onConfirmar: (datos: { fecha: string; monto: number; medioPago: MedioPago; descripcion: string }) => Promise<void>;
}) {
  const [fecha, setFecha] = useState(hoyISO);
  const [monto, setMonto] = useState(String(entrega.saldo));
  const [medioPago, setMedioPago] = useState<MedioPago>("Efectivo");
  const [descripcion, setDescripcion] = useState(`Pago a ${proveedor}${entrega.comprobante ? ` — ${entrega.comprobante}` : ""}`);
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);

  async function confirmar() {
    const num = parseFloat(monto);
    if (!(num > 0)) {
      setError("El monto tiene que ser mayor a cero.");
      return;
    }
    if (num > entrega.saldo + 0.005) {
      setError(`Esta entrega debe ${fmtMoneyIE(entrega.saldo)}. Para pagar de más, cargá el pago desde Movimientos.`);
      return;
    }
    if (!fecha) {
      setError("Poné la fecha del pago.");
      return;
    }
    setGuardando(true);
    await onConfirmar({ fecha, monto: num, medioPago, descripcion: descripcion.trim() || `Pago a ${proveedor}` });
    setGuardando(false);
  }

  return (
    <div
      onClick={onCerrar}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "white", borderRadius: 10, padding: 20, width: "100%", maxWidth: 440, maxHeight: "90vh", overflowY: "auto" }}
        data-test="modal-pago"
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
          <strong style={{ fontSize: 16 }}>Registrar pago</strong>
          <button onClick={onCerrar} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#888" }}>
            <X size={18} />
          </button>
        </div>
        <p style={{ fontSize: 12, color: "#666", margin: "0 0 14px" }}>
          {proveedor} · entrega del {fmtDateIE(entrega.fecha)} · debe <strong>{fmtMoneyIE(entrega.saldo)}</strong>
        </p>

        <div style={{ display: "grid", gap: 10 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: "#666" }}>
            Fecha del pago
            <input type="date" value={fecha} onChange={(e) => setFecha(e.target.value)} style={inputStyle} data-test="pago-fecha" />
          </label>
          <label style={{ fontSize: 11, fontWeight: 700, color: "#666" }}>
            Monto
            <input type="number" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} style={inputStyle} data-test="pago-monto" />
          </label>
          <label style={{ fontSize: 11, fontWeight: 700, color: "#666" }}>
            Medio de pago
            <select value={medioPago} onChange={(e) => setMedioPago(e.target.value as MedioPago)} style={inputStyle} data-test="pago-medio">
              <option value="Efectivo">Efectivo</option>
              <option value="Transferencia">Transferencia</option>
              <option value="Cheque">Cheque</option>
            </select>
          </label>
          <label style={{ fontSize: 11, fontWeight: 700, color: "#666" }}>
            Descripción
            <input value={descripcion} onChange={(e) => setDescripcion(e.target.value)} style={inputStyle} />
          </label>
        </div>

        {error && (
          <div style={{ color: ROJO_TX, fontSize: 12, marginTop: 10, fontWeight: 700 }} data-test="pago-error">
            {error}
          </div>
        )}

        <p style={{ fontSize: 11, color: "#888", margin: "12px 0 0" }}>
          Se va a crear un egreso en Movimientos con categoría &quot;Pago a Proveedor&quot;, así que no hace
          falta que lo cargues de nuevo ahí.
        </p>

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button
            onClick={confirmar}
            disabled={guardando}
            style={{ ...botonStyle, background: RED, color: "white", opacity: guardando ? 0.6 : 1 }}
            data-test="pago-confirmar"
          >
            {guardando ? "Guardando…" : "Registrar pago"}
          </button>
          <button onClick={onCerrar} style={{ ...botonStyle, background: "#F0F0F0", color: "#1A1A2E" }}>
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
