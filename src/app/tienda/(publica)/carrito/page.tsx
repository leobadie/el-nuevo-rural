import type { Metadata } from "next";
import { CarritoVista } from "./CarritoVista";

export const metadata: Metadata = { title: "Tu pedido", robots: { index: false } };

export default function CarritoPage() {
  return <CarritoVista />;
}
