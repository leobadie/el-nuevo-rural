import { fmtPrecio, porcentajeAhorro } from "@/lib/cartel/placas";
import type { Placa } from "@/lib/cartel/types";

/**
 * El cuerpo de una placa tal como se ve en el televisor.
 *
 * Vive aparte de la pantalla para que el admin pueda previsualizar exactamente
 * lo mismo que se va a proyectar, en vez de una maqueta parecida que se
 * despegue del original con el tiempo.
 */
export default function PlacaVista({ placa }: { placa: Placa }) {
  if (placa.tipo === "oferta") return <PlacaOferta placa={placa} />;
  return <PlacaMensaje placa={placa} />;
}

function PlacaOferta({ placa }: { placa: Placa }) {
  const off = porcentajeAhorro(placa);
  const precio = placa.precio != null ? fmtPrecio(placa.precio) : null;

  return (
    <div className="cartel-placa">
      {placa.bajada && <span className="cartel-chip">{placa.bajada}</span>}

      {placa.imagen_url && (
        // El TV pide la imagen directo: una capa de optimización de por medio es
        // un punto más donde la pantalla se puede quedar sin foto.
        // eslint-disable-next-line @next/next/no-img-element
        <img className="cartel-foto" src={placa.imagen_url} alt="" />
      )}

      <h1 className={placa.titulo.length > 26 ? "cartel-titulo cartel-titulo-largo" : "cartel-titulo"}>
        {placa.titulo}
      </h1>

      {precio && (
        <div className="cartel-precio-bloque">
          {(placa.precio_anterior != null || off != null) && (
            <div className="cartel-anterior">
              {placa.precio_anterior != null && (
                <span className="cartel-tachado">{fmtPrecio(placa.precio_anterior)}</span>
              )}
              {off != null && <span className="cartel-off">{off}% OFF</span>}
            </div>
          )}

          <span className={precio.length > 9 ? "cartel-precio cartel-precio-largo" : "cartel-precio"}>
            {precio}
          </span>

          {placa.unidad && <span className="cartel-unidad">{placa.unidad}</span>}
        </div>
      )}
    </div>
  );
}

function PlacaMensaje({ placa }: { placa: Placa }) {
  const esInstitucional = placa.tipo === "institucional";

  return (
    <div className="cartel-placa">
      {esInstitucional && !placa.imagen_url && (
        // eslint-disable-next-line @next/next/no-img-element -- ver nota de arriba
        <img className="cartel-logo-grande" src="/logo.jpg" alt="" />
      )}

      {placa.imagen_url && (
        // eslint-disable-next-line @next/next/no-img-element -- ver nota de arriba
        <img className="cartel-foto" src={placa.imagen_url} alt="" />
      )}

      <h1
        className={
          placa.titulo.length > 24
            ? "cartel-titulo-grande cartel-titulo-grande-largo"
            : "cartel-titulo-grande"
        }
      >
        {placa.titulo}
      </h1>

      {placa.bajada && (
        <>
          <div className="cartel-regla" />
          <p className="cartel-bajada">{placa.bajada}</p>
        </>
      )}
    </div>
  );
}
