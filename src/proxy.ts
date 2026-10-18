import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    // webm: el video mínimo que mantiene despierto al TV (public/cartel/despierto.webm)
    // lo pide el televisor sin sesión, igual que las imágenes.
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|webm)$).*)",
  ],
};
