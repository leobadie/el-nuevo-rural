import { fmtMoneyEmp } from "./calculos";
import type { Colaborador, ResumenColaborador } from "./types";

export function generarReciboHTML(colaborador: Colaborador, resumen: ResumenColaborador, mesLabel: string): string {
  return `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8" />
<title>Recibo — ${colaborador.nombre}</title>
<style>
  body { font-family: Arial, sans-serif; color: #1A1A2E; padding: 24px; }
  .card { max-width: 480px; margin: 0 auto; border: 1px solid #ddd; border-radius: 10px; padding: 24px; }
  h1 { color: #1E7B34; font-size: 18px; margin: 0 0 2px; }
  .sub { color: #666; font-size: 12px; margin-bottom: 16px; }
  .row { display: flex; justify-content: space-between; padding: 4px 0; font-size: 13px; border-bottom: 1px solid #f0f0f0; }
  h2 { color: #1E7B34; font-size: 13px; margin: 18px 0 6px; }
  .total { font-weight: 700; font-size: 15px; border-top: 2px solid #1E7B34; padding-top: 8px; margin-top: 8px; }
</style>
</head>
<body>
  <div class="card">
    <h1>EL NUEVO RURAL</h1>
    <div class="sub">Recibo de Sueldo (uso interno — no reemplaza el recibo legal)</div>
    <div class="row"><span>Colaborador</span><span>${colaborador.nombre} (${colaborador.codigo})</span></div>
    <div class="row"><span>Área / Cargo</span><span>${colaborador.area || "-"} / ${colaborador.cargo || "-"}</span></div>
    <div class="row"><span>Período</span><span>${mesLabel}</span></div>
    <div class="row"><span>Tipo de Pago</span><span>${colaborador.tipo_pago}</span></div>
    <div class="row"><span>Valor</span><span>${fmtMoneyEmp(colaborador.valor)}</span></div>

    <h2>DETALLE DE ASISTENCIA</h2>
    <div class="row"><span>Días completos</span><span>${resumen.diasCompletos}</span></div>
    <div class="row"><span>Días media jornada</span><span>${resumen.diasMedia}</span></div>
    <div class="row"><span>Días francos</span><span>${resumen.diaFranco}</span></div>
    <div class="row"><span>Faltas injustificadas</span><span>${resumen.faltaInj}</span></div>
    <div class="row"><span>Faltas justificadas</span><span>${resumen.faltaJust}</span></div>
    <div class="row"><span>Vacaciones</span><span>${resumen.vacaciones}</span></div>
    <div class="row"><span>Descanso médico</span><span>${resumen.descMed}</span></div>
    <div class="row"><span>Otras</span><span>${resumen.otras}</span></div>
    <div class="row"><span>Horas extra 50%</span><span>${resumen.he50}</span></div>
    <div class="row"><span>Horas extra 100%</span><span>${resumen.he100}</span></div>

    <h2>RESUMEN DE PAGO</h2>
    <div class="row"><span>Pago base</span><span>${fmtMoneyEmp(resumen.pagoBase)}</span></div>
    <div class="row"><span>Pago horas extra</span><span>${fmtMoneyEmp(resumen.pagoHE)}</span></div>
    <div class="row total"><span>TOTAL A PAGAR</span><span>${fmtMoneyEmp(resumen.totalPagar)}</span></div>
  </div>
</body>
</html>`;
}

export function descargarRecibo(colaborador: Colaborador, resumen: ResumenColaborador, mesLabel: string) {
  const html = generarReciboHTML(colaborador, resumen, mesLabel);
  const nombreSanitizado = colaborador.nombre.replace(/[^\w-]/g, "_");
  const mesSanitizado = mesLabel.replace(/[^\w-]/g, "_");
  const blob = new Blob([html], { type: "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `recibo-${colaborador.codigo}-${nombreSanitizado}-${mesSanitizado}.html`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
