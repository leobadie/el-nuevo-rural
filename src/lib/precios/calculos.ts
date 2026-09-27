/*
 * Las cuentas de la calculadora de precios (SPEC-precios.md). El usuario es Responsable
 * Inscripto: el margen se saca sobre precios sin IVA, y el IVA se suma al final.
 *
 * Sin React, para probarlo suelto (`npm run verificar:precios-calculos`).
 */

/** Las dos alícuotas del súper: carnes y despojos (bovinos, ovinos, porcinos, aves…) al 10,5%, el resto al 21%. */
export const ALICUOTAS = [
  { valor: 21, etiqueta: "21%", detalle: "general" },
  { valor: 10.5, etiqueta: "10,5%", detalle: "carnes y despojos: bovinos, ovinos, porcinos, aves…" },
] as const;

export const REDONDEOS = [0, 10, 50, 100] as const;
export const MARGENES_RAPIDOS = [25, 30, 35, 40, 50] as const;

/** Redondea a centavos: evita que 1000/0.6 arrastre decimales de flotante a la vista. */
const aCentavos = (n: number) => Math.round(n * 100) / 100;

/** Hacia arriba al múltiplo elegido (0 = sin redondeo). Nunca baja: redondear no puede comer margen. */
export function redondearArriba(precio: number, paso: number): number {
  if (!paso) return aCentavos(precio);
  // El aCentavos previo evita que 2020.0000000001 salte a 2030.
  return Math.ceil(aCentavos(precio) / paso) * paso;
}

/** El costo neto real: sin IVA y con lo que no se recupera. */
export function costoNeto(costo: number, incluyeIva: boolean, iva: number, otros = 0): number {
  const base = incluyeIva ? costo / (1 + iva / 100) : costo;
  return base + (otros || 0);
}

export interface Precio {
  costoNeto: number;
  /** Precio sin IVA que da el margen pedido, sin redondear. */
  netoExacto: number;
  /** Góndola con IVA, sin redondear. */
  gondolaExacto: number;
  /** Góndola con IVA, redondeado hacia arriba. Es el que se pone en el cartel. */
  gondola: number;
  /** Lo que queda con el precio redondeado. */
  neto: number;
  iva: number;
  ganancia: number;
  /** % sobre la venta sin IVA, con el precio redondeado: nunca menos que el pedido. */
  margenReal: number;
  /** % sobre el costo neto. */
  recargo: number;
}

export interface EntradaPrecio {
  costo: number;
  incluyeIva: boolean;
  iva: number;
  margen: number;
  otros?: number;
  redondeo: number;
}

/** Qué falta o está mal para poder calcular, o null si se puede. */
export function problemaPrecio(e: Pick<EntradaPrecio, "costo" | "margen" | "otros">): string | null {
  if (!(e.costo > 0)) return "Cargá el costo del producto.";
  if (e.otros != null && e.otros < 0) return "Los otros costos no pueden ser negativos.";
  if (!(e.margen >= 0 && e.margen < 100)) return "El margen tiene que ser de 0% a menos de 100%.";
  return null;
}

/** De costo a precio (SPEC 2 a 4). */
export function calcularPrecio(e: EntradaPrecio): Precio | null {
  if (problemaPrecio(e)) return null;
  const cn = costoNeto(e.costo, e.incluyeIva, e.iva, e.otros);
  const netoExacto = cn / (1 - e.margen / 100);
  const gondolaExacto = netoExacto * (1 + e.iva / 100);
  const gondola = redondearArriba(gondolaExacto, e.redondeo);
  return { ...desglose(gondola, cn, e.iva), netoExacto: aCentavos(netoExacto), gondolaExacto: aCentavos(gondolaExacto), gondola };
}

export interface Margen {
  costoNeto: number;
  neto: number;
  iva: number;
  ganancia: number;
  margenReal: number;
  recargo: number;
  /** El precio no llega a cubrir el costo. */
  perdida: boolean;
}

/** De precio a margen (SPEC 5): cuánto deja un precio de góndola. */
export function margenDePrecio(e: { costo: number; incluyeIva: boolean; iva: number; otros?: number; gondola: number }): Margen | null {
  if (!(e.costo > 0) || !(e.gondola > 0) || (e.otros != null && e.otros < 0)) return null;
  const cn = costoNeto(e.costo, e.incluyeIva, e.iva, e.otros);
  const d = desglose(e.gondola, cn, e.iva);
  return { ...d, perdida: d.ganancia < 0 };
}

function desglose(gondola: number, cn: number, iva: number) {
  const neto = gondola / (1 + iva / 100);
  const ganancia = neto - cn;
  return {
    costoNeto: aCentavos(cn),
    neto: aCentavos(neto),
    iva: aCentavos(gondola - neto),
    ganancia: aCentavos(ganancia),
    margenReal: (ganancia / neto) * 100,
    recargo: (ganancia / cn) * 100,
  };
}

/** "1.234,5" o "1234.5" o "$ 1.234": lo que se tipea a mano, a número. Vacío = NaN. */
export function aNumero(texto: string): number {
  const t = texto.trim().replace(/\s|\$|%/g, "");
  if (!t) return NaN;
  if (t.includes(",")) return Number(t.replace(/\./g, "").replace(",", "."));
  if (/^\d{1,3}(\.\d{3})+$/.test(t)) return Number(t.replace(/\./g, ""));
  return Number(t);
}
