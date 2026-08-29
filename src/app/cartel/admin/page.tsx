import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import AdminShell from "./AdminShell";
import type { Placa } from "@/lib/cartel/types";

export const dynamic = "force-dynamic";

export default async function CartelAdminPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  // A diferencia de la pantalla del televisor, acá se listan también las placas
  // apagadas: son las que hay que poder volver a prender.
  const { data, error } = await supabase
    .from("cartel_placas")
    .select("*")
    .order("orden", { ascending: true });

  return (
    <AdminShell
      placasIniciales={(data ?? []) as Placa[]}
      userId={user.id}
      errorInicial={error?.message ?? null}
    />
  );
}
