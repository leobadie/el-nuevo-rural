// Convierte las filas de la hoja "Productos web" de XRP en lo que recibe tienda_importar.
// Valida, saltea filas malas (con motivo), infiere pesables y arma el texto de búsqueda.
// Lo prueba verificacion/tienda-importar.mts.

import { decodificarEntidades } from "./xlsx.ts";
import { leerPresentacion, normalizar, type SeVendePor } from "./formato.ts";

export const HOJA_XRP = "Productos web";

export type FilaImportar = {
  codigo_xrp: string;
  codigo_barras: string | null;
  nombre_xrp: string;
  marca: string | null;
  presentacion: string | null;
  categoria_xrp: string | null;
  categoria_slug: string | null;
  precio_centavos: number;
  se_vende_por: SeVendePor;
  fraccionable: boolean;
  contenido_cantidad: number | null;
  contenido_unidad: "g" | "ml" | "un" | null;
  busqueda: string;
};

export type Problema = { fila: number; codigo?: string; motivo: string };

export type Preparado = {
  filas: FilaImportar[];
  problemas: Problema[];
  /** Cuántos pesables (PLU) y cuántos paquetes por kg (EAN) hay. */
  resumen: { total: number; porKg: number; pesables: number; paquetesKg: number; categorias: number };
};

/** Columnas que se buscan en el encabezado (comparadas sin acentos ni mayúsculas). */
const COLUMNAS = {
  codigo: ["codigo"],
  barras: ["codigo de barras"],
  nombre: ["producto"],
  marca: ["marca"],
  presentacion: ["presentacion"],
  categoria: ["categoria"],
  precio: ["precio"],
  porKg: ["se vende por"],
} as const;

type Clave = keyof typeof COLUMNAS;
const OBLIGATORIAS: Clave[] = ["codigo", "nombre", "precio", "porKg"];

/**
 * El export de XRP trae los acentos dos veces escapados ("&amp;#243;" en el XML, que el
 * lector deja como "&#243;"). Se decodifica otra vez y se limpian espacios.
 */
export function limpiarTexto(s: string | undefined | null): string {
  return decodificarEntidades(String(s ?? "")).replace(/\s+/g, " ").trim();
}

export function slug(texto: string): string {
  return normalizar(texto)
    .replace(/ñ/g, "n")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Precio a centavos. Acepta lo que guarda Excel ("159.9", "7600") y lo que alguien podría
 * tipear a mano ("1.234,50", "$ 7.600"). null si no es un número positivo.
 */
export function precioACentavos(valor: string): number | null {
  let s = valor.replace(/\$|\s/g, "");
  if (!s) return null;
  if (s.includes(",")) s = s.replace(/\./g, "").replace(",", ".");
  else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, "");
  const n = Number(s);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * 100);
}

/** Pesable = se vende por kg y tiene PLU (código corto de balanza), no un EAN de paquete. */
export function esPesable(seVendePor: SeVendePor, codigoBarras: string | null): boolean {
  if (seVendePor !== "kg") return false;
  const digitos = (codigoBarras ?? "").replace(/\D/g, "");
  return digitos.length < 8;
}

export function prepararFilas(tabla: string[][]): Preparado {
  const problemas: Problema[] = [];
  const iEncabezado = tabla.findIndex((f) => f.some((c) => normalizar(limpiarTexto(c)) === "producto"));
  if (iEncabezado < 0) {
    return {
      filas: [],
      problemas: [{ fila: 0, motivo: 'No encontré el encabezado (falta la columna "Producto").' }],
      resumen: { total: 0, porKg: 0, pesables: 0, paquetesKg: 0, categorias: 0 },
    };
  }
  const encabezado = tabla[iEncabezado].map((c) => normalizar(limpiarTexto(c)));
  const idx = {} as Record<Clave, number>;
  for (const clave of Object.keys(COLUMNAS) as Clave[]) {
    idx[clave] = encabezado.findIndex((h) => (COLUMNAS[clave] as readonly string[]).includes(h));
  }
  const faltan = OBLIGATORIAS.filter((c) => idx[c] < 0);
  if (faltan.length) {
    return {
      filas: [],
      problemas: [{ fila: iEncabezado + 1, motivo: `Faltan columnas: ${faltan.join(", ")}.` }],
      resumen: { total: 0, porKg: 0, pesables: 0, paquetesKg: 0, categorias: 0 },
    };
  }

  const vistos = new Map<string, number>();
  const filas: FilaImportar[] = [];
  for (let i = iEncabezado + 1; i < tabla.length; i++) {
    const f = tabla[i];
    const celda = (c: Clave) => (idx[c] >= 0 ? limpiarTexto(f[idx[c]]) : "");
    const numFila = i + 1; // como lo ve el usuario en Excel
    if (!f.some((c) => limpiarTexto(c))) continue; // fila vacía

    const codigo = celda("codigo");
    const nombre = celda("nombre");
    if (!codigo) {
      problemas.push({ fila: numFila, motivo: "Sin código." });
      continue;
    }
    if (!nombre) {
      problemas.push({ fila: numFila, codigo, motivo: "Sin nombre de producto." });
      continue;
    }
    const centavos = precioACentavos(celda("precio"));
    if (centavos === null) {
      problemas.push({ fila: numFila, codigo, motivo: `Precio inválido ("${celda("precio")}").` });
      continue;
    }
    const porKgTexto = normalizar(celda("porKg"));
    const seVendePor: SeVendePor | null =
      porKgTexto === "kg" || porKgTexto === "kilo" ? "kg" : porKgTexto === "unidad" || porKgTexto === "un" ? "unidad" : null;
    if (!seVendePor) {
      problemas.push({ fila: numFila, codigo, motivo: `"Se vende por" debe ser kg o unidad ("${celda("porKg")}").` });
      continue;
    }
    if (vistos.has(codigo)) {
      problemas.push({ fila: numFila, codigo, motivo: `Código repetido (ya estaba en la fila ${vistos.get(codigo)}); se usa la primera.` });
      continue;
    }
    vistos.set(codigo, numFila);

    const barras = celda("barras") || null;
    const marca = celda("marca") || null;
    const presentacion = celda("presentacion") || null;
    const categoria = celda("categoria") || null;
    const contenido = leerPresentacion(presentacion);
    filas.push({
      codigo_xrp: codigo,
      codigo_barras: barras,
      nombre_xrp: nombre,
      marca,
      presentacion,
      categoria_xrp: categoria,
      categoria_slug: categoria ? slug(categoria) || null : null,
      precio_centavos: centavos,
      se_vende_por: seVendePor,
      fraccionable: esPesable(seVendePor, barras),
      contenido_cantidad: contenido?.cantidad ?? null,
      contenido_unidad: contenido?.unidad ?? null,
      busqueda: normalizar([nombre, marca, presentacion].filter(Boolean).join(" ")),
    });
  }

  const porKg = filas.filter((x) => x.se_vende_por === "kg");
  return {
    filas,
    problemas,
    resumen: {
      total: filas.length,
      porKg: porKg.length,
      pesables: porKg.filter((x) => x.fraccionable).length,
      paquetesKg: porKg.filter((x) => !x.fraccionable).length,
      categorias: new Set(filas.map((x) => x.categoria_xrp).filter(Boolean)).size,
    },
  };
}
