import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import IngresosEgresosShell from "./IngresosEgresosShell";
import type {
  Categoria,
  EntregaProveedor,
  GastoFijo,
  ImputacionPago,
  LimiteCategoria,
  Movimiento,
  Pedido,
  Proveedor,
  VentaXRP,
} from "@/lib/ingresos-egresos/types";

export default async function IngresosEgresosPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const { tab } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: perfil } = await supabase
    .from("usuarios")
    .select("rol")
    .eq("id", user.id)
    .maybeSingle();

  const [
    movsRes,
    ventasXRPRes,
    gastosFijosRes,
    proveedoresRes,
    categoriasRes,
    limitesRes,
    pedidosRes,
    entregasRes,
    imputacionesRes,
  ] = await Promise.all([
    supabase.from("movimientos").select("*").order("creado_el", { ascending: true }),
    supabase.from("ventas_xrp").select("*").order("fecha", { ascending: true }),
    supabase.from("gastos_fijos").select("*").order("descripcion", { ascending: true }),
    supabase.from("proveedores").select("*").order("nombre", { ascending: true }),
    supabase.from("categorias").select("*").order("nombre", { ascending: true }),
    supabase.from("limites_categorias").select("*"),
    supabase.from("pedidos").select("*").order("enviado_el", { ascending: false }),
    supabase.from("entregas_proveedor").select("*").order("fecha", { ascending: true }),
    supabase.from("imputaciones_pago").select("*").order("creado_el", { ascending: true }),
  ]);

  return (
    <IngresosEgresosShell
      esAdmin={perfil?.rol === "admin"}
      userId={user.id}
      initialTab={tab}
      movimientosIniciales={(movsRes.data ?? []) as Movimiento[]}
      ventasXRPIniciales={(ventasXRPRes.data ?? []) as VentaXRP[]}
      gastosFijosIniciales={(gastosFijosRes.data ?? []) as GastoFijo[]}
      proveedoresIniciales={(proveedoresRes.data ?? []) as Proveedor[]}
      categoriasIniciales={(categoriasRes.data ?? []) as Categoria[]}
      limitesIniciales={(limitesRes.data ?? []) as LimiteCategoria[]}
      pedidosIniciales={(pedidosRes.data ?? []) as Pedido[]}
      entregasIniciales={(entregasRes.data ?? []) as EntregaProveedor[]}
      imputacionesIniciales={(imputacionesRes.data ?? []) as ImputacionPago[]}
    />
  );
}
