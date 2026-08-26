"use client";

import { useState } from "react";
import CuentaProveedoresTab from "@/app/ingresos-egresos/tabs/CuentaProveedoresTab";
import type {
  EntregaProveedor,
  ImputacionPago,
  MedioPago,
  Movimiento,
  NuevaEntregaProveedor,
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

  async function addEntrega(nueva: NuevaEntregaProveedor) {
    setEntregas((prev) => [...prev, { ...nueva, id: nextId(), creado_el: new Date().toISOString(), creado_por: null }]);
  }

  function eliminarEntrega(id: string) {
    setEntregas((prev) => prev.filter((e) => e.id !== id));
    setImputaciones((prev) => prev.filter((im) => im.entrega_id !== id));
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
    setImputaciones((prev) => [
      ...prev,
      { id: nextId(), movimiento_id: id, entrega_id: datos.entregaId, monto: datos.monto, creado_el: new Date().toISOString() },
    ]);
  }

  return (
    // minWidth: 0 por lo mismo que en IngresosEgresosShell: el body es flex y sin esto
    // el ancho de la tabla estira el documento entero en móvil.
    <div style={{ fontFamily: "Arial, sans-serif", maxWidth: 1200, width: "100%", minWidth: 0, margin: "0 auto", padding: 20, color: "#1A1A2E", background: "white" }}>
      <h1 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Preview — Cuenta corriente de proveedores</h1>
      <p style={{ fontSize: 12, color: "#888", marginTop: 0, marginBottom: 20 }}>
        Datos ficticios en memoria. Sólo existe en desarrollo.
      </p>
      <CuentaProveedoresTab
        movs={movs}
        entregas={entregas}
        imputaciones={imputaciones}
        proveedores={PROVEEDORES}
        esAdmin
        corte={corte}
        onAddEntrega={addEntrega}
        onDeleteEntrega={eliminarEntrega}
        onPagarEntrega={pagarEntrega}
        onImputar={imputar}
        onDesimputar={desimputar}
        onSetCorte={async (nuevo) => setCorte(nuevo)}
      />
    </div>
  );
}
