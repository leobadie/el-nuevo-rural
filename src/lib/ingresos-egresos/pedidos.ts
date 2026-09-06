import { fmtDate } from "@/lib/cheques/calculos";
import type { ItemPedido } from "./types";
import { hoyISO } from "@/lib/fechas";

export function textoPedido(proveedor: string, items: ItemPedido[], notas: string): string {
  const hoy = hoyISO();
  let texto = `*Pedido — El Nuevo Rural* (${fmtDate(hoy)})\n`;
  texto += `Para: ${proveedor}\n\n`;
  items
    .filter((i) => i.producto.trim())
    .forEach((i) => {
      let linea = `• ${i.producto}`;
      if (i.cantidad) {
        linea += ` — ${i.cantidad}`;
        if (i.unidad) linea += ` ${i.unidad}`;
      }
      texto += linea + "\n";
    });
  if (notas.trim()) {
    texto += `\nNotas: ${notas.trim()}`;
  }
  return texto;
}

export function waUrlParaPedido(telefono: string | null | undefined, texto: string): string {
  const digits = (telefono || "").replace(/[^\d+]/g, "");
  const base = digits ? `https://wa.me/${digits}` : "https://wa.me/";
  return `${base}?text=${encodeURIComponent(texto)}`;
}
