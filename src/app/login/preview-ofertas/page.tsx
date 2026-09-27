// En la app lo trae el layout de /cartel; este banco vive bajo /login y lo tiene que importar él.
import "../../cartel/cartel.css";
import { notFound } from "next/navigation";
import PreviewOfertasCliente from "./PreviewOfertasCliente";

/*
 * Banco de pruebas del módulo de ofertas (televisores + flyer) con una base en memoria, para
 * verificarlo en el navegador sin sesión ni datos reales. Vive bajo /login porque es la única
 * ruta que el proxy deja pasar sin sesión, y sólo existe en desarrollo.
 *
 * El script que lo verifica es `npm run verificar:ofertas`.
 */
export default async function PreviewOfertasPage({
  searchParams,
}: {
  searchParams: Promise<{ [clave: string]: string | string[] | undefined }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();
  const { vista } = await searchParams;
  return <PreviewOfertasCliente vista={vista === "flyer" || vista === "televisores" ? vista : "ofertas"} />;
}
