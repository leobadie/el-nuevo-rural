import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: { default: "El Nuevo Rural · Supermercado", template: "%s · El Nuevo Rural" },
  description: "Hacé tu pedido al Supermercado El Nuevo Rural y retiralo en el local o recibilo en tu casa.",
};

export const viewport: Viewport = {
  themeColor: "#b80f0a",
};

export default function TiendaLayout({ children }: { children: React.ReactNode }) {
  return <div className="tienda flex-1 flex flex-col">{children}</div>;
}
