"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { Catalogo } from "@/lib/tienda/servidor";
import {
  cantidadEn,
  leerCarrito,
  ponerCantidad,
  reconciliar,
  type Carrito,
  type ProductoPublico,
} from "@/lib/tienda/pedido";

const CLAVE = "tienda-carrito-v1";

type Valor = {
  catalogo: Catalogo;
  mapa: Map<string, ProductoPublico>;
  carrito: Carrito;
  /** false hasta leer el carrito guardado (evita parpadeos y diferencias con el servidor). */
  carritoListo: boolean;
  cantidad: (codigo: string) => number;
  cambiar: (codigo: string, cantidad: number) => void;
  vaciar: () => void;
  resumen: ReturnType<typeof reconciliar>;
  busqueda: string;
  setBusqueda: (v: string) => void;
};

const Ctx = createContext<Valor | null>(null);

export function useTienda(): Valor {
  const v = useContext(Ctx);
  if (!v) throw new Error("useTienda fuera de TiendaProvider");
  return v;
}

export function TiendaProvider({ catalogo, children }: { catalogo: Catalogo; children: ReactNode }) {
  const mapa = useMemo(() => new Map(catalogo.productos.map((p) => [p.c, p])), [catalogo]);
  const [carrito, setCarrito] = useState<Carrito>([]);
  const [carritoListo, setCarritoListo] = useState(false);
  const [busqueda, setBusqueda] = useState("");

  // El carrito vive en el navegador. localStorage puede no estar (modo privado) o tirar:
  // en ese caso la tienda funciona igual, sólo que el carrito no sobrevive a recargar.
  useEffect(() => {
    let guardado: Carrito = [];
    try {
      guardado = leerCarrito(window.localStorage.getItem(CLAVE));
    } catch {
      /* sin almacenamiento */
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- se lee una sola vez al montar
    setCarrito(guardado);
    setCarritoListo(true);
  }, []);

  useEffect(() => {
    if (!carritoListo) return;
    try {
      window.localStorage.setItem(CLAVE, JSON.stringify(carrito));
    } catch {
      /* sin almacenamiento */
    }
  }, [carrito, carritoListo]);

  const cambiar = useCallback((codigo: string, cant: number) => setCarrito((c) => ponerCantidad(c, codigo, cant)), []);
  const vaciar = useCallback(() => setCarrito([]), []);
  const cantidad = useCallback((codigo: string) => cantidadEn(carrito, codigo), [carrito]);
  const resumen = useMemo(() => reconciliar(carrito, mapa), [carrito, mapa]);

  const valor = useMemo<Valor>(
    () => ({ catalogo, mapa, carrito, carritoListo, cantidad, cambiar, vaciar, resumen, busqueda, setBusqueda }),
    [catalogo, mapa, carrito, carritoListo, cantidad, cambiar, vaciar, resumen, busqueda],
  );
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}
