import { fmtPrecio } from "@/lib/cartel/placas";
import { AIRE, anchosDeFila, colorDeFlyer, descuentoDe, escalaDe, ENCABEZADO, MEDIDAS, PIE, tamanoQueEntra } from "./calculos";
import type { Flyer, FormatoFlyer, ProductoFlyer } from "./tipos";

/*
 * El dibujo del flyer, y el único (SPEC-flyer.md R1.1): lo usa la vista previa en pantalla y
 * lo usa el PNG que arma el servidor, así que lo que se ve es literalmente lo que se descarga.
 *
 * Por eso está escrito con el subconjunto de CSS que entiende Satori (el motor de `next/og`):
 *   - sólo flexbox, nunca `grid`;
 *   - todo contenedor con más de un hijo lleva `display: "flex"` explícito;
 *   - separaciones con `margin`, no con `gap`;
 *   - estilos inline, nada de clases ni de `cartel.css`.
 * Los valores (colores, formato de precio, regla del % OFF) sí se heredan del cartel, para que
 * el flyer y los televisores se vean como lo mismo.
 */

const BLANCO = "#fff";
const FONDO = "#12203c";
const AMARILLO = "#ffd400";
const SOBRE_AMARILLO = "#1a1a2e";
const VELO = "rgba(0,0,0,0.28)";
const FILA = "rgba(255,255,255,0.07)";

const FUENTE = 'Geist, var(--font-geist-sans), Arial, Helvetica, sans-serif';

function Precio({ p, escala, ancho }: { p: ProductoFlyer; escala: ReturnType<typeof escalaDe>; ancho: number }) {
  const off = descuentoDe(p);
  const texto = p.precio == null ? "" : fmtPrecio(p.precio);
  // El precio se achica hasta entrar en su columna: un "$ 124.999,50" no puede pisar al nombre.
  const fs = tamanoQueEntra(texto, ancho, escala.precioFS, 36);

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        // Apilado el precio cuelga del nombre, así que arranca del mismo borde.
        alignItems: escala.apilado ? "flex-start" : "flex-end",
        width: ancho,
        flexShrink: 0,
      }}
    >
      {(p.precio_anterior != null || off != null) && (
        <div style={{ display: "flex", alignItems: "center" }}>
          {p.precio_anterior != null && (
            <div
              style={{
                fontSize: escala.tachadoFS,
                fontWeight: 600,
                opacity: 0.72,
                textDecoration: "line-through",
              }}
            >
              {fmtPrecio(p.precio_anterior)}
            </div>
          )}
          {off != null && (
            <div
              style={{
                display: "flex",
                marginLeft: p.precio_anterior != null ? Math.round(escala.tachadoFS * 0.4) : 0,
                backgroundColor: AMARILLO,
                color: SOBRE_AMARILLO,
                fontSize: Math.round(escala.tachadoFS * 0.92),
                fontWeight: 900,
                borderRadius: 999,
                padding: `${Math.round(escala.tachadoFS * 0.18)}px ${Math.round(escala.tachadoFS * 0.5)}px`,
              }}
            >
              {off}% OFF
            </div>
          )}
        </div>
      )}
      <div
        style={{
          fontSize: fs,
          fontWeight: 900,
          lineHeight: 1,
          letterSpacing: -2,
          marginTop: 4,
        }}
      >
        {texto}
      </div>
    </div>
  );
}

function Fila({ p, escala, ultimo }: { p: ProductoFlyer; escala: ReturnType<typeof escalaDe>; ultimo: boolean }) {
  const anchos = anchosDeFila(escala, !!p.imagen_url);
  const nombre = p.nombre.trim().toUpperCase();
  // La palabra más larga es la que decide: si no entra de una, el nombre se parte feo.
  const palabra = nombre.split(/\s+/).reduce((a, b) => (b.length > a.length ? b : a), "");
  const nombreFS = tamanoQueEntra(palabra, anchos.nombre, escala.nombreFS, 26);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        height: escala.altoFila,
        marginBottom: ultimo ? 0 : escala.hueco,
        backgroundColor: FILA,
        borderRadius: 28,
        padding: "0 30px",
        overflow: "hidden",
      }}
    >
      {p.imagen_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={p.imagen_url}
          alt=""
          width={escala.foto}
          height={escala.foto}
          style={{ width: escala.foto, height: escala.foto, objectFit: "cover", borderRadius: 20, flexShrink: 0 }}
        />
      )}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          width: anchos.nombre,
          flexShrink: 0,
          marginLeft: p.imagen_url ? 28 : 0,
          marginRight: escala.apilado ? 0 : 20,
        }}
      >
        <div style={{ fontSize: nombreFS, fontWeight: 900, lineHeight: 1.04 }}>{nombre}</div>
        {p.unidad?.trim() && (
          <div style={{ fontSize: escala.unidadFS, fontWeight: 600, opacity: 0.8, marginTop: 6 }}>
            {p.unidad.trim()}
          </div>
        )}
        {/* Apilado, el precio es el siguiente renglón del mismo bloque. */}
        {escala.apilado && <Precio p={p} escala={escala} ancho={anchos.precio} />}
      </div>
      {!escala.apilado && <Precio p={p} escala={escala} ancho={anchos.precio} />}
    </div>
  );
}

/**
 * @param logoSrc De dónde sale el logo: en pantalla alcanza "/logo.jpg", pero Satori no
 *   resuelve rutas relativas, así que el servidor le pasa la dirección completa.
 */
export default function FlyerArte({
  flyer,
  formato,
  logoSrc = "/logo.jpg",
}: {
  flyer: Flyer;
  formato: FormatoFlyer;
  logoSrc?: string;
}) {
  const medida = MEDIDAS[formato];
  const productos = flyer.productos;
  const escala = escalaDe(formato, productos.length);
  const color = colorDeFlyer(flyer.seccion);
  const pie = flyer.pie;

  return (
    <div
      style={{
        width: medida.ancho,
        height: medida.alto,
        display: "flex",
        flexDirection: "column",
        backgroundColor: FONDO,
        color: BLANCO,
        fontFamily: FUENTE,
      }}
    >
      {/* data-test lo ignora Satori al dibujar el PNG; sirve para poder verificar el color. */}
      <div data-test="flyer-franja" style={{ display: "flex", alignItems: "center", height: ENCABEZADO, backgroundColor: color, padding: "0 50px" }}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={logoSrc}
          alt=""
          width={126}
          height={126}
          style={{ width: 126, height: 126, borderRadius: 999, objectFit: "cover", backgroundColor: BLANCO, flexShrink: 0 }}
        />
        <div style={{ display: "flex", flexDirection: "column", marginLeft: 30, flexGrow: 1, minWidth: 0 }}>
          <div style={{ fontSize: flyer.titulo.length > 22 ? 52 : 66, fontWeight: 900, lineHeight: 1.04, letterSpacing: 1 }}>
            {flyer.titulo.trim().toUpperCase()}
          </div>
          {flyer.vigencia.trim() && (
            <div style={{ fontSize: 34, fontWeight: 600, opacity: 0.9, marginTop: 8 }}>{flyer.vigencia.trim()}</div>
          )}
        </div>
        {flyer.seccion.trim() && (
          <div
            style={{
              display: "flex",
              flexShrink: 0,
              marginLeft: 20,
              backgroundColor: "rgba(0,0,0,0.25)",
              borderRadius: 999,
              padding: "12px 26px",
              fontSize: 32,
              fontWeight: 900,
              letterSpacing: 2,
            }}
          >
            {flyer.seccion.trim().toUpperCase()}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", justifyContent: "center", flexGrow: 1, padding: `${AIRE}px 40px` }}>
        {productos.map((p, i) => (
          <Fila key={p.id} p={p} escala={escala} ultimo={i === productos.length - 1} />
        ))}
      </div>

      <div
        style={{
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          height: PIE,
          backgroundColor: VELO,
          padding: "0 50px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", fontSize: 40, fontWeight: 900 }}>
          {pie.direccion.trim() || "El Nuevo Rural"}
          {pie.telefono.trim() && (
            <div style={{ display: "flex", marginLeft: 26, fontSize: 36, fontWeight: 600, opacity: 0.92 }}>
              {pie.telefono.trim()}
            </div>
          )}
          {pie.instagram.trim() && (
            <div style={{ display: "flex", marginLeft: "auto", fontSize: 34, fontWeight: 600, opacity: 0.92 }}>
              {pie.instagram.trim()}
            </div>
          )}
        </div>
        {pie.horarios.trim() && (
          <div style={{ fontSize: 27, fontWeight: 600, opacity: 0.85, marginTop: 10, lineHeight: 1.3 }}>
            {pie.horarios.trim()}
          </div>
        )}
      </div>
    </div>
  );
}
