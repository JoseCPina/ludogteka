import type { User } from "@supabase/supabase-js";
import { createSupabaseAnonClient } from "./anon";
import { createSupabaseServerClient } from "./server";

// Resuelve quién llama a una API route: cookies de sesión (uso normal desde
// la app) o un Bearer token (pruebas por curl, llamadas servidor-a-servidor).
// auth.getUser() siempre revalida contra el servidor de Auth, nunca confía
// en un JWT local sin verificar.
export async function getCallerUser(request: Request): Promise<User | null> {
  const authHeader = request.headers.get("authorization");

  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice("Bearer ".length);
    const { data, error } = await createSupabaseAnonClient().auth.getUser(token);
    return error ? null : data.user;
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  return error ? null : data.user;
}
