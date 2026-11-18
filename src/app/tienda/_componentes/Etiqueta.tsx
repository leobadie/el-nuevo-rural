import type { ReactNode } from "react";

type Tipo = "descuento" | "mayores" | "pesable" | "nuevo";

const TIPOS: Record<Tipo, string> = {
  descuento: "bg-t-highlight text-t-on-highlight",
  // Estas dos van encima de la foto (o del reemplazo crema): fondo blanco con borde para
  // que se lean sobre cualquier imagen.
  mayores: "bg-t-surface text-t-on-warning border border-t-border-input",
  pesable: "bg-t-surface text-t-text border border-t-border-input",
  nuevo: "bg-t-success-bg text-t-success",
};

export function Etiqueta({ tipo, children, titulo }: { tipo: Tipo; children: ReactNode; titulo?: string }) {
  return (
    <span
      title={titulo}
      className={`inline-flex items-center h-[22px] px-2 rounded-full text-xs font-bold whitespace-nowrap ${TIPOS[tipo]}`}
    >
      {children}
    </span>
  );
}
