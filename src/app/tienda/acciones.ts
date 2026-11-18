"use server";

import { clienteAnonimo } from "@/lib/tienda/servidor";
import { explicarError } from "@/lib/tienda/pedido";

export type DatosPedido = {
  nombre: string;
  telefono: string;
  entrega: "retiro" | "envio";
  direccion: string;
  forma_pago: "efectivo" | "transferencia" | "tarjeta";
  nota: string;
  lineas: { codigo: string; cantidad: number }[];
};

export type RespuestaPedido =
  | { ok: true; numero: number; token: string }
  | { ok: false; campo?: string; mensaje: string };

/**
 * Guarda el pedido con tienda_crear_pedido (que valida todo y toma los precios de la
 * base). Corre como anónimo: el cliente no tiene cuenta. El mensaje de WhatsApp se arma
 * en la pantalla del pedido, a partir de lo que quedó guardado.
 */
export async function enviarPedido(datos: DatosPedido): Promise<RespuestaPedido> {
  const lineas = Array.isArray(datos?.lineas)
    ? datos.lineas
        .filter((l) => l && typeof l.codigo === "string" && Number.isFinite(l.cantidad))
        .map((l) => ({ codigo: l.codigo.slice(0, 40), cantidad: l.cantidad }))
    : [];
  const { data, error } = await clienteAnonimo().rpc("tienda_crear_pedido", {
    p: {
      nombre: String(datos?.nombre ?? "").slice(0, 100),
      telefono: String(datos?.telefono ?? "").slice(0, 30),
      entrega: datos?.entrega,
      direccion: String(datos?.direccion ?? "").slice(0, 200),
      forma_pago: datos?.forma_pago,
      nota: String(datos?.nota ?? "").slice(0, 500),
      lineas: lineas.slice(0, 101),
    },
  });
  if (error || !data) {
    if (error && !error.message.includes("tienda:")) console.error("tienda: crear pedido:", error);
    const e = explicarError(error?.message ?? "");
    return { ok: false, campo: e.campo, mensaje: e.texto };
  }
  return { ok: true, numero: data.numero, token: data.token };
}
