import { createClient } from "@supabase/supabase-js";

// Nunca importar este módulo desde código que corra en el navegador: la
// secret key concede acceso total (bypassa RLS y auth.admin.*).
//
// PeluDesk: la secret key salta la RLS, así que QUIEN LA USA filtra por
// negocio. Pásale siempre el negocio (negocioIdActual() en una petición,
// o el de la fila que se está tocando, como en el webhook): las funciones
// de la base y sus triggers solo ven ese negocio. Sin negocio, solo sirve
// para lo que no es de ningún negocio (auth.admin, Storage por ruta).
export function createSupabaseAdminClient(negocioId?: string | null) {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      auth: { autoRefreshToken: false, persistSession: false },
      global: { headers: negocioId ? { "x-negocio-id": negocioId } : {} },
    }
  );
}
