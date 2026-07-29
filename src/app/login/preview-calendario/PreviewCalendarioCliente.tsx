"use client";

import CalendarioTab from "@/app/cheques/tabs/CalendarioTab";
import { enriquecerCheques } from "@/lib/cheques/calculos";
import { feriadosNacionales } from "@/lib/cheques/feriados";
import type { Cheque, ChequeTercero, EstadoTercero } from "@/lib/cheques/types";

function d(offset: number): string {
  const x = new Date();
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() + offset);
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

/** Próximo sábado, para tener siempre un cheque en día no hábil (R10.8). */
function proximoSabado(): string {
  const x = new Date();
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() + ((6 - x.getDay() + 7) % 7 || 7));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

/** Sábado de hace dos semanas: día no hábil ya pasado, para el caso del cheque ya pagado. */
function sabadoPasado(): string {
  const x = new Date();
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - (((x.getDay() + 1) % 7 || 7) + 7));
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

/** Primer feriado del mes visible, si el mes tiene alguno (septiembre no tiene). */
function feriadoDelMes(): string | null {
  const hoy = new Date();
  const mes = String(hoy.getMonth() + 1).padStart(2, "0");
  const delMes = feriadosNacionales(hoy.getFullYear())
    .map((f) => f.fecha)
    .filter((f) => f.slice(5, 7) === mes);
  return delMes[0] ?? null;
}

const FERIADO = feriadoDelMes();

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
  // Débito distinto del importe emitido, para verificar R11.
  [d(-4), 700_000, 690_000, "Taller Mecánico", false],
  [d(-10), 2_300_000, 2_300_000, "Fertilizantes Pampa", false],
  // Sábado futuro: el banco no opera, el cobro pasa al hábil siguiente.
  [proximoSabado(), 1_100_000, null, "Corralón del Norte", false],
  // Sábado pasado con el débito completo: ya se cobró, no corresponde anunciar fecha.
  [sabadoPasado(), 800_000, 800_000, "Chapista del Pueblo", false],
  // Feriado del mes, si el mes visible tiene alguno.
  ...(FERIADO
    ? ([[FERIADO, 2_600_000, null, "Agroquímicos del Litoral", false]] as Array<
        [string, number, number | null, string, boolean]
      >)
    : []),
];

/*
 * Cheques de terceros: entran plata los que están En cartera o Depositado.
 * Los Entregado (ya se usaron para pagar) y Rechazado no deben sumar (R12.1).
 */
const MOCK_TERCEROS: Array<[string, number, string, string, EstadoTercero]> = [
  // [fecha_cobro, importe, librador, banco, estado]
  [d(1), 3_000_000, "Cerealera del Centro", "Banco Nación", "En cartera"],
  [d(2), 1_800_000, "Acopio San Justo", "Banco Provincia", "Depositado"],
  [d(2), 450_000, "Molino Los Álamos", "Banco Galicia", "En cartera"],
  [d(5), 5_200_000, "Exportadora Paraná", "BBVA", "En cartera"],
  [d(8), 2_000_000, "Ya lo usé para pagar", "Banco Macro", "Entregado"],
  [d(9), 900_000, "Cheque que rebotó", "Banco Credicoop", "Rechazado"],
];

const tercerosMock: ChequeTercero[] = MOCK_TERCEROS.map(
  ([fecha, importe, librador, banco, estado], i) => ({
    id: `mock-t-${i}`,
    n_cheque: `T-${500 + i}`,
    librador,
    // CUIT real de YPF (dato público) en el primero, para probar el botón "verificar".
    cuit_librador: i === 0 ? "30546689979" : null,
    banco,
    fecha_emision: d(-15),
    fecha_cobro: fecha,
    importe,
    estado,
    entregado_a: estado === "Entregado" ? "Agro Insumos SA" : null,
    fecha_entrega: estado === "Entregado" ? d(-2) : null,
    observaciones: null,
    creado_el: new Date().toISOString(),
    modificado_el: new Date().toISOString(),
  }),
);

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
      <CalendarioTab enriched={enriquecerCheques(cheques)} terceros={tercerosMock} />
    </div>
  );
}
