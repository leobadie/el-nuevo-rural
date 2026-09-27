import { redirect } from "next/navigation";

/*
 * El flyer ahora es una pestaña del módulo de ofertas (SPEC-ofertas.md): se arma con las
 * mismas ofertas que van a los televisores. Esta dirección queda como atajo para que un
 * marcador guardado no dé error.
 */
export default function FlyerPage() {
  redirect("/cartel/admin?vista=flyer");
}
