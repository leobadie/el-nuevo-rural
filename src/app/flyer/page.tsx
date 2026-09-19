import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import FlyerShell from "./FlyerShell";

export default async function FlyerPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  return <FlyerShell />;
}
