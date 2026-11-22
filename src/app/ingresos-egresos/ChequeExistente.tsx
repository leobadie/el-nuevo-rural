"use client";

/**
 * Piezas para pagar con un cheque que ya está cargado en Control de Cheques
 * (SPEC-cheque-a-proveedor.md): el buscador, la vista previa del reparto y el modal que se abre
 * desde Control de Cheques ("Aplicar a deuda").
 */
import { useMemo, useState } from "react";
import { X } from "lucide-react";
import { filtrarCheques, ordenarParaProveedor, parecidoProveedor, repartirCheque, type ChequeBasico } from "@/lib/cheques/vinculo";
import { buildCuentasProveedores, entregasConSaldo } from "@/lib/ingresos-egresos/cuentaProveedores";
import { fmtDateIE, fmtMoneyIE } from "@/lib/ingresos-egresos/calculos";
import { RED, inputStyle } from "@/lib/ingresos-egresos/estilos";
import type { EntregaConSaldo, EntregaProveedor, ImputacionPago, Movimiento } from "@/lib/ingresos-egresos/types";

const boton = { border: "none", borderRadius: 6, padding: "8px 14px", fontSize: 12, fontWeight: 700, cursor: "pointer" } as const;

/** Lista con buscador de los cheques sin usar; los parecidos al proveedor van primero. */
export function ElegirCheque({
  cheques,
  proveedor,
  elegidoId,
  onElegir,
}: {
  cheques: ChequeBasico[];
  proveedor: string | null;
  elegidoId: string | null;
  onElegir: (c: ChequeBasico) => void;
}) {
  const [busqueda, setBusqueda] = useState("");
  const lista = useMemo(
    () => filtrarCheques(ordenarParaProveedor(cheques, proveedor), busqueda),
    [cheques, proveedor, busqueda],
  );

  if (cheques.length === 0) {
    return (
      <p style={{ fontSize: 12, color: "#888", margin: 0 }} data-test="sin-cheques-libres">
        No hay cheques sin usar en Control de Cheques. Cargalo ahí primero o elegí &quot;Cheque nuevo&quot;.
      </p>
    );
  }

  return (
    <div data-test="elegir-cheque">
      <input
        placeholder="Buscar por N°, proveedor o importe"
        value={busqueda}
        onChange={(e) => setBusqueda(e.target.value)}
        style={inputStyle}
        data-test="buscar-cheque"
      />
      <div style={{ maxHeight: 220, overflowY: "auto", border: "1px solid #ddd", borderRadius: 6, marginTop: 6 }}>
        {lista.length === 0 && <div style={{ padding: 10, fontSize: 12, color: "#888" }}>Ningún cheque coincide con la búsqueda.</div>}
        {lista.slice(0, 60).map((c) => {
          const elegido = c.id === elegidoId;
          const parecido = proveedor ? parecidoProveedor(c.proveedor, proveedor) > 0 : false;
          return (
            <button
              key={c.id}
              type="button"
              onClick={() => onElegir(c)}
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 8,
                width: "100%",
                textAlign: "left",
                padding: "8px 10px",
                border: "none",
                borderTop: "1px solid #eee",
                background: elegido ? "#FDECEA" : "white",
                outline: elegido ? `2px solid ${RED}` : "none",
                outlineOffset: -2,
                cursor: "pointer",
                fontSize: 12,
              }}
              data-test="opcion-cheque"
              data-cheque-id={c.id}
            >
              <span style={{ minWidth: 0 }}>
                <strong>N° {c.n_cheque || "s/n"}</strong> · {c.proveedor || "sin proveedor"}
                {parecido && <span style={{ color: "#145A32", fontWeight: 700 }}> ✓</span>}
                <div style={{ color: "#888", fontSize: 11 }}>
                  {c.fecha_emision ? `Emitido ${fmtDateIE(c.fecha_emision)}` : "Sin fecha de emisión"}
                  {c.fecha_cobro ? ` · cobra ${fmtDateIE(c.fecha_cobro)}` : ""}
                </div>
              </span>
              <strong style={{ whiteSpace: "nowrap" }}>{fmtMoneyIE(Number(c.importe))}</strong>
            </button>
          );
        })}
      </div>
      {lista.length > 60 && <div style={{ fontSize: 11, color: "#888", marginTop: 4 }}>Mostrando 60 de {lista.length}. Buscá para achicar la lista.</div>}
    </div>
  );
}

/** Cómo va a quedar el cheque repartido entre las entregas, antes de confirmar. */
export function VistaReparto({
  cheque,
  pendientes,
  entregaPrimeroId,
}: {
  cheque: ChequeBasico;
  pendientes: EntregaConSaldo[];
  entregaPrimeroId?: string | null;
}) {
  const { aplicaciones, aCuenta } = repartirCheque(Number(cheque.importe), pendientes, entregaPrimeroId);
  return (
    <div style={{ background: "#F8F9FA", borderRadius: 6, padding: "8px 10px", fontSize: 12 }} data-test="vista-reparto">
      <div style={{ fontWeight: 700, marginBottom: 4 }}>
        Se carga un egreso de {fmtMoneyIE(Number(cheque.importe))} con este cheque y se aplica así:
      </div>
      {aplicaciones.length === 0 && <div>Este proveedor no tiene entregas pendientes.</div>}
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {aplicaciones.map((a) => {
          const e = pendientes.find((x) => x.id === a.entrega_id);
          return (
            <li key={a.entrega_id} data-test="reparto-linea">
              {fmtMoneyIE(a.monto)} → entrega del {e ? fmtDateIE(e.fecha) : "?"}
              {e?.comprobante ? ` (${e.comprobante})` : ""}
              {e && a.monto < e.saldo ? ` — queda debiendo ${fmtMoneyIE(e.saldo - a.monto)}` : ""}
            </li>
          );
        })}
      </ul>
      {aCuenta > 0 && (
        <div style={{ marginTop: 4, color: "#784212", fontWeight: 700 }} data-test="reparto-a-cuenta">
          Sobran {fmtMoneyIE(aCuenta)}: quedan a cuenta del proveedor.
        </div>
      )}
    </div>
  );
}

/**
 * Modal de "Aplicar a deuda" que se abre desde Control de Cheques: el cheque ya está elegido y
 * falta el proveedor.
 */
export function AplicarChequeModal({
  cheque,
  yaUsado,
  movs,
  entregas,
  imputaciones,
  corte,
  nombresProveedores,
  onAplicar,
  onCerrar,
}: {
  cheque: ChequeBasico | null;
  yaUsado: Movimiento | null;
  movs: Movimiento[];
  entregas: EntregaProveedor[];
  imputaciones: ImputacionPago[];
  corte: string | null;
  nombresProveedores: string[];
  onAplicar: (cheque: ChequeBasico, proveedor: string) => Promise<string | null>;
  onCerrar: () => void;
}) {
  const cuentas = useMemo(() => buildCuentasProveedores(entregas, movs, imputaciones, corte), [entregas, movs, imputaciones, corte]);
  const opciones = useMemo(() => {
    const deuda = new Map(cuentas.map((c) => [c.proveedor, c.saldo]));
    const nombres = [...new Set([...nombresProveedores, ...cuentas.map((c) => c.proveedor)])];
    return nombres
      .map((n) => ({ nombre: n, deuda: deuda.get(n) ?? 0, parecido: cheque ? parecidoProveedor(cheque.proveedor, n) : 0 }))
      .sort((a, b) => b.parecido - a.parecido || b.deuda - a.deuda || a.nombre.localeCompare(b.nombre));
  }, [cuentas, nombresProveedores, cheque]);

  const [proveedor, setProveedor] = useState(() => (opciones[0]?.parecido ? opciones[0].nombre : ""));
  const [error, setError] = useState("");
  const [guardando, setGuardando] = useState(false);
  const [hecho, setHecho] = useState(false);

  const pendientes = useMemo(
    () => (proveedor ? entregasConSaldo(entregas, imputaciones, proveedor).filter((e) => e.saldo > 0) : []),
    [entregas, imputaciones, proveedor],
  );

  async function confirmar() {
    if (!cheque) return;
    if (!proveedor) {
      setError("Elegí a qué proveedor le pagaste con este cheque.");
      return;
    }
    setGuardando(true);
    const err = await onAplicar(cheque, proveedor);
    setGuardando(false);
    if (err) setError(err);
    else setHecho(true);
  }

  return (
    <div
      onClick={onCerrar}
      style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.45)", display: "flex", alignItems: "center", justifyContent: "center", padding: 16, zIndex: 50 }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: "white", borderRadius: 10, padding: 20, width: "100%", maxWidth: 460, maxHeight: "90vh", overflowY: "auto" }}
        data-test="modal-aplicar-cheque"
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <strong style={{ fontSize: 16 }}>Aplicar cheque a una deuda</strong>
          <button onClick={onCerrar} style={{ border: "none", background: "transparent", cursor: "pointer", color: "#888" }} aria-label="Cerrar">
            <X size={18} />
          </button>
        </div>

        {!cheque ? (
          <p style={{ fontSize: 12, color: "#922B21" }} data-test="cheque-no-encontrado">No se encontró ese cheque. Puede que lo hayan borrado.</p>
        ) : cheque.rechazado ? (
          <p style={{ fontSize: 12, color: "#922B21" }} data-test="cheque-rechazado">
            El cheque N° {cheque.n_cheque || "s/n"} está marcado como rechazado: no se puede usar para pagar.
          </p>
        ) : yaUsado && !hecho ? (
          <p style={{ fontSize: 12, color: "#922B21" }} data-test="cheque-ya-usado">
            El cheque N° {cheque.n_cheque || "s/n"} ya está vinculado a {yaUsado.id ? `el pago "${yaUsado.descripcion}" del ${fmtDateIE(yaUsado.fecha)}` : "un pago anterior"}.
          </p>
        ) : hecho ? (
          <p style={{ fontSize: 13, color: "#145A32", fontWeight: 700 }} data-test="cheque-aplicado">
            Listo: el cheque N° {cheque.n_cheque || "s/n"} quedó cargado como pago a {proveedor}.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            <div style={{ fontSize: 12, background: "#F8F9FA", borderRadius: 6, padding: "8px 10px" }}>
              <strong>N° {cheque.n_cheque || "s/n"}</strong> · {cheque.proveedor || "sin proveedor"} · <strong>{fmtMoneyIE(Number(cheque.importe))}</strong>
              <div style={{ color: "#888", fontSize: 11 }}>
                {cheque.fecha_emision ? `Emitido ${fmtDateIE(cheque.fecha_emision)}` : "Sin fecha de emisión"}
                {cheque.fecha_cobro ? ` · cobra ${fmtDateIE(cheque.fecha_cobro)}` : ""}
              </div>
            </div>
            <label style={{ fontSize: 11, fontWeight: 700, color: "#666" }}>
              Proveedor al que se le pagó
              <select
                value={proveedor}
                onChange={(e) => {
                  setProveedor(e.target.value);
                  setError("");
                }}
                style={inputStyle}
                data-test="aplicar-cheque-proveedor"
              >
                <option value="">Elegí un proveedor…</option>
                {opciones.map((o) => (
                  <option key={o.nombre} value={o.nombre}>
                    {o.nombre}
                    {o.deuda > 0 ? ` — debe ${fmtMoneyIE(o.deuda)}` : ""}
                  </option>
                ))}
              </select>
            </label>
            {proveedor && <VistaReparto cheque={cheque} pendientes={pendientes} />}
          </div>
        )}

        {error && (
          <div style={{ color: "#922B21", fontSize: 12, marginTop: 10, fontWeight: 700 }} data-test="aplicar-cheque-error">
            {error}
          </div>
        )}

        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          {cheque && !cheque.rechazado && !yaUsado && !hecho && (
            <button
              onClick={confirmar}
              disabled={guardando}
              style={{ ...boton, background: RED, color: "white", opacity: guardando ? 0.6 : 1 }}
              data-test="aplicar-cheque-confirmar"
            >
              {guardando ? "Guardando…" : "Aplicar cheque"}
            </button>
          )}
          <button onClick={onCerrar} style={{ ...boton, background: "#F0F0F0", color: "#1A1A2E" }} data-test="aplicar-cheque-cerrar">
            {hecho ? "Cerrar" : "Cancelar"}
          </button>
        </div>
      </div>
    </div>
  );
}
