import type { CSSProperties } from "react";
import type { CodigoAsistencia } from "./types";

export const GREEN = "#1E7B34";

export const ASISTENCIA_INFO: Record<CodigoAsistencia, { label: string; bg: string; text: string }> = {
  A: { label: "Presente completo", bg: "#D5F5E3", text: "#145A32" },
  AM: { label: "Presente media jornada", bg: "#EAFAF1", text: "#1E8449" },
  DF: { label: "Día Franco", bg: "#D6EAF8", text: "#1F618D" },
  FI: { label: "Falta Injustificada", bg: "#FADBD8", text: "#922B21" },
  FJ: { label: "Falta Justificada", bg: "#FDEBD0", text: "#B9770E" },
  FM: { label: "Descanso Médico", bg: "#E8DAEF", text: "#6C3483" },
  FV: { label: "Vacaciones", bg: "#FCF3CF", text: "#B7950B" },
  FC: { label: "Cita Médica", bg: "#FAE5D3", text: "#A04000" },
  FD: { label: "Duelo / Licencia", bg: "#EAEDED", text: "#616A6B" },
};

export const CODIGOS_ASISTENCIA = Object.keys(ASISTENCIA_INFO) as CodigoAsistencia[];

export const inputStyle: CSSProperties = {
  width: "100%",
  padding: "6px 8px",
  borderRadius: 6,
  border: "1px solid #ccc",
  fontSize: 13,
  fontFamily: "Arial, sans-serif",
  color: "#1A1A2E",
  background: "white",
};

export const thStyle: CSSProperties = {
  background: GREEN,
  color: "white",
  fontWeight: 700,
  fontSize: 12,
  padding: "10px 8px",
  textAlign: "left",
  whiteSpace: "nowrap",
};

export const tdStyle: CSSProperties = {
  padding: "8px",
  fontSize: 13,
  fontFamily: "Arial, sans-serif",
  verticalAlign: "middle",
};
