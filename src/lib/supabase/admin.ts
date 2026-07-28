import { createClient } from "@supabase/supabase-js";

// Nunca importar este módulo desde código que corra en el navegador: la
// secret key concede acceso total (bypassa RLS y auth.admin.*).
export function createSupabaseAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
