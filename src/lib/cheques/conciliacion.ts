import { diffDays, toDate } from "./calculos";
import type { ChequeEnriquecido, MovimientoBanco, MovimientoMatcheado } from "./types";

export function parseMovimientoImporte(raw: string): number {
  const limpio = (raw || "").replace(/[^\d,.-]/g, "");
  const normalizado = limpio.replace(/\./g, "").replace(",", ".");
  return Math.abs(parseFloat(normalizado) || 0);
}

interface BloqueEtiquetado {
  fechaRaw: string;
  comprobante: string;
  concepto: string;
  importeRaw: string;
}

function nuevoId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function parseBloquesEtiquetados(texto: string): MovimientoBanco[] {
  const lineas = texto.split("\n").map((l) => l.trim());
  const bloques: BloqueEtiquetado[] = [];
  let actual: BloqueEtiquetado | null = null;
  lineas.forEach((linea) => {
    if (!linea) return;
    const fechaMatch = linea.match(/^fecha\s*:\s*(\d{1,2}[/-]\d{1,2}[/-]\d{2,4})/i);
    if (fechaMatch) {
      if (actual) bloques.push(actual);
      actual = { fechaRaw: fechaMatch[1], comprobante: "", concepto: "", importeRaw: "" };
      return;
    }
    if (!actual) return;
    const compMatch = linea.match(/^comprobante\s*:\s*(.+)/i);
    if (compMatch) {
      actual.comprobante = compMatch[1].trim();
      return;
    }
    const concMatch = linea.match(/^concepto\s*:\s*(.+)/i);
    if (concMatch) {
      actual.concepto = concMatch[1].trim();
      return;
    }
    const montoInline = linea.match(/^monto\s*:\s*(.+)/i);
    if (montoInline) {
      if (montoInline[1].trim()) actual.importeRaw = montoInline[1].trim();
      return;
    }
    if (/^[A-Za-zÀ-ÿ ]+\s*:/.test(linea)) return;
    if (!actual.importeRaw && /\$|\d+[.,]\d/.test(linea)) {
      actual.importeRaw = linea;
    }
  });
  if (actual) bloques.push(actual);

  return bloques
    .filter((b) => b.importeRaw)
    .map((b) => {
      const [d, mo, y] = b.fechaRaw.split(/[/-]/);
      const yyyy = y.length === 2 ? "20" + y : y;
      const fecha = `${yyyy}-${mo.padStart(2, "0")}-${d.padStart(2, "0")}`;
      const descripcion = [b.concepto, b.comprobante ? `Comprobante ${b.comprobante}` : ""]
        .filter(Boolean)
        .join(" — ");
      return {
        id: nuevoId(),
        fecha,
        importe: parseMovimientoImporte(b.importeRaw),
        descripcion,
        comprobante: b.comprobante || undefined,
      };
    });
}

export function parseLineasSimples(texto: string): MovimientoBanco[] {
  const lineas = texto.split("\n").map((l) => l.trim()).filter(Boolean);
  const movimientos: MovimientoBanco[] = [];
  lineas.forEach((linea) => {
    const partes = linea.split(/[\t;]+/).map((p) => p.trim()).filter(Boolean);
    let fecha = "";
    let importe: number | null = null;
    const resto: string[] = [];
    partes.forEach((p) => {
      const fechaMatch = p.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
      const numMatch = p.replace(/\./g, "").replace(",", ".").match(/^-?\$?\s*-?\d+(\.\d+)?$/);
      if (fechaMatch && !fecha) {
        const [, d, m] = fechaMatch;
        let y = fechaMatch[3];
        if (y.length === 2) y = "20" + y;
        fecha = `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
      } else if (numMatch && importe === null) {
        importe = parseMovimientoImporte(p);
      } else {
        resto.push(p);
      }
    });
    if (fecha || importe !== null) {
      movimientos.push({
        id: nuevoId(),
        fecha,
        importe: importe ?? 0,
        descripcion: resto.join(" ").trim(),
      });
    }
  });
  return movimientos;
}

export function parseMovimientosBancarios(texto: string): MovimientoBanco[] {
  if (/^\s*fecha\s*:/im.test(texto)) {
    const bloques = parseBloquesEtiquetados(texto);
    if (bloques.length > 0) return bloques;
  }
  return parseLineasSimples(texto);
}

export function matchMovimientos(
  movimientos: MovimientoBanco[],
  enriched: ChequeEnriquecido[],
): MovimientoMatcheado[] {
  const usados = new Set<string>();
  return movimientos.map((mov) => {
    const movFecha = toDate(mov.fecha);

    if (mov.comprobante) {
      const porComprobante = enriched.find(
        (c) =>
          !usados.has(c.id) &&
          (c.n_cheque || "").trim().toLowerCase() === mov.comprobante!.trim().toLowerCase() &&
          Math.abs((Number(c.importe) || 0) - mov.importe) <= 1,
      );
      if (porComprobante) {
        usados.add(porComprobante.id);
        return { ...mov, cheque: porComprobante, matchPor: "comprobante" as const };
      }
    }

    let mejor: ChequeEnriquecido | null = null;
    let mejorScore: number | null = null;
    enriched.forEach((c) => {
      if (usados.has(c.id)) return;
      const imp = Number(c.importe) || 0;
      const diffImporte = Math.abs(imp - mov.importe);
      if (diffImporte > 1) return;
      const yaPagado = c.estado === "Pagado" ? 1 : 0;
      const fc = toDate(c.fecha_cobro);
      const diffFecha = movFecha && fc ? Math.abs(diffDays(movFecha, fc)) : 999;
      const score = yaPagado * 100000 + diffImporte * 10 + diffFecha;
      if (mejorScore === null || score < mejorScore) {
        mejor = c;
        mejorScore = score;
      }
    });
    if (mejor) usados.add((mejor as ChequeEnriquecido).id);
    return { ...mov, cheque: mejor, matchPor: mejor ? ("importe" as const) : null };
  });
}
