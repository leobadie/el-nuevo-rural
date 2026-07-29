import { notFound } from "next/navigation";
import PreviewVerificacionCliente from "./PreviewVerificacionCliente";

/*
 * Banco de pruebas de la pestaña Verificación, para poder probarla en el navegador sin
 * depender del login. Vive bajo /login porque es la única ruta que el proxy deja pasar sin
 * sesión, y sólo existe en desarrollo: en producción devuelve 404.
 * El script que la verifica está en verificacion/bcra.mjs.
 */
export default function PreviewVerificacionPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PreviewVerificacionCliente />;
}
