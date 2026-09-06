"use client";

import { useMemo, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { buildSaldoAcumulado } from "@/lib/ingresos-egresos/calculos";
import { RED } from "@/lib/ingresos-egresos/estilos";
import { useConfirmDialog } from "../useConfirmDialog";
import MovimientosTab from "./tabs/MovimientosTab";
import VentasXRPTab from "./tabs/VentasXRPTab";
import GastosFijosTab from "./tabs/GastosFijosTab";
import DashboardTab from "./tabs/DashboardTab";
import CategoriasTab from "./tabs/CategoriasTab";
import ProveedoresTab from "./tabs/ProveedoresTab";
import CuentaProveedoresTab from "./tabs/CuentaProveedoresTab";
import MensualTab from "./tabs/MensualTab";
import CierreTab from "./tabs/CierreTab";
import PedidosTab from "./tabs/PedidosTab";
import HistorialTab from "./tabs/HistorialTab";
import type {
  Categoria,
  ConfigProveedores,
  EntregaProveedor,
  GastoFijo,
  ImputacionPago,
  LimiteCategoria,
  MedioPago,
  Movimiento,
  NuevaEntregaProveedor,
  NuevoGastoFijo,
  NuevoMovimiento,
  NuevoPedido,
  Pedido,
  Proveedor,
  VentaXRP,
} from "@/lib/ingresos-egresos/types";
import type { RendicionXRP } from "@/lib/ingresos-egresos/xrp";
import { hoyISO } from "@/lib/fechas";

function normalizarMovimientoImportado(raw: Record<string, unknown>): NuevoMovimiento {
  const get = (a: string, b: string) => (raw[a] ?? raw[b]) as unknown;
  const medioPago = get("medio_pago", "medioPago") as string | undefined;
  return {
    fecha: (raw.fecha as string) || "",
    descripcion: (raw.descripcion as string) || null,
    categoria: (raw.categoria as string) || null,
    ingreso: raw.ingreso != null && raw.ingreso !== "" ? Number(raw.ingreso) : null,
    egreso: raw.egreso != null && raw.egreso !== "" ? Number(raw.egreso) : null,
    proveedor: (raw.proveedor as string) || null,
    medio_pago: medioPago === "Efectivo" || medioPago === "Transferencia" || medioPago === "Cheque" ? medioPago : null,
    n_cheque_pago: (get("n_cheque_pago", "nChequePago") as string) || null,
    fecha_cobro_cheque_pago: (get("fecha_cobro_cheque_pago", "fechaCobroChequePago") as string) || null,
    // El id del gasto fijo del artifact viejo no coincide con ningún gasto_fijo real de la base
    // nueva (son sistemas de ids distintos) — se descarta el vínculo, el movimiento en sí se
    // restaura igual, solo pierde la etiqueta de "generado desde este gasto fijo".
    gasto_fijo_id: null,
  };
}

const TABS: { key: string; label: string }[] = [
  { key: "movimientos", label: "Movimientos" },
  { key: "ventasxrp", label: "Ventas (XRP)" },
  { key: "gastosfijos", label: "Gastos Fijos" },
  { key: "dashboard", label: "Dashboard" },
  { key: "categorias", label: "Resumen por categoría" },
  { key: "cuentaproveedores", label: "Proveedores (cuenta corriente)" },
  { key: "proveedores", label: "Resumen por proveedor" },
  { key: "mensual", label: "Resumen mensual" },
  { key: "cierre", label: "Cierre diario" },
  { key: "pedidos", label: "Pedidos" },
  { key: "historial", label: "Historial" },
];

export default function IngresosEgresosShell({
  esAdmin,
  userId,
  initialTab,
  movimientosIniciales,
  ventasXRPIniciales,
  gastosFijosIniciales,
  proveedoresIniciales,
  categoriasIniciales,
  limitesIniciales,
  pedidosIniciales,
  entregasIniciales,
  imputacionesIniciales,
  configProveedoresInicial,
}: {
  esAdmin: boolean;
  userId: string;
  initialTab?: string;
  movimientosIniciales: Movimiento[];
  ventasXRPIniciales: VentaXRP[];
  gastosFijosIniciales: GastoFijo[];
  proveedoresIniciales: Proveedor[];
  categoriasIniciales: Categoria[];
  limitesIniciales: LimiteCategoria[];
  pedidosIniciales: Pedido[];
  entregasIniciales: EntregaProveedor[];
  imputacionesIniciales: ImputacionPago[];
  configProveedoresInicial: ConfigProveedores | null;
}) {
  const supabase = useMemo(() => createClient(), []);
  const { pedirConfirmacion, ConfirmModal } = useConfirmDialog();

  const [movs, setMovs] = useState<Movimiento[]>(movimientosIniciales);
  const [ventasXRP, setVentasXRP] = useState<VentaXRP[]>(ventasXRPIniciales);
  const [gastosFijos, setGastosFijos] = useState<GastoFijo[]>(gastosFijosIniciales);
  const [proveedores, setProveedores] = useState<Proveedor[]>(proveedoresIniciales);
  const [categorias, setCategorias] = useState<Categoria[]>(categoriasIniciales);
  const [limites, setLimites] = useState<Record<string, number>>(() =>
    Object.fromEntries(limitesIniciales.map((l) => [l.categoria, l.limite])),
  );
  const [pedidos, setPedidos] = useState<Pedido[]>(pedidosIniciales);
  const [entregas, setEntregas] = useState<EntregaProveedor[]>(entregasIniciales);
  const [imputaciones, setImputaciones] = useState<ImputacionPago[]>(imputacionesIniciales);
  const [corte, setCorte] = useState<string | null>(configProveedoresInicial?.corte_cuenta_corriente ?? null);
  const [tab, setTab] = useState(
    initialTab && TABS.some((t) => t.key === initialTab) ? initialTab : "movimientos",
  );
  const [saveError, setSaveError] = useState("");

  const enriched = useMemo(() => buildSaldoAcumulado(movs), [movs]);
  const nombresProveedores = useMemo(() => proveedores.map((p) => p.nombre), [proveedores]);
  const nombresCategorias = useMemo(() => categorias.map((c) => c.nombre), [categorias]);

  async function crearChequeDesdeMovimiento(mov: Movimiento) {
    const { error } = await supabase.from("cheques").insert({
      n_cheque: mov.n_cheque_pago || null,
      proveedor: mov.proveedor || mov.descripcion || "",
      fecha_emision: mov.fecha,
      fecha_cobro: mov.fecha_cobro_cheque_pago || null,
      importe: mov.egreso,
      tipo: "Físico",
      entregado: true,
      observaciones: `Generado desde Ingresos y Egresos: ${mov.descripcion}`,
      creado_por: userId,
    });
    if (error) {
      setSaveError("El movimiento se guardó pero no se pudo crear el cheque asociado. Revisalo en Control de Cheques.");
    }
  }

  async function addMov(nuevo: NuevoMovimiento) {
    const esCheque = nuevo.medio_pago === "Cheque" && !!nuevo.egreso;
    const { data, error } = await supabase
      .from("movimientos")
      .insert({
        ...nuevo,
        fecha_cobro_cheque_pago: nuevo.fecha_cobro_cheque_pago || null,
        cheque_creado: esCheque,
        creado_por: userId,
      })
      .select()
      .single();
    if (error || !data) {
      console.error(error);
      setSaveError("No se pudo guardar. Probá de nuevo.");
      return null;
    }
    setSaveError("");
    setMovs((prev) => [...prev, data as Movimiento]);
    if (esCheque) await crearChequeDesdeMovimiento(data as Movimiento);
    return data as Movimiento;
  }

  async function updateMov(id: string, patch: Movimiento) {
    const actual = movs.find((m) => m.id === id);
    const esChequeNuevo = patch.medio_pago === "Cheque" && !!patch.egreso && !actual?.cheque_creado;
    const { data, error } = await supabase
      .from("movimientos")
      .update({
        ...patch,
        fecha_cobro_cheque_pago: patch.fecha_cobro_cheque_pago || null,
        cheque_creado: actual?.cheque_creado || esChequeNuevo,
        modificado_el: new Date().toISOString(),
      })
      .eq("id", id)
      .select()
      .single();
    if (error || !data) {
      console.error(error);
      setSaveError("No se pudo guardar. Probá de nuevo.");
      return;
    }
    setSaveError("");
    setMovs((prev) => prev.map((m) => (m.id === id ? (data as Movimiento) : m)));
    if (esChequeNuevo) await crearChequeDesdeMovimiento(data as Movimiento);
  }

  function deleteMov(id: string) {
    pedirConfirmacion("¿Eliminar este movimiento? Esta acción no se puede deshacer.", async () => {
      const { error } = await supabase.from("movimientos").delete().eq("id", id);
      if (error) {
        setSaveError("No se pudo eliminar. Probá de nuevo.");
        return;
      }
      setMovs((prev) => prev.filter((m) => m.id !== id));
      // En la base las imputaciones se van solas (on delete cascade); acá hay que
      // sacarlas a mano o la entrega seguiría figurando como pagada.
      setImputaciones((prev) => prev.filter((im) => im.movimiento_id !== id));
    });
  }

  async function addEntrega(nueva: NuevaEntregaProveedor) {
    const { data, error } = await supabase
      .from("entregas_proveedor")
      .insert({ ...nueva, creado_por: userId })
      .select()
      .single();
    if (error || !data) {
      console.error(error);
      setSaveError("No se pudo guardar la entrega. Probá de nuevo.");
      return;
    }
    setSaveError("");
    setEntregas((prev) => [...prev, data as EntregaProveedor]);
  }

  function eliminarEntrega(id: string) {
    pedirConfirmacion(
      "¿Eliminar esta entrega? Se van a deshacer también los pagos aplicados a ella (los pagos en sí no se borran).",
      async () => {
        const { error } = await supabase.from("entregas_proveedor").delete().eq("id", id);
        if (error) {
          setSaveError("No se pudo eliminar la entrega. Probá de nuevo.");
          return;
        }
        setEntregas((prev) => prev.filter((e) => e.id !== id));
        setImputaciones((prev) => prev.filter((im) => im.entrega_id !== id));
      },
    );
  }

  async function imputarPago(aplicaciones: { movimiento_id: string; entrega_id: string; monto: number }[]) {
    if (aplicaciones.length === 0) return;
    const { data, error } = await supabase.from("imputaciones_pago").insert(aplicaciones).select();
    if (error || !data) {
      console.error(error);
      setSaveError(
        error?.message?.includes("supera")
          ? "Ese pago ya no tiene tanto saldo disponible, o la entrega ya está cubierta. Recargá la página."
          : "No se pudo aplicar el pago. Probá de nuevo.",
      );
      return;
    }
    setSaveError("");
    setImputaciones((prev) => [...prev, ...(data as ImputacionPago[])]);
  }

  /**
   * Mover el corte no toca ningún movimiento: cambia qué mira la cuenta corriente. Por eso
   * se puede correr para atrás y para adelante sin consecuencias.
   */
  async function setCorteCuentaCorriente(nuevo: string) {
    const { data, error } = await supabase
      .from("config_proveedores")
      .update({ corte_cuenta_corriente: nuevo })
      .eq("id", true)
      .select()
      .single();
    if (error || !data) {
      console.error(error);
      setSaveError("No se pudo cambiar la fecha de corte. Probá de nuevo.");
      return;
    }
    setSaveError("");
    setCorte((data as ConfigProveedores).corte_cuenta_corriente);
  }

  async function desimputarPago(id: string) {
    const { error } = await supabase.from("imputaciones_pago").delete().eq("id", id);
    if (error) {
      setSaveError("No se pudo deshacer la aplicación. Probá de nuevo.");
      return;
    }
    setSaveError("");
    setImputaciones((prev) => prev.filter((im) => im.id !== id));
  }

  /**
   * Pagar desde la ficha del proveedor: se crea el egreso real en Movimientos (con toda la
   * maquinaria que ya existe, incluido el cheque si el medio es Cheque) y recién ahí se lo
   * imputa contra la entrega. Así no hay que cargar el pago dos veces.
   */
  async function pagarEntrega({
    proveedor,
    entregaId,
    fecha,
    monto,
    medioPago,
    descripcion,
  }: {
    proveedor: string;
    entregaId: string;
    fecha: string;
    monto: number;
    medioPago: MedioPago;
    descripcion: string;
  }) {
    const mov = await addMov({
      fecha,
      descripcion,
      categoria: "Pago a Proveedor",
      ingreso: null,
      egreso: monto,
      proveedor,
      medio_pago: medioPago,
      n_cheque_pago: null,
      fecha_cobro_cheque_pago: null,
      gasto_fijo_id: null,
    });
    if (!mov) return;
    await imputarPago([{ movimiento_id: mov.id, entrega_id: entregaId, monto }]);
  }

  async function restaurarBackupMovs(nuevosMovs: unknown[], nuevosLimites: Record<string, number>) {
    const ejecutar = async () => {
      const { error: delErr } = await supabase.from("movimientos").delete().not("id", "is", null);
      if (delErr) {
        setSaveError("No se pudo restaurar el backup. Probá de nuevo.");
        return;
      }
      const payload = nuevosMovs.map((m) => ({
        ...normalizarMovimientoImportado(m as Record<string, unknown>),
        creado_por: userId,
      }));
      const { data: inserted, error: insErr } = await supabase.from("movimientos").insert(payload).select();
      if (insErr) {
        setSaveError("No se pudo restaurar el backup. Probá de nuevo.");
        return;
      }
      setMovs((inserted ?? []) as Movimiento[]);

      await supabase.from("limites_categorias").delete().not("categoria", "is", null);
      const limitesPayload = Object.entries(nuevosLimites).map(([categoria, limite]) => ({ categoria, limite: Number(limite) }));
      if (limitesPayload.length > 0) {
        await supabase.from("limites_categorias").insert(limitesPayload);
      }
      setLimites(Object.fromEntries(limitesPayload.map((l) => [l.categoria, l.limite])));
      setSaveError("");
    };

    if (movs.length > 0) {
      pedirConfirmacion(
        `Esto va a REEMPLAZAR los ${movs.length} movimientos actuales por los ${nuevosMovs.length} del backup. ¿Continuar?`,
        ejecutar,
      );
    } else {
      await ejecutar();
    }
  }

  async function addProveedor(nombre: string) {
    const { data, error } = await supabase.from("proveedores").insert({ nombre }).select().single();
    if (error || !data) {
      setSaveError("No se pudo guardar el proveedor. Probá de nuevo.");
      return;
    }
    setProveedores((prev) => [...prev, data as Proveedor]);
  }

  async function renombrarProveedor(id: string, nombreViejo: string, nombreNuevo: string) {
    const { data, error } = await supabase
      .from("proveedores")
      .update({ nombre: nombreNuevo })
      .eq("id", id)
      .select()
      .single();
    if (error || !data) {
      setSaveError("No se pudo renombrar el proveedor. Probá de nuevo.");
      return;
    }
    setProveedores((prev) => prev.map((p) => (p.id === id ? (data as Proveedor) : p)));
    await supabase.from("movimientos").update({ proveedor: nombreNuevo }).eq("proveedor", nombreViejo);
    setMovs((prev) => prev.map((m) => (m.proveedor === nombreViejo ? { ...m, proveedor: nombreNuevo } : m)));
    // Las entregas también se vinculan por nombre: si no se renombran acá, la cuenta
    // corriente se parte en dos proveedores distintos.
    await supabase.from("entregas_proveedor").update({ proveedor: nombreNuevo }).eq("proveedor", nombreViejo);
    setEntregas((prev) => prev.map((e) => (e.proveedor === nombreViejo ? { ...e, proveedor: nombreNuevo } : e)));
  }

  function eliminarProveedor(id: string) {
    pedirConfirmacion("¿Eliminar este proveedor? Los movimientos ya cargados no se ven afectados.", async () => {
      const { error } = await supabase.from("proveedores").delete().eq("id", id);
      if (error) {
        setSaveError("No se pudo eliminar. Probá de nuevo.");
        return;
      }
      setProveedores((prev) => prev.filter((p) => p.id !== id));
    });
  }

  async function setTelefonoProveedor(id: string, telefono: string) {
    const { data, error } = await supabase.from("proveedores").update({ telefono }).eq("id", id).select().single();
    if (!error && data) {
      setProveedores((prev) => prev.map((p) => (p.id === id ? (data as Proveedor) : p)));
    }
  }

  async function addCategoria(nombre: string) {
    if (categorias.some((c) => c.nombre.toLowerCase() === nombre.trim().toLowerCase())) return;
    const { data, error } = await supabase.from("categorias").insert({ nombre: nombre.trim() }).select().single();
    if (error || !data) {
      setSaveError("No se pudo guardar la categoría. Probá de nuevo.");
      return;
    }
    setCategorias((prev) => [...prev, data as Categoria]);
  }

  function eliminarCategoria(id: string) {
    pedirConfirmacion("¿Eliminar esta categoría? Los movimientos ya cargados no se ven afectados.", async () => {
      const { error } = await supabase.from("categorias").delete().eq("id", id);
      if (error) {
        setSaveError("No se pudo eliminar. Probá de nuevo.");
        return;
      }
      setCategorias((prev) => prev.filter((c) => c.id !== id));
    });
  }

  async function setLimiteCategoria(categoria: string, valor: string) {
    const num = parseFloat(valor);
    if (!valor || !(num > 0)) {
      await supabase.from("limites_categorias").delete().eq("categoria", categoria);
      setLimites((prev) => {
        const next = { ...prev };
        delete next[categoria];
        return next;
      });
    } else {
      await supabase.from("limites_categorias").upsert({ categoria, limite: num });
      setLimites((prev) => ({ ...prev, [categoria]: num }));
    }
  }

  async function addGastoFijo(nuevo: NuevoGastoFijo) {
    const { data, error } = await supabase.from("gastos_fijos").insert(nuevo).select().single();
    if (error || !data) {
      setSaveError("No se pudo guardar. Probá de nuevo.");
      return;
    }
    setSaveError("");
    setGastosFijos((prev) => [...prev, data as GastoFijo]);
  }

  async function updateGastoFijo(id: string, patch: Partial<GastoFijo>) {
    const { data, error } = await supabase.from("gastos_fijos").update(patch).eq("id", id).select().single();
    if (error || !data) {
      setSaveError("No se pudo guardar. Probá de nuevo.");
      return;
    }
    setGastosFijos((prev) => prev.map((g) => (g.id === id ? (data as GastoFijo) : g)));
  }

  function eliminarGastoFijo(id: string) {
    pedirConfirmacion("¿Eliminar este gasto fijo? Los movimientos ya cargados no se ven afectados.", async () => {
      const { error } = await supabase.from("gastos_fijos").delete().eq("id", id);
      if (error) {
        setSaveError("No se pudo eliminar. Probá de nuevo.");
        return;
      }
      setGastosFijos((prev) => prev.filter((g) => g.id !== id));
    });
  }

  async function cargarGastoFijo(g: GastoFijo) {
    await addMov({
      fecha: hoyISO(),
      descripcion: g.descripcion,
      categoria: g.categoria,
      ingreso: null,
      egreso: g.monto,
      proveedor: g.proveedor,
      medio_pago: null,
      n_cheque_pago: null,
      fecha_cobro_cheque_pago: null,
      gasto_fijo_id: g.id,
    });
  }

  async function confirmarImportacionXRP(preview: RendicionXRP[]) {
    const fechasNuevas = preview.map((p) => p.fecha);
    const conflictos = ventasXRP.filter((v) => fechasNuevas.includes(v.fecha));
    const ejecutar = async () => {
      const payload = preview.map((p) => ({ ...p, creado_el: new Date().toISOString() }));
      const { data, error } = await supabase.from("ventas_xrp").upsert(payload, { onConflict: "fecha" }).select();
      if (error || !data) {
        console.error(error);
        setSaveError(`No se pudo importar${error ? `: ${error.message}` : ""}. Probá de nuevo.`);
        return;
      }
      setSaveError("");
      setVentasXRP((prev) => [...prev.filter((v) => !fechasNuevas.includes(v.fecha)), ...(data as VentaXRP[])].sort((a, b) => (a.fecha < b.fecha ? -1 : 1)));
    };
    if (conflictos.length > 0) {
      pedirConfirmacion(
        `Ya tenés datos cargados para ${conflictos.map((c) => c.fecha).join(", ")}. ¿Reemplazarlos?`,
        ejecutar,
      );
    } else {
      await ejecutar();
    }
  }

  function eliminarVentaXRP(id: string) {
    pedirConfirmacion("¿Eliminar esta venta XRP importada?", async () => {
      const { error } = await supabase.from("ventas_xrp").delete().eq("id", id);
      if (error) {
        setSaveError("No se pudo eliminar. Probá de nuevo.");
        return;
      }
      setVentasXRP((prev) => prev.filter((v) => v.id !== id));
    });
  }

  async function guardarPedidoEnviado(nuevo: NuevoPedido) {
    const { data, error } = await supabase.from("pedidos").insert(nuevo).select().single();
    if (error || !data) {
      setSaveError("No se pudo guardar el pedido. Probá de nuevo.");
      return;
    }
    setPedidos((prev) => [data as Pedido, ...prev]);
  }

  async function toggleConfirmadoPedido(id: string, confirmado: boolean) {
    const { data, error } = await supabase.from("pedidos").update({ confirmado }).eq("id", id).select().single();
    if (!error && data) {
      setPedidos((prev) => prev.map((p) => (p.id === id ? (data as Pedido) : p)));
    }
  }

  function eliminarPedido(id: string) {
    pedirConfirmacion("¿Eliminar este pedido del historial?", async () => {
      const { error } = await supabase.from("pedidos").delete().eq("id", id);
      if (error) {
        setSaveError("No se pudo eliminar. Probá de nuevo.");
        return;
      }
      setPedidos((prev) => prev.filter((p) => p.id !== id));
    });
  }

  return (
    // minWidth: 0 no es decorativo: este div es hijo de un body flex, y sin él su
    // min-width:auto lo estira hasta el ancho mínimo de la tabla más ancha, agrandando
    // el documento entero y dejando botones fuera de la pantalla en móvil.
    <div style={{ fontFamily: "Arial, sans-serif", maxWidth: 1200, width: "100%", minWidth: 0, margin: "0 auto", padding: 20, color: "#1A1A2E", background: "white", minHeight: "100vh" }}>
      <div
        style={{
          background: RED,
          color: "white",
          padding: "18px 24px",
          borderRadius: 10,
          marginBottom: 16,
          display: "flex",
          alignItems: "center",
          gap: 14,
        }}
      >
        <div style={{ width: 50, height: 50, borderRadius: 12, flexShrink: 0, overflow: "hidden", boxShadow: "0 2px 6px rgba(0,0,0,0.25)" }}>
          <Image src="/logo.jpg" alt="Logo El Nuevo Rural" width={50} height={50} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
        </div>
        <div style={{ flex: 1 }}>
          <h1 style={{ margin: 0, fontSize: 20, fontWeight: 800, letterSpacing: 0.3 }}>EL NUEVO RURAL</h1>
          <p style={{ margin: "2px 0 0", fontSize: 13, opacity: 0.85 }}>
            Ingresos y Egresos · {movs.length} movimientos cargados
          </p>
        </div>
        {esAdmin && (
          <Link href="/cheques" style={{ color: "white", fontSize: 13, fontWeight: 700, opacity: 0.9 }}>
            Cheques
          </Link>
        )}
        <Link href="/empleados" style={{ color: "white", fontSize: 13, fontWeight: 700, opacity: 0.9 }}>
          Empleados
        </Link>
        {esAdmin && (
          <Link href="/rentabilidad" style={{ color: "white", fontSize: 13, fontWeight: 700, opacity: 0.9 }}>
            Rentabilidad
          </Link>
        )}
        <Link href="/" style={{ color: "white", fontSize: 13, fontWeight: 700, opacity: 0.9 }}>
          ← Volver
        </Link>
      </div>

      {saveError && (
        <div style={{ background: "#FADBD8", color: "#922B21", padding: "8px 12px", borderRadius: 6, marginBottom: 12, fontSize: 13 }}>
          {saveError}
        </div>
      )}

      <div style={{ display: "flex", gap: 6, marginBottom: 16, borderBottom: "1px solid #ddd", flexWrap: "wrap" }}>
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              border: "none",
              background: "transparent",
              padding: "10px 14px",
              fontSize: 13,
              fontWeight: 700,
              color: tab === key ? RED : "#888",
              borderBottom: tab === key ? `2px solid ${RED}` : "2px solid transparent",
              cursor: "pointer",
            }}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "movimientos" && (
        <MovimientosTab
          movs={movs}
          enriched={enriched}
          esAdmin={esAdmin}
          categorias={categorias}
          proveedores={proveedores}
          limites={limites}
          onAdd={addMov}
          onUpdate={updateMov}
          onDelete={deleteMov}
          onRestaurarBackup={restaurarBackupMovs}
          onAddCategoria={addCategoria}
          onDeleteCategoria={eliminarCategoria}
          onAddProveedor={addProveedor}
          onRenameProveedor={renombrarProveedor}
          onDeleteProveedor={eliminarProveedor}
          onSetTelefonoProveedor={setTelefonoProveedor}
        />
      )}
      {tab === "ventasxrp" && (
        <VentasXRPTab ventasXRP={ventasXRP} onConfirmarImportacion={confirmarImportacionXRP} onDelete={eliminarVentaXRP} />
      )}
      {tab === "gastosfijos" && (
        <GastosFijosTab
          gastosFijos={gastosFijos}
          movs={movs}
          nombresCategorias={nombresCategorias}
          nombresProveedores={nombresProveedores}
          onAdd={addGastoFijo}
          onUpdate={updateGastoFijo}
          onDelete={eliminarGastoFijo}
          onCargar={cargarGastoFijo}
          pedirConfirmacion={pedirConfirmacion}
        />
      )}
      {tab === "dashboard" && <DashboardTab movs={movs} />}
      {tab === "categorias" && <CategoriasTab movs={movs} nombresCategorias={nombresCategorias} limites={limites} onSetLimite={setLimiteCategoria} />}
      {tab === "cuentaproveedores" && (
        <CuentaProveedoresTab
          movs={movs}
          entregas={entregas}
          imputaciones={imputaciones}
          proveedores={proveedores}
          esAdmin={esAdmin}
          corte={corte}
          onAddEntrega={addEntrega}
          onDeleteEntrega={eliminarEntrega}
          onPagarEntrega={pagarEntrega}
          onImputar={imputarPago}
          onDesimputar={desimputarPago}
          onSetCorte={setCorteCuentaCorriente}
        />
      )}
      {tab === "proveedores" && <ProveedoresTab movs={movs} />}
      {tab === "mensual" && <MensualTab movs={movs} nombresCategorias={nombresCategorias} />}
      {tab === "cierre" && <CierreTab movs={movs} />}
      {tab === "pedidos" && (
        <PedidosTab
          pedidos={pedidos}
          proveedores={proveedores}
          onGuardarEnviado={guardarPedidoEnviado}
          onToggleConfirmado={toggleConfirmadoPedido}
          onDelete={eliminarPedido}
        />
      )}
      {tab === "historial" && <HistorialTab movs={movs} />}

      <ConfirmModal />
    </div>
  );
}
