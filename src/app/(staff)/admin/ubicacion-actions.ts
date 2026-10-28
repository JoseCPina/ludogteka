"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { geocodificarDireccion } from "@/lib/google-maps/geocodificar";
import { apartarConsulta, hayLlaveMaps, mensajeTope } from "@/lib/google-maps/cuota";
import { registrosDe } from "@/lib/concurrencia/registro-final";
import type { RegistroFinal } from "@/lib/concurrencia/tipos";
import { negocioIdActual } from "@/lib/negocio/actual";

export type EstadoUbicacion = { error: string | null; aviso?: string; registros?: RegistroFinal[] };

/**
 * QA R23: la dirección del negocio es UNA y se edita en Perfil; aquí solo se UBICA en el mapa (se lee de
 * negocio_perfil, nunca de lo que mande la pantalla). El punto de salida de recolección es opcional: vacío, las
 * rutas salen de la dirección del negocio. Se geocodifican con la llave de PeluDesk (cada una cuenta contra el
 * tope del mes), con la ciudad del negocio; una dirección que no cambió no se vuelve a pedir a Google.
 */
export async function guardarUbicacion(datos: { base: string }): Promise<EstadoUbicacion> {
  const supabase = await createSupabaseServerClient();
  const { data: perfil } = await supabase.from("negocio_perfil").select("direccion").is("deleted_at", null).maybeSingle();
  const direccion = ((perfil?.direccion as string | null) ?? "").trim();
  if (!direccion) return { error: "Primero escribe la dirección de tu negocio en Perfil y página web (/admin/perfil)." };
  let base = datos.base.trim();
  if (base.toLowerCase() === direccion.toLowerCase()) base = "";

  const [{ data: sucursal }, { data: cupoData }, { data: neg }] = await Promise.all([
    supabase.from("sucursales").select("direccion, lat, lng").is("deleted_at", null).order("activo", { ascending: false }).limit(1).maybeSingle(),
    supabase.rpc("resolver_cupo_configuracion"),
    supabase.from("negocios").select("ciudad").maybeSingle(),
  ]);
  const cupo = (Array.isArray(cupoData) ? cupoData[0] : cupoData) as { base_direccion: string | null; base_lat: number | null; base_lng: number | null } | null;
  const ciudad = (neg?.ciudad as string | null) ?? null;

  async function ubicar(texto: string, previa: { direccion: string | null; lat: number | null; lng: number | null } | null, centro: { lat: number; lng: number } | null) {
    if (!texto) return { lat: null, lng: null, simulado: false, error: null as string | null };
    if (previa?.direccion === texto && previa.lat != null && previa.lng != null) {
      return { lat: Number(previa.lat), lng: Number(previa.lng), simulado: false, error: null };
    }
    if (hayLlaveMaps()) {
      const c = await apartarConsulta(supabase, "geocodificar");
      if (!c.permitida) return { lat: null, lng: null, simulado: false, error: mensajeTope(c) };
    }
    const g = await geocodificarDireccion(texto, { ciudad, centro });
    return g.ok ? { lat: g.lat, lng: g.lng, simulado: g.simulado, error: null } : { lat: null, lng: null, simulado: false, error: g.error };
  }

  const n = await ubicar(direccion, sucursal ?? null, null);
  if (n.error) return { error: `Dirección del negocio: ${n.error}` };
  const centro = n.lat != null && n.lng != null ? { lat: n.lat, lng: n.lng } : null;
  const b = await ubicar(base, cupo ? { direccion: cupo.base_direccion, lat: cupo.base_lat, lng: cupo.base_lng } : null, centro);
  if (b.error) return { error: `Punto de salida de recolección: ${b.error}` };

  const { error } = await supabase.rpc("guardar_ubicacion_negocio", {
    p_direccion: direccion,
    p_lat: n.lat,
    p_lng: n.lng,
    p_base_direccion: base || null,
    p_base_lat: b.lat,
    p_base_lng: b.lng,
  });
  if (error) return { error: error.message };
  revalidatePath("/admin");
  const texto = base ? "Ubicado en el mapa: la dirección del negocio y el punto de salida." : "Ubicado en el mapa. Las recolecciones salen de la dirección del negocio.";
  const { data: ubicada } = await supabase.from("sucursales").select("id").is("deleted_at", null).order("activo", { ascending: false }).limit(1).maybeSingle();
  const registros = await registrosDe(supabase, [
    { t: "sucursales", i: ubicada?.id },
    { t: "cupo_configuracion", i: await negocioIdActual() },
  ]);
  return { error: null, registros, aviso: n.simulado || b.simulado ? `${texto} (Coordenadas simuladas: este ambiente no tiene llave de Google.)` : texto };
}
