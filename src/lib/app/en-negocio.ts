import { createServerClient } from "@supabase/ssr";
import { cookies, headers } from "next/headers";
import { ENCABEZADOS_NEGOCIO } from "@/lib/negocio/resolver";
import { opcionesCookieSesion } from "@/lib/supabase/area";
import { ENCABEZADO_PESTANA, esPestanaValida } from "@/lib/concurrencia/tipos";
import { ENCABEZADO_MEDIR, fetchMedido, medirActivo } from "@/lib/medicion/consultas";
import { cookiesDeSesionMovil, sesionMovilActual } from "@/lib/movil/contexto";

/**
 * El cliente de Supabase de la app para dueños DENTRO de un negocio (Fase 3). La app vive en app.peludesk.mx, sin
 * negocio en el dominio; cuando el dueño ve lo suyo en un negocio donde su mascota tiene expediente, el servidor manda
 * el encabezado del negocio y la base decide con la MISMA membresía de cliente que usa el portal (`mi_cliente_id()`):
 * así las funciones del portal (mis_visitas, mi_carnet, mi_expediente, mis_recetas, la firma de contratos…) sirven
 * tal cual. El encabezado solo dice de qué negocio es la petición; nunca autoriza (CLAUDE.md, «varios negocios»).
 *
 * La sesión es la cookie del portal (área "portal"), la misma que usa la app.
 */
export async function supabaseAppEnNegocio(negocioId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(negocioId)) throw new Error("Negocio inválido.");
  const cookieStore = await cookies();
  const encabezados = await headers();
  const pestana = encabezados.get(ENCABEZADO_PESTANA);
  const idMedir = medirActivo() ? encabezados.get(ENCABEZADO_MEDIR) : null;
  const movil = sesionMovilActual();
  const nombreCookie = opcionesCookieSesion("portal")?.name;
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    global: {
      headers: {
        [ENCABEZADOS_NEGOCIO.id]: negocioId,
        ...(esPestanaValida(pestana) ? { [ENCABEZADO_PESTANA]: pestana } : {}),
      },
      ...(idMedir && /^[A-Za-z0-9-]{8,64}$/.test(idMedir) ? { fetch: fetchMedido(idMedir) } : {}),
    },
    cookieOptions: opcionesCookieSesion("portal"),
    cookies: {
      getAll() {
        if (movil && nombreCookie) return cookiesDeSesionMovil(nombreCookie, movil);
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        if (movil) return;
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {
          // En un render no se escriben cookies; la sesión la renueva el middleware.
        }
      },
    },
  });
}
