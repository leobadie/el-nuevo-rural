import { notFound } from "next/navigation";
import { Vitrina } from "./Vitrina";

export const metadata = { title: "Componentes", robots: { index: false } };

/** Vitrina de componentes de la tienda. Sólo existe en desarrollo. */
export default function DisenoPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return <Vitrina />;
}
