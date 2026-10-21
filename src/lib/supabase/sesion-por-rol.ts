import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { ENCABEZADOS_NEGOCIO } from "@/lib/negocio/resolver";
import { createSupabaseServerClient } from "@/lib/supabase/server";

// Dos sesiones, dos cookies (area.ts). Quien inicia sesión (contraseña o link de un solo uso) NO escribe su sesión
// en la cookie de la ruta donde está: se canjea con un cliente sin cookies, se averigua su rol EN ESTE negocio y
// solo entonces se guarda en la del área que le toca (cliente → portal; el resto → personal). Así un dueño que abre
// su link en el navegador del admin no le cierra la sesión.

type Sesion = { access_token: string; refresh_token: string };

/** Cliente sin cookies ni estado: para canjear contraseñas y links antes de saber el rol. */
export function clienteSinSesion() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

/** El rol de la sesión en el negocio de la petición ('anonimo' si la cuenta no es de este negocio). */
export async function rolDeSesion(sesion: Sesion): Promise<string> {
  const negocioId = (await headers()).get(ENCABEZADOS_NEGOCIO.id);
  const cliente = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${sesion.access_token}`, ...(negocioId ? { [ENCABEZADOS_NEGOCIO.id]: negocioId } : {}) } },
  });
  const { data } = await cliente.rpc("current_rol");
  return (data as string | null) ?? "anonimo";
}

/** Guarda la sesión en la cookie de su área según el rol y devuelve ese rol. Si quien llama ya lo sabe, lo pasa
 *  (el login lo pregunta antes para rechazar una cuenta de otro negocio: preguntarlo dos veces era un viaje de más). */
export async function guardarSesionEnSuArea(sesion: Sesion, rolSabido?: string): Promise<string> {
  const rol = rolSabido ?? (await rolDeSesion(sesion));
  const servidor = await createSupabaseServerClient(rol === "cliente" ? "portal" : "personal");
  await servidor.auth.setSession({ access_token: sesion.access_token, refresh_token: sesion.refresh_token });
  return rol;
}
