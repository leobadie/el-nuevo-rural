import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value, options } of cookiesToSet) {
            try {
              cookieStore.set(name, value, options);
            } catch (e) {
              // Desde un Server Component no se pueden escribir cookies y el
              // error es esperable: el proxy ya refrescó la sesión en esta
              // misma request. Pero desde una Server Action sí se puede, y si
              // ahí falla el usuario queda autenticado en Supabase y sin
              // sesión en el navegador. Antes esto se descartaba en silencio,
              // así que ese caso era invisible: ahora al menos queda en el log.
              console.warn(`no se pudo escribir la cookie ${name}:`, e);
            }
          }
        },
      },
    },
  );
}
