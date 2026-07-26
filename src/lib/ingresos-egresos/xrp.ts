const MESES_XRP: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
};

export function normalizarMedioPagoXRP(label: string): string {
  const l = (label || "").toLowerCase();
  if (l.includes("efectivo") || l.includes("contado")) return "Efectivo";
  if (l.includes("tarjeta")) return "Tarjeta de Crédito";
  if (l.includes("cuenta corriente")) return "Cuenta Corriente";
  if (l.includes("no definid")) return "No Definida";
  return "Otros";
}

export interface RendicionXRP {
  fecha: string;
  empresa: string | null;
  venta_total: number | null;
  cobro_total: number | null;
  venta_por_medio: Record<string, number>;
  cobro_por_medio: Record<string, number>;
}

function parseImporte(raw: string): number {
  return parseFloat(raw.replace(/,/g, "")) || 0;
}

export function parseRendicionXRP(xmlText: string): RendicionXRP {
  const doc = new DOMParser().parseFromString(xmlText, "text/xml");
  if (doc.getElementsByTagName("parsererror").length > 0) {
    throw new Error("El archivo no parece ser un export válido de XRP (no se pudo interpretar como XML).");
  }

  const rows = Array.from(doc.getElementsByTagName("Row"));
  const filas: (string | null)[][] = rows.map((row) =>
    Array.from(row.getElementsByTagName("Cell")).map((cell) => {
      const texto = (cell.textContent || "").replace(/ /g, " ").trim();
      return texto === "" ? null : texto;
    }),
  );

  let empresa: string | null = null;
  let fecha = "";
  let fechaConfiable = false;
  let ventaTotal: number | null = null;
  let cobroTotal: number | null = null;
  let seccion: "venta" | "cobro" | null = null;
  const ventaPorMedio: Record<string, number> = {};
  const cobroPorMedio: Record<string, number> = {};

  for (const fila of filas) {
    const c0 = fila[0];
    if (!c0) continue;

    if (c0.startsWith("Empresa:")) {
      empresa = c0.slice("Empresa:".length).trim();
      continue;
    }

    const fechaMatch = c0.match(/^Fecha:\s*(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
    if (fechaMatch) {
      const [, d, m, y] = fechaMatch;
      fecha = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      fechaConfiable = true;
      continue;
    }

    if (c0.includes("Operación: Venta")) {
      seccion = "venta";
      continue;
    }
    if (c0.includes("Operación: Cobro")) {
      seccion = "cobro";
      continue;
    }
    if (c0.includes("Subtotal Operación Venta")) {
      ventaTotal = fila[1] ? parseImporte(fila[1]) : null;
      seccion = null;
      continue;
    }
    if (c0.includes("Subtotal Operación Cobro")) {
      cobroTotal = fila[1] ? parseImporte(fila[1]) : null;
      seccion = null;
      continue;
    }

    if (seccion && fila.length >= 3 && fila[1]) {
      const importe = parseImporte(fila[2] || "0");
      const categoria = normalizarMedioPagoXRP(fila[1]);
      const target = seccion === "venta" ? ventaPorMedio : cobroPorMedio;
      target[categoria] = (target[categoria] || 0) + importe;
      continue;
    }

    if (!fechaConfiable) {
      const largaMatch = c0.match(/(\d{1,2}) de (\w+) de (\d{4})/i);
      if (largaMatch) {
        const [, d, mesNombre, y] = largaMatch;
        const mes = MESES_XRP[mesNombre.toLowerCase()];
        if (mes) {
          fecha = `${y}-${String(mes).padStart(2, "0")}-${d.padStart(2, "0")}`;
        }
      }
    }
  }

  if (!fecha) {
    throw new Error("No se pudo encontrar la fecha de la rendición en el archivo.");
  }
  if (ventaTotal === null && cobroTotal === null) {
    throw new Error("No se encontraron totales de Venta ni de Cobro en el archivo.");
  }

  return { fecha, empresa, venta_total: ventaTotal, cobro_total: cobroTotal, venta_por_medio: ventaPorMedio, cobro_por_medio: cobroPorMedio };
}
