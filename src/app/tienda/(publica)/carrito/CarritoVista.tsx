"use client";

import { MessageCircle, Store, Truck } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { formatoPrecio, pasoGramos } from "@/lib/tienda/formato";
import { enviarPedido, type DatosPedido } from "../../acciones";
import { Boton } from "../../_componentes/Boton";
import { Cantidad } from "../../_componentes/Cantidad";
import { useTienda } from "../../_componentes/TiendaContexto";
import { Aviso, Campo, EstadoVacio, Segmentado } from "../../_componentes/Varios";

type Errores = Partial<Record<"nombre" | "telefono" | "direccion" | "forma_pago" | "entrega", string>>;

const PAGOS = [
  { valor: "efectivo", titulo: "Efectivo" },
  { valor: "transferencia", titulo: "Transferencia" },
  { valor: "tarjeta", titulo: "Tarjeta" },
] as const;

export function CarritoVista() {
  const { resumen, cambiar, vaciar, catalogo, carritoListo } = useTienda();
  const router = useRouter();
  const cfg = catalogo.config;
  const opcionesEntrega = [
    ...(cfg.retiro_activo
      ? [{ valor: "retiro" as const, titulo: "Retiro", detalle: "Lo pasás a buscar", icono: <Store aria-hidden className="size-5" /> }]
      : []),
    ...(cfg.envio_activo
      ? [{ valor: "envio" as const, titulo: "Envío", detalle: "Te lo llevamos", icono: <Truck aria-hidden className="size-5" /> }]
      : []),
  ];

  const [nombre, setNombre] = useState("");
  const [telefono, setTelefono] = useState("");
  const [entrega, setEntrega] = useState<"retiro" | "envio">(opcionesEntrega[0]?.valor ?? "retiro");
  const [direccion, setDireccion] = useState("");
  const [pago, setPago] = useState<DatosPedido["forma_pago"]>("efectivo");
  const [nota, setNota] = useState("");
  const [errores, setErrores] = useState<Errores>({});
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [enviando, iniciar] = useTransition();

  if (!carritoListo) return <p className="text-t-muted py-10 text-center">Cargando tu carrito…</p>;

  if (resumen.lineas.length === 0) {
    return (
      <EstadoVacio
        titulo="Tu carrito está vacío"
        texto="Buscá lo que necesitás y tocá “Agregar”."
        accion={
          <Link href="/tienda" className="inline-flex items-center h-11 px-4 rounded-t-md border-2 border-t-accent text-t-accent font-bold bg-t-surface">
            Ver productos
          </Link>
        }
      />
    );
  }

  const validar = (): Errores => {
    const e: Errores = {};
    if (nombre.trim().length < 2) e.nombre = "Poné tu nombre.";
    const digitos = telefono.replace(/\D/g, "");
    if (digitos.length < 8 || digitos.length > 15) e.telefono = "Entre 8 y 15 números, con código de área. Ej.: 3549 123456";
    if (entrega === "envio" && direccion.trim().length < 5) e.direccion = "Poné la dirección: calle, número y alguna referencia.";
    return e;
  };

  const enviar = () => {
    const e = validar();
    setErrores(e);
    setErrorGeneral(null);
    if (Object.keys(e).length) {
      document.getElementById(`campo-${Object.keys(e)[0]}`)?.focus();
      return;
    }
    iniciar(async () => {
      const r = await enviarPedido({
        nombre,
        telefono,
        entrega,
        direccion,
        forma_pago: pago,
        nota,
        lineas: resumen.lineas.map((l) => ({ codigo: l.producto.c, cantidad: l.cantidad })),
      });
      if (!r.ok) {
        if (r.campo) setErrores({ [r.campo]: r.mensaje });
        else setErrorGeneral(r.mensaje);
        return;
      }
      vaciar();
      router.push(`/tienda/pedido/${r.numero}?t=${r.token}&nuevo=1`);
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_400px] items-start min-w-0">
      <section aria-labelledby="titulo-carrito" className="flex flex-col gap-3 min-w-0">
        <div className="flex items-baseline justify-between gap-2">
          <h1 id="titulo-carrito" className="text-xl font-extrabold">
            Tu pedido ({resumen.lineas.length})
          </h1>
          <Link href="/tienda" className="inline-flex items-center min-h-11 px-1 text-sm font-semibold text-t-accent underline underline-offset-2">
            Seguir comprando
          </Link>
        </div>

        {resumen.quitados.length > 0 ? (
          <Aviso tipo="atencion">Sacamos {resumen.quitados.length === 1 ? "un producto que ya no está disponible" : `${resumen.quitados.length} productos que ya no están disponibles`}.</Aviso>
        ) : null}

        <ul className="flex flex-col gap-2">
          {resumen.lineas.map(({ producto: p, cantidad, subtotal }) => (
            <li key={p.c} className="flex flex-col gap-2 sm:flex-row sm:items-center rounded-t-md bg-t-surface border border-t-border p-3 min-w-0">
              <div className="flex-1 min-w-0">
                <p className="font-semibold leading-snug">{p.n}</p>
                <p className="text-xs text-t-muted">
                  {[p.m, p.f ? null : p.pr].filter(Boolean).join(" · ")}
                  {p.f || p.kg ? `${p.m ? " · " : ""}${formatoPrecio(p.p)}/kg` : ""}
                </p>
              </div>
              <div className="flex items-center gap-3 justify-between sm:justify-end">
                <div className="w-40">
                  <Cantidad
                    valor={cantidad}
                    onCambiar={(c) => cambiar(p.c, c)}
                    pesable={p.f}
                    pasoGramos={pasoGramos(p.kn)}
                    nombre={p.n}
                  />
                </div>
                <p className="font-bold tabular-nums text-right min-w-[88px]">
                  {p.f ? <span className="block text-[11px] font-semibold text-t-muted">aprox.</span> : null}
                  {formatoPrecio(subtotal)}
                </p>
              </div>
            </li>
          ))}
        </ul>

        <div className="flex items-center justify-between rounded-t-md bg-t-surface-alt px-4 py-3">
          <span className="font-bold">{resumen.aproximado ? "Total aproximado" : "Total"}</span>
          <span className="text-2xl font-extrabold tabular-nums" data-test="total">
            {formatoPrecio(resumen.total)}
          </span>
        </div>
        {resumen.aproximado ? (
          <Aviso>Los productos que se pesan se cobran según lo que marque la balanza: el total final puede variar un poco.</Aviso>
        ) : null}
      </section>

      <section aria-labelledby="titulo-datos" className="flex flex-col gap-4 rounded-t-lg bg-t-surface border border-t-border p-4 min-w-0">
        <h2 id="titulo-datos" className="text-lg font-extrabold">
          Tus datos
        </h2>

        {opcionesEntrega.length > 1 ? (
          <Segmentado etiqueta="¿Cómo lo recibís?" valor={entrega} onCambiar={setEntrega} opciones={opcionesEntrega} />
        ) : null}
        {entrega === "retiro" && cfg.direccion_retiro ? (
          <p className="text-sm text-t-muted -mt-2">Retirás en {cfg.direccion_retiro}.</p>
        ) : null}

        <Campo id="campo-nombre" etiqueta="Nombre" autoComplete="name" value={nombre} onChange={(e) => setNombre(e.target.value)} error={errores.nombre} maxLength={80} />
        <Campo
          id="campo-telefono"
          etiqueta="Teléfono (WhatsApp)"
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="3549 123456"
          value={telefono}
          onChange={(e) => setTelefono(e.target.value)}
          error={errores.telefono}
          maxLength={25}
        />
        {entrega === "envio" ? (
          <Campo
            id="campo-direccion"
            etiqueta="Dirección"
            autoComplete="street-address"
            ayuda="Calle, número y alguna referencia. El costo del envío te lo confirmamos por WhatsApp."
            value={direccion}
            onChange={(e) => setDireccion(e.target.value)}
            error={errores.direccion}
            maxLength={200}
          />
        ) : null}

        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-semibold mb-1">¿Cómo pagás?</legend>
          <div className="grid grid-cols-3 gap-2">
            {PAGOS.map((p) => (
              <label
                key={p.valor}
                className="flex items-center justify-center h-11 rounded-t-sm border-2 text-sm font-semibold cursor-pointer has-[:checked]:border-t-accent has-[:checked]:bg-t-surface-alt border-t-border has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--t-focus)]"
              >
                <input type="radio" name="pago" value={p.valor} checked={pago === p.valor} onChange={() => setPago(p.valor)} className="sr-only" />
                {p.titulo}
              </label>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-1">
          <label htmlFor="campo-nota" className="text-sm font-semibold">
            Nota (opcional)
          </label>
          <textarea
            id="campo-nota"
            value={nota}
            onChange={(e) => setNota(e.target.value)}
            maxLength={500}
            rows={2}
            placeholder="Ej.: el asado cortado fino, tocar timbre"
            className="w-full rounded-t-sm bg-t-surface px-3 py-2 text-base border border-t-border-input"
          />
        </div>

        {errorGeneral ? <Aviso tipo="error">{errorGeneral}</Aviso> : null}

        <Boton
          variante="whatsapp"
          tamano="lg"
          ancho
          cargando={enviando}
          onClick={enviar}
          icono={<MessageCircle aria-hidden className="size-5" />}
        >
          {enviando ? "Enviando…" : "Enviar pedido por WhatsApp"}
        </Boton>
        <p className="text-xs text-t-muted text-center -mt-2">
          Se abre WhatsApp con el pedido escrito. Lo mandás y te respondemos para confirmarlo.
        </p>
      </section>
    </div>
  );
}
