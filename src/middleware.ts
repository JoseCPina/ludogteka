import { getUserConReintento } from "@/lib/supabase/get-user";
import { ENCABEZADO_RUTA, RUTA_CAMBIO_PERSONAL, RUTA_CAMBIO_PORTAL, debeCambiarPassword } from "@/lib/auth/cambio-obligatorio";
import { NextResponse, type NextRequest } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { ENCABEZADO_AREA, areaDeRuta, nombreCookieSesion, opcionesCookieSesion } from "@/lib/supabase/area";
import { rutaPorRol } from "@/lib/auth/rutas";
import { ENCABEZADOS_NEGOCIO, ENCABEZADO_PLATAFORMA, hostPorMudanza, resolverNegocio, type NegocioBasico } from "@/lib/negocio/resolver";
import { ENCABEZADO_FIRMA, firmaValida, firmarNegocio, firmarPlataforma, plataformaFirmada } from "@/lib/negocio/firma";
import { DOMINIO_PLATAFORMA, esHostPlataforma } from "@/lib/negocio/host";
import { moduloDeRuta, moduloRequeridoActivo } from "@/lib/plan/modulos";
import { ZONAS_API, accesoAbreZona, zonaDeRuta, zonaPidePermisos, zonaPideVeterinaria, type Acceso } from "@/lib/auth/acceso";

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
    icono: h.get(ENCABEZADOS_NEGOCIO.icono) || null,
    imagen: h.get(ENCABEZADOS_NEGOCIO.imagen) || null,
  };
  return (await firmaValida(n, h.get(ENCABEZADO_FIRMA))) ? n : null;
}

// Zonas de página y de API: quién abre qué vive en src/lib/auth/acceso.ts (QA N127), la misma regla con la que
// la pantalla esconde los botones. Si el rol no entra, se redirige a la zona que sí le toca (nunca a /login con
// sesión activa — eso se lee como un bug); la API responde 401/403.

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
  "/icono-negocio",
  "/manifest.webmanifest",
  // La app instalable: su service worker, el ícono con el logo y la pantalla «sin conexión».
  "/sw.js",
  "/icono-pwa",
  "/sin-conexion",
]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Una sola versión del host: www.peludesk.mx redirige (308, conserva ruta y
  // parámetros) a peludesk.mx, el canónico. Sin cadenas: es un solo salto.
  if ((request.headers.get("host") ?? "").toLowerCase().split(":")[0] === `www.${DOMINIO_PLATAFORMA}`) {
    return NextResponse.redirect(`https://${DOMINIO_PLATAFORMA}${pathname}${request.nextUrl.search}`, 308);
  }

  // El negocio lo decide el DOMINIO, nunca el navegador: los encabezados
  // x-negocio-* que vengan de afuera se tiran antes de poner los nuestros.
  // (Salvo los que firmó este middleware: ver negocioFirmado.)
  const firmado = await negocioFirmado(request.headers);
  const plataformaInterna =
    request.headers.get(ENCABEZADO_PLATAFORMA) === "1" && (await plataformaFirmada(request.headers.get(ENCABEZADO_FIRMA)));
  const cabeceras = new Headers(request.headers);
  for (const nombre of Object.values(ENCABEZADOS_NEGOCIO)) cabeceras.delete(nombre);
  cabeceras.delete(ENCABEZADO_FIRMA);
  cabeceras.delete(ENCABEZADO_PLATAFORMA);

  if (pathname === "/negocio-no-encontrado" || pathname === "/pagina-no-encontrada") {
    return NextResponse.next({ request: { headers: cabeceras } });
  }

  // ── El dominio de la plataforma: la administración de PeluDesk ──
  // Sin negocio. Solo /plataforma y lo de Auth; quién entra lo decide la
  // base (es_admin_plataforma), en cada página y en cada función.
  if (!firmado && (plataformaInterna || esHostPlataforma(request.headers.get("host")))) {
    return plataforma(request, cabeceras);
  }
  // Y en el dominio de un negocio, /plataforma (ni la landing de PeluDesk) no existe:
  // 404 de verdad (lo da la página con notFound(); el status del rewrite no llega).
  if (
    pathname === "/plataforma" || pathname.startsWith("/plataforma/") || pathname === "/peludesk" || pathname.startsWith("/peludesk/") ||
    pathname.startsWith("/api/stripe/") || pathname.startsWith("/api/whatsapp/") || pathname.startsWith("/api/telegram/")
  ) {
    return NextResponse.rewrite(new URL("/pagina-no-encontrada", request.url), { request: { headers: cabeceras }, status: 404 });
  }

  let negocio: NegocioBasico | null = firmado;
  try {
    negocio ??= await resolverNegocio(request.headers.get("host"));
  } catch {
    return new NextResponse("No pudimos cargar este sitio. Intenta de nuevo en un momento.", { status: 503 });
  }
  if (!negocio) {
    // ¿Es el subdominio de un negocio que se mudó? Redirección permanente a la dirección nueva, con la misma
    // ruta y parámetros, para que los links, QR y la página pública ya enviados sigan sirviendo.
    try {
      const nuevoHost = await hostPorMudanza(request.headers.get("host"));
      if (nuevoHost) {
        const protocolo = request.headers.get("x-forwarded-proto")?.split(",")[0].trim() || request.nextUrl.protocol.replace(":", "");
        return NextResponse.redirect(`${protocolo}://${nuevoHost}${request.nextUrl.pathname}${request.nextUrl.search}`, 308);
      }
    } catch {
      // Sin respuesta de la base: se queda en "no encontrado" (no se inventa un destino).
    }
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
  cabeceras.set(ENCABEZADOS_NEGOCIO.icono, negocio.icono ?? "");
  cabeceras.set(ENCABEZADOS_NEGOCIO.imagen, negocio.imagen ?? "");
  cabeceras.set(ENCABEZADO_FIRMA, await firmarNegocio(negocio));
  // Qué sesión corresponde a esta ruta (personal o portal): siempre la pone el middleware, nunca el navegador.
  const areaSesion = areaDeRuta(pathname);
  cabeceras.set(ENCABEZADO_AREA, areaSesion);
  // La ruta de la petición, para que el layout del portal sepa si ya está en la pantalla de cambiar contraseña (R35).
  cabeceras.set(ENCABEZADO_RUTA, pathname);
  const siguiente = () => NextResponse.next({ request: { headers: cabeceras } });

  if (RUTAS_PUBLICAS_EXACTAS.has(pathname)) return siguiente();

  let response = siguiente();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { [ENCABEZADOS_NEGOCIO.id]: negocio.id } },
      cookieOptions: opcionesCookieSesion(areaSesion),
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

  const zonaPagina = zonaDeRuta(pathname);
  const zonaApi = zonaPagina ? null : zonaDeRuta(pathname, ZONAS_API);
  const zona = zonaPagina ?? zonaApi;

  // Rol, módulos, permisos y Veterinaria de quien llama, en UN viaje a la base (acceso_de_sesion), lanzado a la vez
  // que getUser(): antes eran tres viajes seguidos (Auth, luego rol y módulos, luego permisos) en cada pantalla y cada
  // acción. Solo si la ruta es de una zona y trae la cookie de sesión de su área (sin sesión no hay nada que preguntar).
  // Si el token venció, las dos llamadas esperan la MISMA renovación (supabase-js la hace una sola vez). Se usa solo
  // después de comprobar que hay usuario, igual que antes.
  const cookieSesion = nombreCookieSesion(areaSesion) ?? `sb-${new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split(".")[0]}-auth-token`;
  const accesoEnCamino = zona && request.cookies.getAll().some((c) => c.name.startsWith(cookieSesion)) ? supabase.rpc("acceso_de_sesion") : null;

  // getUser() (no getSession()) revalida el token contra el servidor de
  // Auth en vez de confiar en lo que ya traiga la cookie.
  // (con un reintento si Auth o la red fallaron un instante: ver get-user.ts)
  const {
    data: { user },
  } = await getUserConReintento(supabase);

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

  // R35: con una contraseña temporal no se abre nada más que la pantalla para cambiarla (y lo que esa pantalla
  // necesita: su propia acción de servidor llega por POST a la misma ruta).
  if (debeCambiarPassword(user) && pathname !== RUTA_CAMBIO_PORTAL) {
    if (zonaApi) {
      return conCookiesDe(response, NextResponse.json({ error: "Primero cambia tu contraseña temporal." }, { status: 403 }));
    }
    const destino = areaSesion === "portal" ? RUTA_CAMBIO_PORTAL : RUTA_CAMBIO_PERSONAL;
    return conCookiesDe(response, NextResponse.redirect(new URL(destino, request.url)));
  }

  // El rol es el de la MEMBRESÍA en este negocio, leído de la base en cada
  // request — nunca de un claim ni de estado guardado en el navegador.
  // Sin membresía aquí ("anonimo"), la cuenta existe pero no es de este
  // negocio.
  let respuestaAcceso = accesoEnCamino ? await accesoEnCamino : null;
  // Un reintento si falló (salió a la par de la renovación de la sesión o la red falló un instante), o si no se lanzó.
  if (!respuestaAcceso || respuestaAcceso.error) respuestaAcceso = await supabase.rpc("acceso_de_sesion");
  const datosAcceso = (respuestaAcceso.data ?? null) as {
    rol?: string | null; modulos?: string[] | null; permisos?: string[] | null; acceso_veterinaria?: boolean; es_medico?: boolean;
  } | null;
  const moduloZona = zonaPagina ? moduloDeRuta(pathname) : null;
  const rol = datosAcceso?.rol ?? "anonimo";
  if (rol === "anonimo") {
    if (zonaApi) {
      return conCookiesDe(response, NextResponse.json({ error: "Tu cuenta no es de este negocio." }, { status: 403 }));
    }
    return conCookiesDe(response, NextResponse.redirect(new URL("/sin-acceso", request.url)));
  }

  // Los permisos por persona y Veterinaria cuentan solo si esta zona los necesita para este rol (la misma regla de
  // siempre: ya vienen en la respuesta, pero fuera de esos casos se toman vacíos como cuando no se preguntaban). La
  // base vuelve a revisar el permiso en cada operación: esto solo decide si se ve la página.
  const acceso: Acceso = {
    rol,
    permisos: zonaPidePermisos(zona, rol) ? (datosAcceso?.permisos ?? []).map(String) : [],
    accesoVeterinaria: zonaPideVeterinaria(zona, rol) && datosAcceso?.acceso_veterinaria === true,
    esMedico: zonaPideVeterinaria(zona, rol) && datosAcceso?.es_medico === true,
  };

  if (!accesoAbreZona(acceso, zona)) {
    if (zonaApi) {
      return conCookiesDe(
        response,
        NextResponse.json({ error: "No tienes permiso para esto." }, { status: 403 })
      );
    }
    return conCookiesDe(response, NextResponse.redirect(new URL(rutaPorRol(rol), request.url)));
  }

  // Un módulo que el negocio no tiene (su plan o lo que el admin apagó) no
  // se abre: el admin va a la pantalla de módulos, los demás a una página
  // que lo explica. La base lo bloquea de todos modos.
  if (moduloZona) {
    const activos = datosAcceso?.modulos ?? null;
    if (!moduloRequeridoActivo(moduloZona, ((activos as string[] | null) ?? []).map(String))) {
      const primero = Array.isArray(moduloZona) ? moduloZona[0] : moduloZona;
      const listaActivos = ((activos as string[] | null) ?? []).map(String);
      // QA S16 (N80): en una clínica sin Estética, «la agenda» (/agenda → /estetica) es la agenda clínica; el médico
      // invitado con rol de estética también llega ahí.
      if (primero === "estetica" && listaActivos.includes("veterinaria") && (rol !== "admin" || pathname === "/estetica")) {
        return conCookiesDe(response, NextResponse.redirect(new URL("/veterinaria/agenda", request.url)));
      }
      const destino = rol === "admin" ? `/admin/modulos?apagado=${primero}` : `/modulo-apagado?m=${primero}`;
      return conCookiesDe(response, NextResponse.redirect(new URL(destino, request.url)));
    }
  }

  return response;
}

// Rutas de la plataforma: la administración y lo que Auth necesita para
// entrar (link de invitación y escoger contraseña).
const RUTAS_PLATAFORMA = ["/plataforma", "/auth/callback", "/auth/nueva-password", "/robots.txt", "/sitemap.xml", "/icono-negocio", "/manifest.webmanifest", "/imagen-negocio", "/marca", "/iconos"];

// Las páginas públicas de PeluDesk (landing y registro de prueba): viven
// en /peludesk/* y se sirven en la raíz del dominio de la plataforma.
const PUBLICAS_PLATAFORMA: Record<string, string> = {
  "/": "/peludesk",
  "/registro": "/peludesk/registro",
  "/ayuda": "/peludesk/ayuda",
  "/blog": "/peludesk/blog",
  "/blog/rss.xml": "/peludesk/blog/rss.xml",
  "/aviso-de-privacidad": "/peludesk/aviso-de-privacidad",
  "/terminos": "/peludesk/terminos",
  "/cookies": "/peludesk/cookies",
  "/software-para-guarderias-caninas": "/peludesk/software/software-para-guarderias-caninas",
  "/software-para-esteticas-caninas": "/peludesk/software/software-para-esteticas-caninas",
  "/software-para-hoteles-caninos": "/peludesk/software/software-para-hoteles-caninos",
  "/veterinaria": "/peludesk/veterinaria",
  "/precios": "/peludesk/precios",
  "/alternativas": "/peludesk/alternativas",
  "/llms.txt": "/peludesk/llms.txt",
  "/llms-full.txt": "/peludesk/llms-full.txt",
  "/indexnow-key.txt": "/peludesk/indexnow-key.txt",
  // Herramientas públicas (src/app/peludesk/herramientas; la lista en src/lib/herramientas/lista.ts).
  "/herramientas": "/peludesk/herramientas",
  "/precios-mercado": "/peludesk/precios-mercado",
  "/precios-mercado/imagen": "/peludesk/precios-mercado/imagen",
  // Sin extensión a propósito: el matcher del middleware no toma rutas que terminan en .svg.
  "/precios-mercado/insignia": "/peludesk/precios-mercado/insignia",
  "/directorio": "/peludesk/directorio",
  "/lista-de-precios": "/peludesk/lista-de-precios",
  "/contrato-guarderia-hotel": "/peludesk/contrato-guarderia-hotel",
  "/mensajes-whatsapp": "/peludesk/mensajes-whatsapp",
};
// Con parámetro: artículos del centro de ayuda y del blog, páginas del índice
// del blog y sus categorías. Una lista cerrada de formas, nunca por prefijo.
const COOKIE_INTERNO = "peludesk_interno";
const PUBLICAS_PLATAFORMA_PATRON = /^\/(ayuda\/[a-z0-9-]+|guias\/[a-z0-9-]+|alternativas\/[a-z0-9-]+|ayuda\/videos\/[a-z0-9-]+|blog\/[a-z0-9-]+|blog\/pagina\/\d{1,3}|blog\/categoria\/[a-z0-9-]+|para\/[a-z0-9-]{3,60}|para\/[a-z0-9-]{3,60}\/ir\/(?:prueba|whatsapp|demo)|entrar\/[A-Za-z0-9_-]{30,60}|precios-mercado\/(?:estetica|hotel|guarderia|veterinaria)\/[a-z0-9-]{2,60}|directorio\/(?:estetica|hotel|guarderia|veterinaria)\/[a-z0-9-]{2,60}(?:\/[a-z0-9-]{3,60})?|mensajes-whatsapp\/[a-z0-9-]{3,60})$/;

async function plataforma(request: NextRequest, cabeceras: Headers) {
  const { pathname } = request.nextUrl;
  cabeceras.set(ENCABEZADO_PLATAFORMA, "1");
  cabeceras.set(ENCABEZADO_FIRMA, await firmarPlataforma());
  // El webhook de Stripe (cobro de PeluDesk): sin sesión ni negocio; la
  // firma la comprueba la ruta.
  if (pathname === "/api/stripe/webhook") return NextResponse.next({ request: { headers: cabeceras } });
  // El bot de WhatsApp de PeluDesk y su bandeja de Telegram: sin sesión ni
  // negocio; cada ruta comprueba su firma o su secret_token.
  // El endpoint del WhatsApp Flow de prueba gratis, además, va cifrado.
  if (pathname === "/api/whatsapp/webhook" || pathname === "/api/whatsapp/flow" || pathname === "/api/telegram/webhook") {
    return NextResponse.next({ request: { headers: cabeceras } });
  }
  // Integraciones por negocio: el webhook único de Mercado Pago, el regreso
  // de "Conectar Mercado Pago" (OAuth), el webhook de Clip de cada negocio
  // y el cron. Sin sesión: cada ruta comprueba su firma, su state o su token.
  if (
    pathname === "/api/mercadopago/webhook" ||
    pathname === "/api/mercadopago/oauth" ||
    pathname === "/api/mercadopago/oauth/simulacion" ||
    pathname.startsWith("/api/clip/webhook/") ||
    pathname.startsWith("/api/cron/") ||
    // La medición de las herramientas públicas (sendBeacon desde el navegador; sin sesión, siempre 204).
    pathname === "/api/herramientas/evento"
  ) {
    return NextResponse.next({ request: { headers: cabeceras } });
  }
  // El centro de ayuda público: /ayuda y /ayuda/<artículo>.
  const publica = PUBLICAS_PLATAFORMA[pathname] ?? (PUBLICAS_PLATAFORMA_PATRON.test(pathname) ? `/peludesk${pathname}` : undefined);
  if (publica) {
    // El rewrite conserva los parámetros: /registro?utm_source=… los necesita.
    const destino = new URL(publica, request.url);
    destino.search = request.nextUrl.search;
    // El layout de peludesk.mx no pone aviso de cookies, píxel ni botón flotante en la vista previa de un prospecto.
    cabeceras.set("x-peludesk-ruta", pathname);
    const reescrita = NextResponse.rewrite(destino, { request: { headers: cabeceras } });
    // QA R23 (N73): la revisión interna (?interno=1, desde el CRM) se recuerda en una cookie de /para por un día:
    // así ningún clic posterior (la demo, el registro, recargar sin el parámetro) cuenta como visita.
    if (pathname.startsWith("/para/") && request.nextUrl.searchParams.get("interno") === "1") {
      reescrita.cookies.set(COOKIE_INTERNO, "1", { path: "/para", maxAge: 86400, sameSite: "lax", httpOnly: true, secure: request.nextUrl.protocol === "https:" });
    }
    return reescrita;
  }
  if (pathname === "/peludesk" || pathname.startsWith("/peludesk/")) return NextResponse.redirect(new URL("/", request.url));
  const permitida = RUTAS_PLATAFORMA.some((r) => pathname === r || pathname.startsWith(`${r}/`));
  if (!permitida) return NextResponse.redirect(new URL("/", request.url));

  const siguiente = () => NextResponse.next({ request: { headers: cabeceras } });
  let response = siguiente();
  // Solo para refrescar la sesión (cookies). Sin negocio: nada de un
  // negocio se ve desde aquí.
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        cabeceras.set("cookie", request.headers.get("cookie") ?? "");
        response = siguiente();
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  await supabase.auth.getUser();
  return response;
}

export const config = {
  // Archivos estáticos (imágenes y los videos de redes de public/peludesk/redes:
  // mp4 y sus subtítulos .srt) no pasan por aquí.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|mp4|srt)$).*)"],
};
