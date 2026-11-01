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

  // Rol, módulos, permisos y Veterinaria en UN viaje (`acceso_de_sesion`, la misma función que usa el middleware), a la
  // vez que el expediente y el nombre: antes eran tres o cuatro viajes seguidos en cada pantalla (rol + módulos, luego
  // permisos, luego Veterinaria), unos 60–100 ms de servidor por página (tiempo del panel, 31 de octubre de 2026).
  const [{ data: accesoData }, { data: clienteData }, { data: perfil }] = await Promise.all([
    supabase.rpc("acceso_de_sesion"),
    supabase.rpc("mi_cliente_id"),
    // El nombre de la persona EN ESTE negocio (su ficha de empleado, luego su cuenta); nunca el correo (QA N24).
    supabase.rpc("nombre_de_persona", { p_profile: user.id, p_vacio: null }),
  ]);
  const acceso = (accesoData ?? null) as { rol?: string | null; modulos?: string[] | null; permisos?: string[] | null; acceso_veterinaria?: boolean; es_medico?: boolean } | null;
  const rol = acceso?.rol ?? "anonimo";
  // Los módulos que el negocio tiene prendidos (su plan y lo que el admin apagó). La base los hace cumplir; esto es
  // para no mostrar lo demás.
  const modulosData = acceso?.modulos ?? [];

  // Permisos extra de recepción (admin los tiene todos por definición). La
  // base es la que manda: esto solo sirve para la navegación y para no
  // mostrar botones que la base va a rechazar.
  let permisos: string[] = [];
  if (rol === "recepcion" || rol === "admin") {
    permisos = (acceso?.permisos ?? []).map(String);
  }

  // Veterinaria abre por la designación de médico o por algún permiso del módulo,
  // sin importar el rol (la base lo decide con acceso_veterinaria()).
  // Un médico designado tiene además los permisos clínicos (vet_puede): con eso la pantalla esconde lo que no abre.
  let accesoVeterinaria = false;
  let esMedico = false;
  const modulosActivos = ((modulosData as string[] | null) ?? []).map(String);
  if (rol !== "cliente" && rol !== "anonimo" && modulosActivos.includes("veterinaria")) {
    accesoVeterinaria = acceso?.acceso_veterinaria === true;
    esMedico = acceso?.es_medico === true;
  }

  return {
    user,
    rol,
    permisos,
    accesoVeterinaria,
    esMedico,
    modulos: ((modulosData as string[] | null) ?? []).map(String),
    nombreCompleto: (typeof perfil === "string" && perfil.trim()) || null,
    clienteId: (clienteData as string | null) ?? null,
  };
});
