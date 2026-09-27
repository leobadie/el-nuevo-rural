/*
 * Las cuentas de la carnicería: los 16 módulos de la "Planilla de Desposte y Escandallo 2026"
 * (Criterio Carnicero) más el historial de medias reses. Ver SPEC-carniceria.md.
 *
 * Las fórmulas son las del Excel, celda por celda; cada módulo cita la que reproduce. Con los
 * datos de ejemplo de la planilla dan los mismos números que el PDF, y eso lo verifica
 * `npm run verificar:carniceria-calculos`.
 *
 * Lo que en el Excel dice "sale del módulo N" acá se completa solo (origen "auto"). Un valor
 * cargado a mano siempre gana; si no hay ni cálculo ni carga, queda el de la carnicería de
 * ejemplo de la planilla (origen "ejemplo"), que es lo que ve el usuario la primera vez.
 *
 * Este archivo no importa nada del proyecto: el script de verificación lo transpila suelto.
 */
import type { Corte, Especie, GastoCarniceria, IngresoPollo, MediaRes, Parametros } from "./types";

// ============================================================================
// Formato
// ============================================================================

/** El FIXED() del Excel en castellano: miles con punto y decimales con coma. */
export function fix(n: number, decimales = 0): string {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("es-AR", { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
}

/** Número tipeado a mano: acepta "10.600", "10600", "2,6" y "2.6". */
export function parseNumero(texto: string): number | null {
  const t = texto.trim().replace(/\s|\$|%/g, "");
  if (!t) return null;
  let normal: string;
  if (t.includes(",")) {
    // Con coma, la coma es el decimal y los puntos son miles.
    normal = t.replace(/\./g, "").replace(",", ".");
  } else if (/^-?\d{1,3}(\.\d{3})+$/.test(t)) {
    // "10.600" o "1.446.120": puntos de miles.
    normal = t.replace(/\./g, "");
  } else {
    normal = t;
  }
  const n = Number(normal);
  return Number.isFinite(n) ? n : null;
}

/** Para mostrar un valor en un campo editable sin separador de miles que confunda. */
export function numeroParaCampo(n: number): string {
  if (!Number.isFinite(n)) return "";
  const redondeado = Math.round(n * 1000) / 1000;
  return String(redondeado).replace(".", ",");
}

// ============================================================================
// Campos: qué carga el usuario en cada módulo
// ============================================================================

export type Origen = "manual" | "auto" | "ejemplo";

export interface DefCampo {
  etiqueta: string;
  unidad: string;
  /** Valor de la carnicería de ejemplo de la planilla (agosto de 2026). */
  ejemplo: number;
  /** Si el valor se completa solo, de dónde sale. */
  fuente?: string;
}

export const CAMPOS: Record<string, DefCampo> = {
  // Datos generales: los usan varios módulos. En el Excel están repetidos en cada pestaña.
  "gen.kilos_mes": { etiqueta: "Kilos de carne que vendés por mes", unidad: "kg", ejemplo: 2142 },
  "gen.medias_mes": { etiqueta: "Medias reses que vendés por mes", unidad: "medias", ejemplo: 26, fuente: "historial (últimos 30 días)" },
  "gen.dias_mes": { etiqueta: "Días que abrís por mes", unidad: "días", ejemplo: 26 },
  "gen.hora_empleado": { etiqueta: "Lo que le pagás por hora a un empleado (con cargas)", unidad: "$/hora", ejemplo: 8000 },

  "m1.kg_factura": { etiqueta: "Kilos de la media res en la factura", unidad: "kg", ejemplo: 110, fuente: "historial (últimos 30 días)" },
  "m1.precio_kg": { etiqueta: "Precio por kilo de la factura", unidad: "$/kg", ejemplo: 10600, fuente: "historial (últimos 30 días)" },
  "m1.hueso": { etiqueta: "Hueso que sale y no se vende", unidad: "kg", ejemplo: 18, fuente: "historial (últimos 30 días)" },
  "m1.grasa": { etiqueta: "Grasa y sebo que sacás", unidad: "kg", ejemplo: 7, fuente: "historial (últimos 30 días)" },
  "m1.merma": { etiqueta: "Merma: romana, oreo, sierra y recorte chico", unidad: "kg", ejemplo: 2.6, fuente: "historial (últimos 30 días)" },
  "m1.grasero": { etiqueta: "Lo que te paga el grasero por kilo", unidad: "$/kg", ejemplo: 800, fuente: "historial (últimos 30 días)" },

  "m2.kg_factura": { etiqueta: "Kilos que dice la factura (peso al gancho)", unidad: "kg", ejemplo: 110, fuente: "historial (últimos 30 días)" },
  "m2.kg_balanza": { etiqueta: "Kilos que marca tu balanza al recibirla", unidad: "kg", ejemplo: 109, fuente: "historial (últimos 30 días)" },
  "m2.precio_kg": { etiqueta: "Precio por kilo de la factura", unidad: "$/kg", ejemplo: 10600, fuente: "módulo 1" },
  "m2.dias_camara": { etiqueta: "Días en cámara antes de despostar", unidad: "días", ejemplo: 2, fuente: "historial (últimos 30 días)" },
  "m2.perdida_dia": { etiqueta: "Peso que pierde por día en la cámara", unidad: "%", ejemplo: 0.5 },
  "m2.medias_semana": { etiqueta: "Medias reses que comprás por semana", unidad: "medias", ejemplo: 6, fuente: "datos generales" },

  "m3.kg_factura": { etiqueta: "Kilos de la media res en la factura", unidad: "kg", ejemplo: 110, fuente: "módulo 1" },
  "m3.precio_kg": { etiqueta: "Precio por kilo de la factura", unidad: "$/kg", ejemplo: 10600, fuente: "módulo 1" },
  "m3.grasa": { etiqueta: "Grasa (al grasero)", unidad: "kg", ejemplo: 7, fuente: "módulo 1" },
  "m3.grasero": { etiqueta: "Lo que te paga el grasero por kilo", unidad: "$/kg", ejemplo: 800, fuente: "módulo 1" },
  "m3.hueso": { etiqueta: "Hueso", unidad: "kg", ejemplo: 18, fuente: "módulo 1" },

  "m4.kg_factura": { etiqueta: "Kilos de la media res en la factura", unidad: "kg", ejemplo: 110, fuente: "módulo 1" },
  "m4.precio_kg": { etiqueta: "Precio por kilo de la factura", unidad: "$/kg", ejemplo: 10600, fuente: "módulo 1" },
  "m4.margen": { etiqueta: "Margen que querés sobre la venta", unidad: "%", ejemplo: 25 },
  "m4.recupero": { etiqueta: "Lo que recuperás por grasa y hueso", unidad: "$", ejemplo: 5600, fuente: "módulo 3" },

  "m5.costo": { etiqueta: "Costo real del kilo", unidad: "$/kg", ejemplo: 14083, fuente: "módulo 1" },
  "m5.recargo": { etiqueta: "Recargo que le ponés al costo", unidad: "%", ejemplo: 30 },
  "m5.margen": { etiqueta: "Margen que querés quedarte de cada venta", unidad: "%", ejemplo: 25 },

  "m6.kg_factura": { etiqueta: "Kilos de la media res de cerdo en la factura", unidad: "kg", ejemplo: 45, fuente: "historial de cerdo (últimos 30 días)" },
  "m6.precio_kg": { etiqueta: "Precio por kilo de la factura", unidad: "$/kg", ejemplo: 5300, fuente: "historial de cerdo (últimos 30 días)" },
  "m6.hueso": { etiqueta: "Hueso que no se vende", unidad: "kg", ejemplo: 5.4, fuente: "historial de cerdo (últimos 30 días)" },
  "m6.grasa": { etiqueta: "Cuero, grasa y tocino que sacás", unidad: "kg", ejemplo: 5, fuente: "historial de cerdo (últimos 30 días)" },
  "m6.merma": { etiqueta: "Recorte y merma", unidad: "kg", ejemplo: 0.9, fuente: "historial de cerdo (últimos 30 días)" },
  "m6.recupero": { etiqueta: "Lo que recuperás por kilo de grasa y cuero", unidad: "$/kg", ejemplo: 500, fuente: "historial de cerdo (últimos 30 días)" },

  "m7.kg": { etiqueta: "Kilos del cajón de pollo", unidad: "kg", ejemplo: 20, fuente: "historial de pollo (últimos 30 días)" },
  "m7.compra": { etiqueta: "Precio de compra por kilo (con IVA)", unidad: "$/kg", ejemplo: 3000, fuente: "historial de pollo (últimos 30 días)" },
  "m7.venta_entero": { etiqueta: "Precio de venta del pollo entero", unidad: "$/kg", ejemplo: 4900 },
  "m7.pechuga_rinde": { etiqueta: "Pechuga con hueso: rinde", unidad: "%", ejemplo: 30 },
  "m7.pechuga_precio": { etiqueta: "Pechuga con hueso: precio", unidad: "$/kg", ejemplo: 9900 },
  "m7.pata_rinde": { etiqueta: "Pata y muslo: rinde", unidad: "%", ejemplo: 31 },
  "m7.pata_precio": { etiqueta: "Pata y muslo: precio", unidad: "$/kg", ejemplo: 4900 },
  "m7.alitas_rinde": { etiqueta: "Alitas: rinde", unidad: "%", ejemplo: 10 },
  "m7.alitas_precio": { etiqueta: "Alitas: precio", unidad: "$/kg", ejemplo: 3500 },
  "m7.carcasa_rinde": { etiqueta: "Carcasa y menudos: rinde", unidad: "%", ejemplo: 26 },
  "m7.carcasa_precio": { etiqueta: "Carcasa y menudos: precio", unidad: "$/kg", ejemplo: 900 },

  "m8.kg_carne": { etiqueta: "Kilos de carne que usás (nalga o cuadrada)", unidad: "kg", ejemplo: 10 },
  "m8.precio_carne": { etiqueta: "Precio de pizarra de esa carne", unidad: "$/kg", ejemplo: 21900 },
  "m8.kg_milanesa": { etiqueta: "Kilos de milanesa terminada que salen", unidad: "kg", ejemplo: 13.2 },
  "m8.insumos": { etiqueta: "Pan rallado, huevo y condimentos de la tanda", unidad: "$", ejemplo: 10600 },
  "m8.minutos": { etiqueta: "Minutos de trabajo de la tanda", unidad: "min", ejemplo: 90 },
  "m8.hora": { etiqueta: "Costo de la hora de trabajo", unidad: "$/hora", ejemplo: 8000, fuente: "datos generales" },
  "m8.precio_milanesa": { etiqueta: "Precio de pizarra de la milanesa", unidad: "$/kg", ejemplo: 20900 },

  "m9.kw_camara": { etiqueta: "Potencia del equipo de la cámara", unidad: "kW", ejemplo: 2.2 },
  "m9.h_camara": { etiqueta: "Horas por día que trabaja el compresor", unidad: "h", ejemplo: 14 },
  "m9.kw_exhibidoras": { etiqueta: "Potencia de las exhibidoras", unidad: "kW", ejemplo: 1.4 },
  "m9.h_exhibidoras": { etiqueta: "Horas por día de las exhibidoras", unidad: "h", ejemplo: 16 },
  "m9.kwh_resto": { etiqueta: "Sierra, picadora, luces y resto (por día)", unidad: "kWh", ejemplo: 3.5 },
  "m9.precio_kwh": { etiqueta: "Precio del kWh con impuestos", unidad: "$/kWh", ejemplo: 365 },
  "m9.kilos_mes": { etiqueta: "Kilos que vendés por mes", unidad: "kg", ejemplo: 2142, fuente: "datos generales" },
  "m9.deja_media": { etiqueta: "Lo que te deja una media res", unidad: "$", ejemplo: 280120, fuente: "módulo 3" },

  // Módulo 10: los gastos fijos salen de Ingresos y Egresos (decisión del usuario, SPEC 7).
  "m10.pct": { etiqueta: "Parte de los gastos fijos del súper que le toca a la carnicería", unidad: "%", ejemplo: 10 },
  "m10.sueldos": { etiqueta: "Sueldos y cargas del personal de la carnicería", unidad: "$/mes", ejemplo: 0 },
  "m10.otros": { etiqueta: "Otros gastos propios (bolsas, bandejas, limpieza)", unidad: "$/mes", ejemplo: 0 },
  "m10.usar_luz_m9": { etiqueta: "Sumar la luz del frío del módulo 9", unidad: "", ejemplo: 1 },
  "m10.luz": { etiqueta: "Luz del frío", unidad: "$/mes", ejemplo: 620865, fuente: "módulo 9" },
  "m10.kilos_mes": { etiqueta: "Kilos que vendés por mes", unidad: "kg", ejemplo: 2142, fuente: "datos generales" },
  "m10.dias_mes": { etiqueta: "Días que abrís por mes", unidad: "días", ejemplo: 26, fuente: "datos generales" },

  "m11.gasto_fijo": { etiqueta: "Gasto fijo del mes", unidad: "$", ejemplo: 4970865, fuente: "módulo 10" },
  "m11.deja_media": { etiqueta: "Lo que te deja cada media res", unidad: "$", ejemplo: 245193, fuente: "módulos 3, 14 y 15" },
  "m11.medias_mes": { etiqueta: "Medias reses que vendés por mes", unidad: "medias", ejemplo: 26, fuente: "datos generales" },

  "m12.limpio": { etiqueta: "Lo que te queda limpio en el mes", unidad: "$", ejemplo: 1404153, fuente: "módulo 11" },
  "m12.horas_dia": { etiqueta: "Horas por día que estás en el local", unidad: "h", ejemplo: 11 },
  "m12.dias_mes": { etiqueta: "Días que abrís por mes", unidad: "días", ejemplo: 26, fuente: "datos generales" },
  "m12.hora_empleado": { etiqueta: "Lo que le pagás por hora a tu empleado (con cargas)", unidad: "$/hora", ejemplo: 8000, fuente: "datos generales" },

  "m13.precio": { etiqueta: "Precio de pizarra del corte", unidad: "$/kg", ejemplo: 17700 },
  "m13.costo": { etiqueta: "Lo que te cuesta el kilo", unidad: "$/kg", ejemplo: 14083, fuente: "módulo 1" },
  "m13.descuento": { etiqueta: "Descuento de la promo", unidad: "%", ejemplo: 10 },
  "m13.kilos_semana": { etiqueta: "Kilos que vendés por semana de ese corte", unidad: "kg", ejemplo: 67 },

  "m14.venta_mes": { etiqueta: "Lo que vendés en el mes", unidad: "$", ejemplo: 37600000 },
  "m14.pct_debito": { etiqueta: "Parte que te pagan con débito o QR", unidad: "%", ejemplo: 50 },
  "m14.com_debito": { etiqueta: "Comisión de débito o QR (con IVA)", unidad: "%", ejemplo: 1 },
  "m14.pct_credito": { etiqueta: "Parte que te pagan con tarjeta de crédito", unidad: "%", ejemplo: 15 },
  "m14.com_credito": { etiqueta: "Comisión de crédito (con IVA)", unidad: "%", ejemplo: 5.3 },
  "m14.precio": { etiqueta: "Precio de pizarra de un corte", unidad: "$/kg", ejemplo: 17700 },

  "m15.kg_dia": { etiqueta: "Kilos que ponés en la exhibidora por día", unidad: "kg", ejemplo: 45 },
  "m15.pct": { etiqueta: "Parte que termina en picada o se tira por color", unidad: "%", ejemplo: 4 },
  "m15.precio_prom": { etiqueta: "Precio promedio de pizarra de esos cortes", unidad: "$/kg", ejemplo: 19800 },
  "m15.precio_picada": { etiqueta: "Precio de la picada", unidad: "$/kg", ejemplo: 10800 },
  "m15.dias_mes": { etiqueta: "Días que abrís por mes", unidad: "días", ejemplo: 26, fuente: "datos generales" },
  "m15.medias_mes": { etiqueta: "Medias reses que vendés por mes", unidad: "medias", ejemplo: 26, fuente: "datos generales" },

  "m16.factura": { etiqueta: "Lo que factura la media res", unidad: "$", ejemplo: 1446120, fuente: "módulo 3" },
  "m16.pagaste": { etiqueta: "Lo que pagaste la media res", unidad: "$", ejemplo: 1166000, fuente: "módulo 3" },
  "m16.kilos": { etiqueta: "Kilos que vendés de esa media res", unidad: "kg", ejemplo: 82.4, fuente: "módulo 1" },
  "m16.gasto_kg": { etiqueta: "Gasto fijo por kilo", unidad: "$/kg", ejemplo: 2321, fuente: "módulo 10" },
  "m16.comision": { etiqueta: "Comisión promedio del cobro", unidad: "%", ejemplo: 1.3, fuente: "módulo 14" },
  "m16.picada": { etiqueta: "Lo que baja a picada por media res", unidad: "$", ejemplo: 16200, fuente: "módulo 15" },
};

/** Los 19 cortes vendibles de la planilla, con los kilos y precios del ejemplo (módulos 3 y 4). */
export const CORTES_EJEMPLO: Omit<Corte, "id">[] = [
  ["Asado (con hueso)", 11.2, 17700, true],
  ["Vacío", 3.6, 21200, false],
  ["Matambre", 1.9, 18200, false],
  ["Falda", 5, 11600, false],
  ["Nalga", 6.4, 21900, false],
  ["Tapa de nalga", 2.2, 18200, false],
  ["Cuadrada", 3.9, 19600, false],
  ["Peceto", 2.1, 23200, false],
  ["Bola de lomo", 4, 19200, false],
  ["Cuadril", 3.4, 21000, false],
  ["Colita de cuadril", 1.1, 23900, false],
  ["Lomo", 2.1, 28700, false],
  ["Bife angosto", 4.6, 18600, false],
  ["Bife ancho", 3.6, 17800, false],
  ["Paleta", 5, 17400, false],
  ["Roast beef y aguja", 7.4, 16500, false],
  ["Tapa de asado", 1.6, 17200, false],
  ["Osobuco", 4.2, 11600, false],
  ["Picada común (recorte)", 9.1, 10800, true],
].map(([nombre, kilos, precio, fijo], i) => ({
  nombre: nombre as string,
  kilos_desposte: kilos as number,
  precio_pizarra: precio as number,
  fijo: fijo as boolean,
  orden: i + 1,
  activo: true,
}));

// ============================================================================
// Historial de medias reses
// ============================================================================

export interface CalculoMediaRes {
  /** Kilos que pagaste y no marcó tu balanza al recibirla. null si no se pesó. */
  romanaKg: number | null;
  romanaPlata: number | null;
  tieneDesposte: boolean;
  vendibles: number | null;
  rendimiento: number | null;
  /** Costo real del kilo vendible: la fórmula del módulo 1 con los datos de esta media res. */
  costoReal: number | null;
}

function tieneDesposte(m: MediaRes): boolean {
  return m.hueso_kg != null && m.grasa_kg != null && m.merma_kg != null;
}

export function calcularMediaRes(m: MediaRes): CalculoMediaRes {
  const kg = Number(m.kg_factura);
  const precio = Number(m.precio_kg);
  const romanaKg = m.kg_balanza != null ? kg - Number(m.kg_balanza) : null;
  const romanaPlata = romanaKg != null ? romanaKg * precio : null;
  if (!tieneDesposte(m)) {
    return { romanaKg, romanaPlata, tieneDesposte: false, vendibles: null, rendimiento: null, costoReal: null };
  }
  const grasa = Number(m.grasa_kg);
  const vendibles = kg - Number(m.hueso_kg) - grasa - Number(m.merma_kg);
  const recupero = grasa * Number(m.precio_grasero ?? 0);
  return {
    romanaKg,
    romanaPlata,
    tieneDesposte: true,
    vendibles,
    rendimiento: kg > 0 ? (vendibles / kg) * 100 : null,
    costoReal: vendibles > 0 ? (kg * precio - recupero) / vendibles : null,
  };
}

/** Días entre dos fechas ISO (YYYY-MM-DD), sin pasar por la zona horaria. */
function diasEntre(desde: string, hasta: string): number {
  const a = Date.UTC(+desde.slice(0, 4), +desde.slice(5, 7) - 1, +desde.slice(8, 10));
  const b = Date.UTC(+hasta.slice(0, 4), +hasta.slice(5, 7) - 1, +hasta.slice(8, 10));
  return Math.round((b - a) / 86400000);
}

/** Si una fecha cae en los últimos 30 días, hoy incluido. Lo futuro no cuenta. */
function enUltimos30(fecha: string, hoy: string): boolean {
  const d = diasEntre(fecha, hoy);
  return d >= 0 && d < 30;
}

/** Las medias reses de los últimos 30 días (hoy incluido) de una especie. */
export function ultimoMes(medias: MediaRes[], especie: Especie, hoy: string): MediaRes[] {
  return medias.filter((m) => m.especie === especie && enUltimos30(m.fecha, hoy));
}

const promedio = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : NaN);

/**
 * Promedios del historial que alimentan los módulos 1, 2 y 6 (SPEC 9). Sólo devuelve lo que se
 * puede calcular: sin medias reses pesadas no hay kg de balanza, sin desposte no hay hueso.
 */
export function promediosHistorial(medias: MediaRes[], especie: Especie, hoy: string) {
  const mes = ultimoMes(medias, especie, hoy);
  const res: Record<string, number> = {};
  if (mes.length === 0) return { cantidad: 0, valores: res };

  // El precio se pondera por kilos: una media res grande pesa más en lo que pagaste.
  const precioPonderado = (xs: MediaRes[]) =>
    xs.reduce((s, m) => s + Number(m.kg_factura) * Number(m.precio_kg), 0) / xs.reduce((s, m) => s + Number(m.kg_factura), 0);

  const despostadas = mes.filter(tieneDesposte);
  const base = despostadas.length ? despostadas : mes;
  res.kg_factura = promedio(base.map((m) => Number(m.kg_factura)));
  res.precio_kg = precioPonderado(base);
  if (despostadas.length) {
    res.hueso = promedio(despostadas.map((m) => Number(m.hueso_kg)));
    res.grasa = promedio(despostadas.map((m) => Number(m.grasa_kg)));
    res.merma = promedio(despostadas.map((m) => Number(m.merma_kg)));
    const conGrasero = despostadas.filter((m) => m.precio_grasero != null);
    if (conGrasero.length) res.grasero = promedio(conGrasero.map((m) => Number(m.precio_grasero)));
  }

  // Romana: factura y balanza de las mismas medias reses, para que la diferencia sea real.
  const pesadas = mes.filter((m) => m.kg_balanza != null);
  if (pesadas.length) {
    res.kg_factura_pesadas = promedio(pesadas.map((m) => Number(m.kg_factura)));
    res.kg_balanza = promedio(pesadas.map((m) => Number(m.kg_balanza)));
  }
  const conCamara = mes.filter((m) => m.dias_camara != null);
  if (conCamara.length) res.dias_camara = promedio(conCamara.map((m) => Number(m.dias_camara)));

  return { cantidad: mes.length, valores: res };
}

export interface ResumenGrupo {
  clave: string;
  cantidad: number;
  kgFactura: number;
  precioPromedio: number;
  /** % de kilos facturados que no marcó tu balanza, sobre las que se pesaron. */
  romanaPct: number | null;
  romanaKgPromedio: number | null;
  romanaPlata: number;
  rendimiento: number | null;
  costoReal: number | null;
  conDesposte: number;
}

/** Totales de un grupo de medias reses: un mes, un abastecedor o los últimos 30 días. */
export function resumir(clave: string, xs: MediaRes[]): ResumenGrupo {
  const kgFactura = xs.reduce((s, m) => s + Number(m.kg_factura), 0);
  const plata = xs.reduce((s, m) => s + Number(m.kg_factura) * Number(m.precio_kg), 0);
  const pesadas = xs.filter((m) => m.kg_balanza != null);
  const romanaKg = pesadas.reduce((s, m) => s + Number(m.kg_factura) - Number(m.kg_balanza), 0);
  const kgPesadas = pesadas.reduce((s, m) => s + Number(m.kg_factura), 0);
  const despostadas = xs.filter(tieneDesposte);
  const kgDesp = despostadas.reduce((s, m) => s + Number(m.kg_factura), 0);
  let vendibles = 0;
  let costoNeto = 0;
  for (const m of despostadas) {
    const c = calcularMediaRes(m);
    vendibles += c.vendibles ?? 0;
    costoNeto += Number(m.kg_factura) * Number(m.precio_kg) - Number(m.grasa_kg) * Number(m.precio_grasero ?? 0);
  }
  return {
    clave,
    cantidad: xs.length,
    kgFactura,
    precioPromedio: kgFactura > 0 ? plata / kgFactura : 0,
    romanaPct: kgPesadas > 0 ? (romanaKg / kgPesadas) * 100 : null,
    romanaKgPromedio: pesadas.length ? romanaKg / pesadas.length : null,
    romanaPlata: pesadas.reduce((s, m) => s + (Number(m.kg_factura) - Number(m.kg_balanza)) * Number(m.precio_kg), 0),
    rendimiento: kgDesp > 0 ? (vendibles / kgDesp) * 100 : null,
    costoReal: vendibles > 0 ? costoNeto / vendibles : null,
    conDesposte: despostadas.length,
  };
}

/** Evolución mes a mes (YYYY-MM), del más reciente al más viejo (SPEC 6). */
export function resumenPorMes(medias: MediaRes[], especie: Especie): ResumenGrupo[] {
  const grupos = new Map<string, MediaRes[]>();
  for (const m of medias.filter((x) => x.especie === especie)) {
    const k = m.fecha.slice(0, 7);
    grupos.set(k, [...(grupos.get(k) ?? []), m]);
  }
  return [...grupos.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([k, xs]) => resumir(k, xs));
}

/** Resumen por abastecedor, el que más medias reses mandó primero (SPEC 6). */
export function resumenPorAbastecedor(medias: MediaRes[], especie: Especie): ResumenGrupo[] {
  const grupos = new Map<string, MediaRes[]>();
  for (const m of medias.filter((x) => x.especie === especie)) {
    const k = m.abastecedor?.trim() || "Sin abastecedor";
    grupos.set(k, [...(grupos.get(k) ?? []), m]);
  }
  return [...grupos.entries()].map(([k, xs]) => resumir(k, xs)).sort((a, b) => b.cantidad - a.cantidad || a.clave.localeCompare(b.clave));
}

// ============================================================================
// Cajones de pollo (SPEC 19 a 23)
// ============================================================================

export interface ResumenPollo {
  clave: string;
  ingresos: number;
  cajones: number;
  kg: number;
  kgPorCajon: number | null;
  /** Ponderado por kilos: un ingreso grande pesa más en lo que pagaste. */
  precioPromedio: number | null;
  total: number;
}

export function resumirPollo(clave: string, xs: IngresoPollo[]): ResumenPollo {
  const cajones = xs.reduce((s, x) => s + Number(x.cajones), 0);
  const kg = xs.reduce((s, x) => s + Number(x.kg_total), 0);
  const total = xs.reduce((s, x) => s + Number(x.kg_total) * Number(x.precio_kg), 0);
  return {
    clave,
    ingresos: xs.length,
    cajones,
    kg,
    kgPorCajon: cajones > 0 ? kg / cajones : null,
    precioPromedio: kg > 0 ? total / kg : null,
    total,
  };
}

export function polloUltimoMes(pollo: IngresoPollo[], hoy: string): IngresoPollo[] {
  return pollo.filter((x) => enUltimos30(x.fecha, hoy));
}

export function resumenPolloPorMes(pollo: IngresoPollo[]): ResumenPollo[] {
  const grupos = new Map<string, IngresoPollo[]>();
  for (const x of pollo) grupos.set(x.fecha.slice(0, 7), [...(grupos.get(x.fecha.slice(0, 7)) ?? []), x]);
  return [...grupos.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([k, xs]) => resumirPollo(k, xs));
}

export function resumenPolloPorProveedor(pollo: IngresoPollo[]): ResumenPollo[] {
  const grupos = new Map<string, IngresoPollo[]>();
  for (const x of pollo) {
    const k = x.proveedor?.trim() || "Sin proveedor";
    grupos.set(k, [...(grupos.get(k) ?? []), x]);
  }
  return [...grupos.entries()].map(([k, xs]) => resumirPollo(k, xs)).sort((a, b) => b.cajones - a.cajones || a.clave.localeCompare(b.clave));
}

// ============================================================================
// Los 16 módulos
// ============================================================================

export interface CampoResuelto extends DefCampo {
  clave: string;
  valor: number;
  origen: Origen;
  /** Lo que valdría si se vuelve a automático (para mostrarlo al lado de un valor pisado). */
  valorAuto: number | null;
}

export interface Resultado {
  etiqueta: string;
  valor: number;
  unidad: string;
  decimales: number;
}

export interface ModuloCalculado {
  numero: number;
  titulo: string;
  pregunta: string;
  campos: CampoResuelto[];
  principal: Resultado;
  frase: string;
  secundarios: Resultado[];
  consejo: string;
}

export interface FilaEscandallo {
  id: string;
  nombre: string;
  kilos: number;
  precio: number;
  plata: number;
  pctPeso: number;
  pctPlata: number;
  /** Grasa y hueso: salen del módulo 1, no de la lista de cortes. */
  derivada: boolean;
}

export interface FilaProrrateo {
  id: string;
  nombre: string;
  kilos: number;
  precio: number;
  fijo: boolean;
  plata: number;
  plataFijos: number;
  precioNuevo: number;
}

export interface FilaPollo {
  parte: string;
  claveRinde: string;
  clavePrecio: string;
  rinde: number;
  precio: number;
  kilos: number;
  plata: number;
}

export interface FilaGasto extends GastoCarniceria {
  /** Lo que le toca a la carnicería: monto × % si está incluido. */
  parte: number;
}

export interface EntradaCarniceria {
  parametros: Parametros;
  cortes: Corte[];
  gastos: GastoCarniceria[];
  medias: MediaRes[];
  /** Cajones de pollo que entraron. Opcional: sin historial el módulo 7 usa lo cargado. */
  pollo?: IngresoPollo[];
  hoy: string;
}

export interface ResultadoCarniceria {
  generales: CampoResuelto[];
  modulos: ModuloCalculado[];
  escandallo: FilaEscandallo[];
  prorrateo: FilaProrrateo[];
  pollo: FilaPollo[];
  gastos: FilaGasto[];
  /** La luz podría estar contada dos veces en el módulo 10 (SPEC 11). */
  avisoLuzDoble: string | null;
  historial: { vaca: number; cerdo: number; pollo: number };
}

/** El IFERROR(…, 0) del Excel: una cuenta que divide por cero da 0, no NaN. */
function f(n: number): number {
  return Number.isFinite(n) ? n : 0;
}

const CARGA = "Cargá los datos de arriba.";

/** Frase explicativa: si alguna cuenta no cierra, el Excel muestra el aviso de carga. */
function frase(numeros: number[], texto: () => string): string {
  return numeros.every(Number.isFinite) ? texto() : CARGA;
}

const r = (etiqueta: string, valor: number, unidad: string, decimales = 0): Resultado => ({ etiqueta, valor: f(valor), unidad, decimales });

const PALABRAS_LUZ = /\b(luz|epec|energ[ií]a|electricidad|edenor|edesur|epe)\b/i;

export function calcularCarniceria(e: EntradaCarniceria): ResultadoCarniceria {
  const p = e.parametros;
  const resueltos = new Map<string, CampoResuelto>();

  /** Valor de un campo: lo cargado a mano gana, después lo automático y por último el ejemplo. */
  function v(clave: string, auto?: number | null): number {
    const def = CAMPOS[clave];
    if (!def) throw new Error(`Campo desconocido: ${clave}`);
    const autoOk = auto != null && Number.isFinite(auto) ? auto : null;
    let valor: number;
    let origen: Origen;
    if (p[clave] != null && Number.isFinite(p[clave])) {
      valor = p[clave];
      origen = "manual";
    } else if (autoOk != null) {
      valor = autoOk;
      origen = "auto";
    } else {
      valor = def.ejemplo;
      origen = "ejemplo";
    }
    resueltos.set(clave, { ...def, clave, valor, origen, valorAuto: autoOk });
    return valor;
  }
  const campos = (...claves: string[]) => claves.map((c) => resueltos.get(c)!);

  const vaca = promediosHistorial(e.medias, "vaca", e.hoy);
  const cerdo = promediosHistorial(e.medias, "cerdo", e.hoy);
  const polloMes = resumirPollo("30 días", polloUltimoMes(e.pollo ?? [], e.hoy));
  const hv = vaca.valores;
  const hc = cerdo.valores;

  // ---------- Datos generales ----------
  const kilosMes = v("gen.kilos_mes");
  const mediasMes = v("gen.medias_mes", vaca.cantidad > 0 ? vaca.cantidad : null);
  const diasMes = v("gen.dias_mes");
  const horaEmpleado = v("gen.hora_empleado");
  const generales = campos("gen.kilos_mes", "gen.medias_mes", "gen.dias_mes", "gen.hora_empleado");

  const modulos: ModuloCalculado[] = [];

  // ---------- 1. El kilo que vendés ----------
  const m1kg = v("m1.kg_factura", hv.kg_factura);
  const m1precio = v("m1.precio_kg", hv.precio_kg);
  const m1hueso = v("m1.hueso", hv.hueso);
  const m1grasa = v("m1.grasa", hv.grasa);
  const m1merma = v("m1.merma", hv.merma);
  const m1grasero = v("m1.grasero", hv.grasero);
  const vendibles = m1kg - m1hueso - m1grasa - m1merma; // H11
  const costoReal = (m1kg * m1precio - m1grasa * m1grasero) / vendibles; // G8
  modulos.push({
    numero: 1,
    titulo: "El kilo que vendés",
    pregunta: "De los kilos que te facturan, cuántos llegan a la balanza del mostrador",
    campos: campos("m1.kg_factura", "m1.precio_kg", "m1.hueso", "m1.grasa", "m1.merma", "m1.grasero"),
    principal: r("Costo real del kilo que vendés", costoReal, "$/kg"),
    frase: frase([costoReal, costoReal / m1precio], () =>
      `La factura dice ${fix(m1kg, 0)} kilos a ${fix(m1precio, 0)} pesos. A la balanza del mostrador llegan ${fix(vendibles, 1)}: cada kilo que vendés te cuesta ${fix(costoReal, 0)} pesos, un ${fix((costoReal / m1precio - 1) * 100, 1)} % más que el de la factura.`),
    secundarios: [
      r("Kilos que sí vendés", vendibles, "kg", 1),
      r("Rendimiento de la media res", (vendibles / m1kg) * 100, "%", 1),
      r("Plata que pagaste en hueso y grasa", (m1hueso + m1grasa) * m1precio - m1grasa * m1grasero, "$"),
      r("Lo que regalás si costeás sobre la factura", (m1hueso + m1grasa + m1merma) * m1precio - m1grasa * m1grasero, "$"),
    ],
    consejo:
      "El rendimiento no es un número fijo: una vaca da menos carne que un novillito, y una media res pesada trae más hueso en kilos. Pesá el hueso y la grasa de una media res cada tanto y cargala en el historial: el porcentaje del primer día envejece con la hacienda que te mandan.",
  });

  // ---------- 2. Romana y oreo ----------
  const m2kg = v("m2.kg_factura", hv.kg_factura_pesadas);
  const m2bal = v("m2.kg_balanza", hv.kg_balanza);
  const m2precio = v("m2.precio_kg", m1precio);
  const m2dias = v("m2.dias_camara", hv.dias_camara);
  const m2perdida = v("m2.perdida_dia");
  const m2semana = v("m2.medias_semana", mediasMes * 12 / 52);
  const romana = m2kg - m2bal; // H11
  const camara = (m2bal * m2perdida / 100) * m2dias; // H12
  const noLlegan = romana + camara; // G8
  const plataMes = noLlegan * m2precio * m2semana * 52 / 12; // H14
  modulos.push({
    numero: 2,
    titulo: "La romana y el oreo",
    pregunta: "Lo que pagaste y se quedó en la balanza del frigorífico o en la cámara",
    campos: campos("m2.kg_factura", "m2.kg_balanza", "m2.precio_kg", "m2.dias_camara", "m2.perdida_dia", "m2.medias_semana"),
    principal: r("Kilos que pagás y no llegan al mostrador", noLlegan, "kg", 2),
    frase: frase([noLlegan, plataMes], () =>
      `Entre la romana y la cámara se van ${fix(noLlegan, 2)} kilos por media res: ${fix(noLlegan * m2precio, 0)} pesos. Con ${fix(m2semana, 0)} medias por semana son ${fix(plataMes, 0)} pesos por mes que pagaste y nunca pesaste en el mostrador.`),
    secundarios: [
      r("Diferencia de romana", romana, "kg", 2),
      r("Lo que se va en la cámara", camara, "kg", 2),
      r("Plata por media res", noLlegan * m2precio, "$"),
      r("Plata por mes", plataMes, "$"),
    ],
    consejo:
      "La diferencia de romana no se discute a los gritos: se anota. Pesá cada media res cuando baja del camión, cargala en el historial y juntá un mes de datos antes de hablar con el abastecedor. Y controlá tu propia balanza: una balanza sin calibrar también miente.",
  });

  // ---------- 3. Escandallo ----------
  const m3kg = v("m3.kg_factura", m1kg);
  const m3precio = v("m3.precio_kg", m1precio);
  const m3grasa = v("m3.grasa", m1grasa);
  const m3grasero = v("m3.grasero", m1grasero);
  const m3hueso = v("m3.hueso", m1hueso);
  const cortes = e.cortes.filter((c) => c.activo).sort((a, b) => a.orden - b.orden);
  const filasBase = [
    ...cortes.map((c) => ({ id: c.id, nombre: c.nombre, kilos: Number(c.kilos_desposte), precio: Number(c.precio_pizarra), derivada: false })),
    { id: "grasa", nombre: "Grasa (al grasero)", kilos: m3grasa, precio: m3grasero, derivada: true },
    { id: "hueso", nombre: "Hueso", kilos: m3hueso, precio: 0, derivada: true },
  ];
  const facturacion = filasBase.reduce((s, x) => s + x.kilos * x.precio, 0); // F38
  const kilosTabla = filasBase.reduce((s, x) => s + x.kilos, 0); // D38
  const costoMedia = m3kg * m3precio; // H12
  const ganancia = facturacion - costoMedia; // G8
  const escandallo: FilaEscandallo[] = filasBase.map((x) => ({
    ...x,
    plata: x.kilos * x.precio,
    pctPeso: f((x.kilos / m3kg) * 100),
    pctPlata: f(((x.kilos * x.precio) / facturacion) * 100),
  }));
  const fijos = cortes.filter((c) => c.fijo);
  const kgFijos = fijos.reduce((s, c) => s + Number(c.kilos_desposte), 0);
  const plataFijos3 = fijos.reduce((s, c) => s + Number(c.kilos_desposte) * Number(c.precio_pizarra), 0);
  const nombresFijos = listaNombres(fijos.map((c) => nombreCorto(c.nombre)));
  modulos.push({
    numero: 3,
    titulo: "Escandallo de la media res",
    pregunta: "Corte por corte: cuánta plata sale de una media res a tus precios de pizarra",
    campos: campos("m3.kg_factura", "m3.precio_kg", "m3.grasa", "m3.grasero", "m3.hueso"),
    principal: r("Lo que te deja la media res", ganancia, "$"),
    frase: frase([ganancia / facturacion], () =>
      `Vendida entera a tu pizarra, la media res factura ${fix(facturacion, 0)} pesos contra ${fix(costoMedia, 0)} que pagaste: te quedan ${fix(ganancia, 0)} pesos, el ${fix((ganancia / facturacion) * 100, 1)} % de lo que cobrás, antes de pagar la luz, el alquiler y los sueldos.`),
    secundarios: [
      r("Facturación de la media res", facturacion, "$"),
      r("Costo de la media res", costoMedia, "$"),
      r("Margen sobre la venta", (ganancia / facturacion) * 100, "%", 1),
      r("Kilos que no aparecen en la tabla", m3kg - kilosTabla, "kg", 1),
    ],
    // B40 del Excel habla del asado y la picada: son los cortes que quedan fijos.
    consejo: fijos.length && Number.isFinite(plataFijos3 / facturacion) && m3kg > 0
      ? `${capitalizar(nombresFijos)} ${fijos.length > 1 ? "son" : "es"} ${fix((kgFijos / m3kg) * 100, 1)} % de los kilos y ${fix((plataFijos3 / facturacion) * 100, 1)} % de la plata. Los kilos que más salen no son los que más dejan: por eso el precio de un corte no se puede mirar solo.`
      : "Los kilos que más salen no son los que más dejan: por eso el precio de un corte no se puede mirar solo.",
  });

  // ---------- 4. La picada que subsidia ----------
  const m4kg = v("m4.kg_factura", m1kg);
  const m4precio = v("m4.precio_kg", m1precio);
  const m4margen = v("m4.margen");
  // D10 del Excel: la fila de grasa del escandallo (el hueso vale 0).
  const m4recupero = v("m4.recupero", m3grasa * m3grasero);
  const necesaria = (m4kg * m4precio - m4recupero) / (1 - m4margen / 100); // H11
  const plataFijos = cortes.reduce((s, c) => s + (c.fijo ? Number(c.kilos_desposte) * Number(c.precio_pizarra) : 0), 0); // H36
  const plataHoy = cortes.reduce((s, c) => s + Number(c.kilos_desposte) * Number(c.precio_pizarra), 0); // G36
  const kilosCortes = cortes.reduce((s, c) => s + Number(c.kilos_desposte), 0); // D36
  const factor = (necesaria - plataFijos) / (plataHoy - plataFijos);
  const suba = (factor - 1) * 100; // G8
  const prorrateo: FilaProrrateo[] = cortes.map((c) => {
    const kilos = Number(c.kilos_desposte);
    const precio = Number(c.precio_pizarra);
    return {
      id: c.id,
      nombre: c.nombre,
      kilos,
      precio,
      fijo: c.fijo,
      plata: kilos * precio,
      plataFijos: c.fijo ? kilos * precio : 0,
      precioNuevo: f(c.fijo ? precio : precio * factor),
    };
  });
  const ejemplos = cortesDeEjemplo(prorrateo);
  modulos.push({
    numero: 4,
    titulo: "La picada que subsidia",
    pregunta: "Si hay cortes que no podés subir, cuánto tienen que subir los demás",
    campos: campos("m4.kg_factura", "m4.precio_kg", "m4.margen", "m4.recupero"),
    principal: r("Lo que tienen que subir los cortes que sí se mueven", suba, "%", 1),
    frase: frase([suba], () =>
      `Con ${fijos.length ? nombresFijos : "ningún corte"} quiet${fijos.length > 1 ? "os" : "o"}, para quedarte con el ${fix(m4margen, 0)} % de lo que cobrás el resto de la pizarra sube ${fix(suba, 1)} %.` +
      (ejemplos.length
        ? " " + capitalizar(ejemplos.map((x) => `${nombreCorto(x.nombre)} pasa de ${fix(x.precio, 0)} a ${fix(x.precioNuevo, 0)} pesos`).join(" y ")) + "."
        : "")),
    secundarios: [
      r("Facturación que necesitás", necesaria, "$"),
      r("Lo que ponen los cortes fijos", plataFijos, "$"),
      r("Lo que facturás hoy", plataHoy, "$"),
      r("Costo parejo por kilo (el que engaña)", (m4kg * m4precio - m4recupero) / kilosCortes, "$/kg"),
    ],
    consejo:
      "Dividir el costo parejo entre todos los kilos da un número que sirve para una sola cosa: engañarte. Con ese número la picada da pérdida y el lomo una fortuna, y ninguno de los dos es cierto. La media res se compra entera y se vende entera: lo que un corte no pone, lo tiene que poner otro.",
  });

  // ---------- 5. Margen no es recargo ----------
  const m5costo = v("m5.costo", Number.isFinite(costoReal) ? costoReal : null);
  const m5recargo = v("m5.recargo");
  const m5margen = v("m5.margen");
  const margenReal = (m5recargo / (100 + m5recargo)) * 100; // G8
  const precioMargen = m5costo / (1 - m5margen / 100); // H13
  const precioRecargo = m5costo * (1 + m5recargo / 100); // H11
  modulos.push({
    numero: 5,
    titulo: "Margen no es recargo",
    pregunta: "Le sumás un porcentaje al costo y te queda otro: cuál es el tuyo",
    campos: campos("m5.costo", "m5.recargo", "m5.margen"),
    principal: r("Margen que realmente te queda", margenReal, "%", 1),
    frase: frase([margenReal, precioMargen], () =>
      `Le sumás ${fix(m5recargo, 0)} % al costo y te quedan ${fix(margenReal, 1)} pesos de cada 100 que cobrás. Para quedarte con ${fix(m5margen, 0)} de cada 100, el recargo tiene que ser ${fix((m5margen / (100 - m5margen)) * 100, 1)} %: el kilo va a ${fix(precioMargen, 0)} pesos, no a ${fix(precioRecargo, 0)}.`),
    secundarios: [
      r("Precio con tu recargo", precioRecargo, "$/kg"),
      r("Recargo que necesitás", (m5margen / (100 - m5margen)) * 100, "%", 1),
      r("Precio para tu margen", precioMargen, "$/kg"),
      r("Diferencia por kilo", precioMargen - precioRecargo, "$/kg"),
    ],
    consejo:
      "El margen se mide sobre lo que cobrás, no sobre lo que pagaste. Sumar el 30 % al costo deja el 23 % de cada venta; para quedarte con el 30 % hay que dividir el costo por 0,70. Se divide, no se suma.",
  });

  // ---------- 6. Media res de cerdo ----------
  const m6kg = v("m6.kg_factura", hc.kg_factura);
  const m6precio = v("m6.precio_kg", hc.precio_kg);
  const m6hueso = v("m6.hueso", hc.hueso);
  const m6grasa = v("m6.grasa", hc.grasa);
  const m6merma = v("m6.merma", hc.merma);
  const m6recupero = v("m6.recupero", hc.grasero);
  const vendCerdo = m6kg - m6hueso - m6grasa - m6merma;
  const costoCerdo = (m6kg * m6precio - m6grasa * m6recupero) / vendCerdo;
  modulos.push({
    numero: 6,
    titulo: "Media res de cerdo",
    pregunta: "El kilo de cerdo que vendés no es el kilo de cerdo que pagaste",
    campos: campos("m6.kg_factura", "m6.precio_kg", "m6.hueso", "m6.grasa", "m6.merma", "m6.recupero"),
    principal: r("Costo real del kilo de cerdo que vendés", costoCerdo, "$/kg"),
    frase: frase([costoCerdo, costoCerdo / m6precio], () =>
      `De ${fix(m6kg, 1)} kilos facturados vendés ${fix(vendCerdo, 1)}. El kilo de cerdo que sale del mostrador te cuesta ${fix(costoCerdo, 0)} pesos, un ${fix((costoCerdo / m6precio - 1) * 100, 1)} % más que el de la factura.`),
    secundarios: [
      r("Kilos que sí vendés", vendCerdo, "kg", 1),
      r("Rendimiento", (vendCerdo / m6kg) * 100, "%", 1),
      r("Costo de la media res", m6kg * m6precio, "$"),
      r("Lo que regalás si costeás sobre la factura", (m6hueso + m6grasa + m6merma) * m6precio - m6grasa * m6recupero, "$"),
    ],
    consejo:
      "El cerdo rinde distinto que la vaca y se vende distinto: la bondiola y el carré salen solos, la paleta y el pechito dependen de la temporada. No le copies el porcentaje de la vaca: pesá una media res de cerdo despostada y cargala en el historial.",
  });

  // ---------- 7. Pollo entero o trozado ----------
  const m7kg = v("m7.kg", polloMes.kgPorCajon);
  const m7compra = v("m7.compra", polloMes.precioPromedio);
  const m7entero = v("m7.venta_entero");
  const partes: [string, string][] = [
    ["Pechuga con hueso", "pechuga"],
    ["Pata y muslo", "pata"],
    ["Alitas", "alitas"],
    ["Carcasa y menudos", "carcasa"],
  ];
  const pollo: FilaPollo[] = partes.map(([parte, k]) => {
    const rinde = v(`m7.${k}_rinde`);
    const precio = v(`m7.${k}_precio`);
    return { parte, claveRinde: `m7.${k}_rinde`, clavePrecio: `m7.${k}_precio`, rinde, precio, kilos: (m7kg * rinde) / 100, plata: (m7kg * rinde / 100) * precio };
  });
  const trozado = pollo.reduce((s, x) => s + x.plata, 0); // G21
  const kilosTrozado = pollo.reduce((s, x) => s + x.kilos, 0); // F21
  const facturaEntero = m7kg * m7entero;
  modulos.push({
    numero: 7,
    titulo: "Pollo entero o trozado",
    pregunta: "El mismo cajón de pollo vendido entero o trozado: cuál te deja más",
    campos: campos("m7.kg", "m7.compra", "m7.venta_entero"),
    principal: r("Lo que ganás de más trozando el cajón", trozado - facturaEntero, "$"),
    frase: frase([trozado], () =>
      `Entero, el cajón factura ${fix(facturaEntero, 0)} pesos. Trozado factura ${fix(trozado, 0)}: ${fix(trozado - facturaEntero, 0)} pesos ${trozado >= facturaEntero ? "más" : "menos"} por cajón, y se pierden ${fix(m7kg - kilosTrozado, 2)} kilos en la mesada.`),
    secundarios: [
      r("Facturación trozado", trozado, "$"),
      r("Facturación entero", facturaEntero, "$"),
      r("Costo del cajón", m7kg * m7compra, "$"),
      r("Margen trozado sobre la venta", ((trozado - m7kg * m7compra) / trozado) * 100, "%", 1),
    ],
    consejo:
      "La carcasa es la trampa del trozado: son muchos kilos que se venden a precio de caldo. Si la pechuga no se vende en el día, trozar puede dejar menos que vender entero. Hacé la cuenta con los precios de tu barrio.",
  });

  // ---------- 8. Milanesas ----------
  const m8kg = v("m8.kg_carne");
  const m8precio = v("m8.precio_carne");
  const m8mila = v("m8.kg_milanesa");
  const m8insumos = v("m8.insumos");
  const m8min = v("m8.minutos");
  const m8hora = v("m8.hora", horaEmpleado);
  const m8pizarra = v("m8.precio_milanesa");
  const manoObra = (m8min / 60) * m8hora; // H14
  const dejaMila = (m8mila * m8pizarra - m8insumos - manoObra) / m8kg - m8precio; // G8
  modulos.push({
    numero: 8,
    titulo: "Milanesas",
    pregunta: "El pan rallado también se pesa: lo que te deja un kilo de nalga hecho milanesa",
    campos: campos("m8.kg_carne", "m8.precio_carne", "m8.kg_milanesa", "m8.insumos", "m8.minutos", "m8.hora", "m8.precio_milanesa"),
    principal: r("Lo que te deja de más cada kilo de carne hecho milanesa", dejaMila, "$/kg"),
    frase: frase([dejaMila], () =>
      `${fix(m8kg, 0)} kilos de carne se vuelven ${fix(m8mila, 1)} de milanesa. ` +
      (m8precio >= m8pizarra
        ? `Aun vendiéndola ${fix(m8precio - m8pizarra, 0)} pesos más barata que la carne, `
        : `Vendiéndola ${fix(m8pizarra - m8precio, 0)} pesos más cara que la carne, `) +
      `cada kilo de carne que pasa por el pan rallado te deja ${fix(dejaMila, 0)} pesos ${dejaMila >= 0 ? "más" : "menos"} que vendido como corte.`),
    secundarios: [
      r("Kilos de milanesa por kilo de carne", m8mila / m8kg, "kg", 2),
      r("Costo del kilo de milanesa", (m8kg * m8precio + m8insumos + manoObra) / m8mila, "$/kg"),
      r("Lo que factura la tanda", m8mila * m8pizarra, "$"),
      r("La mano de obra de la tanda", manoObra, "$"),
    ],
    consejo:
      "Pesá la milanesa terminada, no la carne cruda: el pan rallado y el huevo también pasan por la balanza del mostrador y se cobran a precio de milanesa. Y cargá la hora de trabajo: una milanesa que no paga la mano que la hizo no conviene.",
  });

  // ---------- 9. La luz del frío ----------
  const m9kwc = v("m9.kw_camara");
  const m9hc = v("m9.h_camara");
  const m9kwe = v("m9.kw_exhibidoras");
  const m9he = v("m9.h_exhibidoras");
  const m9resto = v("m9.kwh_resto");
  const m9precio = v("m9.precio_kwh");
  const m9kilos = v("m9.kilos_mes", kilosMes);
  const m9deja = v("m9.deja_media", Number.isFinite(ganancia) ? ganancia : null);
  const kwhDia = m9kwc * m9hc + m9kwe * m9he + m9resto;
  const kwhMes = kwhDia * 30; // H11
  const luzMes = kwhMes * m9precio; // H12
  modulos.push({
    numero: 9,
    titulo: "La luz del frío",
    pregunta: "Cuánto de cada kilo que vendés se lo lleva la factura de luz",
    campos: campos("m9.kw_camara", "m9.h_camara", "m9.kw_exhibidoras", "m9.h_exhibidoras", "m9.kwh_resto", "m9.precio_kwh", "m9.kilos_mes", "m9.deja_media"),
    principal: r("La luz en cada kilo que vendés", luzMes / m9kilos, "$/kg"),
    frase: frase([luzMes / m9kilos, luzMes / m9deja], () =>
      `El frío y las máquinas gastan ${fix(kwhMes, 0)} kWh por mes: ${fix(luzMes, 0)} pesos de luz. Repartidos en ${fix(m9kilos, 0)} kilos, son ${fix(luzMes / m9kilos, 0)} pesos que cada kilo tiene que pagar antes de dejarte algo: la luz se lleva lo que dejan ${fix(luzMes / m9deja, 1)} medias reses por mes.`),
    secundarios: [
      r("kWh por mes", kwhMes, "kWh"),
      r("Factura de luz estimada", luzMes, "$/mes"),
      r("Parte de la cámara", ((m9kwc * m9hc) / kwhDia) * 100, "%", 1),
      r("Medias reses por mes que pagan la luz", luzMes / m9deja, "medias", 1),
    ],
    consejo:
      "La cámara gasta más con la puerta abierta que llena de carne: cada apertura larga obliga al compresor a arrancar otra vez. Revisá el burlete, no metas carne caliente y no la pongas al sol ni al lado de la sierra. La potencia de cada equipo está en la chapa del motor.",
  });

  // ---------- 10. Abrir la persiana ----------
  const m10pct = v("m10.pct");
  const m10sueldos = v("m10.sueldos");
  const m10otros = v("m10.otros");
  const usarLuz = v("m10.usar_luz_m9") >= 0.5;
  const m10luz = v("m10.luz", luzMes);
  const m10kilos = v("m10.kilos_mes", kilosMes);
  const m10dias = v("m10.dias_mes", diasMes);
  const gastos: FilaGasto[] = e.gastos.map((g) => ({ ...g, parte: g.incluido ? (Number(g.monto) * m10pct) / 100 : 0 }));
  const gastosApp = gastos.reduce((s, g) => s + g.parte, 0);
  const luzM10 = usarLuz ? m10luz : 0;
  const gastoMes = gastosApp + m10sueldos + m10otros + luzM10; // H11
  const gastoKg = gastoMes / m10kilos; // G8
  const luzEnApp = gastos.filter((g) => g.incluido && (PALABRAS_LUZ.test(g.descripcion) || PALABRAS_LUZ.test(g.categoria)));
  const avisoLuzDoble =
    usarLuz && luzEnApp.length
      ? `La luz puede estar contada dos veces: sumás la del módulo 9 y también ${luzEnApp.length === 1 ? "el gasto fijo" : "los gastos fijos"} ${listaNombres(luzEnApp.map((g) => `«${g.descripcion}»`))}. Destildá uno de los dos.`
      : null;
  const mayor = [
    { nombre: "los gastos fijos del súper", monto: gastosApp },
    { nombre: "los sueldos", monto: m10sueldos },
    { nombre: "la luz del frío", monto: luzM10 },
    { nombre: "los otros gastos", monto: m10otros },
  ].sort((a, b) => b.monto - a.monto)[0];
  modulos.push({
    numero: 10,
    titulo: "Abrir la persiana",
    pregunta: "Lo que cuesta levantar la persiana, repartido en cada kilo que vendés",
    campos: campos("m10.pct", "m10.sueldos", "m10.otros", "m10.luz", "m10.kilos_mes", "m10.dias_mes"),
    principal: r("Gasto fijo en cada kilo que vendés", gastoKg, "$/kg"),
    frase: frase([gastoKg, gastoMes / m10dias], () =>
      `Levantar la persiana cuesta ${fix(gastoMes, 0)} pesos por mes, ${fix(gastoMes / m10dias, 0)} por día abierto. Cada uno de los ${fix(m10kilos, 0)} kilos que vendés carga ${fix(gastoKg, 0)} pesos de eso antes de dejarte un peso a vos.`),
    secundarios: [
      r("Gasto fijo del mes", gastoMes, "$"),
      r(`Por día abierto (${fix(m10dias, 0)} días)`, gastoMes / m10dias, "$"),
      r("Gastos fijos del súper que le tocan", gastosApp, "$"),
      r(`Parte de ${mayor.nombre}`, (mayor.monto / gastoMes) * 100, "%", 1),
    ],
    consejo:
      "El gasto fijo por kilo baja cuando vendés más kilos, no cuando subís el precio. En un mes flojo el mismo alquiler se reparte en menos kilos y cada uno te cuesta más: el precio que cerraba en diciembre puede no cerrar en febrero.",
  });

  // ---------- 14 y 15 antes que 11: el 11 usa sus resultados ----------
  const m14venta = v("m14.venta_mes");
  const m14pd = v("m14.pct_debito");
  const m14cd = v("m14.com_debito");
  const m14pc = v("m14.pct_credito");
  const m14cc = v("m14.com_credito");
  const m14precio = v("m14.precio");
  const comisionPct = (m14pd * m14cd + m14pc * m14cc) / 100; // H11
  const comisionMes = (m14venta * (m14pd * m14cd + m14pc * m14cc)) / 10000; // G8
  const precioCredito = m14precio / (1 - m14cc / 100); // H13

  const m15kg = v("m15.kg_dia");
  const m15pct = v("m15.pct");
  const m15prom = v("m15.precio_prom");
  const m15picada = v("m15.precio_picada");
  const m15dias = v("m15.dias_mes", diasMes);
  const m15medias = v("m15.medias_mes", mediasMes);
  const kgPicadaDia = (m15kg * m15pct) / 100; // H11
  const picadaMes = kgPicadaDia * (m15prom - m15picada) * m15dias; // G8
  const picadaPorMedia = picadaMes / m15medias;

  // ---------- 11. Punto de equilibrio ----------
  const m11gasto = v("m11.gasto_fijo", gastoMes);
  const dejaAuto = ganancia - (facturacion * comisionPct) / 100 - picadaPorMedia;
  const m11deja = v("m11.deja_media", dejaAuto);
  const m11medias = v("m11.medias_mes", mediasMes);
  const equilibrio = m11gasto / m11deja; // G8
  const limpioMes = m11medias * m11deja - m11gasto; // H12
  modulos.push({
    numero: 11,
    titulo: "Punto de equilibrio",
    pregunta: "Cuántas medias reses tenés que vender por mes para empezar a ganar",
    campos: campos("m11.gasto_fijo", "m11.deja_media", "m11.medias_mes"),
    principal: r("Medias reses para empezar a ganar", equilibrio, "medias", 1),
    frase: frase([equilibrio, limpioMes / m11medias], () =>
      `Las primeras ${fix(equilibrio, 1)} medias reses de cada mes no son ganancia: pagan la persiana. Con las ${fix(m11medias, 0)} que vendés, te ${limpioMes >= 0 ? "quedan" : "faltan"} ${fix(Math.abs(limpioMes), 0)} pesos al mes, que son ${fix(Math.abs(limpioMes) / m11medias, 0)} por media res.`),
    secundarios: [
      r("Medias por semana para cubrir", m11gasto / m11deja / (52 / 12), "medias", 1),
      r("Lo que te queda en el mes", limpioMes, "$"),
      r("Margen de seguridad", ((m11medias - m11gasto / m11deja) / m11medias) * 100, "%", 1),
      r("Ganancia por media res vendida", limpioMes / m11medias, "$"),
    ],
    consejo:
      "El margen de seguridad dice cuánto puede caer la venta antes de que el mes dé pérdida. Si te da menos del 20 %, una semana de lluvia o un aumento del alquiler te dejan trabajando para pagar el local.",
  });

  // ---------- 12. Lo que vale tu hora ----------
  const m12limpio = v("m12.limpio", Number.isFinite(limpioMes) ? limpioMes : null);
  const m12horas = v("m12.horas_dia");
  const m12dias = v("m12.dias_mes", diasMes);
  const m12empleado = v("m12.hora_empleado", horaEmpleado);
  const horasMes = m12horas * m12dias;
  const tuHora = m12limpio / horasMes;
  modulos.push({
    numero: 12,
    titulo: "Lo que vale tu hora",
    pregunta: "Lo que ganás por cada hora que estás detrás del mostrador",
    campos: campos("m12.limpio", "m12.horas_dia", "m12.dias_mes", "m12.hora_empleado"),
    principal: r("Tu hora vale", tuHora, "$/hora"),
    frase: frase([tuHora, tuHora / m12empleado], () =>
      `Trabajás ${fix(horasMes, 0)} horas por mes y te quedan ${fix(m12limpio, 0)} pesos: tu hora vale ${fix(tuHora, 0)} pesos, ${fix(tuHora / m12empleado, 2)} veces la de tu empleado.`),
    secundarios: [
      r("Horas al mes", horasMes, "h"),
      r("Tu hora contra la del empleado", tuHora / m12empleado, "veces", 2),
      r("Lo que cobraría un empleado en tus horas", m12empleado * horasMes, "$"),
      r("Lo que ganás por ser el dueño", m12limpio - m12empleado * horasMes, "$"),
    ],
    consejo:
      "Si tu hora vale menos que la de tu empleado, la pizarra está pagando su sueldo y no el tuyo. Eso no se arregla trabajando más horas: se arregla en el módulo 4, con el precio de los cortes que sí se mueven.",
  });

  // ---------- 13. La promo ----------
  const m13precio = v("m13.precio");
  const m13costo = v("m13.costo", Number.isFinite(costoReal) ? costoReal : null);
  const m13desc = v("m13.descuento");
  const m13kilos = v("m13.kilos_semana");
  const dejaHoy = m13precio - m13costo; // H11
  const dejaPromo = m13precio * (1 - m13desc / 100) - m13costo; // H12
  const kilosEmpate = (m13kilos * dejaHoy) / dejaPromo; // G8
  // Si en promo el kilo ya no deja nada, no hay cantidad de kilos que empate.
  const empateImposible = dejaPromo <= 0;
  modulos.push({
    numero: 13,
    titulo: "La promo que te come el margen",
    pregunta: "Si bajás el precio de un corte, cuántos kilos más tenés que vender para ganar lo mismo",
    campos: campos("m13.precio", "m13.costo", "m13.descuento", "m13.kilos_semana"),
    principal: r("Kilos por semana para ganar lo mismo", empateImposible ? NaN : kilosEmpate, "kg", 1),
    frase: empateImposible
      ? `Con el ${fix(m13desc, 0)} % de descuento el kilo se vende a ${fix(m13precio * (1 - m13desc / 100), 0)} pesos y te cuesta ${fix(m13costo, 0)}: cada kilo que vendés en promo te hace perder plata. No hay cantidad de kilos que empate.`
      : frase([kilosEmpate], () =>
          `Con el ${fix(m13desc, 0)} % de descuento cada kilo te deja ${fix(dejaPromo, 0)} pesos en vez de ${fix(dejaHoy, 0)}. Para ganar lo mismo que hoy tenés que vender ${fix(kilosEmpate, 1)} kilos por semana: un ${fix((dejaHoy / dejaPromo - 1) * 100, 0)} % más.`),
    secundarios: [
      r("Lo que deja el kilo hoy", dejaHoy, "$"),
      r("Lo que deja el kilo en promo", dejaPromo, "$"),
      r("Kilos de más por semana", empateImposible ? NaN : kilosEmpate - m13kilos, "kg", 1),
      r("Venta que tiene que crecer", empateImposible ? NaN : (dejaHoy / dejaPromo - 1) * 100, "%", 1),
    ],
    consejo:
      "Una promo que no trae clientes nuevos es un regalo a los de siempre. Antes de bajar un precio, fijate si ese corte ya sale solo: la promo rinde con lo que se queda en la exhibidora, no con lo que se va.",
  });

  // ---------- 14. Lo que se queda el cobro ----------
  modulos.push({
    numero: 14,
    titulo: "Lo que se queda el cobro",
    pregunta: "Cuánto de lo que cobrás se queda en el camino, y el precio que lo cubre",
    campos: campos("m14.venta_mes", "m14.pct_debito", "m14.com_debito", "m14.pct_credito", "m14.com_credito", "m14.precio"),
    principal: r("Lo que se queda el cobro en el mes", comisionMes, "$"),
    frase: frase([comisionMes, precioCredito], () =>
      `De ${fix(m14venta, 0)} pesos vendidos, ${fix(comisionMes, 0)} se quedan en el cobro. Para que un kilo de ${fix(m14precio, 0)} pesos pagado con crédito te deje lo mismo que en efectivo, se cobra ${fix(precioCredito, 0)}: se divide, no se suma.`),
    secundarios: [
      r("Comisión promedio sobre la venta", comisionPct, "%", 2),
      r("Lo que se queda el crédito", (m14venta * m14pc * m14cc) / 10000, "$"),
      r("Precio con crédito que cubre", precioCredito, "$/kg"),
      r("Si sumaras el %, te faltarían", precioCredito - m14precio * (1 + m14cc / 100), "$/kg"),
    ],
    consejo:
      "La comisión se cobra sobre el total que pasa por la tarjeta, recargo incluido. Por eso un recargo del 5 % no cubre una comisión del 5 %: hay que dividir el precio por 0,95. Revisá las comisiones de tu banco y de tu billetera cada tanto: cambian sin aviso.",
  });

  // ---------- 15. Lo que va a picada ----------
  modulos.push({
    numero: 15,
    titulo: "Lo que va a picada",
    pregunta: "Lo que no se vendió hoy mañana es picada: cuánta plata se va por esa puerta",
    campos: campos("m15.kg_dia", "m15.pct", "m15.precio_prom", "m15.precio_picada", "m15.dias_mes", "m15.medias_mes"),
    principal: r("Plata que se va a picada por mes", picadaMes, "$"),
    frase: frase([picadaMes], () =>
      `Cada día ${fix(kgPicadaDia, 1)} kilos de corte pasan a picada y pierden ${fix(m15prom - m15picada, 0)} pesos por kilo. En el mes son ${fix(kgPicadaDia * m15dias, 1)} kilos y ${fix(picadaMes, 0)} pesos que ya habías pagado a precio de corte.`),
    secundarios: [
      r("Kilos por día que bajan a picada", kgPicadaDia, "kg", 1),
      r("Kilos por mes", kgPicadaDia * m15dias, "kg", 1),
      r("Lo que pierde cada kilo", m15prom - m15picada, "$"),
      r("Por media res", picadaPorMedia, "$"),
      r("Plata por año", picadaMes * 12, "$"),
    ],
    consejo:
      "La exhibidora llena vende, pero lo que queda afuera del frío toda la tarde pierde color y peso. Exhibí lo que vas a vender en el día, guardá el resto en la cámara y cortá a pedido lo que se mueve poco.",
  });

  // ---------- 16. Lo que te queda ----------
  const m16fact = v("m16.factura", facturacion);
  const m16pag = v("m16.pagaste", costoMedia);
  const m16kilos = v("m16.kilos", Number.isFinite(vendibles) ? vendibles : null);
  const m16gkg = v("m16.gasto_kg", Number.isFinite(gastoKg) ? gastoKg : null);
  const m16com = v("m16.comision", comisionPct);
  const m16pic = v("m16.picada", Number.isFinite(picadaPorMedia) ? picadaPorMedia : null);
  const queda = m16fact * (1 - m16com / 100) - m16pag - m16kilos * m16gkg - m16pic; // G8
  modulos.push({
    numero: 16,
    titulo: "Lo que te queda por media res",
    pregunta: "Lo que te queda limpio de una media res, después de todo",
    campos: campos("m16.factura", "m16.pagaste", "m16.kilos", "m16.gasto_kg", "m16.comision", "m16.picada"),
    principal: r("Lo que te queda limpio de una media res", queda, "$"),
    frase: frase([queda, queda / m16kilos], () =>
      `De ${fix(m16fact, 0)} pesos que factura la media res, ${fix(m16pag, 0)} vuelven al abastecedor, ${fix(m16kilos * m16gkg, 0)} pagan la persiana, ${fix((m16fact * m16com) / 100, 0)} se quedan en el cobro y ${fix(m16pic, 0)} se van a picada desde la exhibidora. Te ${queda >= 0 ? "quedan" : "faltan"} ${fix(Math.abs(queda), 0)}: ${fix(queda / m16kilos, 0)} pesos por kilo vendido.`),
    secundarios: [
      r("Por kilo vendido", queda / m16kilos, "$/kg"),
      r("Sobre lo que factura", (queda / m16fact) * 100, "%", 1),
      r("Ganancia bruta (antes de gastos)", m16fact - m16pag, "$"),
      r("Lo que se va en gastos", m16kilos * m16gkg + (m16fact * m16com) / 100 + m16pic, "$"),
    ],
    consejo:
      "Éste es el número que más importa y el que menos se mira. Si da negativo no es que vendés poco: es que cada media res que entra te cuesta plata, y vender más la hace más grande. Se arregla en el módulo 4.",
  });

  modulos.sort((a, b) => a.numero - b.numero);
  return {
    generales,
    modulos,
    escandallo,
    prorrateo,
    pollo,
    gastos,
    avisoLuzDoble,
    historial: { vaca: vaca.cantidad, cerdo: cerdo.cantidad, pollo: polloMes.ingresos },
  };
}

// ============================================================================
// Textos
// ============================================================================

/** "Asado (con hueso)" → "el asado"; "Picada común (recorte)" → "la picada". */
function nombreCorto(nombre: string): string {
  const base = nombre.replace(/\s*\(.*\)\s*/g, "").replace(/\s+común$/i, "").trim().toLowerCase();
  const femenino = /^(picada|nalga|tapa|cuadrada|bola|colita|falda|paleta|aguja)\b/.test(base) || /a$/.test(base.split(" ")[0]);
  return `${femenino ? "la" : "el"} ${base}`;
}

function listaNombres(xs: string[]): string {
  if (xs.length <= 1) return xs[0] ?? "";
  return `${xs.slice(0, -1).join(", ")} y ${xs[xs.length - 1]}`;
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Los dos cortes que nombra la frase del módulo 4: lomo y nalga si están, si no los más caros. */
function cortesDeEjemplo(filas: FilaProrrateo[]): FilaProrrateo[] {
  const movibles = filas.filter((x) => !x.fijo && x.precio > 0);
  const preferidos = ["lomo", "nalga"]
    .map((n) => movibles.find((x) => x.nombre.trim().toLowerCase() === n))
    .filter((x): x is FilaProrrateo => !!x);
  if (preferidos.length === 2) return preferidos;
  return [...movibles].sort((a, b) => b.precio - a.precio).slice(0, 2);
}
