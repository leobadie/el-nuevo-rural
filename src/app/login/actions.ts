"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Traduce el error de Supabase a un mensaje en castellano. Antes cualquier
 * falla se mostraba como "Email o contraseña incorrectos", así que un bloqueo
 * por intentos o una caída de conexión parecían una contraseña mal puesta.
 */
function mensajeDeError(codigo: string | undefined, texto: string): string {
  switch (codigo) {
    case "invalid_credentials":
      return "Email o contraseña incorrectos.";
    case "email_not_confirmed":
      return "Falta confirmar tu email antes de poder entrar.";
    case "user_banned":
      return "Tu usuario está suspendido. Pedile al administrador que lo reactive.";
    case "over_request_rate_limit":
    case "over_email_send_rate_limit":
      return "Demasiados intentos seguidos. Esperá unos minutos y volvé a probar.";
    default:
      return `No pudimos iniciar sesión (${codigo ?? texto}). Probá de nuevo en un momento.`;
  }
}

export async function login(_prevState: string | null, formData: FormData) {
  const email = String(formData.get("email") ?? "").trim();
  const password = String(formData.get("password") ?? "");

  let error;
  try {
    const supabase = await createClient();
    ({ error } = await supabase.auth.signInWithPassword({ email, password }));
  } catch (e) {
    // Sin esto, una caída de red o una variable de entorno faltante rompían la
    // acción entera y el botón quedaba colgado en "Ingresando…" sin explicación.
    return `No pudimos conectar con el servidor: ${(e as Error).message}`;
  }

  if (error) {
    return mensajeDeError(error.code, error.message);
  }

  redirect("/");
}

export async function logout() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
