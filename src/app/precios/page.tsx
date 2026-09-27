import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NARANJA } from "@/lib/precios/estilos";
import PreciosVista from "./PreciosVista";

/* La calculadora de precios (SPEC-precios.md). No lee ni guarda datos: sólo pide sesión. */
export default async function PreciosPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  return (
    // width: 100% y minWidth: 0: este div es hijo de un body flex (ver el resto de los módulos).
    <div style={{ fontFamily: "Arial, sans-serif", maxWidth: 1000, width: "100%", minWidth: 0, margin: "0 auto", padding: 16, color: "#1A1A2E", background: "white", minHeight: "100vh", boxSizing: "border-box" }}>
      <div style={{ background: NARANJA, color: "white", padding: "16px 20px", borderRadius: 10, marginBottom: 14, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ width: 46, height: 46, borderRadius: 12, flexShrink: 0, overflow: "hidden", boxShadow: "0 2px 6px rgba(0,0,0,0.25)" }}>
          <Image src="/logo.jpg" alt="Logo El Nuevo Rural" width={46} height={46} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        <div style={{ flex: "1 1 180px", minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: 0.3 }}>EL NUEVO RURAL</h1>
          <p style={{ margin: "2px 0 0", fontSize: 13, opacity: 0.9 }}>Calculadora de precios · margen sin IVA</p>
        </div>
        <Link href="/" style={{ color: "white", fontSize: 13, fontWeight: 700, opacity: 0.9 }}>
          ← Volver
        </Link>
      </div>
      <PreciosVista />
    </div>
  );
}
