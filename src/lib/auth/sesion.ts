import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function obtenerSesionConRol() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data: perfil } = await supabase
    .from("profiles")
    .select("rol, nombre_completo, cliente_id")
    .eq("id", user.id)
    .single();

  return {
    user,
    rol: (perfil?.rol as string | undefined) ?? "cliente",
    nombreCompleto: (perfil?.nombre_completo as string | null | undefined) ?? null,
    clienteId: (perfil?.cliente_id as string | null | undefined) ?? null,
  };
}
