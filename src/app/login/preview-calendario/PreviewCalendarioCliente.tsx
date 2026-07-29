"use client";

import CalendarioTab from "@/app/cheques/tabs/CalendarioTab";
import { enriquecerCheques } from "@/lib/cheques/calculos";
import type { Cheque } from "@/lib/cheques/types";

function d(offset: number): string {
  const x = new Date();
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() + offset);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

const MOCK: Array<[string, number, number | null, string, boolean]> = [
  // [fecha_cobro, importe, debito_banco, proveedor, rechazado]
  [d(0), 1_200_000, null, "Agro Insumos SA", false],
  [d(0), 900_000, 900_000, "Semillas del Sur", false],
  [d(1), 4_500_000, null, "Transporte Rossi", false],
  [d(2), 6_500_000, null, "Fertilizantes Pampa", false],
  [d(2), 1_000_000, null, "Repuestos Diesel", false],
  [d(3), 300_000, null, "Ferretería Central", false],
  [d(5), 2_000_000, null, "Combustibles ACA", false],
  [d(8), 8_000_000, null, "Agro Insumos SA", false],
  [d(9), 500_000, null, "Veterinaria Norte", true],
  [d(12), 1_500_000, null, "Semillas del Sur", false],
  [d(-4), 700_000, null, "Taller Mecánico", false],
  [d(-10), 2_300_000, 2_300_000, "Fertilizantes Pampa", false],
];

const cheques: Cheque[] = MOCK.map(([fecha, importe, debito, proveedor, rechazado], i) => ({
  id: `mock-${i}`,
  n_cheque: `0000${100 + i}`,
  proveedor,
  fecha_emision: d(-20),
  fecha_cobro: fecha,
  importe,
  debito_banco: debito,
  rechazado,
  tipo: i % 3 === 0 ? "E-cheque" : "Físico",
  entregado: true,
  observaciones: null,
  creado_el: new Date().toISOString(),
  modificado_el: new Date().toISOString(),
  creado_por: null,
}));

// Un cheque sin fecha de cobro, para verificar el aviso (R3.2)
cheques.push({
  ...cheques[0],
  id: "mock-sin-fecha",
  n_cheque: "000199",
  fecha_cobro: null,
});

export default function PreviewCalendarioCliente() {
  return (
    <div style={{ fontFamily: "Arial, sans-serif", maxWidth: 1200, margin: "0 auto", padding: 20, background: "white", color: "#1A1A2E" }}>
      <CalendarioTab enriched={enriquecerCheques(cheques)} />
    </div>
  );
}
