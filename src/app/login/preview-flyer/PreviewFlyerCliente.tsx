"use client";

import dynamic from "next/dynamic";
import type { HandlersFlyer } from "@/app/flyer/FlyerVista";

const FlyerVista = dynamic(() => import("@/app/flyer/FlyerVista"), { ssr: false });

/*
 * Banco de pruebas del flyer, sin Supabase. La foto no se sube a ningún lado: se lee del disco
 * y se convierte en una dirección local del navegador, que alcanza para ver el arte con foto.
 * La imagen sí se genera de verdad, contra la ruta de pruebas que sólo existe en desarrollo.
 */
export default function PreviewFlyerCliente() {
  const handlers: HandlersFlyer = {
    async onSubirFoto(archivo) {
      return { url: URL.createObjectURL(archivo) };
    },
    endpoint: "/login/preview-flyer/imagen",
  };

  return (
    <div style={{ fontFamily: "Arial, sans-serif", maxWidth: 1200, width: "100%", minWidth: 0, margin: "0 auto", padding: 20, color: "#1A1A2E", background: "white", minHeight: "100vh", boxSizing: "border-box" }}>
      <h1 style={{ fontSize: 20, margin: "0 0 4px" }}>Preview — Flyer de ofertas</h1>
      <p style={{ fontSize: 12, color: "#888", margin: "0 0 16px" }}>
        Banco de pruebas sin Supabase. Sólo existe en desarrollo.
      </p>
      <FlyerVista handlers={handlers} />
    </div>
  );
}
