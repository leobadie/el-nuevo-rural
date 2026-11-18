"use client";

import { Plus } from "lucide-react";
import { nombreLindo, pasoGramos } from "@/lib/tienda/formato";
import type { SeVendePor } from "@/lib/tienda/formato";
import { Boton } from "./Boton";
import { Cantidad } from "./Cantidad";
import { Etiqueta } from "./Etiqueta";
import { Precio } from "./Precio";
import { SinFoto } from "./SinFoto";

export type ProductoTarjeta = {
  codigo: string;
  nombre: string;
  marca?: string | null;
  presentacion?: string | null;
  categoria?: string | null;
  precioCentavos: number;
  anteriorCentavos?: number | null;
  seVendePor: SeVendePor;
  fraccionable: boolean;
  fotoUrl?: string | null;
  mayores?: boolean;
};

type Props = {
  producto: ProductoTarjeta;
  /** Cantidad en el carrito: 0 si no está. Unidades o kilos. */
  enCarrito: number;
  onCambiar: (cantidad: number) => void;
};

export function TarjetaProducto({ producto: p, enCarrito, onCambiar }: Props) {
  const nombre = nombreLindo(p.nombre);
  const paso = pasoGramos(p.categoria);
  // Lo pesable entra con 500 g si el paso es de 250, y con 200 g en fiambres.
  const inicial = p.fraccionable ? (paso === 100 ? 0.2 : 0.5) : 1;
  const detalle = [p.marca, p.fraccionable ? null : p.presentacion].filter(Boolean).join(" · ");

  return (
    <article className="flex flex-col gap-2 rounded-t-md bg-t-surface p-2 sm:p-3 shadow-t-card border border-t-border min-w-0">
      <div className="relative">
        {p.fotoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- fotos de Supabase Storage, sin optimizador por ahora
          <img
            src={p.fotoUrl}
            alt=""
            loading="lazy"
            className="aspect-square w-full rounded-t-sm object-contain bg-white"
          />
        ) : (
          <SinFoto nombre={nombre} categoria={p.categoria} />
        )}
        <div className="absolute top-1.5 left-1.5 flex gap-1 flex-wrap">
          {p.fraccionable ? <Etiqueta tipo="pesable">Se pesa</Etiqueta> : null}
          {p.mayores ? (
            <Etiqueta tipo="mayores" titulo="Venta sólo a mayores de 18 años">
              +18
            </Etiqueta>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-0.5 min-w-0">
        <h3 className="text-sm font-semibold leading-snug text-t-text line-clamp-2 min-h-[2.5em]">{nombre}</h3>
        {detalle ? <p className="text-xs text-t-muted truncate">{detalle}</p> : <p className="text-xs">&nbsp;</p>}
      </div>

      <div className="mt-auto flex flex-col gap-2">
        <Precio
          centavos={p.precioCentavos}
          anteriorCentavos={p.anteriorCentavos}
          seVendePor={p.seVendePor}
          presentacion={p.presentacion}
        />
        {enCarrito > 0 ? (
          <Cantidad
            valor={enCarrito}
            onCambiar={onCambiar}
            pesable={p.fraccionable}
            pasoGramos={paso}
            nombre={nombre}
          />
        ) : (
          <Boton ancho icono={<Plus aria-hidden className="size-5" />} onClick={() => onCambiar(inicial)}>
            Agregar
          </Boton>
        )}
      </div>
    </article>
  );
}
