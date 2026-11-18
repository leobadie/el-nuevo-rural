"use client";

import { AlertTriangle, CheckCircle2, Info, Search, ShoppingBasket, X, XCircle } from "lucide-react";
import { useId, type InputHTMLAttributes, type KeyboardEvent, type ReactNode } from "react";

// ---------------------------------------------------------------- Aviso

type TipoAviso = "info" | "exito" | "error" | "atencion";
const AVISOS: Record<TipoAviso, { clase: string; icono: ReactNode; rol?: "alert" | "status" }> = {
  info: { clase: "bg-t-surface-alt text-t-text", icono: <Info aria-hidden className="size-5 shrink-0" /> },
  exito: {
    clase: "bg-t-success-bg text-t-success",
    icono: <CheckCircle2 aria-hidden className="size-5 shrink-0" />,
    rol: "status",
  },
  error: { clase: "bg-t-danger-bg text-t-danger", icono: <XCircle aria-hidden className="size-5 shrink-0" />, rol: "alert" },
  atencion: { clase: "bg-t-warning-bg text-t-on-warning", icono: <AlertTriangle aria-hidden className="size-5 shrink-0" /> },
};

export function Aviso({ tipo = "info", children }: { tipo?: TipoAviso; children: ReactNode }) {
  const a = AVISOS[tipo];
  return (
    <div role={a.rol} className={`flex gap-2 items-start rounded-t-md px-3 py-2.5 text-sm font-medium ${a.clase}`}>
      {a.icono}
      <div className="min-w-0">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------- Buscador

export function Buscador({
  valor,
  onCambiar,
  onBuscar,
}: {
  valor: string;
  onCambiar: (v: string) => void;
  onBuscar?: () => void;
}) {
  return (
    <form
      role="search"
      onSubmit={(e) => {
        e.preventDefault();
        onBuscar?.();
      }}
      className="relative w-full min-w-0"
    >
      <Search aria-hidden className="size-5 absolute left-3 top-1/2 -translate-y-1/2 text-t-muted pointer-events-none" />
      <input
        type="search"
        aria-label="Buscar productos"
        enterKeyHint="search"
        value={valor}
        onChange={(e) => onCambiar(e.target.value)}
        placeholder="Buscá leche, yerba, asado…"
        className="w-full h-11 rounded-full bg-t-surface text-t-text pl-10 pr-10 text-base border-2 border-transparent focus:border-t-highlight outline-none placeholder:text-t-muted [&::-webkit-search-cancel-button]:hidden"
      />
      {valor ? (
        <button
          type="button"
          aria-label="Borrar búsqueda"
          onClick={() => onCambiar("")}
          className="absolute right-1 top-1/2 -translate-y-1/2 size-9 flex items-center justify-center rounded-full text-t-muted hover:bg-t-surface-alt"
        >
          <X aria-hidden className="size-5" />
        </button>
      ) : null}
    </form>
  );
}

// ---------------------------------------------------------------- Segmentado

export function Segmentado<T extends string>({
  etiqueta,
  opciones,
  valor,
  onCambiar,
}: {
  etiqueta: string;
  opciones: { valor: T; titulo: string; detalle?: string; icono?: ReactNode }[];
  valor: T;
  onCambiar: (v: T) => void;
}) {
  const mover = (e: KeyboardEvent, i: number) => {
    const d = e.key === "ArrowRight" || e.key === "ArrowDown" ? 1 : e.key === "ArrowLeft" || e.key === "ArrowUp" ? -1 : 0;
    if (!d) return;
    e.preventDefault();
    const sig = opciones[(i + d + opciones.length) % opciones.length];
    onCambiar(sig.valor);
    (e.currentTarget.parentElement?.children[(i + d + opciones.length) % opciones.length] as HTMLElement)?.focus();
  };
  return (
    <div role="radiogroup" aria-label={etiqueta} className="grid grid-cols-2 gap-2">
      {opciones.map((o, i) => {
        const activo = o.valor === valor;
        return (
          <button
            key={o.valor}
            type="button"
            role="radio"
            aria-checked={activo}
            tabIndex={activo ? 0 : -1}
            onKeyDown={(e) => mover(e, i)}
            onClick={() => onCambiar(o.valor)}
            className={[
              "flex flex-col items-start gap-1 rounded-t-md p-3 text-left border-2 min-h-[72px] min-w-0",
              activo ? "border-t-accent bg-t-surface-alt" : "border-t-border bg-t-surface",
            ].join(" ")}
          >
            <span className="flex items-center gap-2 font-bold text-t-text">
              {o.icono}
              {o.titulo}
            </span>
            {o.detalle ? <span className="text-xs text-t-muted">{o.detalle}</span> : null}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- Campo

export function Campo({
  etiqueta,
  error,
  ayuda,
  ...input
}: InputHTMLAttributes<HTMLInputElement> & { etiqueta: string; error?: string; ayuda?: string }) {
  const autoId = useId();
  const id = input.id ?? autoId;
  const pie = error ?? ayuda;
  return (
    <div className="flex flex-col gap-1 min-w-0">
      <label htmlFor={id} className="text-sm font-semibold text-t-text">
        {etiqueta}
      </label>
      <input
        {...input}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={pie ? `${id}-pie` : undefined}
        className={[
          "h-11 w-full rounded-t-sm bg-t-surface px-3 text-base text-t-text border",
          error ? "border-2 border-t-danger" : "border-t-border-input",
          "disabled:opacity-50",
        ].join(" ")}
      />
      {pie ? (
        <p id={`${id}-pie`} className={`text-xs ${error ? "text-t-danger font-semibold" : "text-t-muted"}`}>
          {pie}
        </p>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------- EstadoVacio

export function EstadoVacio({ titulo, texto, accion }: { titulo: string; texto?: string; accion?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center gap-2 py-10 px-4">
      <ShoppingBasket aria-hidden className="size-12 text-t-accent" />
      <p className="text-lg font-bold text-t-text">{titulo}</p>
      {texto ? <p className="text-sm text-t-muted max-w-xs">{texto}</p> : null}
      {accion ? <div className="mt-2">{accion}</div> : null}
    </div>
  );
}
