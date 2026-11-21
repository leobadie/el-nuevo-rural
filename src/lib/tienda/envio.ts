// Horario de atención y costo de envío (SPEC-tienda-envio-horarios.md).
// Lógica pura: sin React ni Supabase. La prueba verificacion/tienda-envio.mts.

import { formatoPrecio } from "./formato.ts";

// ---------------------------------------------------------------- horario

/** Franja "HH:MM"–"HH:MM". */
export type Franja = [string, string];
/** Clave "0" (domingo) … "6" (sábado), igual que Date.getDay(). Día sin franjas = cerrado. */
export type Horario = Partial<Record<"0" | "1" | "2" | "3" | "4" | "5" | "6", Franja[]>>;

export const DIAS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"] as const;
const DIAS_CORTOS = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"] as const;
/** Orden en que se muestra la semana: de lunes a domingo. */
export const ORDEN_SEMANA = [1, 2, 3, 4, 5, 6, 0] as const;

/** Argentina no tiene horario de verano: UTC−3 todo el año. */
const DESFASE_AR_MS = -3 * 60 * 60 * 1000;

const HORA = /^([01]?\d|2[0-3]):([0-5]\d)$/;

function aMinutos(h: string): number | null {
  const m = HORA.exec(h.trim());
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
}

/** 480 → "8:00". */
function deMinutos(min: number): string {
  return `${Math.floor(min / 60)}:${String(min % 60).padStart(2, "0")}`;
}

/** "8:00" a partir de "08:00". */
export function horaCorta(h: string): string {
  const min = aMinutos(h);
  return min === null ? h : deMinutos(min);
}

/** Día de la semana y minuto del día en hora argentina, sea cual sea la zona del equipo. */
export function ahoraEnArgentina(fecha: Date): { dia: number; minuto: number } {
  const d = new Date(fecha.getTime() + DESFASE_AR_MS);
  return { dia: d.getUTCDay(), minuto: d.getUTCHours() * 60 + d.getUTCMinutes() };
}

function franjasDe(h: Horario, dia: number): [number, number][] {
  return (h[String(dia) as keyof Horario] ?? [])
    .map(([a, b]) => [aMinutos(a), aMinutos(b)] as const)
    .filter((f): f is readonly [number, number] => f[0] !== null && f[1] !== null && f[1] > f[0])
    .map(([a, b]) => [a, b] as [number, number])
    .sort((x, y) => x[0] - y[0]);
}

/** ¿Hay al menos una franja válida en la semana? Sin horario cargado no se avisa nada. */
export function horarioConfigurado(h: Horario | null | undefined): h is Horario {
  return !!h && [0, 1, 2, 3, 4, 5, 6].some((d) => franjasDe(h, d).length > 0);
}

export type ProximaApertura = { enDias: number; dia: number; hora: string };
export type EstadoHorario =
  | { configurado: false }
  | { configurado: true; abierto: true }
  | { configurado: true; abierto: false; proxima: ProximaApertura };

export function estadoHorario(h: Horario | null | undefined, fecha: Date): EstadoHorario {
  if (!horarioConfigurado(h)) return { configurado: false };
  const { dia, minuto } = ahoraEnArgentina(fecha);
  if (franjasDe(h, dia).some(([a, b]) => minuto >= a && minuto < b)) return { configurado: true, abierto: true };
  for (let enDias = 0; enDias <= 7; enDias++) {
    const d = (dia + enDias) % 7;
    const siguiente = franjasDe(h, d).find(([a]) => enDias > 0 || a > minuto);
    if (siguiente) return { configurado: true, abierto: false, proxima: { enDias, dia: d, hora: deMinutos(siguiente[0]) } };
  }
  return { configurado: false }; // inalcanzable: horarioConfigurado garantiza alguna franja
}

/** "hoy a las 17:00", "mañana a las 8:00", "el lunes a las 8:00". */
export function textoProxima(p: ProximaApertura): string {
  const cuando = p.enDias === 0 ? "hoy" : p.enDias === 1 ? "mañana" : `el ${DIAS[p.dia]}`;
  return `${cuando} a las ${p.hora}`;
}

/** Horario de la semana en una línea, agrupando días seguidos iguales: "Lun a Sáb 8:00–13:00 y 17:00–21:00 · Dom cerrado". */
export function resumenHorario(h: Horario | null | undefined): string | null {
  if (!horarioConfigurado(h)) return null;
  const texto = (d: number) => {
    const f = franjasDe(h, d);
    return f.length ? f.map(([a, b]) => `${deMinutos(a)}–${deMinutos(b)}`).join(" y ") : "cerrado";
  };
  const grupos: { desde: number; hasta: number; texto: string }[] = [];
  for (const d of ORDEN_SEMANA) {
    const t = texto(d);
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.texto === t) ultimo.hasta = d;
    else grupos.push({ desde: d, hasta: d, texto: t });
  }
  return grupos
    .map((g) => {
      const dias = g.desde === g.hasta ? DIAS_CORTOS[g.desde] : `${DIAS_CORTOS[g.desde]} a ${DIAS_CORTOS[g.hasta]}`;
      return `${dias} ${g.texto}`;
    })
    .join(" · ");
}

/**
 * Valida y normaliza lo cargado en /catalogo: horas HH:MM, cierre después de apertura,
 * hasta 2 franjas por día que no se pisen. Franjas totalmente vacías se descartan.
 */
export function validarHorario(entrada: Record<string, [string, string][]>): { ok: true; horario: Horario } | { ok: false; error: string } {
  const horario: Horario = {};
  for (let d = 0; d <= 6; d++) {
    const crudas = (entrada[String(d)] ?? []).filter(([a, b]) => a.trim() || b.trim());
    if (crudas.length > 2) return { ok: false, error: `El ${DIAS[d]} tiene más de dos franjas.` };
    const franjas: Franja[] = [];
    for (const [a, b] of crudas) {
      const ma = aMinutos(a);
      const mb = aMinutos(b);
      if (ma === null || mb === null) return { ok: false, error: `El ${DIAS[d]}: la hora tiene que ser como 8:00 o 17:30.` };
      if (mb <= ma) return { ok: false, error: `El ${DIAS[d]}: la hora de cierre tiene que ser después de la de apertura.` };
      franjas.push([horaCorta(a), horaCorta(b)]);
    }
    franjas.sort((x, y) => (aMinutos(x[0]) ?? 0) - (aMinutos(y[0]) ?? 0));
    if (franjas.length === 2 && (aMinutos(franjas[1][0]) ?? 0) < (aMinutos(franjas[0][1]) ?? 0)) {
      return { ok: false, error: `El ${DIAS[d]}: las dos franjas se pisan.` };
    }
    if (franjas.length) horario[String(d) as keyof Horario] = franjas;
  }
  return { ok: true, horario };
}

// ---------------------------------------------------------------- envío

export type ConfigEnvio = {
  costo_envio_centavos: number | null;
  envio_gratis_desde_centavos: number | null;
  minimo_envio_centavos: number | null;
};

export type CalculoEnvio = {
  /** Sin costo cargado: se confirma por WhatsApp (como en la etapa 1). */
  aConfirmar: boolean;
  costo: number;
  gratis: boolean;
  /** Cuánto falta para el envío gratis (0 si ya llega o si no hay envío gratis). */
  faltaGratis: number;
  /** Cuánto falta para la compra mínima de envío (0 si llega). */
  faltaMinimo: number;
};

/** Misma regla que tienda_crear_pedido (036): la base recalcula y manda ella. */
export function calcularEnvio(cfg: ConfigEnvio, subtotal: number): CalculoEnvio {
  const minimo = cfg.minimo_envio_centavos ?? 0;
  const faltaMinimo = Math.max(0, minimo - subtotal);
  const costoBase = cfg.costo_envio_centavos ?? 0;
  if (!(costoBase > 0)) return { aConfirmar: true, costo: 0, gratis: false, faltaGratis: 0, faltaMinimo };
  const desde = cfg.envio_gratis_desde_centavos ?? 0;
  const gratis = desde > 0 && subtotal >= desde;
  return {
    aConfirmar: false,
    costo: gratis ? 0 : costoBase,
    gratis,
    faltaGratis: desde > 0 && !gratis ? desde - subtotal : 0,
    faltaMinimo,
  };
}

/** Texto para el resumen y el mensaje: "$ 1.500", "gratis" o "a confirmar". */
export function textoEnvio(c: Pick<CalculoEnvio, "aConfirmar" | "gratis" | "costo">): string {
  if (c.aConfirmar) return "a confirmar";
  if (c.gratis || c.costo === 0) return "gratis";
  return formatoPrecio(c.costo);
}
