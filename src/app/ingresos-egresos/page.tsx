import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { aplicarCorte, corteCuentaCorriente } from "@/lib/ingresos-egresos/corte";
import { leerCorteIE } from "@/lib/ingresos-egresos/corteServidor";
import IngresosEgresosShell from "./IngresosEgresosShell";
import type {
  Categoria,
  ConfigProveedores,
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
    configProveedoresRes,
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
    supabase.from("config_proveedores").select("*").maybeSingle(),
  ]);

  // Corte de registros (SPEC-corte-registros.md): lo cargado antes sigue en la base, pero la
  // sección arranca de cero. Se aplica acá, una vez, para que todas las pestañas vean lo mismo.
  const corte = await leerCorteIE(supabase);
  const { visibles, guardados } = aplicarCorte(
    {
      movimientos: (movsRes.data ?? []) as Movimiento[],
      ventasXRP: (ventasXRPRes.data ?? []) as VentaXRP[],
      pedidos: (pedidosRes.data ?? []) as Pedido[],
      entregas: (entregasRes.data ?? []) as EntregaProveedor[],
      imputaciones: (imputacionesRes.data ?? []) as ImputacionPago[],
    },
    corte,
  );
  // La cuenta corriente tiene su propio corte (013); manda el más nuevo de los dos.
  const configProveedores = configProveedoresRes.data as ConfigProveedores | null;
  const configProveedoresEfectiva: ConfigProveedores | null =
    configProveedores || corte
      ? { ...configProveedores, corte_cuenta_corriente: corteCuentaCorriente(configProveedores?.corte_cuenta_corriente, corte) ?? "" }
      : null;

  return (
    <IngresosEgresosShell
      esAdmin={perfil?.rol === "admin"}
      userId={user.id}
      initialTab={tab}
      movimientosIniciales={visibles.movimientos}
      ventasXRPIniciales={visibles.ventasXRP}
      gastosFijosIniciales={(gastosFijosRes.data ?? []) as GastoFijo[]}
      proveedoresIniciales={(proveedoresRes.data ?? []) as Proveedor[]}
      categoriasIniciales={(categoriasRes.data ?? []) as Categoria[]}
      limitesIniciales={(limitesRes.data ?? []) as LimiteCategoria[]}
      pedidosIniciales={visibles.pedidos}
      entregasIniciales={visibles.entregas}
      imputacionesIniciales={visibles.imputaciones}
      configProveedoresInicial={configProveedoresEfectiva}
      corteRegistros={corte}
      guardadosAntesDelCorte={guardados}
    />
  );
}
