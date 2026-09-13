import { notFound } from "next/navigation";
import PreviewMunicipalidadCliente from "./PreviewMunicipalidadCliente";

/*
 * Banco de pruebas de las cobranzas de la Municipalidad, con facturas y cobros ficticios, para
 * verificarlas en el navegador sin depender de datos reales ni de Supabase. Vive bajo /login
 * porque es la única ruta que el proxy deja pasar sin sesión, y sólo existe en desarrollo: en
 * producción devuelve 404.
 *
 * El script que lo verifica es `npm run verificar:municipalidad`.
 */
export default function PreviewMunicipalidadPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PreviewMunicipalidadCliente />;
}
