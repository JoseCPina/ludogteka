import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { cargarTutorialesVisibles, type Tutorial } from "@/lib/tutoriales";

/**
 * Los videos que esta persona puede ver, UNA vez por petición (tiempo del panel, 1 de noviembre de 2026): el layout
 * del personal («¿Cómo se hace?») y la tarjeta «Empieza con estos videos» del inicio pedían la misma lista cada uno,
 * con clientes distintos (que `cache()` no reconoce como la misma llamada). Sin sesión de admin o recepción, vacío.
 */
export const tutorialesDeSesion = cache(async (): Promise<Tutorial[]> => {
  const sesion = await obtenerSesionConRol();
  if (!sesion || (sesion.rol !== "admin" && sesion.rol !== "recepcion")) return [];
  const supabase = await createSupabaseServerClient();
  return cargarTutorialesVisibles(supabase, { rol: sesion.rol, permisos: sesion.permisos, modulos: sesion.modulos }).catch(() => []);
});
