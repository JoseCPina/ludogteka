import { createBrowserClient } from "@supabase/ssr";

// Para llamadas desde el navegador que necesitan la sesión real del
// usuario (p. ej. subir un archivo a Storage respetando RLS). Comparte
// cookies con createSupabaseServerClient — misma sesión, no un login aparte.
export function createSupabaseBrowserClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}
