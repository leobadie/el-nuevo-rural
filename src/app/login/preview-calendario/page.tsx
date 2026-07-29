import { notFound } from "next/navigation";
import PreviewCalendarioCliente from "./PreviewCalendarioCliente";

/*
 * Banco de pruebas del calendario con cheques ficticios, para poder verificarlo en el
 * navegador sin depender de datos reales. Vive bajo /login porque es la única ruta que el
 * proxy deja pasar sin sesión, y sólo existe en desarrollo: en producción devuelve 404.
 * El script que lo verifica está en scratchpad/verificar-calendario.js.
 */
export default function PreviewCalendarioPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PreviewCalendarioCliente />;
}
