import { notFound } from "next/navigation";
import PreviewProveedoresCliente from "./PreviewProveedoresCliente";

/*
 * Banco de pruebas de la cuenta corriente de proveedores, con entregas y pagos ficticios,
 * para poder verificarla en el navegador sin depender de datos reales ni de Supabase.
 * Vive bajo /login porque es la única ruta que el proxy deja pasar sin sesión, y sólo
 * existe en desarrollo: en producción devuelve 404.
 *
 * El script que lo verifica es `npm run verificar:proveedores`.
 */
export default function PreviewProveedoresPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <PreviewProveedoresCliente />;
}
