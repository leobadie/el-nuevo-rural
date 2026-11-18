"use client";

import { useEffect, useMemo, useState } from "react";
import { buscar } from "@/lib/tienda/pedido";
import { Boton } from "../_componentes/Boton";
import { TarjetaProducto } from "../_componentes/TarjetaProducto";
import { useTienda } from "../_componentes/TiendaContexto";
import { Aviso, EstadoVacio } from "../_componentes/Varios";

const DE_A = 40;
const ALCOHOL = "bebidas-con-alcohol";

export function Inicio() {
  const { catalogo, busqueda, setBusqueda, cantidad, cambiar, resumen } = useTienda();
  const [categoria, setCategoria] = useState<string | null>(null);
  const [mostrar, setMostrar] = useState(DE_A);

  const lista = useMemo(() => {
    const base = categoria ? catalogo.productos.filter((p) => p.k === categoria) : catalogo.productos;
    return buscar(base, busqueda);
  }, [catalogo.productos, categoria, busqueda]);

  // Al cambiar el filtro se vuelve a mostrar desde el principio.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reinicio de paginado al cambiar el filtro
    setMostrar(DE_A);
  }, [categoria, busqueda]);

  if (!catalogo.config.abierta) {
    return (
      <EstadoVacio
        titulo="Estamos preparando la tienda"
        texto="Muy pronto vas a poder hacer tu pedido desde acá. Mientras tanto, te esperamos en el local."
      />
    );
  }

  const nombreCategoria = catalogo.categorias.find((c) => c.slug === categoria)?.nombre;

  return (
    <div className="flex flex-col gap-4 min-w-0">
      {resumen.quitados.length > 0 ? (
        <Aviso tipo="atencion">
          {resumen.quitados.length === 1
            ? "Un producto de tu carrito ya no está disponible y lo sacamos."
            : `${resumen.quitados.length} productos de tu carrito ya no están disponibles y los sacamos.`}
        </Aviso>
      ) : null}

      <nav aria-label="Categorías" className="-mx-4 px-4 overflow-x-auto min-w-0">
        <ul className="flex gap-2 w-max pb-1">
          {[{ slug: null as string | null, nombre: "Todo" }, ...catalogo.categorias].map((c) => {
            const activa = categoria === c.slug;
            return (
              <li key={c.slug ?? "todo"}>
                <button
                  type="button"
                  onClick={() => setCategoria(c.slug)}
                  aria-pressed={activa}
                  className={[
                    "h-10 px-4 rounded-full text-sm font-semibold whitespace-nowrap border",
                    activa ? "bg-t-accent text-t-on-accent border-t-accent" : "bg-t-surface text-t-text border-t-border hover:bg-t-surface-alt",
                  ].join(" ")}
                >
                  {c.nombre}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex items-baseline justify-between gap-2 flex-wrap">
        <h1 className="text-xl font-extrabold text-t-text">
          {busqueda ? `Resultados para “${busqueda}”` : (nombreCategoria ?? "Todos los productos")}
        </h1>
        <p className="text-sm text-t-muted" aria-live="polite">
          {lista.length} {lista.length === 1 ? "producto" : "productos"}
        </p>
      </div>

      {lista.length === 0 ? (
        <EstadoVacio
          titulo="No encontramos eso"
          texto={busqueda ? "Probá con otra palabra, o con menos palabras. Ej.: “yerba”, “leche”." : "No hay productos en esta categoría."}
          accion={
            busqueda ? (
              <Boton variante="secundario" onClick={() => setBusqueda("")}>
                Ver todos los productos
              </Boton>
            ) : null
          }
        />
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 lg:gap-4">
            {lista.slice(0, mostrar).map((p) => (
              <TarjetaProducto
                key={p.c}
                producto={{
                  codigo: p.c,
                  nombre: p.n,
                  marca: p.m,
                  presentacion: p.pr,
                  categoria: p.kn,
                  precioCentavos: p.p,
                  anteriorCentavos: p.a,
                  seVendePor: p.kg ? "kg" : "unidad",
                  fraccionable: p.f,
                  fotoUrl: p.ft,
                  mayores: p.k === ALCOHOL,
                }}
                enCarrito={cantidad(p.c)}
                onCambiar={(c) => cambiar(p.c, c)}
              />
            ))}
          </div>
          {mostrar < lista.length ? (
            <div className="flex justify-center">
              <Boton variante="secundario" onClick={() => setMostrar((m) => m + DE_A)}>
                Mostrar más ({lista.length - mostrar} más)
              </Boton>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
