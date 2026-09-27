"use client";

import { useMemo } from "react";
import AdminShell, { type VistaOfertas } from "@/app/cartel/admin/AdminShell";
import { CONFIG_INICIAL } from "@/lib/ofertas/flyer";
import type { Pantalla, Placa } from "@/lib/cartel/types";
import { crearBaseFalsa } from "./baseFalsa";

function d(offset: number): string {
  const x = new Date();
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() + offset);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

function placa(id: string, titulo: string, extra: Partial<Placa> = {}): Placa {
  return {
    id, tipo: "oferta", seccion: "Carnicería", titulo, bajada: null, precio: null, precio_anterior: null,
    unidad: "el kilo", imagen_url: null, color: "#A62C2C", vigencia_desde: null, vigencia_hasta: null,
    duracion_seg: 8, orden: 0, activa: true, en_flyer: false, orden_flyer: 0, ...extra,
  };
}

/*
 * Escenario:
 * - Asado y Vacío ya van al flyer (el vacío primero en el flyer, aunque en el TV va después).
 * - Matambre está marcado pero venció ayer: no entra, se avisa aparte.
 * - Nalga y Pollo entero son ofertas vigentes sin marcar: aparecen para sumar.
 * - "Cartel costilla" es un cartel ya diseñado (tipo imagen): nunca va al flyer.
 * - "Medios de pago" es institucional: tampoco.
 */
const PLACAS: Placa[] = [
  placa("o1", "Asado de tira", { precio: 8990, precio_anterior: 11500, orden: 1, en_flyer: true, orden_flyer: 2 }),
  placa("o2", "Vacío", { precio: 12500, orden: 2, en_flyer: true, orden_flyer: 1 }),
  placa("o3", "Matambre", { precio: 9800, orden: 3, en_flyer: true, orden_flyer: 3, vigencia_hasta: d(-1) }),
  placa("o4", "Nalga", { precio: 13900, precio_anterior: 15200, orden: 4, vigencia_hasta: d(3) }),
  placa("o5", "Pollo entero", { seccion: "Pollería", precio: 3990, orden: 5, color: "#1F3864" }),
  placa("o6", "Cartel costilla", { tipo: "imagen", orden: 6, imagen_url: "/logo.jpg" }),
  placa("o7", "Aceptamos todos los medios de pago", { tipo: "institucional", seccion: null, bajada: "Débito · Crédito · QR", orden: 7, unidad: null }),
];

const PANTALLAS: Pantalla[] = [
  { slug: "carniceria-1", nombre: "Carnicería 1", seccion: "Carnicería", activa: true, orden: 1 },
  { slug: "carniceria-2", nombre: "Carnicería 2", seccion: "Carnicería", activa: true, orden: 2 },
  { slug: "acceso", nombre: "Acceso", seccion: null, activa: true, orden: 3 },
];

export default function PreviewOfertasCliente({ vista }: { vista: VistaOfertas }) {
  // Una base nueva por visita: recargar la página vuelve al escenario de arriba.
  const cliente = useMemo(
    () =>
      crearBaseFalsa({
        cartel_placas: PLACAS.map((p) => ({ ...p })),
        cartel_pantallas: PANTALLAS.map((p) => ({ ...p })),
        cartel_placa_pantalla: [],
        flyer_config: [],
      }),
    [],
  );

  return (
    <>
      <p style={{ background: "#FEF9E7", color: "#1A1A2E", padding: "6px 10px", fontSize: 12, margin: 0 }}>
        Banco de pruebas de ofertas con una base en memoria (fecha de referencia {d(0)}). Nada se guarda.
      </p>
      <AdminShell
        placasIniciales={PLACAS}
        pantallasIniciales={PANTALLAS}
        asignacionesIniciales={[]}
        userId="preview"
        errorInicial={null}
        configFlyerInicial={CONFIG_INICIAL}
        faltaMigracionFlyer={false}
        vistaInicial={vista}
        endpointFlyer="/login/preview-flyer/imagen"
        cliente={cliente}
      />
    </>
  );
}
