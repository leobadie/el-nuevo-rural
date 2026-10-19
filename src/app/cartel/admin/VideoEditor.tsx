"use client";

import { useRef, useState, type CSSProperties } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { ArrowDown, ArrowUp, Copy, Film, Play, Scissors, Trash2 } from "lucide-react";
import type { Clip } from "@/lib/cartel/types";
import {
  MAX_BYTES_ORIGINAL,
  MAX_BYTES_VIDEO,
  TOTAL_SUGERIDO_SEG,
  acotarTramo,
  avisoResolucion,
  detectarCodec,
  motivosParaAdaptar,
  tamanoParaTele,
  duplicarClip,
  duracionClips,
  fmtSeg,
  mb,
  moverClip,
  quitarClip,
  veredictoVideo,
} from "@/lib/cartel/video";
import { fueCancelado, leerFicha, prepararAdaptacion, puedeAdaptar } from "@/lib/cartel/adaptarVideo";

/**
 * Subida y recorte de la placa de video (SPEC-cartel-videos.md, puntos 1-5).
 *
 * Antes de subir revisa el peso y el formato: un HEVC de iPhone se ve bien en
 * la compu y en negro en el televisor, así que se frena acá con instrucciones
 * en vez de descubrirlo en el local.
 */
export default function VideoEditor({
  clips,
  actualizar,
  supabase,
  onError,
  giros = [],
}: {
  clips: Clip[];
  /** Giros de las teles paradas activas (270, 90): para cada uno se prepara una versión girada. */
  giros?: (90 | 270)[];
  /**
   * Cambia la lista a partir de la vigente y no de una copia: una subida tarda,
   * y mientras tanto se puede seguir recortando otro clip sin que se pierda.
   */
  actualizar: (cambio: (clips: Clip[]) => Clip[]) => void;
  supabase: SupabaseClient;
  onError: (mensaje: string | null) => void;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  // null = no se está adaptando; 0 a 1 = avance de la conversión.
  const [adaptando, setAdaptando] = useState<number | null>(null);
  const [etapa, setEtapa] = useState("Adaptando el video para las teles…");
  const cancelarAdaptacion = useRef<(() => void) | null>(null);

  async function subir(original: File) {
    onError(null);
    setAviso(null);

    // El peso se mira antes de leer nada: no tiene sentido cargar 1 GB en
    // memoria para decir que no.
    if (original.size > MAX_BYTES_ORIGINAL) {
      onError(`El video pesa ${mb(original.size)}. Hasta ${mb(MAX_BYTES_ORIGINAL)} lo adaptamos nosotros; recortalo antes de subirlo.`);
      return;
    }

    setSubiendo(true);
    let archivo = original;
    let nota: string | null = null;
    try {
      // ---- Adaptar a la tele (SPEC-cartel-convertir-video.md) ----
      // Si no se puede leer la ficha, se sigue como siempre: lo frenan los
      // chequeos de abajo o se sube.
      const ficha = await leerFicha(original);
      const motivos = ficha ? motivosParaAdaptar(ficha) : [];
      if (ficha && motivos.length > 0) {
        if (await puedeAdaptar(original)) {
          setEtapa("Adaptando el video para las teles…");
          setAdaptando(0);
          const adaptacion = await prepararAdaptacion(original, ficha);
          cancelarAdaptacion.current = adaptacion.cancelar;
          archivo = await adaptacion.correr((p) => setAdaptando(p));
          const t = tamanoParaTele(ficha.ancho, ficha.alto);
          nota =
            `Lo adaptamos para las teles porque ${motivos.map((m) => m.texto).join(", ")}: ` +
            `${ficha.ancho}×${ficha.alto} → ${t.ancho}×${t.alto}, ${mb(original.size)} → ${mb(archivo.size)}.`;
        } else if (motivos.some((m) => m.grave) && ficha.codec !== "hevc") {
          // HEVC sigue al aviso de siempre, que explica cómo grabar en el iPhone.
          onError(
            `La tele no va a poder mostrar este video (${motivos.map((m) => m.texto).join(", ")}) y este navegador ` +
              "no lo puede adaptar. Probá subirlo desde Chrome en la compu o en el celular, o exportalo en 1080p con CapCut.",
          );
          return;
        }
      }

      if (archivo.size > MAX_BYTES_VIDEO) {
        onError(veredictoVideo("desconocido", archivo.size).aviso);
        return;
      }

      const codec = detectarCodec(new Uint8Array(await archivo.arrayBuffer()));
      const veredicto = veredictoVideo(codec, archivo.size);
      if (!veredicto.puede) {
        onError(veredicto.aviso);
        return;
      }

      const meta = await leerMetadatos(archivo);
      if (!meta) {
        onError("No se pudo leer el video. Probá exportarlo de nuevo como MP4 (por ejemplo con CapCut).");
        return;
      }

      // ---- Versión girada para las teles paradas (punto 16) ----
      // Su circuito de video ignora el giro por CSS: el video tiene que llegar
      // girado de fábrica. Se hace antes de subir nada, así Cancelar no deja
      // archivos sueltos.
      const paraGirar: Partial<Record<"90" | "270", File>> = {};
      let notaGiro: string | null = null;
      if (giros.length > 0) {
        if (ficha && (await puedeAdaptar(original))) {
          for (const g of giros) {
            setEtapa("Preparando la versión para las teles paradas…");
            setAdaptando(0);
            const adaptacion = await prepararAdaptacion(original, ficha, g);
            cancelarAdaptacion.current = adaptacion.cancelar;
            paraGirar[String(g) as "90" | "270"] = await adaptacion.correr((p) => setAdaptando(p));
          }
        } else {
          notaGiro =
            "Este navegador no pudo preparar la versión para las teles paradas: ahí el video se va a ver de costado. " +
            "Subilo desde Chrome en la compu.";
        }
      }

      const base = `video-${crypto.randomUUID()}`;
      const ext = archivo.name.split(".").pop()?.toLowerCase() || "mp4";
      const nombre = `${base}.${ext}`;
      // Caché de un año: el archivo no cambia nunca (recortar cambia la placa,
      // no el archivo), y así cada televisor lo baja una sola vez.
      const subirArchivo = async (n: string, f: File) => {
        const { error } = await supabase.storage.from("cartel").upload(n, f, {
          cacheControl: "31536000",
          contentType: f.type || "video/mp4",
          upsert: false,
        });
        if (error) throw error;
        return supabase.storage.from("cartel").getPublicUrl(n).data.publicUrl;
      };
      const url = await subirArchivo(nombre, archivo);
      const girados: Partial<Record<"90" | "270", string>> = {};
      for (const [g, f] of Object.entries(paraGirar) as ["90" | "270", File][]) {
        girados[g] = await subirArchivo(`${base}-girado${g}.mp4`, f);
      }

      const nuevo = acotarTramo({
        url,
        ...(Object.keys(girados).length > 0 ? { girados } : {}),
        desde: 0,
        hasta: Math.min(meta.duracion, 60),
        duracion: meta.duracion,
        ancho: meta.ancho,
        alto: meta.alto,
        bytes: archivo.size,
        codec,
      });
      // Se agrega al final: unir clips es subir uno detrás del otro.
      actualizar((cs) => [...cs, nuevo]);
      setAviso([nota, notaGiro, avisoResolucion(meta.ancho, meta.alto), veredicto.aviso].filter(Boolean).join(" ") || null);
    } catch (e) {
      if (fueCancelado(e)) onError("Cancelado: el video no se subió.");
      else onError(`No se pudo subir el video: ${(e as Error).message}`);
    } finally {
      setSubiendo(false);
      setAdaptando(null);
      cancelarAdaptacion.current = null;
    }
  }

  const total = duracionClips(clips);

  return (
    <div style={{ display: "grid", gap: 10 }} data-test="editor-video">
      {clips.map((c, i) => (
        <div key={`${c.url}:${i}`} style={{ display: "grid", gap: 6 }} data-test="clip" data-girados={JSON.stringify(c.girados ?? {})}>
          {clips.length > 1 && (
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, flexWrap: "wrap" }}>
              <strong style={{ fontSize: 13, color: "#1A1A2E" }}>
                Clip {i + 1} de {clips.length}
              </strong>
              <div style={{ display: "flex", gap: 4 }}>
                <button type="button" style={icono} disabled={i === 0} onClick={() => actualizar((cs) => moverClip(cs, i, -1))} title="Antes" data-test="clip-subir">
                  <ArrowUp size={15} />
                </button>
                <button type="button" style={icono} disabled={i === clips.length - 1} onClick={() => actualizar((cs) => moverClip(cs, i, 1))} title="Después" data-test="clip-bajar">
                  <ArrowDown size={15} />
                </button>
                <button type="button" style={icono} onClick={() => actualizar((cs) => duplicarClip(cs, i))} title="Usar otra parte de este mismo video" data-test="clip-duplicar">
                  <Copy size={15} />
                </button>
                <button type="button" style={{ ...icono, color: "#B42318" }} onClick={() => actualizar((cs) => quitarClip(cs, i))} title="Sacar este clip" data-test="clip-quitar">
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          )}
          <Recortador clip={c} onChange={(nuevo) => actualizar((cs) => cs.map((x, k) => (k === i ? nuevo : x)))} />
          {clips.length === 1 && (
            <button type="button" style={{ ...boton, justifySelf: "start" }} onClick={() => actualizar((cs) => duplicarClip(cs, 0))} data-test="clip-duplicar">
              <Copy size={14} /> Sumar otra parte de este video
            </button>
          )}
        </div>
      ))}

      {clips.length > 1 && (
        <p
          style={{ fontSize: 14, color: "#1A1A2E", margin: 0, padding: "8px 10px", background: "#EEF2FF", borderRadius: 8 }}
          data-test="duracion-total"
        >
          Los {clips.length} clips se ven uno detrás del otro: en total <strong>{fmtSeg(total)}</strong>.
          {total > TOTAL_SUGERIDO_SEG && " Es largo para alguien que pasa por la góndola: conviene dejarlo en menos de un minuto."}
        </p>
      )}

      <div>
        <label style={{ ...boton, cursor: subiendo ? "wait" : "pointer" }}>
          <Film size={15} />
          {adaptando != null
            ? "Adaptando…"
            : subiendo
              ? "Revisando y subiendo…"
              : clips.length > 0
                ? "Agregar otro video"
                : "Subir video"}
          <input
            type="file"
            accept="video/*"
            style={{ display: "none" }}
            disabled={subiendo}
            data-test="subir-video"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) subir(f);
              e.target.value = "";
            }}
          />
        </label>
        <p style={{ fontSize: 12, color: "#64748B", margin: "6px 0 0" }}>
          Cualquier video del celular: si la tele no lo puede mostrar, lo adaptamos antes de subirlo. Efectos, música
          y textos animados: armalo en CapCut o Canva y subí el resultado.
        </p>
      </div>

      {adaptando != null && (
        <div style={{ display: "grid", gap: 6, padding: "8px 10px", background: "#EEF2FF", borderRadius: 8 }} data-test="adaptando">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, fontSize: 13 }}>
            <span>
              <span data-test="adaptando-etapa">{etapa}</span>{" "}
              <strong data-test="adaptando-avance">{Math.round(adaptando * 100)}%</strong>
            </span>
            <button
              type="button"
              onClick={() => cancelarAdaptacion.current?.()}
              style={{ ...boton, padding: "4px 10px", fontSize: 12 }}
              data-test="adaptando-cancelar"
            >
              Cancelar
            </button>
          </div>
          <div style={{ height: 6, background: "#C7D2FE", borderRadius: 3, overflow: "hidden" }}>
            <div style={{ width: `${Math.round(adaptando * 100)}%`, height: "100%", background: "#1F3864", transition: "width .3s" }} />
          </div>
        </div>
      )}

      {aviso && (
        <p style={{ fontSize: 13, color: "#92400E", background: "#FEF3C7", padding: "8px 10px", borderRadius: 8, margin: 0 }} data-test="aviso-video">
          {aviso}
        </p>
      )}
    </div>
  );
}

/** Duración y tamaño del video, leídos por el navegador antes de subirlo. */
function leerMetadatos(archivo: File): Promise<{ duracion: number; ancho: number; alto: number } | null> {
  return new Promise((resolver) => {
    const url = URL.createObjectURL(archivo);
    const v = document.createElement("video");
    const fin = (r: { duracion: number; ancho: number; alto: number } | null) => {
      window.clearTimeout(espera);
      URL.revokeObjectURL(url);
      resolver(r);
    };
    const espera = window.setTimeout(() => fin(null), 15_000);
    v.preload = "metadata";
    v.muted = true;
    v.onloadedmetadata = () =>
      fin(Number.isFinite(v.duration) && v.duration > 0 ? { duracion: v.duration, ancho: v.videoWidth, alto: v.videoHeight } : null);
    v.onerror = () => fin(null);
    v.src = url;
  });
}

/**
 * Recorte de un tramo: dónde empieza y dónde termina. Se puede arrastrar o
 * marcar el punto mientras se mira el video, que es lo más rápido desde el
 * celular.
 */
function Recortador({ clip, onChange }: { clip: Clip; onChange: (c: Clip) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [viendoRecorte, setViendoRecorte] = useState(false);

  const cambiar = (cambios: Partial<Clip>) => onChange(acotarTramo({ ...clip, ...cambios }));
  const ahora = () => ref.current?.currentTime ?? 0;

  function verRecorte() {
    const v = ref.current;
    if (!v) return;
    v.currentTime = clip.desde;
    setViendoRecorte(true);
    v.play().catch(() => {});
  }

  return (
    <div style={{ display: "grid", gap: 8, border: "1px solid #E2E8F0", borderRadius: 10, padding: 10, background: "#fff" }}>
      <video
        ref={ref}
        src={clip.url}
        muted
        playsInline
        controls
        preload="metadata"
        style={{ width: "100%", maxHeight: 280, background: "#000", borderRadius: 8 }}
        // Al abrir, se para en el inicio del recorte: es lo primero que se ajusta.
        onLoadedMetadata={(e) => {
          e.currentTarget.currentTime = clip.desde;
        }}
        onTimeUpdate={(e) => {
          if (viendoRecorte && e.currentTarget.currentTime >= clip.hasta) {
            e.currentTarget.pause();
            setViendoRecorte(false);
          }
        }}
        data-test="recortador-video"
      />

      <Deslizador
        etiqueta="Empieza en"
        valor={clip.desde}
        max={clip.duracion}
        onChange={(desde) => cambiar({ desde })}
        prueba="recorte-desde"
      />
      <Deslizador
        etiqueta="Termina en"
        valor={clip.hasta}
        max={clip.duracion}
        onChange={(hasta) => cambiar({ hasta })}
        prueba="recorte-hasta"
      />

      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        <button type="button" style={boton} onClick={() => cambiar({ desde: ahora() })}>
          <Scissors size={14} /> Empieza acá
        </button>
        <button type="button" style={boton} onClick={() => cambiar({ hasta: ahora() })}>
          <Scissors size={14} /> Termina acá
        </button>
        <button type="button" style={boton} onClick={verRecorte}>
          <Play size={14} /> Ver el recorte
        </button>
      </div>

      <p style={{ fontSize: 13, color: "#1A1A2E", margin: 0 }} data-test="duracion-recorte">
        En el televisor dura <strong>{fmtSeg(duracionClips([clip]))}</strong> (del video de {fmtSeg(clip.duracion)}
        {clip.bytes ? `, ${mb(clip.bytes)}` : ""}).
      </p>
    </div>
  );
}

function Deslizador({
  etiqueta,
  valor,
  max,
  onChange,
  prueba,
}: {
  etiqueta: string;
  valor: number;
  max: number;
  onChange: (v: number) => void;
  prueba: string;
}) {
  return (
    <label style={{ display: "grid", gap: 2, fontSize: 12, color: "#475569", fontWeight: 600 }}>
      <span>
        {etiqueta}: <strong style={{ color: "#1A1A2E" }}>{fmtSeg(valor)}</strong>
      </span>
      <input
        type="range"
        min={0}
        max={max}
        step={0.1}
        value={valor}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ width: "100%" }}
        data-test={prueba}
      />
    </label>
  );
}

const boton: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  padding: "7px 12px",
  borderRadius: 8,
  border: "1px solid #CBD5E1",
  background: "#fff",
  color: "#1A1A2E",
  fontSize: 13,
  fontWeight: 600,
  cursor: "pointer",
};

const icono: CSSProperties = {
  ...boton,
  padding: 6,
};
