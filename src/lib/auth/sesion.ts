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
type SesionActual = {
  rol?: string | null;
  modulos?: string[] | null;
  permisos?: string[] | null;
  acceso_veterinaria?: boolean;
  es_medico?: boolean;
  cliente_id?: string | null;
  nombre?: string | null;
};

export const obtenerSesionConRol = cache(async () => {
  const supabase = await createSupabaseServerClient();
  // Auth («¿hay sesión?», con reintento: la ÚNICA forma de preguntarlo) y la membresía en este negocio salen A LA VEZ:
  // las dos dependen solo del JWT de la petición. `sesion_actual()` (migración 20261203001600) trae en un viaje lo que
  // antes eran tres después de Auth (`acceso_de_sesion`, la misma función que usa el middleware; `mi_cliente_id`;
  // `nombre_de_persona`): una tanda menos en cada pantalla del personal y del portal (tiempo del panel, tercera vuelta).
  // Si Auth dice que no hay usuario, lo que haya contestado la base se tira: la decisión sigue siendo de Auth.
  const [
    {
      data: { user },
    },
    { data: sesionData },
  ] = await Promise.all([getUserConReintento(supabase), supabase.rpc("sesion_actual")]);

  if (!user) return null;

  const acceso = (sesionData ?? null) as SesionActual | null;
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

  // El nombre de la persona EN ESTE negocio (su ficha de empleado, luego su cuenta); nunca el correo (QA N24).
  const nombre = typeof acceso?.nombre === "string" ? acceso.nombre.trim() : "";

  return {
    user,
    rol,
    permisos,
    accesoVeterinaria,
    esMedico,
    modulos: modulosActivos,
    nombreCompleto: nombre || null,
    clienteId: (acceso?.cliente_id as string | null | undefined) ?? null,
  };
});
