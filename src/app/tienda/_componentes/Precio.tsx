import {
  formatoPrecio,
  porcentajeDescuento,
  precioPorMedida,
  sufijoPrecio,
  type SeVendePor,
} from "@/lib/tienda/formato";
import { Etiqueta } from "./Etiqueta";

type Props = {
  centavos: number;
  anteriorCentavos?: number | null;
  seVendePor: SeVendePor;
  presentacion?: string | null;
  aproximado?: boolean;
  tamano?: "md" | "lg";
};

export function Precio({ centavos, anteriorCentavos, seVendePor, presentacion, aproximado, tamano = "md" }: Props) {
  const descuento = porcentajeDescuento(centavos, anteriorCentavos);
  const medida = precioPorMedida(centavos, seVendePor, presentacion);
  const sufijo = sufijoPrecio(seVendePor);
  // Para lo que va por kg el precio grande YA es por kilo: no repetirlo abajo.
  const mostrarMedida = medida && seVendePor !== "kg";

  return (
    <div className="flex flex-col gap-0.5 tabular-nums min-w-0">
      {descuento !== null && anteriorCentavos ? (
        <div className="flex items-center gap-1.5 flex-wrap">
          <s className="text-xs text-t-muted">
            <span className="sr-only">Antes </span>
            {formatoPrecio(anteriorCentavos)}
            {sufijo}
          </s>
          <Etiqueta tipo="descuento">-{descuento}%</Etiqueta>
        </div>
      ) : null}
      <p
        className={[
          "font-extrabold leading-tight",
          tamano === "lg" ? "text-3xl" : "text-xl",
          descuento !== null ? "text-t-price-sale" : "text-t-price",
        ].join(" ")}
      >
        {aproximado ? <span className="text-sm font-semibold text-t-muted mr-1">aprox.</span> : null}
        {formatoPrecio(centavos)}
        {sufijo ? <span className="text-sm font-bold ml-0.5">{sufijo}</span> : null}
      </p>
      {mostrarMedida ? (
        <p className="text-xs text-t-muted">
          {formatoPrecio(medida.centavos)} por {medida.medida}
        </p>
      ) : null}
    </div>
  );
}
