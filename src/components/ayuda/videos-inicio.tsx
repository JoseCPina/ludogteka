import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { cargarTutorialesVisibles } from "@/lib/tutoriales";
import { VideosParaEmpezar } from "./videos-para-empezar";
import { OcultableLocal } from "./ocultable-local";

// La tarjeta «Empieza con estos videos» del inicio de admin y de recepción.
// Se puede ocultar (queda en este navegador); sin videos publicados no sale.
export async function VideosInicio() {
  const sesion = await obtenerSesionConRol();
  if (!sesion || (sesion.rol !== "admin" && sesion.rol !== "recepcion")) return null;
  const videos = await cargarTutorialesVisibles(await createSupabaseServerClient(), { rol: sesion.rol, permisos: sesion.permisos, modulos: sesion.modulos }).catch(() => []);
  if (!videos.length) return null;
  return (
    <OcultableLocal clave="videos-inicio-oculto">
      <VideosParaEmpezar videos={videos} />
    </OcultableLocal>
  );
}
