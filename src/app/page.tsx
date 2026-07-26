import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";
import { FileText, Wallet, Users, TrendingUp } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { fmtMoney } from "@/lib/cheques/calculos";
import {
  buildKpisCheques,
  buildKpisMovs,
  countCategoriasEnRiesgo,
  countProveedoresEnRiesgo,
} from "@/lib/resumen-general/calculos";
import { calcularMes } from "@/lib/rentabilidad/calculos";
import { logout } from "./login/actions";
import type { Cheque, LimiteProveedor } from "@/lib/cheques/types";
import type { LimiteCategoria, Movimiento, VentaXRP } from "@/lib/ingresos-egresos/types";
import type { Colaborador, ParametrosEmpleados, RegistroAsistencia } from "@/lib/empleados/types";

const PARAMETROS_DEFAULT: ParametrosEmpleados = {
  horas_completa: 10.75,
  horas_media: 5.38,
  recargo_50: 0.5,
  recargo_100: 1.0,
};

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: perfil } = await supabase
    .from("usuarios")
    .select("nombre, rol, activo")
    .eq("id", user.id)
    .maybeSingle();

  const esAdmin = perfil?.rol === "admin";

  const [
    chequesRes,
    movsRes,
    limitesProveedoresRes,
    limitesCategoriasRes,
    colaboradoresRes,
    ventasXRPRes,
    registrosRes,
    parametrosRes,
  ] = await Promise.all([
    esAdmin ? supabase.from("cheques").select("*") : Promise.resolve({ data: [] as Cheque[] }),
    supabase.from("movimientos").select("*"),
    esAdmin ? supabase.from("limites_proveedores_cheques").select("*") : Promise.resolve({ data: [] as LimiteProveedor[] }),
    supabase.from("limites_categorias").select("*"),
    supabase.from("colaboradores").select("*"),
    esAdmin ? supabase.from("ventas_xrp").select("*") : Promise.resolve({ data: [] as VentaXRP[] }),
    esAdmin ? supabase.from("registros_asistencia").select("*") : Promise.resolve({ data: [] as RegistroAsistencia[] }),
    esAdmin ? supabase.from("parametros_empleados").select("*").maybeSingle() : Promise.resolve({ data: null }),
  ]);

  const cheques = (chequesRes.data ?? []) as Cheque[];
  const movs = (movsRes.data ?? []) as Movimiento[];
  const colaboradores = (colaboradoresRes.data ?? []) as Colaborador[];
  const ventasXRP = (ventasXRPRes.data ?? []) as VentaXRP[];
  const registros = (registrosRes.data ?? []) as RegistroAsistencia[];
  const parametros = (parametrosRes.data as ParametrosEmpleados | null) ?? PARAMETROS_DEFAULT;
  const limitesProveedores = Object.fromEntries(
    ((limitesProveedoresRes.data ?? []) as LimiteProveedor[]).map((l) => [l.proveedor, l.limite]),
  );
  const limitesCategorias = Object.fromEntries(
    ((limitesCategoriasRes.data ?? []) as LimiteCategoria[]).map((l) => [l.categoria, l.limite]),
  );

  const kpisCheques = buildKpisCheques(cheques);
  const kpisMovs = buildKpisMovs(movs);
  const proveedoresEnRiesgo = countProveedoresEnRiesgo(cheques, limitesProveedores);
  const categoriasEnRiesgo = countCategoriasEnRiesgo(movs, limitesCategorias);
  const alertasTotal = kpisCheques.vencidoCant + proveedoresEnRiesgo + categoriasEnRiesgo;

  const hoy = new Date();
  const datosMes = esAdmin
    ? calcularMes(movs, ventasXRP, colaboradores, registros, parametros, hoy.getFullYear(), hoy.getMonth() + 1)
    : null;

  return (
    <main className="flex flex-1 flex-col bg-gray-50">
      <header className="flex items-center justify-between border-b border-gray-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <Image src="/logo.jpg" alt="Logo El Nuevo Rural" width={40} height={40} className="rounded-lg shadow-sm" />
          <h1 className="text-lg font-semibold text-gray-900">El Nuevo Rural</h1>
        </div>
        <form action={logout}>
          <button
            type="submit"
            className="rounded-md border border-gray-300 px-3 py-1.5 text-sm text-gray-700 transition hover:bg-gray-100"
          >
            Cerrar sesión
          </button>
        </form>
      </header>

      <section className="flex-1 px-4 py-8">
        <div className="mx-auto w-full max-w-5xl" style={{ color: "#1A1A2E" }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 10, marginBottom: 20 }}>
            <div>
              <h2 style={{ fontSize: 24, fontWeight: 800, margin: 0 }}>
                Hola{perfil?.nombre ? `, ${perfil.nombre.split(" ")[0]}` : ""} 👋
              </h2>
              <p style={{ fontSize: 13, color: "#888", margin: "2px 0 0" }}>{user.email}</p>
            </div>
            {perfil ? (
              <span
                style={{
                  background: esAdmin ? "#F4ECF7" : "#EBF2FA",
                  color: esAdmin ? "#6C3483" : "#1F4E78",
                  fontSize: 12,
                  fontWeight: 700,
                  padding: "6px 14px",
                  borderRadius: 20,
                }}
              >
                {esAdmin ? "Administrador" : "Encargado"}
                {!perfil.activo && " · Inactivo"}
              </span>
            ) : (
              <span style={{ background: "#FDEBD0", color: "#784212", fontSize: 12, fontWeight: 700, padding: "6px 14px", borderRadius: 20 }}>
                Sin perfil — pedile al admin que te cree uno
              </span>
            )}
          </div>

          {alertasTotal > 0 && (
            <div style={{ background: "#FADBD8", color: "#922B21", padding: "12px 16px", borderRadius: 8, marginBottom: 20, fontSize: 13, fontWeight: 700 }}>
              ⚠ Tenés {alertasTotal} cosa(s) para revisar:{" "}
              {[
                kpisCheques.vencidoCant > 0 ? `${kpisCheques.vencidoCant} cheque(s) vencido(s)` : null,
                proveedoresEnRiesgo > 0 ? `${proveedoresEnRiesgo} proveedor(es) de cheques pasados de límite` : null,
                categoriasEnRiesgo > 0 ? `${categoriasEnRiesgo} categoría(s) de gasto pasadas de límite` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </div>
          )}

          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 16, marginBottom: 24 }}>
            {esAdmin && (
              <div style={{ background: "white", border: "1px solid #e0e0e0", borderTop: "4px solid #1F3864", borderRadius: 10, padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: "#1F3864", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <FileText size={17} color="white" />
                    </div>
                    <span style={{ fontWeight: 700, color: "#1F3864", fontSize: 15 }}>Cheques</span>
                  </div>
                  <Link href="/cheques" style={{ background: "#1F3864", color: "white", fontSize: 12, fontWeight: 700, padding: "6px 10px", borderRadius: 6, textDecoration: "none" }}>
                    Ver módulo →
                  </Link>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div style={{ background: "#F8F9FA", borderRadius: 8, padding: "10px" }}>
                    <div style={{ fontSize: 10, color: "#666", fontWeight: 700 }}>PENDIENTE</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A2E" }}>{fmtMoney(kpisCheques.pendiente)}</div>
                  </div>
                  <div style={{ background: "#FADBD8", color: "#922B21", borderRadius: 8, padding: "10px" }}>
                    <div style={{ fontSize: 10, fontWeight: 700 }}>VENCIDO</div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{fmtMoney(kpisCheques.vencido)}</div>
                  </div>
                  <div style={{ background: "#FDEBD0", color: "#784212", borderRadius: 8, padding: "10px" }}>
                    <div style={{ fontSize: 10, fontWeight: 700 }}>PRÓXIMO (7 días)</div>
                    <div style={{ fontSize: 15, fontWeight: 700 }}>{fmtMoney(kpisCheques.proximo)}</div>
                  </div>
                  <div style={{ background: "#F8F9FA", borderRadius: 8, padding: "10px" }}>
                    <div style={{ fontSize: 10, color: "#666", fontWeight: 700 }}>TOTAL EMITIDO</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A2E" }}>{fmtMoney(kpisCheques.total)}</div>
                  </div>
                </div>
              </div>
            )}

            <div style={{ background: "white", border: "1px solid #e0e0e0", borderTop: "4px solid #C00000", borderRadius: 10, padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: "#C00000", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Wallet size={17} color="white" />
                  </div>
                  <span style={{ fontWeight: 700, color: "#C00000", fontSize: 15 }}>Ingresos y Egresos</span>
                </div>
                <Link href="/ingresos-egresos" style={{ background: "#C00000", color: "white", fontSize: 12, fontWeight: 700, padding: "6px 10px", borderRadius: 6, textDecoration: "none" }}>
                  Ver módulo →
                </Link>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                <div style={{ background: "#D5F5E3", color: "#145A32", borderRadius: 8, padding: "10px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700 }}>ENTRÓ HOY</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{fmtMoney(kpisMovs.ingresosHoy)}</div>
                </div>
                <div style={{ background: "#FADBD8", color: "#922B21", borderRadius: 8, padding: "10px" }}>
                  <div style={{ fontSize: 10, fontWeight: 700 }}>SALIÓ HOY</div>
                  <div style={{ fontSize: 15, fontWeight: 700 }}>{fmtMoney(kpisMovs.egresosHoy)}</div>
                </div>
                <div style={{ gridColumn: "span 2", background: "#F8F9FA", borderRadius: 8, padding: "10px" }}>
                  <div style={{ fontSize: 10, color: "#666", fontWeight: 700 }}>SALDO DE CAJA (histórico)</div>
                  <div style={{ fontSize: 18, fontWeight: 700, color: "#1F4E78" }}>{fmtMoney(kpisMovs.saldo)}</div>
                </div>
              </div>
            </div>

            <div style={{ background: "white", border: "1px solid #e0e0e0", borderTop: "4px solid #1E7B34", borderRadius: 10, padding: 18 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: "#1E7B34", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                    <Users size={17} color="white" />
                  </div>
                  <span style={{ fontWeight: 700, color: "#1E7B34", fontSize: 15 }}>Empleados</span>
                </div>
                <Link href="/empleados" style={{ background: "#1E7B34", color: "white", fontSize: 12, fontWeight: 700, padding: "6px 10px", borderRadius: 6, textDecoration: "none" }}>
                  Ver módulo →
                </Link>
              </div>
              <div style={{ background: "#F8F9FA", borderRadius: 8, padding: "10px" }}>
                <div style={{ fontSize: 10, color: "#666", fontWeight: 700 }}>COLABORADORES CARGADOS</div>
                <div style={{ fontSize: 18, fontWeight: 700, color: "#1A1A2E" }}>{colaboradores.length}</div>
              </div>
            </div>

            {esAdmin && datosMes && (
              <div style={{ background: "white", border: "1px solid #e0e0e0", borderTop: "4px solid #6C3483", borderRadius: 10, padding: 18 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 8, background: "#6C3483", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                      <TrendingUp size={17} color="white" />
                    </div>
                    <span style={{ fontWeight: 700, color: "#6C3483", fontSize: 15 }}>Rentabilidad</span>
                  </div>
                  <Link href="/rentabilidad" style={{ background: "#6C3483", color: "white", fontSize: 12, fontWeight: 700, padding: "6px 10px", borderRadius: 6, textDecoration: "none" }}>
                    Ver módulo →
                  </Link>
                </div>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                  <div style={{ background: "#F8F9FA", borderRadius: 8, padding: "10px" }}>
                    <div style={{ fontSize: 10, color: "#666", fontWeight: 700 }}>INGRESOS DEL MES</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A2E" }}>{fmtMoney(datosMes.ingresosReales)}</div>
                  </div>
                  <div style={{ background: "#F8F9FA", borderRadius: 8, padding: "10px" }}>
                    <div style={{ fontSize: 10, color: "#666", fontWeight: 700 }}>GASTOS DEL MES</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: "#1A1A2E" }}>{fmtMoney(datosMes.egresosOperativos + datosMes.costoPersonal)}</div>
                  </div>
                  <div style={{ gridColumn: "span 2", background: datosMes.utilidad >= 0 ? "#F4ECF7" : "#FADBD8", borderRadius: 8, padding: "10px" }}>
                    <div style={{ fontSize: 10, fontWeight: 700, color: datosMes.utilidad >= 0 ? "#6C3483" : "#922B21" }}>
                      UTILIDAD NETA ({datosMes.margen.toFixed(1)}%)
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 700, color: datosMes.utilidad >= 0 ? "#6C3483" : "#922B21" }}>{fmtMoney(datosMes.utilidad)}</div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <p style={{ textAlign: "center", fontSize: 11, color: "#888" }}>
            Elegí un módulo arriba para ver el detalle completo, cargar movimientos o revisar las alertas.
          </p>
        </div>
      </section>
    </main>
  );
}
