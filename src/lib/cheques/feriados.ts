/*
 * Feriados nacionales argentinos, para saber qué días el banco no opera.
 *
 * Se calcula lo que es calculable en vez de copiar una lista por año:
 *  - Los feriados con fecha fija salen de una tabla.
 *  - Los móviles (Carnaval, Jueves y Viernes Santo) se derivan de la fecha de Pascua.
 *  - Los trasladables se corren según la Ley 27.399: si caen martes o miércoles van al
 *    lunes anterior; si caen jueves o viernes, al lunes siguiente.
 *
 * Lo que NO es calculable son los días no laborables con fines turísticos ("puentes"),
 * que el Poder Ejecutivo fija por decreto cada año y cambian de un año a otro. Esos se
 * cargan a mano desde la pantalla del calendario (ver diasPropios).
 */

export type TipoFeriado = "inamovible" | "trasladable" | "movil" | "propio";

export interface Feriado {
  fecha: string; // YYYY-MM-DD
  nombre: string;
  tipo: TipoFeriado;
}

/** Domingo de Pascua (algoritmo de Meeus/Jones/Butcher, calendario gregoriano). */
export function domingoDePascua(anio: number): Date {
  const a = anio % 19;
  const b = Math.floor(anio / 100);
  const c = anio % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mes = Math.floor((h + l - 7 * m + 114) / 31); // 3 = marzo, 4 = abril
  const dia = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(anio, mes - 1, dia);
}

function clave(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${dd}`;
}

function sumarDias(d: Date, dias: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + dias);
  return x;
}

const FIJOS: { mes: number; dia: number; nombre: string }[] = [
  { mes: 1, dia: 1, nombre: "Año Nuevo" },
  { mes: 3, dia: 24, nombre: "Día de la Memoria por la Verdad y la Justicia" },
  { mes: 4, dia: 2, nombre: "Día del Veterano y de los Caídos en Malvinas" },
  { mes: 5, dia: 1, nombre: "Día del Trabajador" },
  { mes: 5, dia: 25, nombre: "Día de la Revolución de Mayo" },
  { mes: 6, dia: 20, nombre: "Paso a la Inmortalidad del Gral. Manuel Belgrano" },
  { mes: 7, dia: 9, nombre: "Día de la Independencia" },
  { mes: 12, dia: 8, nombre: "Inmaculada Concepción de María" },
  { mes: 12, dia: 25, nombre: "Navidad" },
];

const TRASLADABLES: { mes: number; dia: number; nombre: string }[] = [
  { mes: 6, dia: 17, nombre: "Paso a la Inmortalidad del Gral. Martín Miguel de Güemes" },
  { mes: 8, dia: 17, nombre: "Paso a la Inmortalidad del Gral. José de San Martín" },
  { mes: 10, dia: 12, nombre: "Día del Respeto a la Diversidad Cultural" },
  { mes: 11, dia: 20, nombre: "Día de la Soberanía Nacional" },
];

/**
 * Traslado de la Ley 27.399, art. 2: martes y miércoles pasan al lunes anterior;
 * jueves y viernes, al lunes siguiente. Lunes y fines de semana quedan donde están.
 */
export function trasladarFeriado(fecha: Date): Date {
  switch (fecha.getDay()) {
    case 2: // martes
      return sumarDias(fecha, -1);
    case 3: // miércoles
      return sumarDias(fecha, -2);
    case 4: // jueves
      return sumarDias(fecha, 4);
    case 5: // viernes
      return sumarDias(fecha, 3);
    default:
      return fecha;
  }
}

/** Feriados nacionales calculados para un año (sin los días propios del usuario). */
export function feriadosNacionales(anio: number): Feriado[] {
  const out: Feriado[] = [];

  FIJOS.forEach(({ mes, dia, nombre }) => {
    out.push({ fecha: clave(new Date(anio, mes - 1, dia)), nombre, tipo: "inamovible" });
  });

  TRASLADABLES.forEach(({ mes, dia, nombre }) => {
    const original = new Date(anio, mes - 1, dia);
    const movida = trasladarFeriado(original);
    const trasladado = clave(movida) !== clave(original);
    out.push({
      fecha: clave(movida),
      nombre: trasladado ? `${nombre} (trasladado del ${dia}/${mes})` : nombre,
      tipo: "trasladable",
    });
  });

  const pascua = domingoDePascua(anio);
  out.push({ fecha: clave(sumarDias(pascua, -48)), nombre: "Carnaval", tipo: "movil" });
  out.push({ fecha: clave(sumarDias(pascua, -47)), nombre: "Carnaval", tipo: "movil" });
  out.push({ fecha: clave(sumarDias(pascua, -3)), nombre: "Jueves Santo", tipo: "movil" });
  out.push({ fecha: clave(sumarDias(pascua, -2)), nombre: "Viernes Santo", tipo: "movil" });

  return out.sort((a, b) => (a.fecha < b.fecha ? -1 : 1));
}

/**
 * Mapa fecha → nombre para el año pedido, combinando los feriados nacionales con los
 * días propios que cargó el usuario. Si una fecha coincide, gana el nombre del usuario.
 */
export function mapaNoHabiles(anio: number, diasPropios: Feriado[] = []): Map<string, Feriado> {
  const map = new Map<string, Feriado>();
  feriadosNacionales(anio).forEach((f) => {
    const previo = map.get(f.fecha);
    // Dos feriados el mismo día (ej. Malvinas y Jueves Santo en 2026): se muestran juntos.
    if (previo && previo.nombre !== f.nombre) {
      map.set(f.fecha, { ...previo, nombre: `${previo.nombre} · ${f.nombre}` });
    } else {
      map.set(f.fecha, f);
    }
  });
  diasPropios
    .filter((d) => d.fecha.startsWith(String(anio)))
    .forEach((d) => map.set(d.fecha, { ...d, tipo: "propio" }));
  return map;
}

export function esFinDeSemana(fecha: string): boolean {
  const [y, m, d] = fecha.split("-").map(Number);
  const dow = new Date(y, m - 1, d).getDay();
  return dow === 0 || dow === 6;
}

/**
 * Próximo día en que el banco opera, a partir de la fecha dada (excluida).
 * Recorre como máximo 20 días para no quedar en un bucle si algo viene mal cargado.
 */
export function proximoDiaHabil(fecha: string, noHabiles: Map<string, Feriado>): string {
  const [y, m, d] = fecha.split("-").map(Number);
  let cursor = new Date(y, m - 1, d);
  for (let i = 0; i < 20; i++) {
    cursor = sumarDias(cursor, 1);
    const k = clave(cursor);
    if (!esFinDeSemana(k) && !noHabiles.has(k)) return k;
  }
  return fecha;
}
