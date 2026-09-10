"use server";

import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { probarGoogleMaps, type PruebaApi } from "@/lib/google-maps/diagnostico";

export type EstadoDiagnostico = {
  error: string | null;
  pruebas?: PruebaApi[];
  direccionProbada?: string;
};

// Cada prueba gasta DOS llamadas facturables (una a Geocoding, una a
// Routes). Solo admin, y el botón lo dice: no es algo que convenga dejar
// apretando.
export async function probarConexionGoogle(): Promise<EstadoDiagnostico> {
  const sesion = await obtenerSesionConRol();
  if (sesion?.rol !== "admin") {
    return { error: "Solo un admin puede correr esta prueba." };
  }

  const supabase = await createSupabaseServerClient();

  const [{ data: sucursal }, { data: cupo }] = await Promise.all([
    supabase.from("sucursales").select("direccion, lat, lng").eq("activo", true).limit(1).maybeSingle(),
    supabase
      .from("cupo_configuracion")
      .select("base_direccion, base_lat, base_lng")
      .order("vigencia_desde", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (!sucursal?.lat || !sucursal?.lng) {
    return {
      error:
        "La sucursal no tiene coordenadas guardadas todavía. Captura la dirección de Ludogteka antes de probar la conexión.",
    };
  }
  if (!cupo?.base_lat || !cupo?.base_lng) {
    return {
      error:
        "La base de la camioneta no tiene coordenadas guardadas todavía. Captúrala en la configuración de cupo antes de probar.",
    };
  }

  // Se geocodifica la dirección de la propia sucursal: es una dirección
  // real y conocida, así que si Google contesta "no la encuentro" el
  // problema es de la llave o de la API, no del texto.
  const direccion = (sucursal.direccion as string | null) ?? "Ludogteka, San Luis Potosí";

  const pruebas = await probarGoogleMaps(
    direccion,
    { lat: Number(cupo.base_lat), lng: Number(cupo.base_lng) },
    { lat: Number(sucursal.lat), lng: Number(sucursal.lng) }
  );

  return { error: null, pruebas, direccionProbada: direccion };
}
