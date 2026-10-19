"use server";

import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function cerrarSesion() {
  const supabase = await createSupabaseServerClient();
  // Solo ESTA sesión (este navegador y este negocio): el alcance por omisión es global y cerraba la sesión de la
  // persona en todos sus negocios y equipos (QA N42, 18 de octubre de 2026).
  await supabase.auth.signOut({ scope: "local" });
  redirect("/login");
}
