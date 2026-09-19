import { notFound } from "next/navigation";
import PreviewFlyerCliente from "./PreviewFlyerCliente";

/*
 * Banco de pruebas del flyer para verificarlo en el navegador sin sesión. Vive bajo /login
 * porque es la única ruta que el proxy deja pasar, y sólo existe en desarrollo: en producción
 * devuelve 404.
 *
 * El script que lo verifica es `npm run verificar:flyer`.
 */
export default function PreviewFlyerPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PreviewFlyerCliente />;
}
