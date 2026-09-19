"use client";

import { useState } from "react";
import MunicipalidadVista, { type HandlersMunicipalidad } from "@/app/municipalidad/MunicipalidadVista";
import { centavos, claveNumeroFactura } from "@/lib/municipalidad/calculos";
import type { CobroMunicipalidad, FacturaMunicipalidad, ImputacionCobro } from "@/lib/municipalidad/types";

function d(offset: number): string {
  const x = new Date();
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() + offset);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

function factura(id: string, numero: string | null, entrega: number, monto: number, extra: Partial<FacturaMunicipalidad> = {}): FacturaMunicipalidad {
  return {
    id,
    fecha_entrega: d(entrega),
    numero_factura: numero,
    fecha_factura: null,
    monto,
    orden_compra: null,
    lugar_entrega: null,
    detalle: null,
    creado_el: `${d(entrega)}T12:00:00.000Z`,
    creado_por: null,
    ...extra,
  };
}

/*
 * Escenario:
 * - 101 cobrada entera por un cobro con retenciones ($380.000 + $20.000).
 * - 102 cobrada a medias ($100.000 de $250.000) por un cobro de $150.000 → quedan $50.000 sin aplicar.
 * - 103 y una sin número, pendientes y entregadas el mismo día: así hay un día con más de una
 *   factura para probar el agrupado en solapas (R3.9).
 * Te debe = 920.000 − 550.000 = 370.000. La pendiente más vieja (102) tiene 40 días.
 */
const FACTURAS: FacturaMunicipalidad[] = [
  factura("f1", "0001-00000101", -75, 400000, { orden_compra: "OC 55/2026", lugar_entrega: "Escuela Sarmiento", detalle: "Módulos alimentarios julio" }),
  factura("f2", "0001-00000102", -40, 250000, { orden_compra: "OC 61/2026", lugar_entrega: "Escuela Belgrano" }),
  factura("f3", "0001-00000103", -20, 180000, { lugar_entrega: "Escuela Sarmiento" }),
  // Mismo día de entrega que la 103, y cargada después: dentro del día va primero.
  factura("f4", null, -20, 90000, { detalle: "Entrega semana 36", creado_el: `${d(-20)}T15:00:00.000Z` }),
];

const COBROS: CobroMunicipalidad[] = [
  { id: "c1", fecha: d(-30), monto_cobrado: 380000, retenciones: 20000, medio_pago: "Transferencia", comprobante: "OP 1234", detalle: null, creado_el: `${d(-30)}T12:00:00.000Z`, creado_por: null },
  { id: "c2", fecha: d(-10), monto_cobrado: 150000, retenciones: 0, medio_pago: "Transferencia", comprobante: "OP 1301", detalle: null, creado_el: `${d(-10)}T12:00:00.000Z`, creado_por: null },
];

const IMPUTACIONES: ImputacionCobro[] = [
  { id: "i1", cobro_id: "c1", factura_id: "f1", monto: 400000, creado_el: d(-30) },
  { id: "i2", cobro_id: "c2", factura_id: "f2", monto: 100000, creado_el: d(-10) },
];

let seq = 100;
const nextId = () => `x${(seq += 1)}`;

/**
 * Réplica en memoria de los handlers del Shell, con las mismas reglas que la base (número de
 * factura único y los topes del trigger de 018), para que el test ejercite también el camino
 * del error del servidor.
 */
export default function PreviewMunicipalidadCliente() {
  const [facturas, setFacturas] = useState(FACTURAS);
  const [cobros, setCobros] = useState(COBROS);
  const [imputaciones, setImputaciones] = useState(IMPUTACIONES);

  function superaTopes(nuevas: { cobro_id: string; factura_id: string; monto: number }[], cobrosActuales = cobros): boolean {
    const todas = [...imputaciones, ...nuevas];
    const suma = (clave: "cobro_id" | "factura_id", id: string) =>
      todas.filter((i) => i[clave] === id).reduce((a, i) => a + centavos(i.monto), 0);
    return nuevas.some((n) => {
      const f = facturas.find((x) => x.id === n.factura_id);
      const c = cobrosActuales.find((x) => x.id === n.cobro_id);
      if (!f || !c) return true;
      return suma("factura_id", f.id) > centavos(f.monto) || suma("cobro_id", c.id) > centavos(c.monto_cobrado) + centavos(c.retenciones);
    });
  }

  const handlers: HandlersMunicipalidad = {
    async onGuardarFactura(datos, id) {
      const clave = claveNumeroFactura(datos.numero_factura);
      if (clave && facturas.some((f) => f.id !== id && claveNumeroFactura(f.numero_factura) === clave)) {
        return "Ya hay una factura cargada con ese número.";
      }
      if (id) {
        setFacturas((prev) => prev.map((f) => (f.id === id ? { ...f, ...datos } : f)));
      } else {
        setFacturas((prev) => [...prev, { ...datos, id: nextId(), creado_el: new Date().toISOString(), creado_por: null }]);
      }
      return null;
    },
    async onEliminarFactura(id) {
      setFacturas((prev) => prev.filter((f) => f.id !== id));
      setImputaciones((prev) => prev.filter((i) => i.factura_id !== id));
      return null;
    },
    async onRegistrarCobro(datos, aplicaciones) {
      const cobro: CobroMunicipalidad = { ...datos, id: nextId(), creado_el: new Date().toISOString(), creado_por: null };
      setCobros((prev) => [...prev, cobro]);
      const nuevas = aplicaciones.map((a) => ({ ...a, cobro_id: cobro.id }));
      if (superaTopes(nuevas, [...cobros, cobro])) {
        return "El cobro se guardó, pero no se pudo aplicar a las facturas. Aplicalo desde la pestaña Cobros.";
      }
      setImputaciones((prev) => [...prev, ...nuevas.map((n) => ({ ...n, id: nextId(), creado_el: new Date().toISOString() }))]);
      return null;
    },
    async onEliminarCobro(id) {
      setCobros((prev) => prev.filter((c) => c.id !== id));
      setImputaciones((prev) => prev.filter((i) => i.cobro_id !== id));
      return null;
    },
    async onImputar(aplicaciones) {
      if (superaTopes(aplicaciones)) return "Esa factura ya no tiene tanto saldo, o el cobro no tiene tanto disponible. Recargá la página.";
      setImputaciones((prev) => [...prev, ...aplicaciones.map((a) => ({ ...a, id: nextId(), creado_el: new Date().toISOString() }))]);
      return null;
    },
    async onDesimputar(ids) {
      setImputaciones((prev) => prev.filter((i) => !ids.includes(i.id)));
      return null;
    },
  };

  return (
    // minWidth: 0 por lo mismo que en el Shell: el body es flex y sin esto el ancho de la
    // tabla estira el documento entero en móvil.
    <div style={{ fontFamily: "Arial, sans-serif", maxWidth: 1200, width: "100%", minWidth: 0, margin: "0 auto", padding: 20, color: "#1A1A2E", background: "white", boxSizing: "border-box" }}>
      <h1 style={{ fontSize: 18, fontWeight: 800, marginBottom: 4 }}>Preview — Cobranzas de la Municipalidad</h1>
      <p style={{ fontSize: 12, color: "#888", marginTop: 0, marginBottom: 16 }}>Datos ficticios en memoria. Sólo existe en desarrollo.</p>
      <MunicipalidadVista facturas={facturas} cobros={cobros} imputaciones={imputaciones} esAdmin handlers={handlers} />
    </div>
  );
}
