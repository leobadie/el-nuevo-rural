"use client";

import { Minus, Plus, Trash2 } from "lucide-react";
import { formatoPeso } from "@/lib/tienda/formato";

type Props = {
  /** Unidades, o kilos si es pesable. */
  valor: number;
  onCambiar: (nuevo: number) => void;
  pesable: boolean;
  /** Paso en gramos para lo pesable (100 o 250). */
  pasoGramos?: number;
  nombre: string;
  atajos?: boolean;
};

const MAX_UNIDADES = 99;
const MAX_KG = 10;

/** Redondea a gramos enteros para que 0.1 + 0.15 no muestre "249.99 g". */
const enGramos = (kg: number) => Math.round(kg * 1000);

export function Cantidad({ valor, onCambiar, pesable, pasoGramos = 250, nombre, atajos = false }: Props) {
  const paso = pesable ? pasoGramos / 1000 : 1;
  const minimo = paso;
  const maximo = pesable ? MAX_KG : MAX_UNIDADES;
  const enMinimo = enGramos(valor) <= enGramos(minimo);
  const enMaximo = enGramos(valor) >= enGramos(maximo);

  const bajar = () => onCambiar(enMinimo ? 0 : enGramos(valor - paso) / 1000);
  const subir = () => onCambiar(Math.min(maximo, enGramos(valor + paso) / 1000));

  const texto = pesable ? formatoPeso(valor) : String(valor);

  return (
    <div className="flex flex-col gap-1.5 w-full min-w-0">
      <div
        role="group"
        aria-label={`Cantidad de ${nombre}`}
        className="flex items-center justify-between h-12 rounded-t-md border-2 border-t-accent bg-t-surface overflow-hidden"
      >
        <button
          type="button"
          onClick={bajar}
          aria-label={enMinimo ? `Quitar ${nombre}` : "Menos"}
          className="h-full w-11 shrink-0 flex items-center justify-center text-t-accent hover:bg-t-surface-alt"
        >
          {enMinimo ? <Trash2 aria-hidden className="size-5" /> : <Minus aria-hidden className="size-5" />}
        </button>
        <span aria-live="polite" className="font-bold tabular-nums text-t-text text-base truncate px-1">
          {texto}
        </span>
        <button
          type="button"
          onClick={subir}
          disabled={enMaximo}
          aria-label="Más"
          className="h-full w-11 shrink-0 flex items-center justify-center text-t-accent hover:bg-t-surface-alt disabled:opacity-40"
        >
          <Plus aria-hidden className="size-5" />
        </button>
      </div>
      {pesable && atajos ? (
        <div className="grid grid-cols-3 gap-1.5" aria-label="Atajos de peso">
          {[
            { kg: 0.25, t: "¼ kg" },
            { kg: 0.5, t: "½ kg" },
            { kg: 1, t: "1 kg" },
          ].map((a) => (
            <button
              key={a.t}
              type="button"
              onClick={() => onCambiar(a.kg)}
              aria-pressed={enGramos(valor) === enGramos(a.kg)}
              className="h-11 rounded-t-sm text-sm font-semibold border border-t-border bg-t-surface text-t-text aria-pressed:bg-t-surface-alt aria-pressed:border-t-accent"
            >
              {a.t}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
