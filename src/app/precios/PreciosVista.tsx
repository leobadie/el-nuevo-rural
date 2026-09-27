"use client";

import { useState, type CSSProperties, type ReactNode } from "react";
import {
  ALICUOTAS,
  MARGENES_RAPIDOS,
  REDONDEOS,
  aNumero,
  calcularPrecio,
  margenDePrecio,
  problemaPrecio,
} from "@/lib/precios/calculos";

import { NARANJA } from "@/lib/precios/estilos";
const NARANJA_CLARO = "#FEF5E7";

const pesos = (n: number, dec = 2) =>
  `$ ${n.toLocaleString("es-AR", { minimumFractionDigits: dec, maximumFractionDigits: dec })}`;
const pct = (n: number) => `${n.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
/** $ 2.020 si es entero, $ 2.016,67 si no: el precio de góndola se lee como en el cartel. */
const precioGondola = (n: number) => pesos(n, Number.isInteger(n) ? 0 : 2);

type Modo = "precio" | "margen";

/**
 * La calculadora de precios (SPEC-precios.md). No guarda nada: es una cuenta que se hace con la
 * factura en la mano. Sin IVA, porque el usuario es Responsable Inscripto.
 */
export default function PreciosVista() {
  const [modo, setModo] = useState<Modo>("precio");
  const [costo, setCosto] = useState("");
  const [incluyeIva, setIncluyeIva] = useState(false);
  const [iva, setIva] = useState<number>(21);
  const [otros, setOtros] = useState("");
  const [margen, setMargen] = useState("40");
  const [redondeo, setRedondeo] = useState<number>(10);
  const [gondola, setGondola] = useState("");

  const nCosto = aNumero(costo);
  const nOtros = otros.trim() ? aNumero(otros) : 0;
  const nMargen = aNumero(margen);
  const nGondola = aNumero(gondola);

  const precio = calcularPrecio({ costo: nCosto, incluyeIva, iva, margen: nMargen, otros: nOtros, redondeo });
  const falta = problemaPrecio({ costo: nCosto, margen: nMargen, otros: nOtros });
  const deja = margenDePrecio({ costo: nCosto, incluyeIva, iva, otros: nOtros, gondola: nGondola });

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 14 }}>
      <div style={{ display: "flex", gap: 4, borderBottom: `2px solid ${NARANJA}`, flexWrap: "wrap" }} role="tablist">
        {(
          [
            ["precio", "Poner un precio"],
            ["margen", "¿Cuánto me deja un precio?"],
          ] as const
        ).map(([id, texto]) => (
          <button
            key={id}
            role="tab"
            aria-selected={modo === id}
            onClick={() => setModo(id)}
            data-test={`modo-${id}`}
            style={{
              background: modo === id ? NARANJA : "transparent",
              color: modo === id ? "white" : NARANJA,
              border: "none",
              borderRadius: "8px 8px 0 0",
              padding: "9px 14px",
              fontSize: 14,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {texto}
          </button>
        ))}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 320px), 1fr))", gap: 14, alignItems: "start" }}>
        {/* ---------- Los datos ---------- */}
        <div style={tarjeta}>
          <Campo etiqueta={incluyeIva ? "Costo del producto, con IVA" : "Costo del producto, sin IVA (neto de la factura A)"}>
            <Entrada valor={costo} onCambio={setCosto} placeholder="1.000" prefijo="$" dataTest="costo" />
          </Campo>
          <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, margin: "-4px 0 14px", cursor: "pointer" }}>
            <input type="checkbox" checked={incluyeIva} onChange={(e) => setIncluyeIva(e.target.checked)} style={{ width: 17, height: 17 }} data-test="incluye-iva" />
            El costo que tengo incluye IVA (se lo saco)
          </label>

          <Campo etiqueta="IVA del producto">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {ALICUOTAS.map((a) => (
                <button
                  key={a.valor}
                  type="button"
                  onClick={() => setIva(a.valor)}
                  aria-pressed={iva === a.valor}
                  data-test={`iva-${a.valor}`}
                  style={{ ...opcion(iva === a.valor), textAlign: "left", padding: "8px 10px" }}
                >
                  <div style={{ fontSize: 16, fontWeight: 800 }}>{a.etiqueta}</div>
                  <div style={{ fontSize: 11, opacity: 0.85 }}>{a.detalle}</div>
                </button>
              ))}
            </div>
          </Campo>

          <Campo etiqueta="Otros costos que no recuperás, por unidad (opcional)">
            <Entrada valor={otros} onCambio={setOtros} placeholder="percepción de IIBB, flete…" prefijo="$" dataTest="otros" />
          </Campo>

          {modo === "precio" ? (
            <>
              <Campo etiqueta="Margen que querés ganar (sobre la venta, sin IVA)">
                <Entrada valor={margen} onCambio={setMargen} sufijo="%" dataTest="margen" />
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                  {MARGENES_RAPIDOS.map((m) => (
                    <button key={m} type="button" onClick={() => setMargen(String(m))} style={opcion(nMargen === m)} data-test={`margen-${m}`}>
                      {m}%
                    </button>
                  ))}
                </div>
              </Campo>
              <Campo etiqueta="Redondear el precio de góndola (hacia arriba)">
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  {REDONDEOS.map((r) => (
                    <button key={r} type="button" onClick={() => setRedondeo(r)} style={opcion(redondeo === r)} data-test={`redondeo-${r}`}>
                      {r === 0 ? "Sin redondear" : `A $${r}`}
                    </button>
                  ))}
                </div>
              </Campo>
            </>
          ) : (
            <Campo etiqueta="Precio de góndola (con IVA)">
              <Entrada valor={gondola} onCambio={setGondola} placeholder="2.020" prefijo="$" dataTest="gondola" />
            </Campo>
          )}
        </div>

        {/* ---------- El resultado ---------- */}
        <div style={{ ...tarjeta, background: NARANJA_CLARO, borderColor: "#F5CBA7" }} data-test="resultado">
          {modo === "precio" ? (
            precio ? (
              <>
                <div style={etiquetaResultado}>Precio de góndola (con IVA)</div>
                <div style={{ fontSize: 40, fontWeight: 800, color: NARANJA, lineHeight: 1.1 }} data-test="precio-gondola">
                  {precioGondola(precio.gondola)}
                </div>
                {redondeo > 0 && precio.gondola !== precio.gondolaExacto && (
                  <div style={{ fontSize: 12, color: "#7E5109", marginTop: 4 }} data-test="precio-exacto">
                    Exacto: {pesos(precio.gondolaExacto)}, redondeado a ${redondeo} hacia arriba.
                  </div>
                )}
                <Filas
                  filas={[
                    ["Costo neto", pesos(precio.costoNeto)],
                    ["Precio sin IVA", pesos(precio.neto)],
                    [`IVA (${pct(iva)})`, pesos(precio.iva)],
                    ["Ganancia neta por unidad", pesos(precio.ganancia), "ganancia"],
                    ["Margen real (sobre la venta sin IVA)", pct(precio.margenReal), "margen-real"],
                    ["Recargo sobre el costo", pct(precio.recargo), "recargo"],
                  ]}
                />
                <p style={nota}>
                  Para ganar {pct(nMargen)} no se suma {pct(nMargen)} al costo: se divide el costo neto por{" "}
                  {(1 - nMargen / 100).toLocaleString("es-AR", { maximumFractionDigits: 2 })} y después se suma el IVA.
                </p>
              </>
            ) : (
              <Vacio texto={falta ?? "Cargá los datos."} />
            )
          ) : deja ? (
            <>
              <div style={etiquetaResultado}>Ese precio te deja</div>
              <div style={{ fontSize: 40, fontWeight: 800, color: deja.perdida ? "#C0392B" : NARANJA, lineHeight: 1.1 }} data-test="margen-resultado">
                {pct(deja.margenReal)}
              </div>
              {deja.perdida && (
                <div style={{ fontSize: 13, color: "#C0392B", fontWeight: 700, marginTop: 4 }} data-test="aviso-perdida">
                  Con ese precio perdés plata: no cubre el costo.
                </div>
              )}
              <Filas
                filas={[
                  ["Costo neto", pesos(deja.costoNeto)],
                  ["Precio sin IVA", pesos(deja.neto)],
                  [`IVA (${pct(iva)})`, pesos(deja.iva)],
                  ["Ganancia neta por unidad", pesos(deja.ganancia), "ganancia"],
                  ["Recargo sobre el costo", pct(deja.recargo), "recargo"],
                ]}
              />
            </>
          ) : (
            <Vacio texto={!(nCosto > 0) ? "Cargá el costo del producto." : "Cargá el precio de góndola."} />
          )}
        </div>
      </div>
    </div>
  );
}

function Entrada({ valor, onCambio, placeholder, prefijo, sufijo, dataTest }: { valor: string; onCambio: (v: string) => void; placeholder?: string; prefijo?: string; sufijo?: string; dataTest: string }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      {prefijo && <span style={{ fontWeight: 700, color: "#555" }}>{prefijo}</span>}
      <input
        type="text"
        inputMode="decimal"
        value={valor}
        placeholder={placeholder}
        onChange={(e) => onCambio(e.target.value)}
        onFocus={(e) => e.currentTarget.select()}
        data-test={dataTest}
        style={{ flex: 1, minWidth: 0, padding: "10px 12px", fontSize: 18, border: "1px solid #ccc", borderRadius: 8, color: "#1A1A2E", background: "white", fontFamily: "inherit" }}
      />
      {sufijo && <span style={{ fontWeight: 700, color: "#555" }}>{sufijo}</span>}
    </div>
  );
}

function Campo({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 700, color: "#555", marginBottom: 6 }}>{etiqueta}</div>
      {children}
    </div>
  );
}

function Filas({ filas }: { filas: [string, string, string?][] }) {
  return (
    <div style={{ marginTop: 14, display: "grid", gap: 2 }}>
      {filas.map(([k, v, test]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", gap: 10, padding: "6px 0", borderBottom: "1px dashed #F0D9B5", fontSize: 14 }}>
          <span style={{ color: "#555" }}>{k}</span>
          <strong data-test={test}>{v}</strong>
        </div>
      ))}
    </div>
  );
}

function Vacio({ texto }: { texto: string }) {
  return (
    <p style={{ margin: 0, color: "#7E5109", fontSize: 14 }} data-test="falta">
      {texto}
    </p>
  );
}

const tarjeta: CSSProperties = { background: "white", border: "1px solid #e0e0e0", borderRadius: 10, padding: 16, minWidth: 0 };
const etiquetaResultado: CSSProperties = { fontSize: 12, fontWeight: 700, color: "#7E5109", textTransform: "uppercase" };
const nota: CSSProperties = { fontSize: 12, color: "#7E5109", margin: "12px 0 0", lineHeight: 1.5 };
const opcion = (activo: boolean): CSSProperties => ({
  border: `1px solid ${activo ? NARANJA : "#ddd"}`,
  background: activo ? NARANJA : "white",
  color: activo ? "white" : "#1A1A2E",
  borderRadius: 8,
  padding: "7px 12px",
  fontSize: 13,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
});
