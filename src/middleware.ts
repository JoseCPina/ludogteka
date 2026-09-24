import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { rutaPorRol } from "@/lib/auth/rutas";

// Zonas de página: si el rol no está permitido, se redirige a la zona que
// sí le toca (nunca a /login con sesión activa — eso se lee como un bug).
//
// `permisos`: una persona de recepción con CUALQUIERA de esos permisos
// extra (permisos_staff, 24 de septiembre de 2026) también entra. El orden
// importa: gana el primer prefijo que coincide, así que lo más específico
// va primero (/admin/permisos antes de /admin).
type Zona = { prefijo: string; rolesPermitidos: string[]; permisos?: string[] };
const ZONAS_PROTEGIDAS: Zona[] = [
  // Dar y quitar permisos nunca se delega.
  { prefijo: "/admin/permisos", rolesPermitidos: ["admin"] },
  { prefijo: "/admin", rolesPermitidos: ["admin"], permisos: ["personal", "configuracion_negocio", "tarifas"] },
  { prefijo: "/recepcion", rolesPermitidos: ["recepcion", "admin"] },
  // /estetica es a la vez el aterrizaje del rol de estética y el módulo de
  // la agenda (antes /agenda), así que recepción también entra.
  { prefijo: "/estetica", rolesPermitidos: ["admin", "recepcion", "estetica"] },
  { prefijo: "/portal", rolesPermitidos: ["cliente"] },
  { prefijo: "/clientes", rolesPermitidos: ["admin", "recepcion"] },
  { prefijo: "/vinculacion", rolesPermitidos: ["admin", "recepcion"] },
  // Estética entra también: escribe peso/alergias/alertas del perro, aunque
  // no pueda tocar los datos base (eso lo filtra RLS, no esta zona).
  { prefijo: "/perros", rolesPermitidos: ["admin", "recepcion", "estetica"] },
  // Con el permiso de tarifas solo le sirven las matrices de precios: la
  // página de cada servicio la manda ahí (crear y editar servicios es de admin).
  { prefijo: "/servicios", rolesPermitidos: ["admin"], permisos: ["tarifas"] },
  { prefijo: "/reservas", rolesPermitidos: ["admin", "recepcion"] },
  { prefijo: "/guarderia", rolesPermitidos: ["admin", "recepcion"] },
  { prefijo: "/hotel", rolesPermitidos: ["admin", "recepcion"] },
  { prefijo: "/caja", rolesPermitidos: ["admin", "recepcion"] },
  { prefijo: "/contratos", rolesPermitidos: ["admin", "recepcion"] },
  { prefijo: "/inventario", rolesPermitidos: ["admin", "recepcion", "estetica"] },
  { prefijo: "/reportes", rolesPermitidos: ["admin"], permisos: ["reportes_financieros"] },
];

// Zonas de API: nunca redirige (un fetch no sabe qué hacer con un 302 a
// HTML) — responde 401/403 directo.
const ZONAS_API_PROTEGIDAS: Zona[] = [
  { prefijo: "/api/staff", rolesPermitidos: ["admin"], permisos: ["personal"] },
];

function conCookiesDe(origen: NextResponse, destino: NextResponse) {
  origen.cookies.getAll().forEach((cookie) => destino.cookies.set(cookie));
  return destino;
}

// Páginas públicas que no necesitan saber quién es el visitante: la
// landing y los archivos de metadatos (Open Graph, robots, sitemap). Se
// sueltan antes de crear el cliente de Supabase para no pagar la vuelta a
// Auth en la primera carga de ludogteka.mx. Es una lista EXACTA, no de
// prefijos: "/" como prefijo abriría todo.
const RUTAS_PUBLICAS_EXACTAS = new Set([
  "/",
  "/opengraph-image.jpg",
  "/robots.txt",
  "/sitemap.xml",
]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (RUTAS_PUBLICAS_EXACTAS.has(pathname)) return NextResponse.next();

  let response = NextResponse.next({ request });

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

  // Recepción con un permiso extra que abre esta zona. La base vuelve a
  // revisar el permiso en cada operación: esto solo decide si se ve la página.
  let entraPorPermiso = false;
  if (!zona.rolesPermitidos.includes(rol) && rol === "recepcion" && zona.permisos?.length) {
    const { data: mios } = await supabase.rpc("mis_permisos");
    const propios = new Set(((mios as string[] | null) ?? []).map(String));
    entraPorPermiso = zona.permisos.some((p) => propios.has(p));
  }

  if (!zona.rolesPermitidos.includes(rol) && !entraPorPermiso) {
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
