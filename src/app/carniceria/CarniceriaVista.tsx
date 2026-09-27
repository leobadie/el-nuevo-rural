"use client";

import { useMemo, useRef, useState } from "react";
import { calcularCarniceria } from "@/lib/carniceria/calculos";
import { hoyISO } from "@/lib/fechas";
import type { Corte, GastoCarniceria, IngresoPollo, MediaRes, NuevoIngresoPollo, NuevaMediaRes, Parametros } from "@/lib/carniceria/types";
import { useConfirmDialog } from "../useConfirmDialog";
import CalculadorasTab from "./CalculadorasTab";
import MediasResesTab from "./MediasResesTab";
import { ROJO } from "./ui";

/**
 * Lo que hace falta para guardar. La vista se encarga del estado; los handlers sólo persisten
 * (Supabase en la app, memoria en el banco de pruebas). Devuelven un mensaje de error o null.
 */
export interface HandlersCarniceria {
  guardarParametro(clave: string, valor: number | null): Promise<string | null>;
  guardarCorte(corte: Omit<Corte, "id"> & { id?: string }): Promise<{ error: string } | { corte: Corte }>;
  guardarGasto(gastoFijoId: string, incluido: boolean): Promise<string | null>;
  guardarMedia(datos: NuevaMediaRes, id?: string): Promise<{ error: string } | { media: MediaRes }>;
  eliminarMedia(id: string): Promise<string | null>;
  guardarPollo(datos: NuevoIngresoPollo, id?: string): Promise<{ error: string } | { ingreso: IngresoPollo }>;
  eliminarPollo(id: string): Promise<string | null>;
}

function cantidadMedias(n: number, especie: string): string {
  return n === 1 ? `la media res ${especie}` : `el promedio de las ${n} medias reses ${especie}`;
}

/** "Los módulos 1 y 2 toman la media res de vaca y el módulo 7 toma los 3 ingresos de pollo de los últimos 30 días." */
function fraseHistorial(h: { vaca: number; cerdo: number; pollo: number }): string {
  const partes = [
    h.vaca > 0 && `los módulos 1 y 2 toman ${cantidadMedias(h.vaca, "de vaca")}`,
    h.cerdo > 0 && `el módulo 6 toma ${cantidadMedias(h.cerdo, "de cerdo")}`,
    h.pollo > 0 && `el módulo 7 toma ${h.pollo === 1 ? "el ingreso de pollo" : `los ${h.pollo} ingresos de pollo`}`,
  ].filter((x): x is string => !!x);
  const lista = partes.length > 1 ? `${partes.slice(0, -1).join(", ")} y ${partes[partes.length - 1]}` : (partes[0] ?? "");
  return `${lista.charAt(0).toUpperCase()}${lista.slice(1)} de los últimos 30 días.`;
}

type Estado = { tipo: "guardando" } | { tipo: "ok" } | { tipo: "error"; mensaje: string } | null;

export default function CarniceriaVista({
  parametrosIniciales,
  cortesIniciales,
  gastosIniciales,
  mediasIniciales,
  polloInicial,
  faltaMigracionPollo = false,
  handlers,
}: {
  parametrosIniciales: Parametros;
  cortesIniciales: Corte[];
  gastosIniciales: GastoCarniceria[];
  mediasIniciales: MediaRes[];
  polloInicial: IngresoPollo[];
  faltaMigracionPollo?: boolean;
  handlers: HandlersCarniceria;
}) {
  const [tab, setTab] = useState<"calculadoras" | "medias">("calculadoras");
  const [parametros, setParametros] = useState(parametrosIniciales);
  const [cortes, setCortes] = useState(cortesIniciales);
  const [gastos, setGastos] = useState(gastosIniciales);
  const [medias, setMedias] = useState(mediasIniciales);
  const [pollo, setPollo] = useState(polloInicial);
  const [estado, setEstado] = useState<Estado>(null);
  const { pedirConfirmacion, ConfirmModal } = useConfirmDialog();
  const pendientes = useRef(0);

  const res = useMemo(
    () => calcularCarniceria({ parametros, cortes, gastos, medias, pollo, hoy: hoyISO() }),
    [parametros, cortes, gastos, medias, pollo],
  );

  /** Envuelve un guardado: muestra "Guardando…" y, si falla, deshace el cambio optimista. */
  async function guardar(accion: () => Promise<string | null>, deshacer: () => void) {
    pendientes.current += 1;
    setEstado({ tipo: "guardando" });
    const error = await accion();
    pendientes.current -= 1;
    if (error) {
      deshacer();
      setEstado({ tipo: "error", mensaje: error });
    } else if (pendientes.current === 0) {
      setEstado({ tipo: "ok" });
    }
  }

  const acciones = {
    guardarParametro(clave: string, valor: number | null) {
      const antes = parametros[clave];
      setParametros((p) => {
        const nuevo = { ...p };
        if (valor == null) delete nuevo[clave];
        else nuevo[clave] = valor;
        return nuevo;
      });
      void guardar(
        () => handlers.guardarParametro(clave, valor),
        () =>
          setParametros((p) => {
            const nuevo = { ...p };
            if (antes == null) delete nuevo[clave];
            else nuevo[clave] = antes;
            return nuevo;
          }),
      );
    },

    guardarCorte(corte: Omit<Corte, "id"> & { id?: string }) {
      const anterior = corte.id ? cortes.find((c) => c.id === corte.id) : undefined;
      if (anterior) setCortes((cs) => cs.map((c) => (c.id === corte.id ? { ...c, ...corte } as Corte : c)));
      void guardar(
        async () => {
          const r = await handlers.guardarCorte(corte);
          if ("error" in r) return r.error;
          // Un corte nuevo recién tiene id cuando vuelve de la base.
          setCortes((cs) => (anterior ? cs.map((c) => (c.id === r.corte.id ? r.corte : c)) : [...cs, r.corte]));
          return null;
        },
        () => anterior && setCortes((cs) => cs.map((c) => (c.id === anterior.id ? anterior : c))),
      );
    },

    guardarGasto(gastoFijoId: string, incluido: boolean) {
      setGastos((gs) => gs.map((g) => (g.id === gastoFijoId ? { ...g, incluido } : g)));
      void guardar(
        () => handlers.guardarGasto(gastoFijoId, incluido),
        () => setGastos((gs) => gs.map((g) => (g.id === gastoFijoId ? { ...g, incluido: !incluido } : g))),
      );
    },
  };

  const accionesMedias = {
    async guardarMedia(datos: NuevaMediaRes, id?: string): Promise<string | null> {
      setEstado({ tipo: "guardando" });
      const r = await handlers.guardarMedia(datos, id);
      if ("error" in r) {
        setEstado({ tipo: "error", mensaje: r.error });
        return r.error;
      }
      setMedias((ms) => (id ? ms.map((m) => (m.id === id ? r.media : m)) : [...ms, r.media]));
      setEstado({ tipo: "ok" });
      return null;
    },

    eliminarMedia(id: string) {
      const borrada = medias.find((m) => m.id === id);
      setMedias((ms) => ms.filter((m) => m.id !== id));
      void guardar(
        () => handlers.eliminarMedia(id),
        () => borrada && setMedias((ms) => [...ms, borrada]),
      );
    },
  };

  const accionesPollo = {
    async guardarPollo(datos: NuevoIngresoPollo, id?: string): Promise<string | null> {
      setEstado({ tipo: "guardando" });
      const r = await handlers.guardarPollo(datos, id);
      if ("error" in r) {
        setEstado({ tipo: "error", mensaje: r.error });
        return r.error;
      }
      setPollo((ps) => (id ? ps.map((p) => (p.id === id ? r.ingreso : p)) : [...ps, r.ingreso]));
      setEstado({ tipo: "ok" });
      return null;
    },

    eliminarPollo(id: string) {
      const borrado = pollo.find((p) => p.id === id);
      setPollo((ps) => ps.filter((p) => p.id !== id));
      void guardar(
        () => handlers.eliminarPollo(id),
        () => borrado && setPollo((ps) => [...ps, borrado]),
      );
    },
  };

  return (
    <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr)", gap: 14 }}>
      <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap", borderBottom: `2px solid ${ROJO}` }} role="tablist">
        {(
          [
            ["calculadoras", "Calculadoras"],
            ["medias", `Medias reses y pollo (${medias.length + pollo.length})`],
          ] as const
        ).map(([id, texto]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            data-test={`tab-${id}`}
            onClick={() => setTab(id)}
            style={{
              background: tab === id ? ROJO : "transparent",
              color: tab === id ? "white" : ROJO,
              border: "none",
              borderRadius: "8px 8px 0 0",
              padding: "9px 16px",
              fontSize: 14,
              fontWeight: 800,
              cursor: "pointer",
            }}
          >
            {texto}
          </button>
        ))}
        <span style={{ marginLeft: "auto", fontSize: 12, minHeight: 18 }} data-test="estado-guardado" aria-live="polite">
          {estado?.tipo === "guardando" && <span style={{ color: "#666" }}>Guardando…</span>}
          {estado?.tipo === "ok" && <span style={{ color: "#1E7B34", fontWeight: 700 }}>✓ Guardado</span>}
        </span>
      </div>

      {estado?.tipo === "error" && (
        <div role="alert" data-test="error-guardado" style={{ background: "#FADBD8", color: "#922B21", padding: "10px 12px", borderRadius: 8, fontSize: 13, display: "flex", justifyContent: "space-between", gap: 8 }}>
          <span>{estado.mensaje}</span>
          <button type="button" onClick={() => setEstado(null)} style={{ background: "none", border: "none", color: "#922B21", fontWeight: 800, cursor: "pointer" }} aria-label="Cerrar aviso">
            ✕
          </button>
        </div>
      )}

      {tab === "calculadoras" ? (
        <>
          {(res.historial.vaca > 0 || res.historial.cerdo > 0 || res.historial.pollo > 0) && (
            <p style={{ margin: 0, fontSize: 12, color: "#555" }} data-test="aviso-historial">
              {fraseHistorial(res.historial)}
            </p>
          )}
          <CalculadorasTab res={res} parametros={parametros} cortes={cortes} acciones={acciones} />
        </>
      ) : (
        <MediasResesTab
          medias={medias}
          pollo={pollo}
          acciones={accionesMedias}
          accionesPollo={accionesPollo}
          pedirConfirmacion={pedirConfirmacion}
          faltaMigracionPollo={faltaMigracionPollo}
        />
      )}
      <ConfirmModal />
    </div>
  );
}
