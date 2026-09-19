"use client";

import Image from "next/image";
import Link from "next/link";
import dynamic from "next/dynamic";
import { createClient } from "@/lib/supabase/client";
import type { HandlersFlyer } from "./FlyerVista";

/*
 * Sin render en el servidor: la vista lee de entrada lo último que quedó cargado en este
 * navegador (R3.7), y el servidor no tiene forma de saberlo. Prerenderizarla mostraría un
 * flyer vacío que al hidratar cambia de golpe.
 */
const FlyerVista = dynamic(() => import("./FlyerVista"), { ssr: false });

const AZUL = "#1F3864";

export default function FlyerShell() {
  const supabase = createClient();

  const handlers: HandlersFlyer = {
    // Reusa el bucket `cartel`, que ya existe y es público: el mismo mecanismo del admin de
    // placas (SPEC-flyer.md R3.3). No se inventa una segunda forma de subir fotos.
    async onSubirFoto(archivo) {
      try {
        const ext = archivo.name.split(".").pop()?.toLowerCase() || "jpg";
        const nombre = `flyer-${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from("cartel").upload(nombre, archivo, {
          cacheControl: "3600",
          upsert: false,
        });
        if (error) throw error;
        const { data } = supabase.storage.from("cartel").getPublicUrl(nombre);
        return { url: data.publicUrl };
      } catch (e) {
        return { error: `No se pudo subir la foto: ${(e as Error).message}` };
      }
    },
    endpoint: "/api/flyer",
  };

  return (
    // minWidth: 0 porque este div es hijo de un body flex: sin él, el ancho del arte de 1080 px
    // estira el documento entero y deja los botones fuera de la pantalla en el teléfono.
    <div style={{ fontFamily: "Arial, sans-serif", maxWidth: 1200, width: "100%", minWidth: 0, margin: "0 auto", padding: 20, color: "#1A1A2E", background: "white", minHeight: "100vh", boxSizing: "border-box" }}>
      <div style={{ background: AZUL, color: "white", padding: "18px 24px", borderRadius: 10, marginBottom: 16, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ width: 50, height: 50, borderRadius: 12, flexShrink: 0, overflow: "hidden", boxShadow: "0 2px 6px rgba(0,0,0,0.25)" }}>
          <Image src="/logo.jpg" alt="Logo El Nuevo Rural" width={50} height={50} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        <div style={{ flex: "1 1 180px", minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: 0.3 }}>EL NUEVO RURAL</h1>
          <p style={{ margin: "2px 0 0", fontSize: 13, opacity: 0.85 }}>Flyer de ofertas</p>
        </div>
        <Link href="/" style={{ color: "white", fontSize: 13, fontWeight: 700, opacity: 0.9 }}>
          ← Volver
        </Link>
      </div>

      <FlyerVista handlers={handlers} />
    </div>
  );
}
