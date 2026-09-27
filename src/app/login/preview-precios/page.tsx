import { notFound } from "next/navigation";
import PreciosVista from "@/app/precios/PreciosVista";

/*
 * Banco de pruebas de la calculadora de precios (SPEC-precios.md): la misma vista, sin pedir
 * sesión. Vive bajo /login porque es la única ruta que el proxy deja pasar sin sesión, y sólo
 * existe en desarrollo.
 *
 * El script que lo verifica es `npm run verificar:precios`.
 */
export default function PreviewPreciosPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <div style={{ fontFamily: "Arial, sans-serif", maxWidth: 1000, width: "100%", minWidth: 0, margin: "0 auto", padding: 16, color: "#1A1A2E", background: "white", minHeight: "100vh", boxSizing: "border-box" }}>
      <p style={{ background: "#FEF9E7", padding: "6px 10px", borderRadius: 6, fontSize: 12, margin: "0 0 12px" }}>Banco de pruebas de la calculadora de precios.</p>
      <PreciosVista />
    </div>
  );
}
