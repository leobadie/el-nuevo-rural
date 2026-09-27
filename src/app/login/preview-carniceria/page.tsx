import { notFound } from "next/navigation";
import PreviewCarniceriaCliente from "./PreviewCarniceriaCliente";

/*
 * Banco de pruebas de la carnicería, con gastos fijos y medias reses ficticias, para verificarla
 * en el navegador sin depender de datos reales ni de Supabase. Vive bajo /login porque es la
 * única ruta que el proxy deja pasar sin sesión, y sólo existe en desarrollo: en producción
 * devuelve 404.
 *
 * El script que lo verifica es `npm run verificar:carniceria`.
 */
export default function PreviewCarniceriaPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PreviewCarniceriaCliente />;
}
