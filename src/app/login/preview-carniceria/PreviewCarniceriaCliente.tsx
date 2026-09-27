"use client";

import CarniceriaVista, { type HandlersCarniceria } from "@/app/carniceria/CarniceriaVista";
import { CORTES_EJEMPLO } from "@/lib/carniceria/calculos";
import type { Corte, GastoCarniceria, MediaRes } from "@/lib/carniceria/types";

function d(offset: number): string {
  const x = new Date();
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() + offset);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

/*
 * Escenario:
 * - Los 19 cortes de la planilla.
 * - Gastos fijos del súper: uno de luz (para el aviso de luz contada dos veces) y uno de
 *   mercadería que la carnicería no tiene por qué pagar, ya excluido.
 * - Sin medias reses: los módulos arrancan con el ejemplo de la planilla y la verificación
 *   carga las primeras.
 */
const CORTES: Corte[] = CORTES_EJEMPLO.map((c, i) => ({ ...c, id: `c${i + 1}` }));

const GASTOS: GastoCarniceria[] = [
  { id: "g1", descripcion: "Alquiler del local", categoria: "Alquiler", monto: 900000, incluido: true },
  { id: "g2", descripcion: "Ingresos brutos y monotributo", categoria: "Impuestos", monto: 1200000, incluido: true },
  { id: "g3", descripcion: "Contador y seguro", categoria: "Servicios", monto: 300000, incluido: true },
  { id: "g4", descripcion: "Factura de luz EPEC", categoria: "Servicios", monto: 800000, incluido: true },
  { id: "g5", descripcion: "Reposición de mercadería", categoria: "Compras", monto: 5000000, incluido: false },
];

const MEDIAS: MediaRes[] = [];

let seq = 100;
const nextId = () => `x${(seq += 1)}`;
const esperar = () => new Promise((r) => setTimeout(r, 60));

/** Con ?fallar=1 todo guardado falla: sirve para ver que la pantalla deshace el cambio. */
const falla = () => typeof window !== "undefined" && new URLSearchParams(window.location.search).has("fallar");

const handlers: HandlersCarniceria = {
  async guardarParametro() {
    await esperar();
    return falla() ? "No se pudo guardar el dato. Revisá la conexión y probá de nuevo." : null;
  },
  async guardarCorte(corte) {
    await esperar();
    if (falla()) return { error: "No se pudo guardar el corte. Probá de nuevo." };
    return { corte: { ...corte, id: corte.id ?? nextId() } as Corte };
  },
  async guardarGasto() {
    await esperar();
    return falla() ? "No se pudo guardar el gasto. Probá de nuevo." : null;
  },
  async guardarMedia(datos, id) {
    await esperar();
    if (falla()) return { error: "No se pudo guardar la media res. Probá de nuevo." };
    return { media: { ...datos, id: id ?? nextId(), creado_el: new Date().toISOString() } };
  },
  async eliminarMedia() {
    await esperar();
    return falla() ? "No se pudo eliminar la media res." : null;
  },
  async guardarPollo(datos, id) {
    await esperar();
    if (falla()) return { error: "No se pudo guardar el pollo. Probá de nuevo." };
    return { ingreso: { ...datos, id: id ?? nextId(), creado_el: new Date().toISOString() } };
  },
  async eliminarPollo() {
    await esperar();
    return falla() ? "No se pudo eliminar el ingreso de pollo." : null;
  },
};

export default function PreviewCarniceriaCliente() {
  return (
    <div style={{ fontFamily: "Arial, sans-serif", maxWidth: 1200, width: "100%", minWidth: 0, margin: "0 auto", padding: 16, color: "#1A1A2E", background: "white", minHeight: "100vh", boxSizing: "border-box" }}>
      <p style={{ background: "#FEF9E7", padding: "6px 10px", borderRadius: 6, fontSize: 12, margin: "0 0 12px" }}>
        Banco de pruebas de la carnicería con datos ficticios (fecha de referencia {d(0)}). Nada se guarda.
      </p>
      <CarniceriaVista parametrosIniciales={{}} cortesIniciales={CORTES} gastosIniciales={GASTOS} mediasIniciales={MEDIAS} polloInicial={[]} handlers={handlers} />
    </div>
  );
}
