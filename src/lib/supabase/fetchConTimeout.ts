/**
 * fetch con límite de tiempo para las llamadas a Supabase.
 *
 * Sin esto, si un servicio de Supabase deja de responder, la request se queda
 * esperando indefinidamente: el login queda clavado en "Ingresando…" y las
 * páginas nunca terminan de cargar, sin ningún mensaje. Cortando a los 8
 * segundos el error sube y la app puede explicar qué pasó.
 */
const LIMITE_MS = 8_000;

export const fetchConTimeout: typeof fetch = (input, init) => {
  // Respetamos un signal propio si la llamada ya trae uno.
  const signal = init?.signal
    ? AbortSignal.any([init.signal, AbortSignal.timeout(LIMITE_MS)])
    : AbortSignal.timeout(LIMITE_MS);

  return fetch(input, { ...init, signal });
};
