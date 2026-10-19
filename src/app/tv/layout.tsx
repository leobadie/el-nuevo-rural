import type { Metadata, Viewport } from "next";
import "../cartel/cartel.css";

export const metadata: Metadata = {
  title: "Televisor — El Nuevo Rural",
  description: "Vincular un televisor del local",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#000000",
};

export default function TvLayout({ children }: { children: React.ReactNode }) {
  return children;
}
