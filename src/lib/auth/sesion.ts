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

  const rol = (perfil?.rol as string | undefined) ?? "cliente";

  // Permisos extra de recepción (admin los tiene todos por definición). La
  // base es la que manda: esto solo sirve para la navegación y para no
  // mostrar botones que la base va a rechazar.
  let permisos: string[] = [];
  if (rol === "recepcion" || rol === "admin") {
    const { data } = await supabase.rpc("mis_permisos");
    permisos = ((data as string[] | null) ?? []).map(String);
  }

  return {
    user,
    rol,
    permisos,
    nombreCompleto: (perfil?.nombre_completo as string | null | undefined) ?? null,
    clienteId: (perfil?.cliente_id as string | null | undefined) ?? null,
  };
});
