import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// La sesión EN ESTE NEGOCIO: la persona (Auth + profiles) y su membresía
// aquí (rol, expediente de cliente, permisos). La misma persona puede ser
// cliente en un negocio y estilista en otro: cada dominio ve la suya.
//
// rol "anonimo" = la cuenta existe pero no tiene membresía en este
// negocio (el middleware la manda a /sin-acceso).
//
// cache() evita repetir la consulta cuando el layout y la página de una
// misma request llaman a esto por separado.
export const obtenerSesionConRol = cache(async () => {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const [{ data: rolData }, { data: clienteData }, { data: perfil }] = await Promise.all([
    supabase.rpc("current_rol"),
    supabase.rpc("mi_cliente_id"),
    supabase.from("profiles").select("nombre_completo").eq("id", user.id).maybeSingle(),
  ]);
  const rol = (rolData as string | null) ?? "anonimo";

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
    clienteId: (clienteData as string | null) ?? null,
  };
});
