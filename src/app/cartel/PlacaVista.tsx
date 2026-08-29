import { fmtPrecio, porcentajeAhorro, textoVigencia } from "@/lib/cartel/placas";
import type { Placa } from "@/lib/cartel/types";

/**
 * El cuerpo de una placa tal como se ve en el televisor.
 *
 * Vive aparte de la pantalla para que el admin pueda previsualizar exactamente
 * lo mismo que se va a proyectar, en vez de una maqueta parecida que se
 * despegue del original con el tiempo.
 */
export default function PlacaVista({ placa }: { placa: Placa }) {
  if (placa.tipo === "imagen") return <PlacaImagen placa={placa} />;
  if (placa.tipo === "oferta") return <PlacaOferta placa={placa} />;
  return <PlacaMensaje placa={placa} />;
}

/**
 * Cartel ya diseñado: se muestra entero y sin nada encima.
 *
 * Va con `contain` y no con `cover` a propósito. Recortar una foto de producto
 * no molesta, pero recortar un cartel puede comerse justo el precio, que es lo
 * único que importa. Prefiere que sobre fondo a que falte información.
 */
function PlacaImagen({ placa }: { placa: Placa }) {
  return (
    <div className="pl-imagen">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={placa.imagen_url ?? ""} alt="" />
    </div>
  );
}

/**
 * Oferta: franja de sección arriba (la pone la pantalla), foto a sangre, precio
 * grande y un pie con la unidad y hasta cuándo vale.
 *
 * Sin foto no queda un hueco: el bloque de datos crece y ocupa ese espacio, que
 * es el caso más común mientras no haya fotos de todos los productos.
 */
function PlacaOferta({ placa }: { placa: Placa }) {
  const off = porcentajeAhorro(placa);
  const precio = placa.precio != null ? fmtPrecio(placa.precio) : null;
  const vigencia = textoVigencia(placa);
  const conFoto = !!placa.imagen_url;

  return (
    <div className="of">
      {conFoto && (
        <div className="of-foto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={placa.imagen_url!} alt="" />
          {off != null && <span className="of-cinta">{off}% OFF</span>}
        </div>
      )}

      <div className={conFoto ? "of-datos" : "of-datos of-sin-foto"}>
        <h1 className={placa.titulo.length > 24 ? "of-titulo of-titulo-largo" : "of-titulo"}>
          {placa.titulo}
        </h1>

        {(placa.precio_anterior != null || (!conFoto && off != null)) && (
          <div className="of-antes">
            {placa.precio_anterior != null && (
              <span className="of-tachado">{fmtPrecio(placa.precio_anterior)}</span>
            )}
            {/* Con foto el descuento ya se ve en la cinta: repetirlo sería ruido. */}
            {!conFoto && off != null && <span className="of-off-inline">{off}% OFF</span>}
          </div>
        )}

        {precio && (
          <span className={precio.length > 9 ? "of-precio of-precio-largo" : "of-precio"}>
            {precio}
          </span>
        )}

        {placa.bajada && <p className="cartel-bajada">{placa.bajada}</p>}
      </div>

      <div className={placa.unidad || vigencia ? "of-pie" : "of-pie of-pie-vacio"}>
        <span>{placa.unidad ?? ""}</span>
        <span>{vigencia ?? ""}</span>
      </div>
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
