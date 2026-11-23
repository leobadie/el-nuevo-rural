"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { buildSaldoAcumulado } from "@/lib/ingresos-egresos/calculos";
import { RED } from "@/lib/ingresos-egresos/estilos";
import { useConfirmDialog } from "../useConfirmDialog";
import AvisoCorteRegistros from "./AvisoCorteRegistros";
import type { Guardados } from "@/lib/ingresos-egresos/corte";
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
import { AplicarChequeModal } from "./ChequeExistente";
import { idsChequesUsados, puedeAplicarseADeuda, repartirCheque, type ChequeBasico } from "@/lib/cheques/vinculo";
import { entregasConSaldo } from "@/lib/ingresos-egresos/cuentaProveedores";
import type {
  AplicacionNotaCredito,
  Categoria,
  ConfigProveedores,
  EntregaProveedor,
  GastoFijo,
  ImputacionPago,
  LimiteCategoria,
  MedioPago,
  Movimiento,
  NotaCreditoProveedor,
  NuevaEntregaProveedor,
  NuevaNotaCredito,
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
  notasCreditoIniciales = [],
  aplicacionesNotaIniciales = [],
  configProveedoresInicial,
  corteRegistros = null,
  guardadosAntesDelCorte = { movimientos: 0, ventasXRP: 0, pedidos: 0, entregas: 0 },
  chequesIniciales = [],
  chequesUsadosAntes = [],
  chequeParaAplicar = null,
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
  /** Notas de crédito de proveedores (SPEC-notas-credito.md). */
  notasCreditoIniciales?: NotaCreditoProveedor[];
  aplicacionesNotaIniciales?: AplicacionNotaCredito[];
  configProveedoresInicial: ConfigProveedores | null;
  /** Desde cuándo se cuentan los registros (SPEC-corte-registros.md). null = todo. */
  corteRegistros?: string | null;
  /** Lo cargado antes del corte, que sigue en la base: se cuenta en el aviso. */
  guardadosAntesDelCorte?: Guardados;
  /** Cheques de Control de Cheques, para pagar con uno ya cargado (SPEC-cheque-a-proveedor.md). */
  chequesIniciales?: ChequeBasico[];
  /** Cheques usados por pagos de antes del corte, que no están en movimientosIniciales. */
  chequesUsadosAntes?: string[];
  /** Id de cheque que llega desde Control de Cheques ("Aplicar a deuda"): abre el modal. */
  chequeParaAplicar?: string | null;
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
  const [notas, setNotas] = useState<NotaCreditoProveedor[]>(notasCreditoIniciales);
  const [aplicacionesNota, setAplicacionesNota] = useState<AplicacionNotaCredito[]>(aplicacionesNotaIniciales);
  const [corte, setCorte] = useState<string | null>(configProveedoresInicial?.corte_cuenta_corriente ?? null);
  const [tab, setTab] = useState(
    initialTab && TABS.some((t) => t.key === initialTab) ? initialTab : "movimientos",
  );
  const [saveError, setSaveError] = useState("");
  const [cheques, setCheques] = useState<ChequeBasico[]>(chequesIniciales);
  const [chequeAAplicar, setChequeAAplicar] = useState<string | null>(chequeParaAplicar);
  /** El último error de addMov, para mostrarlo dentro de un modal (que tapa el aviso rojo). */
  const ultimoErrorMov = useRef("");

  // El id del cheque viaja en la URL sólo para abrir el modal: se saca para que recargar la
  // página no lo vuelva a abrir.
  useEffect(() => {
    if (!chequeParaAplicar) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("cheque");
    window.history.replaceState(null, "", url.toString());
  }, [chequeParaAplicar]);

  /**
   * Los que se pueden elegir (R2): no rechazados, sin pago vinculado —ni de antes ni de después
   * del corte— y cargados desde el corte de registros. Los anteriores ya se usaron cuando no
   * existía la cuenta corriente: ofrecerlos invitaría a cargar el mismo pago dos veces.
   */
  const chequesLibres = useMemo(() => {
    const usadosAntes = chequesUsadosAntes.map((id) => ({ id: "", cheque_id: id, proveedor: null, descripcion: null, fecha: "" }));
    const usados = idsChequesUsados([...movs, ...usadosAntes]);
    return cheques.filter((c) => puedeAplicarseADeuda(c, usados, corteRegistros));
  }, [cheques, movs, chequesUsadosAntes, corteRegistros]);

  const enriched = useMemo(() => buildSaldoAcumulado(movs), [movs]);
  const nombresProveedores = useMemo(() => proveedores.map((p) => p.nombre), [proveedores]);
  const nombresCategorias = useMemo(() => categorias.map((c) => c.nombre), [categorias]);

  async function crearChequeDesdeMovimiento(mov: Movimiento) {
    const { data: nuevoCheque, error } = await supabase.from("cheques").insert({
      n_cheque: mov.n_cheque_pago || null,
      proveedor: mov.proveedor || mov.descripcion || "",
      fecha_emision: mov.fecha,
      fecha_cobro: mov.fecha_cobro_cheque_pago || null,
      importe: mov.egreso,
      tipo: "Físico",
      entregado: true,
      observaciones: `Generado desde Ingresos y Egresos: ${mov.descripcion}`,
      creado_por: userId,
    })
      .select("id, n_cheque, proveedor, fecha_emision, fecha_cobro, importe, rechazado, observaciones, creado_el")
      .single();
    if (error || !nuevoCheque) {
      setSaveError("El movimiento se guardó pero no se pudo crear el cheque asociado. Revisalo en Control de Cheques.");
      return;
    }
    setCheques((prev) => [...prev, nuevoCheque as ChequeBasico]);
    // Se vincula para que este cheque no se ofrezca para otro pago (R8). Si la migración 037
    // todavía no está aplicada esto falla sin consecuencias: el pago y el cheque ya están.
    const { error: errVinculo } = await supabase.from("movimientos").update({ cheque_id: nuevoCheque.id }).eq("id", mov.id);
    if (!errVinculo) setMovs((prev) => prev.map((m) => (m.id === mov.id ? { ...m, cheque_id: nuevoCheque.id } : m)));
  }

  /**
   * Pagar con un cheque que ya está en Control de Cheques (SPEC-cheque-a-proveedor.md, R4/R5):
   * un egreso por el importe del cheque, vinculado a él y sin crear otro, repartido primero en
   * la entrega elegida (si hay) y después en las demás pendientes. Lo que sobra queda a cuenta.
   * Devuelve el error para mostrar, o null.
   */
  async function aplicarCheque(cheque: ChequeBasico, proveedor: string, entregaPrimeroId?: string | null): Promise<string | null> {
    if (!chequesLibres.some((c) => c.id === cheque.id)) return "Ese cheque ya está usado en otro pago.";
    const pendientes = entregasConSaldo(entregas, imputaciones, proveedor, aplicacionesNota).filter((e) => e.saldo > 0);
    const { aplicaciones } = repartirCheque(Number(cheque.importe), pendientes, entregaPrimeroId);
    const mov = await addMov({
      fecha: cheque.fecha_emision || hoyISO(),
      descripcion: `Pago a ${proveedor} — cheque N° ${cheque.n_cheque || "s/n"}`,
      categoria: "Pago a Proveedor",
      ingreso: null,
      egreso: Number(cheque.importe),
      proveedor,
      medio_pago: "Cheque",
      n_cheque_pago: cheque.n_cheque,
      fecha_cobro_cheque_pago: cheque.fecha_cobro,
      gasto_fijo_id: null,
      cheque_id: cheque.id,
    });
    if (!mov) return ultimoErrorMov.current || "No se pudo guardar el pago. Probá de nuevo.";
    if (aplicaciones.length > 0) {
      await imputarPago(aplicaciones.map((a) => ({ movimiento_id: mov.id, entrega_id: a.entrega_id, monto: a.monto })));
    }
    return null;
  }

  async function addMov(nuevo: NuevoMovimiento) {
    const esCheque = nuevo.medio_pago === "Cheque" && !!nuevo.egreso;
    // Con un cheque ya cargado no se crea otro (R4, R7). cheque_id sólo viaja cuando hay uno, así
    // los pagos comunes siguen andando aunque la migración 037 no esté aplicada (R10).
    const { cheque_id, ...resto } = nuevo;
    const { data, error } = await supabase
      .from("movimientos")
      .insert({
        ...resto,
        ...(cheque_id ? { cheque_id } : {}),
        fecha_cobro_cheque_pago: nuevo.fecha_cobro_cheque_pago || null,
        cheque_creado: esCheque,
        creado_por: userId,
      })
      .select()
      .single();
    if (error || !data) {
      console.error(error);
      ultimoErrorMov.current =
        cheque_id && error?.message?.includes("cheque_id")
          ? "Para usar un cheque ya cargado falta aplicar la migración 037 en Supabase."
          : cheque_id && error?.code === "23505"
            ? "Ese cheque ya está usado en otro pago. Recargá la página."
            : "No se pudo guardar. Probá de nuevo.";
      setSaveError(ultimoErrorMov.current);
      return null;
    }
    setSaveError("");
    setMovs((prev) => [...prev, data as Movimiento]);
    if (esCheque && !cheque_id) await crearChequeDesdeMovimiento(data as Movimiento);
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
        setAplicacionesNota((prev) => prev.filter((a) => a.entrega_id !== id));
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
   * Carga una nota de crédito y, si viene una boleta, la aplica (SPEC-notas-credito.md, 13-15).
   * No crea ningún movimiento: no sale plata de la caja. Devuelve el error para mostrar, o null.
   */
  async function addNotaCredito(nueva: NuevaNotaCredito, aplicar: { entrega_id: string; monto: number } | null): Promise<string | null> {
    const { data, error } = await supabase
      .from("notas_credito_proveedor")
      .insert({ ...nueva, creado_por: userId })
      .select()
      .single();
    if (error || !data) {
      console.error(error);
      return error?.message?.includes("notas_credito_proveedor")
        ? "Para cargar notas de crédito falta aplicar la migración 038 en Supabase."
        : "No se pudo guardar la nota de crédito. Probá de nuevo.";
    }
    setSaveError("");
    const nota = data as NotaCreditoProveedor;
    setNotas((prev) => [...prev, nota]);
    if (aplicar && aplicar.monto > 0) {
      const err = await aplicarNotas([{ nota_id: nota.id, entrega_id: aplicar.entrega_id, monto: aplicar.monto }]);
      if (err) return `La nota de crédito se guardó, pero no se pudo aplicar a la boleta: quedó a favor. ${err}`;
    }
    return null;
  }

  async function aplicarNotas(aplicaciones: { nota_id: string; entrega_id: string; monto: number }[]): Promise<string | null> {
    if (aplicaciones.length === 0) return null;
    const { data, error } = await supabase.from("aplicaciones_nota_credito").insert(aplicaciones).select();
    if (error || !data) {
      console.error(error);
      const msg = error?.message?.includes("supera")
        ? "La nota ya no tiene tanto saldo, o la boleta ya está cubierta. Recargá la página."
        : "No se pudo aplicar la nota de crédito. Probá de nuevo.";
      setSaveError(msg);
      return msg;
    }
    setSaveError("");
    setAplicacionesNota((prev) => [...prev, ...(data as AplicacionNotaCredito[])]);
    return null;
  }

  async function desaplicarNota(id: string) {
    const { error } = await supabase.from("aplicaciones_nota_credito").delete().eq("id", id);
    if (error) {
      setSaveError("No se pudo deshacer la aplicación. Probá de nuevo.");
      return;
    }
    setSaveError("");
    setAplicacionesNota((prev) => prev.filter((a) => a.id !== id));
  }

  function eliminarNotaCredito(id: string) {
    pedirConfirmacion(
      "¿Eliminar esta nota de crédito? Se deshacen también sus aplicaciones y la deuda con el proveedor vuelve a subir.",
      async () => {
        const { error } = await supabase.from("notas_credito_proveedor").delete().eq("id", id);
        if (error) {
          setSaveError("No se pudo eliminar la nota de crédito. Probá de nuevo.");
          return;
        }
        setNotas((prev) => prev.filter((n) => n.id !== id));
        setAplicacionesNota((prev) => prev.filter((a) => a.nota_id !== id));
      },
    );
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

  /**
   * Una transferencia que paga varias boletas (SPEC-transferencia-proveedor.md, 6 y 8): un solo
   * egreso y después sus aplicaciones. Si una aplicación falla, el egreso queda y lo que no se
   * aplicó queda a cuenta. Devuelve el error para mostrar, o null.
   */
  async function pagarConTransferencia({
    proveedor,
    fecha,
    monto,
    descripcion,
    aplicaciones,
  }: {
    proveedor: string;
    fecha: string;
    monto: number;
    descripcion: string;
    aplicaciones: { entrega_id: string; monto: number }[];
  }): Promise<{ error: string | null; guardado: boolean }> {
    const mov = await addMov({
      fecha,
      descripcion,
      categoria: "Pago a Proveedor",
      ingreso: null,
      egreso: monto,
      proveedor,
      medio_pago: "Transferencia",
      n_cheque_pago: null,
      fecha_cobro_cheque_pago: null,
      gasto_fijo_id: null,
    });
    if (!mov) return { error: ultimoErrorMov.current || "No se pudo guardar la transferencia. Probá de nuevo.", guardado: false };
    if (aplicaciones.length === 0) return { error: null, guardado: true };
    const { data, error } = await supabase
      .from("imputaciones_pago")
      .insert(aplicaciones.map((a) => ({ movimiento_id: mov.id, entrega_id: a.entrega_id, monto: a.monto })))
      .select();
    if (error || !data) {
      console.error(error);
      const msg =
        "La transferencia se guardó en Movimientos, pero no se pudo aplicar a las boletas: quedó a cuenta. " +
        "Recargá la página y usá \"Aplicar a las entregas pendientes\".";
      setSaveError(msg);
      return { error: msg, guardado: true };
    }
    setImputaciones((prev) => [...prev, ...(data as ImputacionPago[])]);
    return { error: null, guardado: true };
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
    // Lo mismo con las notas de crédito (SPEC-notas-credito.md, 5).
    await supabase.from("notas_credito_proveedor").update({ proveedor: nombreNuevo }).eq("proveedor", nombreViejo);
    setNotas((prev) => prev.map((n) => (n.proveedor === nombreViejo ? { ...n, proveedor: nombreNuevo } : n)));
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

  /** El % que descuenta un proveedor en algunas boletas (SPEC-descuento-proveedores.md). */
  async function setDescuentoProveedor(id: string, pct: number | null): Promise<string | null> {
    const { data, error } = await supabase.from("proveedores").update({ descuento_pct: pct }).eq("id", id).select().single();
    if (error || !data) {
      console.error(error);
      return "No se pudo guardar el descuento. Probá de nuevo.";
    }
    setProveedores((prev) => prev.map((p) => (p.id === id ? (data as Proveedor) : p)));
    return null;
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

      <AvisoCorteRegistros
        corte={corteRegistros}
        guardados={guardadosAntesDelCorte}
        esAdmin={esAdmin}
        onCambiar={async (nuevo) => {
          const { error } = await supabase.from("config_ingresos_egresos").upsert({ id: true, corte: nuevo });
          if (error) {
            console.error(error);
            return "No se pudo cambiar la fecha de corte. Probá de nuevo.";
          }
          // Recarga entera: el corte se aplica en el servidor y el estado de acá se armó con lo
          // de antes. Un refresco parcial dejaría las pestañas mostrando los datos viejos.
          window.location.reload();
          return null;
        }}
      />

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
          chequesLibres={chequesLibres}
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
          notas={notas}
          aplicacionesNota={aplicacionesNota}
          onAddNota={addNotaCredito}
          onAplicarNotas={aplicarNotas}
          onDesaplicarNota={desaplicarNota}
          onDeleteNota={eliminarNotaCredito}
          proveedores={proveedores}
          esAdmin={esAdmin}
          corte={corte}
          onAddEntrega={addEntrega}
          onDeleteEntrega={eliminarEntrega}
          onPagarEntrega={pagarEntrega}
          onPagarTransferencia={pagarConTransferencia}
          chequesLibres={chequesLibres}
          onAplicarCheque={aplicarCheque}
          onImputar={imputarPago}
          onDesimputar={desimputarPago}
          onSetCorte={setCorteCuentaCorriente}
          onSetDescuentoProveedor={setDescuentoProveedor}
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

      {chequeAAplicar && (
        <AplicarChequeModal
          cheque={cheques.find((c) => c.id === chequeAAplicar) ?? null}
          yaUsado={
            chequesLibres.some((c) => c.id === chequeAAplicar)
              ? null
              : (movs.find((m) => m.cheque_id === chequeAAplicar) ?? ({ id: "", fecha: "", descripcion: "" } as Movimiento))
          }
          movs={movs}
          entregas={entregas}
          imputaciones={imputaciones}
          notas={notas}
          aplicacionesNota={aplicacionesNota}
          corte={corte}
          nombresProveedores={nombresProveedores}
          onAplicar={(cheque, proveedor) => aplicarCheque(cheque, proveedor)}
          onCerrar={() => setChequeAAplicar(null)}
        />
      )}

      <ConfirmModal />
    </div>
  );
}
