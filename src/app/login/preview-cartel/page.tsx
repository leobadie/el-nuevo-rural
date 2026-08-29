import "../../cartel/cartel.css";
import "./variantes.css";
import { fmtPrecio } from "@/lib/cartel/placas";

/*
 * Previsualización de las tres propuestas de rediseño de la placa de oferta.
 *
 * Vive bajo /login —que es público— por el mismo motivo que las otras previews
 * del proyecto: se mira desde cualquier lado y sin sesión, y no toca datos
 * reales. Es material de decisión, no parte del cartel.
 *
 *   /login/preview-cartel        las tres, una al lado de la otra
 *   /login/preview-cartel?v=A    solo una, para capturarla a 1080x1920
 */

const OFERTA = {
  seccion: "Carnicería",
  color: "#A62C2C",
  titulo: "Asado de tira",
  precio: 8990,
  anterior: 11500,
  unidad: "el kilo",
  vigencia: "Válido hasta el domingo",
};

export default async function PreviewCartelPage({
  searchParams,
}: {
  searchParams: Promise<{ v?: string }>;
}) {
  const { v } = await searchParams;
  const sola = v?.toUpperCase();

  const variantes = [
    { id: "A", nombre: "Foto a sangre arriba", Comp: VarianteA },
    { id: "B", nombre: "Tarjeta central", Comp: VarianteB },
    { id: "C", nombre: "Precio sobre la foto", Comp: VarianteC },
  ].filter((x) => !sola || x.id === sola);

  // Con ?v=X se muestra una sola, a tamaño de televisor, para capturarla.
  if (sola && variantes.length === 1) {
    const { Comp } = variantes[0];
    return (
      <div className="cartel-fondo">
        <div className="cartel-marco" style={{ background: "#12203c" }}>
          <Comp />
        </div>
      </div>
    );
  }

  return (
    <main style={{ background: "#0d1526", minHeight: "100vh", padding: 24, color: "#fff" }}>
      <h1 style={{ fontSize: 20, fontWeight: 800, marginBottom: 4 }}>
        Placa de oferta — tres propuestas
      </h1>
      <p style={{ fontSize: 13, opacity: 0.7, marginBottom: 20 }}>
        La misma oferta con tres diseños. El gris es donde va la foto real del producto.
      </p>

      <div style={{ display: "flex", gap: 24, flexWrap: "wrap" }}>
        {variantes.map(({ id, nombre, Comp }) => (
          <div key={id}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
              {id} — {nombre}
            </div>
            <div
              className="cartel-marco"
              style={
                {
                  "--u": "0.17px",
                  background: "#12203c",
                  borderRadius: 8,
                } as React.CSSProperties
              }
            >
              <Comp />
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}

function FranjaSeccion() {
  return (
    <div className="v-franja" style={{ ["--color-seccion" as string]: OFERTA.color }}>
      <span className="v-seccion">{OFERTA.seccion}</span>
      <span className="v-marca-chica">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="v-logo-chico" src="/logo.jpg" alt="" />
        El Nuevo
        <br />
        Rural
      </span>
    </div>
  );
}

function VarianteA() {
  return (
    <div className="vA">
      <FranjaSeccion />
      <div className="v-foto" />
      <div className="vA-datos">
        <h1 className="vA-titulo">{OFERTA.titulo}</h1>
        <span className="vA-precio">{fmtPrecio(OFERTA.precio)}</span>
      </div>
      <div className="vA-pie">
        <span>{OFERTA.unidad}</span>
        <span>{OFERTA.vigencia}</span>
      </div>
    </div>
  );
}

function VarianteB() {
  return (
    <div className="vB">
      <span className="cartel-chip" style={{ background: OFERTA.color, marginBottom: 0 }}>
        {OFERTA.seccion}
      </span>
      <div className="v-foto" />
      <h1 className="vB-titulo">{OFERTA.titulo}</h1>
      <div className="vB-bloque">
        <div className="vB-antes">
          <span className="vB-tachado">{fmtPrecio(OFERTA.anterior)}</span>
          <span className="vB-off">
            {Math.round(((OFERTA.anterior - OFERTA.precio) / OFERTA.anterior) * 100)}% OFF
          </span>
        </div>
        <span className="vB-precio">{fmtPrecio(OFERTA.precio)}</span>
        <span className="vB-unidad">{OFERTA.unidad}</span>
      </div>
    </div>
  );
}

function VarianteC() {
  return (
    <div className="vC">
      <div className="v-foto" />
      <div className="vC-velo" />
      <div className="vC-contenido">
        <span className="vC-cinta" style={{ ["--color-seccion" as string]: OFERTA.color }}>
          {OFERTA.seccion}
        </span>
        <div className="vC-abajo">
          <h1 className="vC-titulo">{OFERTA.titulo}</h1>
          <span className="vC-precio">{fmtPrecio(OFERTA.precio)}</span>
          <span className="vC-unidad">{OFERTA.unidad}</span>
        </div>
      </div>
    </div>
  );
}
