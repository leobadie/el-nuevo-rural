/**
 * Fecha de hoy según el reloj de quien está usando la app, en formato ISO (YYYY-MM-DD).
 *
 * Existe porque `new Date().toISOString().slice(0, 10)` NO es la fecha de hoy: pasa el
 * momento a UTC primero. En Argentina (UTC-3) eso significa que a partir de las 21:00 la
 * fecha ya salta al día siguiente, y un pago cargado a las 21:30 del 5 se guardaba con
 * fecha 6. Cargar de noche es lo normal en el local: se cierra la caja y recién ahí se
 * anota, así que el bug pegaba justo en el horario de más uso.
 *
 * `getFullYear`/`getMonth`/`getDate` leen el calendario local, que es el que mira el
 * usuario cuando dice "hoy".
 */
export function hoyISO(): string {
  const x = new Date();
  return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, "0")}-${String(x.getDate()).padStart(2, "0")}`;
}

/** Mes actual (YYYY-MM) en hora local, por lo mismo que arriba. */
export function mesActualISO(): string {
  return hoyISO().slice(0, 7);
}
