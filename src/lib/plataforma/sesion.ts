import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { esPlataforma } from "@/lib/negocio/actual";

/**
 * La administración de PeluDesk: solo en el dominio de la plataforma y
 * solo para quien está en plataforma_admins. Lo decide la BASE
 * (es_admin_plataforma), no esta función: aquí solo se evita pintar una
 * pantalla a quien no le toca. Cada escritura la vuelve a revisar la base
 * (políticas y funciones con es_admin_plataforma).
 */
export async function sesionPlataforma() {
  if (!(await esPlataforma())) return null;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: es } = await supabase.rpc("es_admin_plataforma");
  if (es !== true) return null;
  return { user, supabase };
}

export async function exigirPlataforma() {
  const s = await sesionPlataforma();
  if (!s) redirect("/plataforma/entrar");
  return s;
}
