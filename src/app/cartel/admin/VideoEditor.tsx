"use client";

import { useRef, useState, type CSSProperties } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { Film, Play, Scissors } from "lucide-react";
import type { Clip } from "@/lib/cartel/types";
import {
  MAX_BYTES_VIDEO,
  acotarTramo,
  detectarCodec,
  duracionClips,
  fmtSeg,
  mb,
  veredictoVideo,
} from "@/lib/cartel/video";

/**
 * Subida y recorte de la placa de video (SPEC-cartel-videos.md, puntos 1-5).
 *
 * Antes de subir revisa el peso y el formato: un HEVC de iPhone se ve bien en
 * la compu y en negro en el televisor, así que se frena acá con instrucciones
 * en vez de descubrirlo en el local.
 */
export default function VideoEditor({
  clips,
  onChange,
  supabase,
  onError,
}: {
  clips: Clip[];
  onChange: (clips: Clip[]) => void;
  supabase: SupabaseClient;
  onError: (mensaje: string | null) => void;
}) {
  const [subiendo, setSubiendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function subir(archivo: File) {
    onError(null);
    setAviso(null);

    // El peso se mira antes de leer nada: no tiene sentido cargar 200 MB en
    // memoria para decir que no.
    if (archivo.size > MAX_BYTES_VIDEO) {
      onError(veredictoVideo("desconocido", archivo.size).aviso);
      return;
    }

    setSubiendo(true);
    try {
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

      const ext = archivo.name.split(".").pop()?.toLowerCase() || "mp4";
      const nombre = `video-${crypto.randomUUID()}.${ext}`;
      // Caché de un año: el archivo no cambia nunca (recortar cambia la placa,
      // no el archivo), y así cada televisor lo baja una sola vez.
      const { error } = await supabase.storage.from("cartel").upload(nombre, archivo, {
        cacheControl: "31536000",
        contentType: archivo.type || "video/mp4",
        upsert: false,
      });
      if (error) throw error;

      const { data } = supabase.storage.from("cartel").getPublicUrl(nombre);
      onChange([
        acotarTramo({
          url: data.publicUrl,
          desde: 0,
          hasta: Math.min(meta.duracion, 60),
          duracion: meta.duracion,
          ancho: meta.ancho,
          alto: meta.alto,
          bytes: archivo.size,
          codec,
        }),
      ]);
      setAviso(veredicto.aviso);
    } catch (e) {
      onError(`No se pudo subir el video: ${(e as Error).message}`);
    } finally {
      setSubiendo(false);
    }
  }

  const clip = clips[0];

  return (
    <div style={{ display: "grid", gap: 10 }} data-test="editor-video">
      <div>
        <label style={{ ...boton, cursor: subiendo ? "wait" : "pointer" }}>
          <Film size={15} />
          {subiendo ? "Revisando y subiendo…" : clip ? "Cambiar video" : "Subir video"}
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
          MP4 de hasta {mb(MAX_BYTES_VIDEO)}. Efectos, música y textos animados: armalo en CapCut o Canva y subí el resultado.
        </p>
      </div>

      {aviso && (
        <p style={{ fontSize: 13, color: "#92400E", background: "#FEF3C7", padding: "8px 10px", borderRadius: 8, margin: 0 }} data-test="aviso-video">
          {aviso}
        </p>
      )}

      {clip && <Recortador clip={clip} onChange={(c) => onChange([c, ...clips.slice(1)])} />}
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
