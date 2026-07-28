import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// cache() evita repetir la consulta cuando el layout y la página de una
// misma request llaman a esto por separado.
export const obtenerSesionConRol = cache(async () => {
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
});
