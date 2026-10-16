import { createBrowserClient } from "@supabase/ssr";
import { areaDeRuta, opcionesCookieSesion } from "@/lib/supabase/area";

// Para llamadas desde el navegador que necesitan la sesión real del
// usuario (p. ej. subir un archivo a Storage respetando RLS). Comparte
// cookies con createSupabaseServerClient — misma sesión, no un login aparte.
// El negocio sale del <html data-negocio> que pone el layout raíz (el que
// resolvió el middleware por el dominio).
export function createSupabaseBrowserClient() {
  const negocioId = typeof document !== "undefined" ? document.documentElement.dataset.negocio : undefined;
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: negocioId ? { "x-negocio-id": negocioId } : {} },
      // La sesión del portal y la del personal viven en cookies distintas: la de este navegador sale de la ruta.
      cookieOptions: opcionesCookieSesion(typeof location !== "undefined" ? areaDeRuta(location.pathname) : "personal"),
    }
  );
}
