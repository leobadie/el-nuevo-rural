import { revalidateTag } from "next/cache";
import { TAG_CATALOGO } from "@/lib/tienda/servidor";

/**
 * SÓLO EN DESARROLLO: vence el catálogo cacheado al instante. Lo usa la prueba punta a punta
 * (verificacion/tienda.mjs) después de cambiar la configuración directo en la base. En el sitio
 * publicado no existe (404): ahí la tienda se refresca al guardar en /catalogo (updateTag).
 */
export async function POST() {
  if (process.env.NODE_ENV === "production") return new Response("No encontrado", { status: 404 });
  revalidateTag(TAG_CATALOGO, { expire: 0 });
  return Response.json({ ok: true });
}
