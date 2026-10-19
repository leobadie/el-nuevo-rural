import VincularTele from "./VincularTele";

/**
 * La dirección que se tipea igual en todas las teles: /tv (SPEC-cartel-vincular.md).
 *
 * Una tele ya vinculada sigue de largo a su pantalla; una nueva muestra un
 * código para vincularla desde el admin. Todo pasa en el navegador de la tele,
 * porque lo que la identifica está guardado ahí.
 */
export default function TvPage() {
  return <VincularTele />;
}
