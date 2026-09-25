import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { rutaPorRol } from "@/lib/auth/rutas";
import { ENCABEZADOS_NEGOCIO, resolverNegocio, type NegocioBasico } from "@/lib/negocio/resolver";
import { ENCABEZADO_FIRMA, firmaValida, firmarNegocio } from "@/lib/negocio/firma";

// Los encabezados de negocio que puso este mismo middleware (firmados).
// Solo los trae la petición interna con la que Next pinta el destino de
// un redirect() de una acción de servidor (ver lib/negocio/firma.ts).
async function negocioFirmado(h: Headers): Promise<NegocioBasico | null> {
  const id = h.get(ENCABEZADOS_NEGOCIO.id);
  if (!id) return null;
  const n: NegocioBasico = {
    id,
    slug: h.get(ENCABEZADOS_NEGOCIO.slug) ?? "",
    nombre: decodeURIComponent(h.get(ENCABEZADOS_NEGOCIO.nombre) ?? ""),
    dominio: h.get(ENCABEZADOS_NEGOCIO.dominio) || null,
    url_publica: h.get(ENCABEZADOS_NEGOCIO.url) || null,
    zona_horaria: h.get(ENCABEZADOS_NEGOCIO.zona) ?? "",
  };
  return (await firmaValida(n, h.get(ENCABEZADO_FIRMA))) ? n : null;
}

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
  // Empleados: el dinero (nómina, comisiones) y el alta, solo con «Nómina»;
  // lo específico antes que /empleados.
  // Gastos del local: con «Gastos»; las categorías, solo admin.
  { prefijo: "/gastos/categorias", rolesPermitidos: ["admin"] },
  { prefijo: "/gastos", rolesPermitidos: ["admin"], permisos: ["gastos"] },
  { prefijo: "/empleados/nomina", rolesPermitidos: ["admin"], permisos: ["nomina"] },
  { prefijo: "/empleados/comisiones", rolesPermitidos: ["admin"], permisos: ["nomina"] },
  { prefijo: "/empleados/nuevo", rolesPermitidos: ["admin"], permisos: ["nomina"] },
  { prefijo: "/empleados", rolesPermitidos: ["admin", "recepcion"] },
  // Lo de cada quien: su asistencia, ausencias y pagos.
  { prefijo: "/mi-trabajo", rolesPermitidos: ["admin", "recepcion", "estetica"] },
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
// Auth en la primera carga. Es una lista EXACTA, no de prefijos: "/" como
// prefijo abriría todo. (Sí llevan negocio: la landing es la de ESTE
// negocio.)
const RUTAS_PUBLICAS_EXACTAS = new Set([
  "/",
  "/opengraph-image.jpg",
  "/robots.txt",
  "/sitemap.xml",
]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // El negocio lo decide el DOMINIO, nunca el navegador: los encabezados
  // x-negocio-* que vengan de afuera se tiran antes de poner los nuestros.
  // (Salvo los que firmó este middleware: ver negocioFirmado.)
  const firmado = await negocioFirmado(request.headers);
  const cabeceras = new Headers(request.headers);
  for (const nombre of Object.values(ENCABEZADOS_NEGOCIO)) cabeceras.delete(nombre);
  cabeceras.delete(ENCABEZADO_FIRMA);

  if (pathname === "/negocio-no-encontrado") return NextResponse.next({ request: { headers: cabeceras } });

  let negocio: NegocioBasico | null = firmado;
  try {
    negocio ??= await resolverNegocio(request.headers.get("host"));
  } catch {
    return new NextResponse("No pudimos cargar este sitio. Intenta de nuevo en un momento.", { status: 503 });
  }
  if (!negocio) {
    return NextResponse.rewrite(new URL("/negocio-no-encontrado", request.url), {
      request: { headers: cabeceras },
      status: 404,
    });
  }
  cabeceras.set(ENCABEZADOS_NEGOCIO.id, negocio.id);
  cabeceras.set(ENCABEZADOS_NEGOCIO.slug, negocio.slug);
  cabeceras.set(ENCABEZADOS_NEGOCIO.nombre, encodeURIComponent(negocio.nombre));
  cabeceras.set(ENCABEZADOS_NEGOCIO.dominio, negocio.dominio ?? "");
  cabeceras.set(ENCABEZADOS_NEGOCIO.url, negocio.url_publica ?? "");
  cabeceras.set(ENCABEZADOS_NEGOCIO.zona, negocio.zona_horaria);
  cabeceras.set(ENCABEZADO_FIRMA, await firmarNegocio(negocio));
  const siguiente = () => NextResponse.next({ request: { headers: cabeceras } });

  if (RUTAS_PUBLICAS_EXACTAS.has(pathname)) return siguiente();

  let response = siguiente();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { [ENCABEZADOS_NEGOCIO.id]: negocio.id } },
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          cabeceras.set("cookie", request.headers.get("cookie") ?? "");
          response = siguiente();
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

  // El rol es el de la MEMBRESÍA en este negocio, leído de la base en cada
  // request — nunca de un claim ni de estado guardado en el navegador.
  // Sin membresía aquí ("anonimo"), la cuenta existe pero no es de este
  // negocio.
  const { data: rolData } = await supabase.rpc("current_rol");
  const rol = (rolData as string | null) ?? "anonimo";
  if (rol === "anonimo") {
    if (zonaApi) {
      return conCookiesDe(response, NextResponse.json({ error: "Tu cuenta no es de este negocio." }, { status: 403 }));
    }
    return conCookiesDe(response, NextResponse.redirect(new URL("/sin-acceso", request.url)));
  }

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
