"use server";

import { updateTag } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { TAG_CATALOGO } from "@/lib/tienda/servidor";

/**
 * Después de importar o de cambiar la configuración: la tienda deja de usar el catálogo
 * cacheado y muestra lo nuevo en el próximo pedido de página. Sólo con sesión.
 */
export async function refrescarTienda(): Promise<{ ok: boolean }> {
  const sb = await createClient();
  const {
    data: { user },
  } = await sb.auth.getUser();
  if (!user) return { ok: false };
  updateTag(TAG_CATALOGO);
  return { ok: true };
}
