"use client";

import { Check, ImageIcon, Loader2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState, type CSSProperties } from "react";
import { createClient } from "@/lib/supabase/client";
import { nombreLindo } from "@/lib/tienda/formato";
import { refrescarTienda } from "./acciones";

type Sugerencia = {
  id: string;
  url: string;
  nombre_origen: string | null;
  producto: { codigo_xrp: string; nombre_xrp: string; nombre_web: string | null; marca: string | null; presentacion: string | null } | null;
};

const POR_PAGINA = 24;
const caja: CSSProperties = { background: "white", border: "1px solid #e0e0e0", borderRadius: 10, padding: 16, marginBottom: 14 };
const boton = (fondo: string, color = "white", borde = fondo): CSSProperties => ({
  background: fondo, color, border: `2px solid ${borde}`, borderRadius: 8, height: 44, padding: "0 12px",
  fontWeight: 700, fontSize: 14, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center", gap: 6,
});

/** Revisión de las fotos que trajo `npm run tienda:fotos` (SPEC-tienda-fotos.md, req. 11–13). */
export function FotosSugeridas() {
  const sb = useMemo(() => createClient(), []);
  const [lista, setLista] = useState<Sugerencia[] | null>(null);
  const [pendientes, setPendientes] = useState(0);
  const [aceptadas, setAceptadas] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState<Set<string>>(new Set());
  const [aviso, setAviso] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    const [pag, pend, acep] = await Promise.all([
      sb
        .from("tienda_fotos_sugeridas")
        .select("id, url, nombre_origen, producto:tienda_productos(codigo_xrp, nombre_xrp, nombre_web, marca, presentacion)")
        .eq("estado", "pendiente")
        .order("creado_el")
        .order("id")
        .limit(POR_PAGINA),
      sb.from("tienda_fotos_sugeridas").select("id", { count: "exact", head: true }).eq("estado", "pendiente"),
      sb.from("tienda_fotos_sugeridas").select("id", { count: "exact", head: true }).eq("estado", "aceptada"),
    ]);
    if (pag.error) {
      setError(/does not exist|schema cache/i.test(pag.error.message)
        ? "Falta aplicar supabase/034_tienda_fotos.sql en Supabase."
        : `No se pudieron leer las fotos: ${pag.error.message}`);
      setLista([]);
      return;
    }
    setError(null);
    setLista(pag.data as unknown as Sugerencia[]);
    setPendientes(pend.count ?? 0);
    setAceptadas(acep.count ?? 0);
  }, [sb]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- carga inicial desde la base
    void cargar();
  }, [cargar]);

  const decidir = async (ids: string[], aceptar: boolean) => {
    setAviso(null);
    setOcupado((o) => new Set([...o, ...ids]));
    let yaTenian = 0;
    let fallas = 0;
    for (const id of ids) {
      const { data, error: e } = await sb.rpc("tienda_decidir_foto", { p_id: id, p_aceptar: aceptar });
      if (e) fallas++;
      else if (data === "ya_tenia_foto") yaTenian++;
    }
    await refrescarTienda();
    if (fallas) setAviso(`${fallas} no se pudieron guardar. Probá de nuevo.`);
    else if (yaTenian) setAviso(`${yaTenian} ya tenían una foto cargada a mano y no se cambiaron.`);
    setOcupado(new Set());
    await cargar();
  };

  return (
    <section style={caja} aria-labelledby="t-fotos">
      <h2 id="t-fotos" style={{ margin: "0 0 4px", fontSize: 17, display: "flex", alignItems: "center", gap: 8 }}>
        <ImageIcon size={20} color="#B80F0A" /> Fotos sugeridas
      </h2>
      <p style={{ margin: "0 0 12px", fontSize: 13, color: "#555", lineHeight: 1.5 }}>
        Fotos encontradas en Open Food Facts por código de barras. Compará el nombre y elegí: sólo se publican las que
        aceptás. Pendientes: <strong data-test="fotos-pendientes">{pendientes}</strong> · Publicadas:{" "}
        <strong data-test="fotos-aceptadas">{aceptadas}</strong>.
      </p>

      {error ? (
        <p role="alert" style={{ background: "#fdecea", color: "#a3261c", borderRadius: 8, padding: 10, fontSize: 14 }}>{error}</p>
      ) : null}
      {aviso ? (
        <p role="status" style={{ background: "#fff1d1", color: "#6a3d00", borderRadius: 8, padding: 10, fontSize: 14 }}>{aviso}</p>
      ) : null}

      {lista === null ? (
        <p style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 14 }}>
          <Loader2 size={18} className="animate-spin" /> Cargando…
        </p>
      ) : lista.length === 0 && !error ? (
        <p style={{ fontSize: 14, color: "#555" }} data-test="fotos-vacio">
          No hay fotos para revisar. Para buscar más, corré <code>npm run tienda:fotos</code> en la compu.
        </p>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <button
              type="button"
              style={boton("#1e6b45")}
              disabled={ocupado.size > 0}
              onClick={() => decidir(lista.map((s) => s.id), true)}
              data-test="usar-todas"
            >
              <Check size={18} /> Usar las {lista.length} de esta página
            </button>
          </div>
          <ul
            style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill, minmax(min(100%, 200px), 1fr))" }}
          >
            {lista.map((s) => {
              const nuestro = s.producto ? s.producto.nombre_web || nombreLindo(s.producto.nombre_xrp) : "(producto borrado)";
              const detalle = [s.producto?.marca, s.producto?.presentacion].filter(Boolean).join(" · ");
              const enCurso = ocupado.has(s.id);
              return (
                <li key={s.id} data-test="foto-sugerida" style={{ border: "1px solid #e0e0e0", borderRadius: 10, padding: 10, display: "flex", flexDirection: "column", gap: 6, opacity: enCurso ? 0.5 : 1, minWidth: 0 }}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- foto candidata en Storage */}
                  <img src={s.url} alt={`Foto sugerida para ${nuestro}`} loading="lazy" style={{ width: "100%", aspectRatio: "1", objectFit: "contain", background: "white", borderRadius: 8 }} />
                  <div style={{ fontSize: 13, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, overflowWrap: "anywhere" }}>{nuestro}</div>
                    {detalle ? <div style={{ color: "#555", overflowWrap: "anywhere" }}>{detalle}</div> : null}
                    <div style={{ color: "#555", marginTop: 4, overflowWrap: "anywhere" }}>
                      En Open Food Facts: <em>{s.nombre_origen || "sin nombre"}</em>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, marginTop: "auto" }}>
                    <button type="button" style={boton("#1e6b45")} disabled={enCurso} onClick={() => decidir([s.id], true)} data-test="usar">
                      <Check size={16} /> Usar
                    </button>
                    <button type="button" style={boton("white", "#a3261c", "#a3261c")} disabled={enCurso} onClick={() => decidir([s.id], false)} data-test="descartar">
                      <X size={16} /> Descartar
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </section>
  );
}
