import type { Metadata, Viewport } from "next";
import "./cartel.css";

export const metadata: Metadata = {
  title: "Cartel — El Nuevo Rural",
  description: "Pantalla de ofertas del local",
  // El cartel no tiene por qué aparecer en Google: es para los televisores del
  // salón, no una página del sitio.
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // El TV está prendido todo el día en un salón: fondo oscuro para que no
  // encandile y para que el marco negro del lienzo no se note.
  themeColor: "#000000",
};

export default function CartelLayout({ children }: { children: React.ReactNode }) {
  return children;
}
