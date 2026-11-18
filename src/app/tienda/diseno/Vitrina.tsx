"use client";

import { MessageCircle, Store, Truck } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Boton } from "../_componentes/Boton";
import { Cantidad } from "../_componentes/Cantidad";
import { Encabezado } from "../_componentes/Encabezado";
import { Etiqueta } from "../_componentes/Etiqueta";
import { Precio } from "../_componentes/Precio";
import { TarjetaProducto, type ProductoTarjeta } from "../_componentes/TarjetaProducto";
import { Aviso, Campo, EstadoVacio, Segmentado } from "../_componentes/Varios";

// Productos reales de la hoja "Productos web" (XRP, 15/11/2026), salvo dos cosas inventadas
// sólo para mostrar estados: el tachado del aceite (en el Excel nada está en oferta) y el
// fernet (para la etiqueta +18).
const MUESTRA: ProductoTarjeta[] = [
  { codigo: "283", nombre: "Aceite de girasol", marca: "Natura", presentacion: "1x1500 cc", categoria: "Almacén", precioCentavos: 760000, anteriorCentavos: 899000, seVendePor: "unidad", fraccionable: false },
  { codigo: "23281", nombre: "ACEITE DE GIRASOL", marca: "Don Jose", presentacion: "1x5 Lts", categoria: "Almacén", precioCentavos: 1849000, seVendePor: "unidad", fraccionable: false },
  { codigo: "3849", nombre: "Bondiola pieza", marca: "Piamontesa", presentacion: "1x1 Kgr", categoria: "Fiambres y quesos", precioCentavos: 3099000, seVendePor: "kg", fraccionable: true },
  { codigo: "2371", nombre: "Molleja", marca: "", presentacion: "1x1 Kgr", categoria: "Carnicería", precioCentavos: 3500000, seVendePor: "kg", fraccionable: true },
  { codigo: "1241", nombre: "Arroz largo fino estuche", marca: "Gallo Oro", presentacion: "1x1 Kgr", categoria: "Almacén", precioCentavos: 360000, seVendePor: "kg", fraccionable: false },
  { codigo: "19867", nombre: "Amargo Patagonico cero", marca: "Terma", presentacion: "1x1.35 Lts", categoria: "Bebidas sin alcohol", precioCentavos: 15990, seVendePor: "unidad", fraccionable: false },
  { codigo: "x-fernet", nombre: "FERNET", marca: "Branca", presentacion: "1x750 cc", categoria: "Bebidas con alcohol", precioCentavos: 1499000, seVendePor: "unidad", fraccionable: false, mayores: true },
  { codigo: "16719", nombre: "Huevos Frescos", marca: "", presentacion: "1x1 Un", categoria: "Verdulería", precioCentavos: 30000, seVendePor: "unidad", fraccionable: false },
];

function Seccion({ titulo, children }: { titulo: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-lg font-bold text-t-text border-b border-t-border pb-1">{titulo}</h2>
      {children}
    </section>
  );
}

export function Vitrina() {
  const [busqueda, setBusqueda] = useState("");
  const [carrito, setCarrito] = useState<Record<string, number>>({ "3849": 0.2 });
  const [entrega, setEntrega] = useState<"retiro" | "envio">("retiro");
  const [kg, setKg] = useState(0.5);
  const [unidades, setUnidades] = useState(2);
  const cantidad = Object.values(carrito).filter((v) => v > 0).length;

  return (
    <>
      <Encabezado busqueda={busqueda} onBuscar={setBusqueda} cantidadCarrito={cantidad} />
      <main className="mx-auto w-full max-w-[1200px] px-4 py-6 flex flex-col gap-8 min-w-0">
        <h1 className="text-2xl font-extrabold">Componentes de la tienda</h1>

        <Seccion titulo="Tarjetas de producto">
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-3 lg:gap-4">
            {MUESTRA.map((p) => (
              <TarjetaProducto
                key={p.codigo}
                producto={p}
                enCarrito={carrito[p.codigo] ?? 0}
                onCambiar={(c) => setCarrito((v) => ({ ...v, [p.codigo]: c }))}
              />
            ))}
          </div>
        </Seccion>

        <Seccion titulo="Botones">
          <div className="flex flex-wrap gap-2">
            <Boton>Agregar</Boton>
            <Boton variante="whatsapp" icono={<MessageCircle aria-hidden className="size-5" />}>
              Enviar por WhatsApp
            </Boton>
            <Boton variante="secundario">Seguir comprando</Boton>
            <Boton variante="fantasma">Vaciar</Boton>
            <Boton variante="peligro">Quitar</Boton>
            <Boton cargando>Enviando</Boton>
            <Boton disabled>Sin stock</Boton>
            <Boton tamano="sm">Chico</Boton>
            <Boton tamano="lg">Grande</Boton>
          </div>
        </Seccion>

        <Seccion titulo="Precios y etiquetas">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            <Precio centavos={760000} seVendePor="unidad" presentacion="1x1500 cc" />
            <Precio centavos={280000} anteriorCentavos={379000} seVendePor="unidad" presentacion="1x265 grs" />
            <Precio centavos={1499000} seVendePor="kg" />
            <Precio centavos={749500} seVendePor="unidad" aproximado />
          </div>
          <div className="flex flex-wrap gap-2">
            <Etiqueta tipo="descuento">-26%</Etiqueta>
            <Etiqueta tipo="mayores">+18</Etiqueta>
            <Etiqueta tipo="pesable">Se pesa</Etiqueta>
            <Etiqueta tipo="nuevo">Nuevo</Etiqueta>
          </div>
        </Seccion>

        <Seccion titulo="Cantidad">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-2xl">
            <Cantidad valor={unidades} onCambiar={setUnidades} pesable={false} nombre="Aceite" />
            <Cantidad valor={kg} onCambiar={setKg} pesable pasoGramos={250} nombre="Molleja" atajos />
            <Cantidad valor={0.2} onCambiar={() => {}} pesable pasoGramos={100} nombre="Bondiola" />
          </div>
        </Seccion>

        <Seccion titulo="Entrega y formulario">
          <div className="flex flex-col gap-3 max-w-md">
            <Segmentado
              etiqueta="¿Cómo lo recibís?"
              valor={entrega}
              onCambiar={setEntrega}
              opciones={[
                { valor: "retiro", titulo: "Retiro", detalle: "Lo pasás a buscar", icono: <Store aria-hidden className="size-5" /> },
                { valor: "envio", titulo: "Envío", detalle: "Te lo llevamos", icono: <Truck aria-hidden className="size-5" /> },
              ]}
            />
            <Campo etiqueta="Nombre" placeholder="Cómo te llamás" autoComplete="name" />
            <Campo etiqueta="Teléfono" inputMode="tel" placeholder="3549 123456" error="Faltan números: poné el código de área." />
            <Campo etiqueta="Dirección" ayuda="Calle, número y alguna referencia" disabled={entrega === "retiro"} />
          </div>
        </Seccion>

        <Seccion titulo="Avisos">
          <div className="flex flex-col gap-2 max-w-xl">
            <Aviso>Los productos que se pesan tienen precio aproximado: el total final lo da la balanza.</Aviso>
            <Aviso tipo="exito">¡Listo! Tu pedido #123 está en WhatsApp.</Aviso>
            <Aviso tipo="error">No pudimos guardar el pedido. Probá de nuevo.</Aviso>
            <Aviso tipo="atencion">El precio del aceite cambió desde que lo agregaste.</Aviso>
          </div>
        </Seccion>

        <Seccion titulo="Estado vacío">
          <div className="rounded-t-md bg-t-surface border border-t-border">
            <EstadoVacio
              titulo="Tu carrito está vacío"
              texto="Buscá lo que necesitás o mirá las ofertas de la semana."
              accion={<Boton variante="secundario">Ver ofertas</Boton>}
            />
          </div>
        </Seccion>
      </main>
    </>
  );
}
