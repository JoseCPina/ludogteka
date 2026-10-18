import { getUserConReintento } from "@/lib/supabase/get-user";
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
  } = await getUserConReintento(supabase);

  if (!user) return null;

  const [{ data: rolData }, { data: clienteData }, { data: perfil }, { data: modulosData }] = await Promise.all([
    supabase.rpc("current_rol"),
    supabase.rpc("mi_cliente_id"),
    // El nombre de la persona EN ESTE negocio (su ficha de empleado, luego su cuenta); nunca el correo (QA N24).
    supabase.rpc("nombre_de_persona", { p_profile: user.id, p_vacio: null }),
    // Los módulos que el negocio tiene prendidos (su plan y lo que el admin
    // apagó). La base los hace cumplir; esto es para no mostrar lo demás.
    supabase.rpc("modulos_activos"),
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

  // Veterinaria abre por la designación de médico o por algún permiso del módulo,
  // sin importar el rol (la base lo decide con acceso_veterinaria()).
  let accesoVeterinaria = false;
  const modulosActivos = ((modulosData as string[] | null) ?? []).map(String);
  if (rol !== "cliente" && rol !== "anonimo" && modulosActivos.includes("veterinaria")) {
    const { data } = await supabase.rpc("acceso_veterinaria");
    accesoVeterinaria = data === true;
  }

  return {
    user,
    rol,
    permisos,
    accesoVeterinaria,
    modulos: ((modulosData as string[] | null) ?? []).map(String),
    nombreCompleto: (typeof perfil === "string" && perfil.trim()) || null,
    clienteId: (clienteData as string | null) ?? null,
  };
});
