import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { CatalogoAdmin, type ConfigAdmin, type UltimaImportacion } from "./CatalogoAdmin";

export const metadata = { title: "Tienda online · El Nuevo Rural" };

/* Admin de la tienda online (SPEC-tienda.md, req. 6–10): importar el Excel y configurar. */
export default async function CatalogoPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const [cfg, imp, cuenta] = await Promise.all([
    supabase.from("tienda_config").select("abierta, whatsapp, direccion_retiro").maybeSingle(),
    supabase
      .from("tienda_importaciones")
      .select("archivo, filas, nuevos, cambios_de_precio, retirados, creado_el")
      .order("creado_el", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("tienda_productos").select("codigo_xrp", { count: "exact", head: true }).eq("en_ultima_importacion", true),
  ]);

  // Si la migración 033 no está aplicada, las tablas no existen: se avisa en vez de romper.
  const faltaMigracion = [cfg.error, imp.error, cuenta.error].some((e) => e && /does not exist|schema cache|tienda_/i.test(e.message));

  return (
    // width: 100% y minWidth: 0: este div es hijo de un body flex (ver el resto de los módulos).
    <div style={{ fontFamily: "Arial, sans-serif", maxWidth: 1000, width: "100%", minWidth: 0, margin: "0 auto", padding: 16, color: "#1A1A2E", background: "white", minHeight: "100vh", boxSizing: "border-box" }}>
      <div style={{ background: "#B80F0A", color: "white", padding: "16px 20px", borderRadius: 10, marginBottom: 14, display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap" }}>
        <div style={{ width: 46, height: 46, borderRadius: 12, flexShrink: 0, overflow: "hidden", boxShadow: "0 2px 6px rgba(0,0,0,0.25)" }}>
          <Image src="/logo.jpg" alt="Logo El Nuevo Rural" width={46} height={46} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        <div style={{ flex: "1 1 180px", minWidth: 0 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: 0.3 }}>EL NUEVO RURAL</h1>
          <p style={{ margin: "2px 0 0", fontSize: 13, opacity: 0.9 }}>Tienda online · productos y pedidos por WhatsApp</p>
        </div>
        <Link href="/" style={{ color: "white", fontSize: 13, fontWeight: 700, opacity: 0.9 }}>
          ← Volver
        </Link>
      </div>
      <CatalogoAdmin
        faltaMigracion={faltaMigracion}
        config={(cfg.data as ConfigAdmin | null) ?? { abierta: false, whatsapp: null, direccion_retiro: null }}
        ultima={(imp.data as UltimaImportacion | null) ?? null}
        productosPublicados={cuenta.count ?? 0}
      />
    </div>
  );
}
