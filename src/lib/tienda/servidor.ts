// Sólo servidor: usa unstable_cache y se importa únicamente desde layouts, páginas y acciones.
import { createClient as crearCliente } from "@supabase/supabase-js";
import { unstable_cache } from "next/cache";
import { fetchConTimeout } from "@/lib/supabase/fetchConTimeout";
import { nombreLindo, normalizar } from "./formato";
import type { ProductoPublico } from "./pedido";

export const TAG_CATALOGO = "tienda-catalogo";

/**
 * Cliente anónimo y SIN cookies: la tienda es igual para todos, así que se puede cachear,
 * y lo que ve es exactamente lo que el RLS deja ver a alguien sin login.
 */
export function clienteAnonimo() {
  return crearCliente(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { fetch: fetchConTimeout },
  });
}

export type ConfigPublica = {
  abierta: boolean;
  whatsapp: string | null;
  direccion_retiro: string | null;
  retiro_activo: boolean;
  envio_activo: boolean;
  aviso: string | null;
};

export type Catalogo = {
  config: ConfigPublica;
  categorias: { slug: string; nombre: string }[];
  productos: ProductoPublico[];
  /** Hay alguna foto publicada de Open Food Facts: el pie tiene que dar el crédito (CC BY-SA). */
  creditoOff: boolean;
};

type FilaProducto = {
  codigo_xrp: string;
  nombre_xrp: string;
  nombre_web: string | null;
  marca: string | null;
  presentacion: string | null;
  precio_centavos: number;
  precio_anterior_centavos: number | null;
  se_vende_por: "unidad" | "kg";
  fraccionable: boolean;
  foto_url: string | null;
  foto_credito: string | null;
  busqueda: string;
  categoria: { slug: string; nombre: string } | null;
};

const POR_PAGINA = 1000; // tope por pedido de PostgREST en Supabase

async function leerCatalogo(): Promise<Catalogo> {
  const sb = clienteAnonimo();
  const [cfg, cats] = await Promise.all([
    sb.from("tienda_config").select("abierta, whatsapp, direccion_retiro, retiro_activo, envio_activo, aviso").maybeSingle(),
    sb.from("tienda_categorias").select("slug, nombre, orden").order("orden").order("nombre"),
  ]);
  if (cfg.error) throw new Error(`tienda_config: ${cfg.error.message}`);
  if (cats.error) throw new Error(`tienda_categorias: ${cats.error.message}`);
  const config: ConfigPublica = cfg.data ?? {
    abierta: false, whatsapp: null, direccion_retiro: null, retiro_activo: true, envio_activo: true, aviso: null,
  };

  const filas: FilaProducto[] = [];
  if (config.abierta) {
    for (let desde = 0; ; desde += POR_PAGINA) {
      const { data, error } = await sb
        .from("tienda_productos")
        .select(
          "codigo_xrp, nombre_xrp, nombre_web, marca, presentacion, precio_centavos, precio_anterior_centavos, se_vende_por, fraccionable, foto_url, foto_credito, busqueda, categoria:tienda_categorias(slug, nombre)",
        )
        .order("nombre_xrp")
        .order("codigo_xrp")
        .range(desde, desde + POR_PAGINA - 1);
      if (error) throw new Error(`tienda_productos: ${error.message}`);
      filas.push(...((data ?? []) as unknown as FilaProducto[]));
      if (!data || data.length < POR_PAGINA) break;
    }
  }

  const orden = new Map((cats.data ?? []).map((c, i) => [c.slug, i]));
  const productos = filas
    .map<ProductoPublico>((f) => {
      const n = f.nombre_web?.trim() || nombreLindo(f.nombre_xrp);
      return {
        c: f.codigo_xrp,
        n,
        m: f.marca,
        pr: f.presentacion,
        k: f.categoria?.slug ?? null,
        kn: f.categoria?.nombre ?? null,
        p: f.precio_centavos,
        a: f.precio_anterior_centavos,
        kg: f.se_vende_por === "kg",
        f: f.fraccionable,
        ft: f.foto_url,
        // Se suma el nombre web y la categoría: "carniceria" encuentra la carne.
        b: [f.busqueda, normalizar(n), normalizar(f.categoria?.nombre ?? "")].filter(Boolean).join(" "),
      };
    })
    .sort((x, y) => (orden.get(x.k ?? "") ?? 999) - (orden.get(y.k ?? "") ?? 999) || x.n.localeCompare(y.n, "es"));

  // Sólo categorías que tienen algo para mostrar.
  const conProductos = new Set(productos.map((p) => p.k));
  return {
    config,
    categorias: (cats.data ?? []).filter((c) => conProductos.has(c.slug)).map(({ slug, nombre }) => ({ slug, nombre })),
    productos,
    creditoOff: filas.some((f) => !!f.foto_url && (f.foto_credito ?? "").includes("Open Food Facts")),
  };
}

/** Catálogo cacheado; se invalida al importar o al cambiar la config (updateTag). */
const catalogoCacheado = unstable_cache(leerCatalogo, ["tienda-catalogo-v2"], {
  tags: [TAG_CATALOGO],
  revalidate: 600,
});

export type ResultadoCatalogo = { ok: true; catalogo: Catalogo } | { ok: false; error: string };

/** Nunca tira: si la base falla, la tienda muestra un aviso en vez de romperse. */
export async function obtenerCatalogo(): Promise<ResultadoCatalogo> {
  try {
    return { ok: true, catalogo: await catalogoCacheado() };
  } catch (e) {
    console.error("tienda: no se pudo leer el catálogo:", e);
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
