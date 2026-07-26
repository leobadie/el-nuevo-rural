import type { CSSProperties } from "react";
import type { EstadoCheque } from "./types";

export const NAVY = "#1F3864";

export const PIE_COLORS = ["#1F3864", "#2E5C8A", "#5B8DB8", "#8FB8DC", "#D97757", "#E8A87C", "#C0C0C0"];

export const ESTADO_STYLES: Record<EstadoCheque, { bg: string; text: string; label: string }> = {
  Pagado: { bg: "#D5F5E3", text: "#145A32", label: "Pagado" },
  Vencido: { bg: "#FADBD8", text: "#922B21", label: "Vencido" },
  "Próximo": { bg: "#FDEBD0", text: "#784212", label: "Próximo" },
  Pendiente: { bg: "#F8F9FA", text: "#1A1A2E", label: "Pendiente" },
  Rechazado: { bg: "#E8DAEF", text: "#4A235A", label: "Rechazado" },
};

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
  background: NAVY,
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
