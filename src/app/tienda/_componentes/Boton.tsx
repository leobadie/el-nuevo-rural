import { Loader2 } from "lucide-react";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type Variante = "primario" | "whatsapp" | "secundario" | "fantasma" | "peligro";
type Tamano = "sm" | "md" | "lg";

const VARIANTES: Record<Variante, string> = {
  primario: "bg-t-accent text-t-on-accent hover:bg-t-accent-hover",
  whatsapp: "bg-t-whatsapp text-t-on-whatsapp hover:brightness-95",
  secundario: "bg-t-surface text-t-accent border-2 border-t-accent hover:bg-t-surface-alt",
  fantasma: "bg-transparent text-t-text hover:bg-t-surface-alt",
  peligro: "bg-t-surface text-t-danger border-2 border-t-danger hover:bg-t-danger-bg",
};

const TAMANOS: Record<Tamano, string> = {
  sm: "h-9 px-3 text-sm",
  md: "h-11 px-4 text-base",
  lg: "h-13 px-5 text-lg",
};

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: Variante;
  tamano?: Tamano;
  ancho?: boolean;
  cargando?: boolean;
  icono?: ReactNode;
};

export function Boton({
  variante = "primario",
  tamano = "md",
  ancho = false,
  cargando = false,
  icono,
  disabled,
  className = "",
  children,
  type = "button",
  ...resto
}: Props) {
  return (
    <button
      type={type}
      disabled={disabled || cargando}
      aria-busy={cargando || undefined}
      className={[
        "inline-flex items-center justify-center gap-2 rounded-t-md font-bold select-none",
        "transition-[background-color,transform,filter] duration-150 active:scale-[.98]",
        "disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100",
        VARIANTES[variante],
        TAMANOS[tamano],
        ancho ? "w-full" : "",
        className,
      ].join(" ")}
      {...resto}
    >
      {cargando ? <Loader2 aria-hidden className="size-5 animate-spin" /> : icono}
      {children}
    </button>
  );
}
