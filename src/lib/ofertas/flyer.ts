/*
 * El flyer armado desde la lista de ofertas (SPEC-ofertas.md): qué placas entran, en qué orden,
 * y los datos del encabezado y el pie. Sin React, para poder probarlo suelto
 * (`npm run verificar:ofertas-calculos`).
 */
import { estaVigente } from "@/lib/cartel/placas";
import { MAX_PRODUCTOS } from "@/lib/flyer/calculos";
import type { Placa } from "@/lib/cartel/types";
import type { Flyer, PieFlyer, ProductoFlyer } from "@/lib/flyer/tipos";

/** El encabezado y el pie: lo que no es de ninguna oferta. Una fila en `flyer_config`. */
export interface ConfigFlyer {
  titulo: string;
  seccion: string;
  vigencia: string;
  direccion: string;
  telefono: string;
  horarios: string;
  instagram: string;
}

/** Lo que trae el flyer mientras no se guardó nada: los datos del local ya cargados. */
export const CONFIG_INICIAL: ConfigFlyer = {
  titulo: "Ofertas de la semana",
  seccion: "",
  vigencia: "",
  direccion: "Alvear N°637",
  telefono: "",
  horarios: "Lunes a sábados de 08:15 a 13:30 y de 17:00 a 22:00 · Domingos de 09:00 a 13:30",
  instagram: "@elnuevorural.super",
};

/**
 * Sólo las ofertas con precio se pueden dibujar en el flyer. Un cartel ya diseñado (tipo imagen)
 * trae su precio adentro de la foto, y los institucionales y avisos no tienen precio (SPEC 7).
 */
export function puedeIrAlFlyer(placa: Pick<Placa, "tipo">): boolean {
  return placa.tipo === "oferta";
}

/** Orden del flyer; a igual orden, el del televisor, y después el nombre. */
function compararFlyer(a: Placa, b: Placa): number {
  return (a.orden_flyer ?? 0) - (b.orden_flyer ?? 0) || a.orden - b.orden || a.titulo.localeCompare(b.titulo, "es");
}

export interface OfertasDelFlyer {
  /** Las que salen en el flyer, en orden: marcadas, con precio y vigentes hoy (SPEC 4). */
  entran: Placa[];
  /** Marcadas y vigentes, pero pasadas del máximo (SPEC 11). */
  afuera: Placa[];
  /** Marcadas pero apagadas o fuera de fecha: vuelven solas cuando estén vigentes. */
  noVigentes: Placa[];
  /** Ofertas vigentes que se podrían sumar con un toque. */
  disponibles: Placa[];
}

export function ofertasDelFlyer(placas: Placa[], hoy: string): OfertasDelFlyer {
  const ofertas = placas.filter(puedeIrAlFlyer);
  const marcadas = ofertas.filter((p) => p.en_flyer).sort(compararFlyer);
  const vigentes = marcadas.filter((p) => estaVigente(p, hoy));
  return {
    entran: vigentes.slice(0, MAX_PRODUCTOS),
    afuera: vigentes.slice(MAX_PRODUCTOS),
    noVigentes: marcadas.filter((p) => !estaVigente(p, hoy)),
    disponibles: ofertas
      .filter((p) => !p.en_flyer && estaVigente(p, hoy))
      .sort((a, b) => a.orden - b.orden || a.titulo.localeCompare(b.titulo, "es")),
  };
}

/** Una placa como producto del flyer: mismos datos, otro nombre de campo. */
export function productoDesdePlaca(p: Placa): ProductoFlyer {
  return {
    id: p.id,
    nombre: p.titulo,
    precio: p.precio == null ? null : Number(p.precio),
    precio_anterior: p.precio_anterior == null ? null : Number(p.precio_anterior),
    unidad: p.unidad,
    imagen_url: p.imagen_url,
  };
}

/** El flyer que se dibuja y se descarga: la configuración más las ofertas que entran. */
export function armarFlyer(config: ConfigFlyer, entran: Placa[]): Flyer {
  const pie: PieFlyer = {
    direccion: config.direccion,
    telefono: config.telefono,
    horarios: config.horarios,
    instagram: config.instagram,
  };
  return { titulo: config.titulo, seccion: config.seccion, vigencia: config.vigencia, productos: entran.map(productoDesdePlaca), pie };
}

/** El orden_flyer que le toca a una oferta que se suma: al final de las marcadas. */
export function siguienteOrdenFlyer(placas: Placa[]): number {
  const marcadas = placas.filter((p) => p.en_flyer);
  return marcadas.length ? Math.max(...marcadas.map((p) => p.orden_flyer ?? 0)) + 1 : 1;
}

/**
 * Subir o bajar una oferta dentro del flyer: devuelve los nuevos orden_flyer de las dos que se
 * cruzan, o null si ya está en la punta. Si tenían el mismo orden, se les da uno distinto para
 * que el movimiento se vea (como el reordenar del TV).
 */
export function moverEnFlyer(lista: Placa[], id: string, delta: -1 | 1): { id: string; orden_flyer: number }[] | null {
  const i = lista.findIndex((p) => p.id === id);
  const vecina = lista[i + delta];
  if (i < 0 || !vecina) return null;
  const a = lista[i].orden_flyer ?? 0;
  const b = vecina.orden_flyer ?? 0;
  const nuevoA = a === b ? b + delta : b;
  return [
    { id, orden_flyer: nuevoA },
    { id: vecina.id, orden_flyer: a },
  ];
}

// ============================================================================
// El flyer que quedó guardado en el navegador antes de unificar (SPEC 9 y 10)
// ============================================================================

/** La clave con la que el flyer viejo se guardaba en el navegador. */
export const CLAVE_FLYER_VIEJO = "flyer-el-nuevo-rural-v1";

export interface FlyerViejo {
  config: ConfigFlyer;
  /** Los productos que tenía armados, para avisar cuáles marcar a mano. */
  productos: string[];
}

/** Lee lo guardado por el flyer anterior. Cualquier cosa rara es "no había nada". */
export function leerFlyerViejo(json: string | null): FlyerViejo | null {
  if (!json) return null;
  try {
    const f = JSON.parse(json) as Partial<Flyer>;
    if (!f || typeof f !== "object") return null;
    const pie = (f.pie ?? {}) as Partial<PieFlyer>;
    const txt = (v: unknown, def: string) => (typeof v === "string" ? v : def);
    return {
      config: {
        titulo: txt(f.titulo, CONFIG_INICIAL.titulo),
        seccion: txt(f.seccion, ""),
        vigencia: txt(f.vigencia, ""),
        direccion: txt(pie.direccion, CONFIG_INICIAL.direccion),
        telefono: txt(pie.telefono, ""),
        horarios: txt(pie.horarios, CONFIG_INICIAL.horarios),
        instagram: txt(pie.instagram, CONFIG_INICIAL.instagram),
      },
      productos: Array.isArray(f.productos)
        ? f.productos.map((p) => (typeof p?.nombre === "string" ? p.nombre.trim() : "")).filter(Boolean)
        : [],
    };
  } catch {
    return null;
  }
}
