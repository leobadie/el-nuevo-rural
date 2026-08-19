import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";

const PUBLIC_PATHS = ["/login"];

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }
          supabaseResponse = NextResponse.next({ request });
          for (const { name, value, options } of cookiesToSet) {
            supabaseResponse.cookies.set(name, value, options);
          }
        },
      },
    },
  );

  let user: User | null = null;

  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch (e) {
    // getUser() sale a la red contra Supabase. Como este proxy corre en todas
    // las rutas —incluida /login—, si la excepción sube se cae el sitio entero
    // y ni siquiera se puede abrir la pantalla de login para reintentar.
    // Dejamos pasar la request: cada página valida la sesión por su cuenta y
    // manda a /login si hace falta, así que un problema de red degrada el
    // acceso en vez de tumbarlo.
    console.error("proxy: no se pudo validar la sesión:", e);
    return supabaseResponse;
  }

  const isPublicPath = PUBLIC_PATHS.some((path) =>
    request.nextUrl.pathname.startsWith(path),
  );

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && request.nextUrl.pathname === "/login") {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
