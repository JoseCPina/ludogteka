import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { ENCABEZADOS_NEGOCIO } from "@/lib/negocio/resolver";
import { ENCABEZADO_AREA, areaDeEncabezado, opcionesCookieSesion, type AreaSesion } from "@/lib/supabase/area";

// Toda petición a la base lleva el negocio que resolvió el middleware por
// el dominio (x-negocio-id): la base decide qué se ve según la membresía
// de quien llama EN ESE negocio. Sin él, la base no devuelve nada.
//
// Dos sesiones, dos cookies (ver area.ts): sin `area` se usa la de la ruta (la pone el middleware).
export async function createSupabaseServerClient(area?: AreaSesion) {
  const cookieStore = await cookies();
  const encabezados = await headers();
  const negocioId = encabezados.get(ENCABEZADOS_NEGOCIO.id);
  const areaDeSesion = area ?? areaDeEncabezado(encabezados.get(ENCABEZADO_AREA));

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: negocioId ? { [ENCABEZADOS_NEGOCIO.id]: negocioId } : {} },
      cookieOptions: opcionesCookieSesion(areaDeSesion),
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          // En un render (Server Component) Next no deja escribir cookies y
          // lanza. supabase-js llama esto cuando renueva el token y la
          // llamada corre dentro de un evento sin quien la atrape: el error
          // llegaba como «Unhandled Rejection» y tumbaba la instancia de la
          // función. En un Server Action o Route Handler sí escribe; en un
          // render se ignora, porque la sesión la renueva el middleware (y
          // la siguiente petición con cookie vencida la renueva ahí).
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // Solo lectura en este contexto.
          }
        },
      },
    }
  );
}
