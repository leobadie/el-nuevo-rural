"use client";

import { ShoppingCart } from "lucide-react";
import Link from "next/link";
import { Buscador } from "./Varios";

export function Encabezado({
  busqueda,
  onBuscar,
  cantidadCarrito,
}: {
  busqueda: string;
  onBuscar: (v: string) => void;
  cantidadCarrito: number;
}) {
  return (
    <header className="sticky top-0 z-30 bg-t-accent text-t-on-accent shadow-t-pop">
      <div className="mx-auto max-w-[1200px] px-4 py-2 grid grid-cols-[auto_1fr_auto] items-center gap-x-3 gap-y-2 md:h-16 md:py-0">
        <Link href="/tienda" className="flex items-center gap-2 shrink-0 rounded-t-sm" aria-label="El Nuevo Rural, inicio">
          {/* eslint-disable-next-line @next/next/no-img-element -- logo local chico */}
          <img src="/logo.jpg" alt="" width={40} height={40} className="size-10 rounded-full bg-white object-contain" />
          <span className="font-extrabold leading-tight text-base hidden sm:block">El Nuevo Rural</span>
        </Link>

        <div className="col-span-3 row-start-2 md:col-span-1 md:row-start-1 md:col-start-2 min-w-0">
          <Buscador valor={busqueda} onCambiar={onBuscar} />
        </div>

        <Link
          href="/tienda/carrito"
          className="col-start-3 row-start-1 relative flex items-center gap-2 h-11 px-3 rounded-t-md hover:bg-t-accent-hover"
          aria-label={`Carrito, ${cantidadCarrito} ${cantidadCarrito === 1 ? "producto" : "productos"}`}
        >
          <ShoppingCart aria-hidden className="size-6" />
          <span className="hidden md:inline font-bold">Carrito</span>
          {cantidadCarrito > 0 ? (
            <span
              aria-hidden
              className="absolute -top-0.5 left-6 md:static min-w-5 h-5 px-1 rounded-full bg-t-highlight text-t-on-highlight text-xs font-extrabold flex items-center justify-center tabular-nums"
            >
              {cantidadCarrito}
            </span>
          ) : null}
        </Link>
      </div>
    </header>
  );
}
