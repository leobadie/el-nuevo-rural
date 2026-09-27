import { notFound } from "next/navigation";
import PreviewCorteCliente from "./PreviewCorteCliente";

/*
 * Banco de pruebas del aviso de corte de registros de Ingresos y Egresos
 * (SPEC-corte-registros.md), sin Supabase. Vive bajo /login porque es la única ruta que el proxy
 * deja pasar sin sesión, y sólo existe en desarrollo.
 *
 * El script que lo verifica es `npm run verificar:corte-navegador`.
 */
export default function PreviewCortePage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PreviewCorteCliente />;
}
