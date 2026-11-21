import type { Metadata } from "next";
import Link from "next/link";
import { estadoHorario, textoProxima, type Horario } from "@/lib/tienda/envio";
import { formatoPeso, formatoPrecio, nombreLindo } from "@/lib/tienda/formato";
import { enlaceWhatsapp, envioDelPedido, mensajeWhatsapp, type PedidoParaMensaje } from "@/lib/tienda/pedido";
import { Aviso } from "../../../_componentes/Varios";
import { clienteAnonimo } from "@/lib/tienda/servidor";
import { EstadoVacio } from "../../../_componentes/Varios";
import { AbrirWhatsapp } from "./AbrirWhatsapp";

export const metadata: Metadata = { title: "Pedido enviado", robots: { index: false } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type Pedido = PedidoParaMensaje & { whatsapp: string | null; creado_el: string; horario?: Horario | null };

export default async function PedidoPage({
  params,
  searchParams,
}: {
  params: Promise<{ numero: string }>;
  searchParams: Promise<{ t?: string; nuevo?: string }>;
}) {
  const { numero } = await params;
  const { t, nuevo } = await searchParams;
  const n = Number(numero);

  let pedido: Pedido | null = null;
  if (Number.isSafeInteger(n) && n > 0 && t && UUID.test(t)) {
    const { data, error } = await clienteAnonimo().rpc("tienda_ver_pedido", { p_numero: n, p_token: t });
    if (error) console.error("tienda: ver pedido:", error);
    pedido = (data as Pedido | null) ?? null;
  }

  if (!pedido) {
    return (
      <EstadoVacio
        titulo="No encontramos ese pedido"
        texto="Revisá que el enlace esté completo. Si ya lo mandaste por WhatsApp, te respondemos por ahí."
        accion={
          <Link href="/tienda" className="inline-flex items-center h-11 px-4 rounded-t-md border-2 border-t-accent text-t-accent font-bold bg-t-surface">
            Volver a la tienda
          </Link>
        }
      />
    );
  }

  // Fuera de horario se mide a la hora en que se HIZO el pedido, no a la de ahora.
  const horario = estadoHorario(pedido.horario, new Date(pedido.creado_el));
  const fuera = horario.configurado && !horario.abierto ? horario : null;
  const enlace = pedido.whatsapp
    ? enlaceWhatsapp(pedido.whatsapp, mensajeWhatsapp({ ...pedido, fuera_de_horario: !!fuera }))
    : null;
  const envio = pedido.entrega === "envio" ? envioDelPedido(pedido) : null;

  return (
    <div className="mx-auto max-w-xl flex flex-col gap-4 min-w-0">
      <div className="rounded-t-lg bg-t-success-bg text-t-success p-4 flex flex-col gap-1">
        <p className="text-sm font-semibold">Pedido #{pedido.numero}</p>
        <h1 className="text-2xl font-extrabold">¡Ya casi! Falta mandarlo por WhatsApp</h1>
        <p className="text-sm text-t-text">
          Guardamos tu pedido. Mandá el mensaje que se abre en WhatsApp y te respondemos para confirmarlo.
        </p>
      </div>

      {fuera ? (
        <div data-test="pedido-fuera-de-horario">
          <Aviso tipo="atencion">
            Hiciste el pedido fuera de nuestro horario: lo preparamos cuando abramos ({textoProxima(fuera.proxima)}).
          </Aviso>
        </div>
      ) : null}

      {enlace ? <AbrirWhatsapp enlace={enlace} automatico={nuevo === "1"} numero={pedido.numero} /> : null}

      <section aria-labelledby="titulo-resumen" className="rounded-t-lg bg-t-surface border border-t-border p-4 flex flex-col gap-2">
        <h2 id="titulo-resumen" className="font-extrabold">
          Resumen
        </h2>
        <ul className="flex flex-col divide-y divide-t-border">
          {pedido.lineas.map((l, i) => (
            <li key={i} className="flex justify-between gap-3 py-2 text-sm">
              <span className="min-w-0">
                <span className="font-semibold tabular-nums">{l.fraccionable ? formatoPeso(Number(l.cantidad)) : `${l.cantidad} ×`}</span>{" "}
                {nombreLindo(l.nombre)}
              </span>
              <span className="tabular-nums whitespace-nowrap">
                {l.fraccionable ? "aprox. " : ""}
                {formatoPrecio(l.subtotal_centavos)}
              </span>
            </li>
          ))}
        </ul>
        {envio !== null && pedido.subtotal_centavos !== undefined ? (
          <p className="flex justify-between text-sm border-t border-t-border pt-2">
            <span>Subtotal</span>
            <span className="tabular-nums">{formatoPrecio(pedido.subtotal_centavos)}</span>
          </p>
        ) : null}
        {envio !== null ? (
          <p className="flex justify-between text-sm" data-test="pedido-envio">
            <span>Envío</span>
            <span className="tabular-nums">{envio}</span>
          </p>
        ) : null}
        <p className="flex justify-between font-extrabold text-lg border-t border-t-border pt-2">
          <span>{pedido.total_aproximado ? "Total aproximado" : "Total"}</span>
          <span className="tabular-nums">{formatoPrecio(pedido.total_centavos)}</span>
        </p>
        <p className="text-sm text-t-muted">
          {pedido.entrega === "retiro" ? "Retiro en el local" : `Envío a ${pedido.direccion}`} · Pago:{" "}
          {pedido.forma_pago}
        </p>
      </section>

      <Link href="/tienda" className="self-center inline-flex items-center min-h-11 px-2 text-sm font-semibold text-t-accent underline underline-offset-2">
        Volver a la tienda
      </Link>
    </div>
  );
}
