import type {
  CobroConSaldo,
  CobroMunicipalidad,
  EstadoFactura,
  FacturaConSaldo,
  FacturaMunicipalidad,
  ImputacionCobro,
  ResumenMunicipalidad,
} from "./types";

/*
 * Este archivo sólo importa tipos a propósito: así verificacion/municipalidad-calculos.mts
 * lo puede transpilar y probar con node suelto, sin resolver el alias "@/".
 */

/**
 * Los montos vienen de columnas numeric(14,2), que supabase-js entrega como string o number.
 * Se trabaja en centavos enteros para que "¿ya está cobrada?" no falle por redondeo binario.
 */
export const centavos = (n: unknown): number => Math.round((Number(n) || 0) * 100);
const pesos = (c: number): number => c / 100;

/** Días enteros entre dos fechas ISO (YYYY-MM-DD), sin que la zona horaria mueva el resultado. */
export function diasEntre(desde: string, hasta: string): number {
  const utc = (iso: string) => {
    const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(hasta) - utc(desde)) / 86_400_000);
}

function sumaPorClave(imputaciones: ImputacionCobro[], clave: "factura_id" | "cobro_id"): Map<string, number> {
  const map = new Map<string, number>();
  for (const i of imputaciones) map.set(i[clave], (map.get(i[clave]) ?? 0) + centavos(i.monto));
  return map;
}

/** Facturas con lo cobrado y el saldo, de la más vieja a la más nueva. */
export function facturasConSaldo(
  facturas: FacturaMunicipalidad[],
  imputaciones: ImputacionCobro[],
  hoy: string,
): FacturaConSaldo[] {
  const porFactura = sumaPorClave(imputaciones, "factura_id");
  return facturas
    .map((f) => {
      const montoC = centavos(f.monto);
      const cobradoC = Math.min(porFactura.get(f.id) ?? 0, montoC);
      const saldoC = montoC - cobradoC;
      const estado: EstadoFactura = saldoC === 0 ? "Cobrada" : cobradoC === 0 ? "Pendiente" : "Parcial";
      return {
        ...f,
        monto: pesos(montoC),
        cobrado: pesos(cobradoC),
        saldo: pesos(saldoC),
        estado,
        dias: estado === "Cobrada" ? null : Math.max(0, diasEntre(f.fecha_factura || f.fecha_entrega, hoy)),
      };
    })
    .sort((a, b) =>
      a.fecha_entrega !== b.fecha_entrega
        ? a.fecha_entrega < b.fecha_entrega ? -1 : 1
        : a.creado_el < b.creado_el ? -1 : a.creado_el > b.creado_el ? 1 : 0,
    );
}

/** Cobros con lo aplicado y lo disponible, del más nuevo al más viejo. */
export function cobrosConSaldo(
  cobros: CobroMunicipalidad[],
  imputaciones: ImputacionCobro[],
  facturas: FacturaMunicipalidad[],
): CobroConSaldo[] {
  const numeros = new Map(facturas.map((f) => [f.id, f.numero_factura]));
  return cobros
    .map((c) => {
      const totalC = centavos(c.monto_cobrado) + centavos(c.retenciones);
      const propias = imputaciones.filter((i) => i.cobro_id === c.id);
      const aplicadoC = Math.min(propias.reduce((acc, i) => acc + centavos(i.monto), 0), totalC);
      const porFactura = new Map<string, { ids: string[]; montoC: number }>();
      for (const i of propias) {
        const acc = porFactura.get(i.factura_id) ?? { ids: [], montoC: 0 };
        acc.ids.push(i.id);
        acc.montoC += centavos(i.monto);
        porFactura.set(i.factura_id, acc);
      }
      return {
        ...c,
        monto_cobrado: pesos(centavos(c.monto_cobrado)),
        retenciones: pesos(centavos(c.retenciones)),
        total: pesos(totalC),
        aplicado: pesos(aplicadoC),
        disponible: pesos(totalC - aplicadoC),
        aplicaciones: Array.from(porFactura.entries()).map(([factura_id, a]) => ({
          imputacion_ids: a.ids,
          factura_id,
          numero_factura: numeros.get(factura_id) ?? null,
          monto: pesos(a.montoC),
        })),
      };
    })
    .sort((a, b) =>
      a.fecha !== b.fecha ? (a.fecha < b.fecha ? 1 : -1) : a.creado_el < b.creado_el ? 1 : a.creado_el > b.creado_el ? -1 : 0,
    );
}

export function resumenMunicipalidad(
  facturas: FacturaMunicipalidad[],
  cobros: CobroMunicipalidad[],
  imputaciones: ImputacionCobro[],
  hoy: string,
): ResumenMunicipalidad {
  const conSaldo = facturasConSaldo(facturas, imputaciones, hoy);
  const pendientes = conSaldo.filter((f) => f.estado !== "Cobrada");
  const porCobro = sumaPorClave(imputaciones, "cobro_id");

  const facturadoC = conSaldo.reduce((acc, f) => acc + centavos(f.monto), 0);
  let cobradoC = 0;
  let retenidoC = 0;
  let sinAplicarC = 0;
  for (const c of cobros) {
    const totalC = centavos(c.monto_cobrado) + centavos(c.retenciones);
    cobradoC += totalC;
    retenidoC += centavos(c.retenciones);
    sinAplicarC += totalC - Math.min(porCobro.get(c.id) ?? 0, totalC);
  }

  return {
    facturado: pesos(facturadoC),
    cobrado: pesos(cobradoC),
    retenido: pesos(retenidoC),
    teDebe: pesos(facturadoC - cobradoC),
    facturasPendientes: pendientes.length,
    diasMasVieja: pendientes.reduce<number | null>((max, f) => (f.dias != null && (max == null || f.dias > max) ? f.dias : max), null),
    sinAplicar: pesos(sinAplicarC),
  };
}

/**
 * Reparte un monto contra las facturas con saldo, de la más vieja a la más nueva, hasta que
 * se agote uno de los dos. Recibe las facturas ya ordenadas (como las da facturasConSaldo).
 */
export function repartirFIFO(
  disponible: number,
  facturas: Pick<FacturaConSaldo, "id" | "saldo">[],
): { factura_id: string; monto: number }[] {
  let restanteC = centavos(disponible);
  const salida: { factura_id: string; monto: number }[] = [];
  for (const f of facturas) {
    if (restanteC <= 0) break;
    const saldoC = centavos(f.saldo);
    if (saldoC <= 0) continue;
    const aplicarC = Math.min(restanteC, saldoC);
    salida.push({ factura_id: f.id, monto: pesos(aplicarC) });
    restanteC -= aplicarC;
  }
  return salida;
}

/**
 * Reparte lo disponible de TODOS los cobros (del más viejo al más nuevo) contra las facturas
 * pendientes (de la más vieja a la más nueva).
 *
 * Lleva su propio registro de lo que consume de cada factura: los saldos que recibe se
 * calcularon antes del reparto, y sin eso el segundo cobro volvería a apuntar a una factura
 * que el primero ya cubrió y la base rechazaría la imputación.
 */
export function repartirTodoFIFO(
  cobros: Pick<CobroConSaldo, "id" | "fecha" | "creado_el" | "disponible">[],
  facturas: Pick<FacturaConSaldo, "id" | "saldo">[],
): { cobro_id: string; factura_id: string; monto: number }[] {
  const saldos = new Map(facturas.map((f) => [f.id, centavos(f.saldo)]));
  const ordenados = [...cobros].sort((a, b) =>
    a.fecha !== b.fecha ? (a.fecha < b.fecha ? -1 : 1) : a.creado_el < b.creado_el ? -1 : 1,
  );
  const salida: { cobro_id: string; factura_id: string; monto: number }[] = [];
  for (const c of ordenados) {
    let restanteC = centavos(c.disponible);
    for (const f of facturas) {
      if (restanteC <= 0) break;
      const saldoC = saldos.get(f.id) ?? 0;
      if (saldoC <= 0) continue;
      const aplicarC = Math.min(restanteC, saldoC);
      salida.push({ cobro_id: c.id, factura_id: f.id, monto: pesos(aplicarC) });
      saldos.set(f.id, saldoC - aplicarC);
      restanteC -= aplicarC;
    }
  }
  return salida;
}

/**
 * Valida las aplicaciones de un cobro antes de mandarlas: cada una > 0 y dentro del saldo de su
 * factura, y entre todas no más que el total del cobro. Devuelve el mensaje de error o null.
 * Es la misma regla que el trigger de la base (018), para avisar antes de ir al servidor.
 */
export function validarAplicaciones(
  total: number,
  aplicaciones: { factura_id: string; monto: number }[],
  facturas: Pick<FacturaConSaldo, "id" | "saldo" | "numero_factura">[],
): string | null {
  const porId = new Map(facturas.map((f) => [f.id, f]));
  let sumaC = 0;
  for (const a of aplicaciones) {
    const montoC = centavos(a.monto);
    const f = porId.get(a.factura_id);
    const nombre = f?.numero_factura ? `la factura ${f.numero_factura}` : "una factura";
    if (montoC <= 0) return `El monto a aplicar a ${nombre} tiene que ser mayor a cero.`;
    if (!f || montoC > centavos(f.saldo)) return `A ${nombre} no se le puede aplicar más que su saldo.`;
    sumaC += montoC;
  }
  if (sumaC > centavos(total)) return "Entre todas las facturas no se puede aplicar más que el total del cobro.";
  return null;
}

/** Normaliza un número de factura para comparar duplicados: sin espacios y sin mayúsculas. */
export const claveNumeroFactura = (n: string | null | undefined): string => (n ?? "").replace(/\s+/g, "").toUpperCase();

export function filtrarFacturas(
  facturas: FacturaConSaldo[],
  estado: "pendientes" | "cobradas" | "todas",
  texto: string,
): FacturaConSaldo[] {
  const q = texto.trim().toLowerCase();
  return facturas.filter((f) => {
    if (estado === "pendientes" && f.estado === "Cobrada") return false;
    if (estado === "cobradas" && f.estado !== "Cobrada") return false;
    if (!q) return true;
    return [f.numero_factura, f.orden_compra, f.lugar_entrega, f.detalle].some((v) => v?.toLowerCase().includes(q));
  });
}
