"use client";

import { useState } from "react";
import CuentaProveedoresTab from "@/app/ingresos-egresos/tabs/CuentaProveedoresTab";
import { AplicarChequeModal } from "@/app/ingresos-egresos/ChequeExistente";
import { chequesSinUsar, repartirCheque, type ChequeBasico } from "@/lib/cheques/vinculo";
import { entregasConSaldo } from "@/lib/ingresos-egresos/cuentaProveedores";
import type {
  AplicacionNotaCredito,
  EntregaProveedor,
  ImputacionPago,
  MedioPago,
  Movimiento,
  NotaCreditoProveedor,
  NuevaEntregaProveedor,
  NuevaNotaCredito,
  Proveedor,
} from "@/lib/ingresos-egresos/types";

function d(offset: number): string {
  const x = new Date();
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() + offset);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

const PROVEEDORES: Proveedor[] = [
  { id: "p1", nombre: "Italiana", telefono: null },
  { id: "p2", nombre: "Pepsi", telefono: null },
  { id: "p3", nombre: "Miga", telefono: null },
  { id: "p4", nombre: "Katy (verdulería)", telefono: null },
  // Sin entregas ni descuento: el verificador le configura el 5% desde el formulario de carga.
  { id: "p5", nombre: "SANTA RITA SOTO (MAYORISTA)", telefono: null, descuento_pct: null },
];

const ENTREGAS_INICIALES: EntregaProveedor[] = [
  // Italiana: dos entregas, una vieja y una nueva, con un pago sin aplicar dando vueltas.
  { id: "e1", proveedor: "Italiana", fecha: d(-10), monto: 100000, comprobante: "R-0001", detalle: "Fiambres", creado_el: d(-10), creado_por: null },
  { id: "e2", proveedor: "Italiana", fecha: d(-3), monto: 50000, comprobante: "R-0002", detalle: null, creado_el: d(-3), creado_por: null },
  // Pepsi: entrega ya saldada, para ver el estado "Pagada".
  { id: "e3", proveedor: "Pepsi", fecha: d(-7), monto: 30000, comprobante: "FC-A-115", detalle: null, creado_el: d(-7), creado_por: null },
  // Katy: entrega pagada a medias, para ver el estado "Parcial".
  { id: "e4", proveedor: "Katy (verdulería)", fecha: d(-5), monto: 20000, comprobante: null, detalle: "Verdura semana", creado_el: d(-5), creado_por: null },
];

function mov(id: string, proveedor: string, fecha: string, egreso: number, descripcion: string, medio: MedioPago): Movimiento {
  return {
    id,
    fecha,
    descripcion,
    categoria: "Pago a Proveedor",
    ingreso: null,
    egreso,
    proveedor,
    medio_pago: medio,
    n_cheque_pago: null,
    fecha_cobro_cheque_pago: null,
    cheque_creado: false,
    gasto_fijo_id: null,
    creado_el: fecha,
    modificado_el: fecha,
    creado_por: null,
  };
}

/** Corte de prueba: 30 días atrás. Todo lo de arriba se cargó después, así que cuenta. */
const CORTE = `${d(-30)}T00:00:00.000Z`;

const MOVS_INICIALES: Movimiento[] = [
  // Cargado desde Movimientos, todavía sin aplicar a ninguna entrega.
  mov("m1", "Italiana", d(-4), 60000, "Pago Italiana", "Transferencia"),
  mov("m2", "Pepsi", d(-6), 30000, "Pago Pepsi", "Efectivo"),
  mov("m3", "Katy (verdulería)", d(-2), 8000, "Adelanto Katy", "Efectivo"),
  // Un ingreso y un egreso sin proveedor: no tienen que aparecer en la cuenta corriente.
  { ...mov("m4", "", d(-1), 5000, "Nafta", "Efectivo"), proveedor: null },
  { ...mov("m5", "Italiana", d(-1), 0, "Nota", "Efectivo"), egreso: null, ingreso: 1000 },
  // Pago viejo, cargado ANTES del corte: no tiene que contar en la cuenta corriente
  // aunque sea un egreso con proveedor. Es el caso de los pagos históricos.
  mov("m6", "Italiana", d(-90), 777000, "Pago viejo Italiana", "Efectivo"),
];

const IMPUTACIONES_INICIALES: ImputacionPago[] = [
  { id: "i1", movimiento_id: "m2", entrega_id: "e3", monto: 30000, creado_el: d(-6) },
  { id: "i2", movimiento_id: "m3", entrega_id: "e4", monto: 8000, creado_el: d(-2) },
];

/**
 * Cheques de Control de Cheques (SPEC-cheque-a-proveedor.md). Los nombres no coinciden con los de
 * Proveedores a propósito, como pasa en la base real ("italiana santander" vs "Italiana").
 */
const CHEQUES_INICIALES: ChequeBasico[] = [
  { id: "c1", n_cheque: "726", proveedor: "italiana santander", fecha_emision: d(-1), fecha_cobro: d(40), importe: 120000, rechazado: false, observaciones: null, creado_el: d(-1) },
  { id: "c2", n_cheque: "727", proveedor: "PEPSI", fecha_emision: d(-1), fecha_cobro: d(30), importe: 45000, rechazado: false, observaciones: null, creado_el: d(-1) },
  { id: "c3", n_cheque: "700", proveedor: "Italiana", fecha_emision: d(-20), fecha_cobro: d(10), importe: 99000, rechazado: true, observaciones: "ORDEN DE NO PAGAR", creado_el: d(-20) },
  { id: "c4", n_cheque: "650", proveedor: "Miga", fecha_emision: d(-15), fecha_cobro: d(5), importe: 15000, rechazado: false, observaciones: null, creado_el: d(-15) },
  { id: "c5", n_cheque: "800", proveedor: "SANTA RITA", fecha_emision: d(-2), fecha_cobro: d(60), importe: 300000, rechazado: false, observaciones: null, creado_el: d(-2) },
];

let seq = 100;
const nextId = () => `x${(seq += 1)}`;

/**
 * Réplica en memoria de los handlers del Shell: mismas reglas, sin Supabase. Los topes
 * (no imputar más que el saldo de la entrega ni más que el disponible del pago) se
 * revalidan acá igual que en el trigger de la base.
 */
export default function PreviewProveedoresCliente() {
  const [movs, setMovs] = useState<Movimiento[]>(MOVS_INICIALES);
  const [entregas, setEntregas] = useState<EntregaProveedor[]>(ENTREGAS_INICIALES);
  const [imputaciones, setImputaciones] = useState<ImputacionPago[]>(IMPUTACIONES_INICIALES);
  const [corte, setCorte] = useState<string | null>(CORTE);
  const [cheques, setCheques] = useState<ChequeBasico[]>(CHEQUES_INICIALES);
  // El cheque 650 de Miga ya se usó en un pago: no se tiene que ofrecer.
  const [movsConCheque] = useState([{ id: "m-viejo", cheque_id: "c4", proveedor: "Miga", descripcion: "Pago Miga", fecha: d(-15) }]);
  const chequesLibres = chequesSinUsar(cheques, [...movs, ...movsConCheque]);
  const [chequeAAplicar, setChequeAAplicar] = useState<string | null>(null);
  // Notas de crédito (SPEC-notas-credito.md): arrancan vacías, las carga el verificador.
  const [notas, setNotas] = useState<NotaCreditoProveedor[]>([]);
  const [aplicacionesNota, setAplicacionesNota] = useState<AplicacionNotaCredito[]>([]);

  /**
   * Réplica del trigger validar_aplicacion_nota (038): una boleta no se cubre por más de su monto
   * sumando pagos y notas, y una nota no se aplica por más de su monto. Recibe el estado actual para
   * validar un lote entero, como haría la base fila por fila.
   */
  function validarNotas(
    nuevas: { nota_id: string; entrega_id: string; monto: number }[],
    notasAhora: NotaCreditoProveedor[],
    aplicadasAhora: AplicacionNotaCredito[],
  ): string | null {
    const c = (n: number) => Math.round(Number(n) * 100);
    const acumuladas: { nota_id: string; entrega_id: string; monto: number }[] = [...aplicadasAhora];
    for (const a of nuevas) {
      const entrega = entregas.find((e) => e.id === a.entrega_id);
      const nota = notasAhora.find((n) => n.id === a.nota_id);
      if (!entrega || !nota || c(a.monto) <= 0) return "No se pudo aplicar la nota de crédito. Probá de nuevo.";
      const cubierto =
        imputaciones.filter((i) => i.entrega_id === a.entrega_id).reduce((t, i) => t + c(i.monto), 0) +
        acumuladas.filter((x) => x.entrega_id === a.entrega_id).reduce((t, x) => t + c(x.monto), 0);
      const aplicadoNota = acumuladas.filter((x) => x.nota_id === a.nota_id).reduce((t, x) => t + c(x.monto), 0);
      if (cubierto + c(a.monto) > c(entrega.monto) || aplicadoNota + c(a.monto) > c(nota.monto)) {
        return "La nota ya no tiene tanto saldo, o la boleta ya está cubierta. Recargá la página.";
      }
      acumuladas.push(a);
    }
    return null;
  }

  async function aplicarNotas(nuevas: { nota_id: string; entrega_id: string; monto: number }[], notasAhora = notas) {
    const err = validarNotas(nuevas, notasAhora, aplicacionesNota);
    if (err) return err;
    setAplicacionesNota((prev) => [...prev, ...nuevas.map((a) => ({ ...a, id: nextId(), creado_el: new Date().toISOString() }))]);
    return null;
  }

  async function addNota(nueva: NuevaNotaCredito, aplicar: { entrega_id: string; monto: number } | null) {
    const nota: NotaCreditoProveedor = { ...nueva, id: nextId(), creado_el: new Date().toISOString(), creado_por: null };
    const notasAhora = [...notas, nota];
    setNotas(notasAhora);
    if (aplicar) {
      const err = await aplicarNotas([{ nota_id: nota.id, ...aplicar }], notasAhora);
      if (err) return `La nota de crédito se guardó, pero no se pudo aplicar a la boleta: quedó a favor. ${err}`;
    }
    return null;
  }

  /** Réplica de aplicarCheque del Shell: un egreso vinculado al cheque, sin crear otro, y su reparto. */
  async function aplicarCheque(cheque: ChequeBasico, proveedor: string, entregaPrimeroId?: string | null) {
    if (!chequesLibres.some((c) => c.id === cheque.id)) return "Ese cheque ya está usado en otro pago.";
    const pendientes = entregasConSaldo(entregas, imputaciones, proveedor, aplicacionesNota).filter((e) => e.saldo > 0);
    const { aplicaciones } = repartirCheque(Number(cheque.importe), pendientes, entregaPrimeroId);
    const id = nextId();
    setMovs((prev) => [
      ...prev,
      { ...mov(id, proveedor, cheque.fecha_emision || d(0), Number(cheque.importe), `Pago a ${proveedor} — cheque N° ${cheque.n_cheque}`, "Cheque"), cheque_id: cheque.id, cheque_creado: true },
    ]);
    setImputaciones((prev) => [
      ...prev,
      ...aplicaciones.map((a) => ({ ...a, movimiento_id: id, id: nextId(), creado_el: new Date().toISOString() })),
    ]);
    return null;
  }

  async function addEntrega(nueva: NuevaEntregaProveedor) {
    setEntregas((prev) => [...prev, { ...nueva, id: nextId(), creado_el: new Date().toISOString(), creado_por: null }]);
  }

  function eliminarEntrega(id: string) {
    setEntregas((prev) => prev.filter((e) => e.id !== id));
    setImputaciones((prev) => prev.filter((im) => im.entrega_id !== id));
    setAplicacionesNota((prev) => prev.filter((a) => a.entrega_id !== id));
  }

  const [proveedores, setProveedores] = useState(PROVEEDORES);
  async function setDescuentoProveedor(id: string, pct: number | null) {
    setProveedores((prev) => prev.map((p) => (p.id === id ? { ...p, descuento_pct: pct } : p)));
    return null;
  }

  async function imputar(aplicaciones: { movimiento_id: string; entrega_id: string; monto: number }[]) {
    setImputaciones((prev) => [
      ...prev,
      ...aplicaciones.map((a) => ({ ...a, id: nextId(), creado_el: new Date().toISOString() })),
    ]);
  }

  async function desimputar(id: string) {
    setImputaciones((prev) => prev.filter((im) => im.id !== id));
  }

  async function pagarEntrega(datos: {
    proveedor: string;
    entregaId: string;
    fecha: string;
    monto: number;
    medioPago: MedioPago;
    descripcion: string;
  }) {
    const id = nextId();
    setMovs((prev) => [...prev, mov(id, datos.proveedor, datos.fecha, datos.monto, datos.descripcion, datos.medioPago)]);
    // Como en el Shell: pagar con "Cheque" en un pago nuevo crea un cheque en Control de Cheques.
    if (datos.medioPago === "Cheque") {
      setCheques((prev) => [
        ...prev,
        { id: nextId(), n_cheque: null, proveedor: datos.proveedor, fecha_emision: datos.fecha, fecha_cobro: null, importe: datos.monto, rechazado: false, observaciones: `Generado desde Ingresos y Egresos: ${datos.descripcion}`, creado_el: new Date().toISOString() },
      ]);
    }
    setImputaciones((prev) => [
      ...prev,
      { id: nextId(), movimiento_id: id, entrega_id: datos.entregaId, monto: datos.monto, creado_el: new Date().toISOString() },
    ]);
  }

  /** Réplica de pagarConTransferencia del Shell: un egreso con medio Transferencia y sus aplicaciones. */
  async function pagarTransferencia(datos: {
    proveedor: string;
    fecha: string;
    monto: number;
    descripcion: string;
    aplicaciones: { entrega_id: string; monto: number }[];
  }) {
    const id = nextId();
    setMovs((prev) => [...prev, mov(id, datos.proveedor, datos.fecha, datos.monto, datos.descripcion, "Transferencia")]);
    setImputaciones((prev) => [
      ...prev,
      ...datos.aplicaciones.map((a) => ({ ...a, movimiento_id: id, id: nextId(), creado_el: new Date().toISOString() })),
    ]);
    return { error: null, guardado: true };
  }

  return (
    // minWidth: 0 por lo mismo que en IngresosEgresosShell: el body es flex y sin esto
    // el ancho de la tabla estira el documento entero en móvil.
    <div style={{ fontFamily: "Arial, sans-serif", maxWidth: 1200, width: "100%", minWidth: 0, margin: "0 auto", padding: 20, color: "#1A1A2E", background: "white" }}>
      <h1 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Preview — Cuenta corriente de proveedores</h1>
      <p style={{ fontSize: 12, color: "#888", marginTop: 0, marginBottom: 12 }}>
        Datos ficticios en memoria. Sólo existe en desarrollo.
      </p>
      {/*
        Espejo de lo que sería la pestaña Movimientos. Está acá porque el bug que arregla R9
        no se ve en la pantalla del proveedor —ahí la entrega queda saldada de las dos formas—:
        se ve en que el egreso se duplica, y eso vive en otra pestaña.
      */}
      <p style={{ fontSize: 12, color: "#666", marginBottom: 20, background: "#F8F9FA", borderRadius: 6, padding: "8px 10px" }}>
        Movimientos: <strong data-test="preview-cant-movs">{movs.length}</strong> ·
        {" "}total de egresos <strong data-test="preview-total-egresos">{movs.reduce((a, m) => a + (Number(m.egreso) || 0), 0)}</strong> ·
        {" "}cheques en Control de Cheques <strong data-test="preview-cant-cheques">{cheques.length}</strong> ·
        {" "}sin usar <strong data-test="preview-cheques-libres">{chequesLibres.length}</strong> ·
        {" "}notas de crédito <strong data-test="preview-cant-notas">{notas.length}</strong> ·
        {" "}último egreso <strong data-test="preview-ultimo-mov">
          {movs.length > 0 ? `${movs[movs.length - 1].medio_pago} ${movs[movs.length - 1].egreso} ${movs[movs.length - 1].descripcion}` : "—"}
        </strong>
      </p>
      {/* Espejo del botón "Aplicar a deuda" de Control de Cheques, que lleva a este modal. */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 16 }}>
        {cheques.map((c) => (
          <button
            key={c.id}
            onClick={() => setChequeAAplicar(c.id)}
            style={{ border: "1px solid #ddd", background: "white", borderRadius: 6, padding: "5px 10px", fontSize: 12, cursor: "pointer" }}
            data-test={`preview-aplicar-${c.n_cheque ?? c.id}`}
          >
            Aplicar a deuda: N° {c.n_cheque ?? "s/n"}
          </button>
        ))}
      </div>
      {chequeAAplicar && (
        <AplicarChequeModal
          cheque={cheques.find((c) => c.id === chequeAAplicar) ?? null}
          yaUsado={
            chequesLibres.some((c) => c.id === chequeAAplicar)
              ? null
              : (movs.find((m) => m.cheque_id === chequeAAplicar) ?? ({ id: "", fecha: "", descripcion: "" } as Movimiento))
          }
          movs={movs}
          entregas={entregas}
          imputaciones={imputaciones}
          notas={notas}
          aplicacionesNota={aplicacionesNota}
          corte={corte}
          nombresProveedores={proveedores.map((p) => p.nombre)}
          onAplicar={(c, p) => aplicarCheque(c, p)}
          onCerrar={() => setChequeAAplicar(null)}
        />
      )}
      <CuentaProveedoresTab
        movs={movs}
        entregas={entregas}
        imputaciones={imputaciones}
        notas={notas}
        aplicacionesNota={aplicacionesNota}
        onAddNota={addNota}
        onAplicarNotas={(a) => aplicarNotas(a)}
        onDesaplicarNota={async (id) => setAplicacionesNota((prev) => prev.filter((a) => a.id !== id))}
        onDeleteNota={(id) => {
          setNotas((prev) => prev.filter((n) => n.id !== id));
          setAplicacionesNota((prev) => prev.filter((a) => a.nota_id !== id));
        }}
        proveedores={proveedores}
        esAdmin
        corte={corte}
        onAddEntrega={addEntrega}
        onDeleteEntrega={eliminarEntrega}
        onPagarEntrega={pagarEntrega}
        onPagarTransferencia={pagarTransferencia}
        chequesLibres={chequesLibres}
        onAplicarCheque={aplicarCheque}
        onImputar={imputar}
        onDesimputar={desimputar}
        onSetCorte={async (nuevo) => setCorte(nuevo)}
        onSetDescuentoProveedor={setDescuentoProveedor}
      />
    </div>
  );
}
