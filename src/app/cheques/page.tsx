import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import ChequesShell from "./ChequesShell";
import type { Cheque, ChequeTercero, LimiteProveedor } from "@/lib/cheques/types";
import { traerTodo } from "@/lib/supabase/traerTodo";

export default async function ChequesPage() {
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

  if (perfil?.rol !== "admin") {
    return (
      <main className="flex flex-1 flex-col items-center justify-center bg-gray-50 px-4 text-center">
        <p className="text-lg font-semibold text-gray-900">Acceso restringido</p>
        <p className="mt-1 text-sm text-gray-500">Esta sección es solo para administradores.</p>
        <Link href="/" className="mt-4 text-sm font-medium text-green-700 hover:underline">
          ← Volver al inicio
        </Link>
      </main>
    );
  }

  const [chequesRes, tercerosRes, limitesRes] = await Promise.all([
    traerTodo<Cheque>((desde, hasta, conTotal) =>
      supabase
        .from("cheques")
        .select("*", { count: conTotal ? "exact" : undefined })
        .order("creado_el", { ascending: true })
        .order("id", { ascending: true })
        .range(desde, hasta),
    ),
    supabase.from("cheques_terceros").select("*").order("creado_el", { ascending: true }),
    supabase.from("limites_proveedores_cheques").select("*"),
  ]);

  return (
    <ChequesShell
      esAdmin={perfil?.rol === "admin"}
      userId={user.id}
      chequesIniciales={(chequesRes.data ?? []) as Cheque[]}
      tercerosIniciales={(tercerosRes.data ?? []) as ChequeTercero[]}
      limitesIniciales={(limitesRes.data ?? []) as LimiteProveedor[]}
    />
  );
}
