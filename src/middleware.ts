import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { rutaPorRol } from "@/lib/auth/rutas";

// Zonas de página: si el rol no está permitido, se redirige a la zona que
// sí le toca (nunca a /login con sesión activa — eso se lee como un bug).
const ZONAS_PROTEGIDAS: { prefijo: string; rolesPermitidos: string[] }[] = [
  { prefijo: "/admin", rolesPermitidos: ["admin"] },
  { prefijo: "/recepcion", rolesPermitidos: ["recepcion", "admin"] },
  { prefijo: "/estetica", rolesPermitidos: ["estetica", "admin"] },
  { prefijo: "/portal", rolesPermitidos: ["cliente"] },
  { prefijo: "/clientes", rolesPermitidos: ["admin", "recepcion"] },
  { prefijo: "/vinculacion", rolesPermitidos: ["admin", "recepcion"] },
  // Estética entra también: escribe peso/alergias/alertas del perro, aunque
  // no pueda tocar los datos base (eso lo filtra RLS, no esta zona).
  { prefijo: "/perros", rolesPermitidos: ["admin", "recepcion", "estetica"] },
  { prefijo: "/servicios", rolesPermitidos: ["admin"] },
  { prefijo: "/reservas", rolesPermitidos: ["admin", "recepcion"] },
  { prefijo: "/caja", rolesPermitidos: ["admin", "recepcion"] },
  { prefijo: "/contratos", rolesPermitidos: ["admin", "recepcion"] },
  { prefijo: "/agenda", rolesPermitidos: ["admin", "recepcion", "estetica"] },
  { prefijo: "/inventario", rolesPermitidos: ["admin", "recepcion", "estetica"] },
];

// Zonas de API: nunca redirige (un fetch no sabe qué hacer con un 302 a
// HTML) — responde 401/403 directo.
const ZONAS_API_PROTEGIDAS: { prefijo: string; rolesPermitidos: string[] }[] = [
  { prefijo: "/api/staff", rolesPermitidos: ["admin"] },
];

function conCookiesDe(origen: NextResponse, destino: NextResponse) {
  origen.cookies.getAll().forEach((cookie) => destino.cookies.set(cookie));
  return destino;
}

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });
  const { pathname } = request.nextUrl;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getUser() (no getSession()) revalida el token contra el servidor de
  // Auth en vez de confiar en lo que ya traiga la cookie.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const zonaPagina = ZONAS_PROTEGIDAS.find((z) => pathname.startsWith(z.prefijo));
  const zonaApi = ZONAS_API_PROTEGIDAS.find((z) => pathname.startsWith(z.prefijo));
  const zona = zonaPagina ?? zonaApi;

  if (!zona) return response;

  if (!user) {
    if (zonaApi) {
      return conCookiesDe(
        response,
        NextResponse.json({ error: "No autenticado." }, { status: 401 })
      );
    }
    return conCookiesDe(response, NextResponse.redirect(new URL("/login", request.url)));
  }

  // El rol se lee de la base en cada request — nunca de un claim que el
  // cliente pudiera manipular ni de estado guardado en el navegador.
  const { data: perfil } = await supabase
    .from("profiles")
    .select("rol")
    .eq("id", user.id)
    .single();

  const rol = perfil?.rol ?? "cliente";

  if (!zona.rolesPermitidos.includes(rol)) {
    if (zonaApi) {
      return conCookiesDe(
        response,
        NextResponse.json({ error: "No tienes permiso para esto." }, { status: 403 })
      );
    }
    return conCookiesDe(response, NextResponse.redirect(new URL(rutaPorRol(rol), request.url)));
  }

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
