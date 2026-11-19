"use client";

import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";
import { formatoPrecio } from "@/lib/tienda/formato";
import { Encabezado } from "./Encabezado";
import { useTienda } from "./TiendaContexto";

/** Encabezado, contenido, barra de "Ver carrito" en el celular y pie. */
export function Marco({ children }: { children: ReactNode }) {
  const { resumen, busqueda, setBusqueda, catalogo, carritoListo } = useTienda();
  const ruta = usePathname();
  const router = useRouter();
  const enCarrito = ruta?.startsWith("/tienda/carrito");
  const productos = carritoListo ? resumen.lineas.length : 0;

  const buscar = (v: string) => {
    setBusqueda(v);
    // Buscar desde el carrito o el pedido lleva a la lista de productos.
    if (ruta !== "/tienda") router.push("/tienda");
  };

  return (
    <>
      <Encabezado busqueda={busqueda} onBuscar={buscar} cantidadCarrito={productos} />
      {catalogo.config.aviso ? (
        <p className="bg-t-highlight text-t-on-highlight text-sm font-semibold text-center px-4 py-2">{catalogo.config.aviso}</p>
      ) : null}
      <main className="mx-auto w-full max-w-[1200px] px-4 py-4 flex-1 min-w-0">{children}</main>

      {productos > 0 && !enCarrito && ruta !== "/tienda/diseno" ? (
        <div className="sticky bottom-0 z-20 md:hidden bg-t-surface border-t border-t-border px-4 py-2 shadow-t-pop">
          <Link
            href="/tienda/carrito"
            className="flex items-center justify-between gap-3 h-12 px-4 rounded-t-md bg-t-accent text-t-on-accent font-bold"
          >
            <span className="flex items-center gap-2">
              <ShoppingCart aria-hidden className="size-5" />
              Ver carrito ({productos})
            </span>
            <span className="tabular-nums">
              {resumen.aproximado ? "aprox. " : ""}
              {formatoPrecio(resumen.total)}
            </span>
          </Link>
        </div>
      ) : null}

      <footer className="bg-t-surface-alt text-t-muted text-xs text-center px-4 py-5 mt-6">
        <p className="font-bold text-t-text">Supermercado El Nuevo Rural</p>
        {catalogo.config.direccion_retiro ? <p>{catalogo.config.direccion_retiro}</p> : null}
        <p className="mt-1">Precios con IVA incluido. Los productos que se pesan se cobran según la balanza.</p>
        {catalogo.creditoOff ? (
          <p className="mt-1" data-test="credito-fotos">
            Algunas fotos de productos:{" "}
            <a href="https://world.openfoodfacts.org" target="_blank" rel="noreferrer" className="underline">
              Open Food Facts
            </a>{" "}
            (
            <a href="https://creativecommons.org/licenses/by-sa/3.0/deed.es" target="_blank" rel="noreferrer" className="underline">
              CC BY-SA
            </a>
            ).
          </p>
        ) : null}
      </footer>
    </>
  );
}
