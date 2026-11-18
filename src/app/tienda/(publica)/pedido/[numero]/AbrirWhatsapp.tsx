"use client";

import { MessageCircle } from "lucide-react";
import { useEffect } from "react";

/**
 * Botón grande para abrir WhatsApp con el pedido. Recién enviado, intenta abrirlo solo una
 * vez (si el navegador lo frena, queda el botón). La marca en sessionStorage evita que se
 * vuelva a abrir al recargar o al volver atrás desde WhatsApp.
 */
export function AbrirWhatsapp({ enlace, automatico, numero }: { enlace: string; automatico: boolean; numero: number }) {
  useEffect(() => {
    if (!automatico) return;
    const clave = `tienda-wa-abierto-${numero}`;
    try {
      if (window.sessionStorage.getItem(clave)) return;
      window.sessionStorage.setItem(clave, "1");
    } catch {
      /* sin almacenamiento: se intenta igual una vez */
    }
    window.location.href = enlace;
  }, [automatico, enlace, numero]);

  return (
    <a
      href={enlace}
      className="flex items-center justify-center gap-2 h-13 rounded-t-md bg-t-whatsapp text-t-on-whatsapp text-lg font-bold"
      data-test="abrir-whatsapp"
    >
      <MessageCircle aria-hidden className="size-6" />
      Abrir WhatsApp con el pedido
    </a>
  );
}
