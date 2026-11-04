import { NextResponse, type NextRequest } from "next/server";
import { ACCIONES } from "@/lib/movil/acciones";
import { conSesionMovil } from "@/lib/movil/contexto";

/**
 * POST /api/movil/<accion> — la puerta de la app nativa para dueños (apps/duenos-movil).
 *
 * Cuerpo JSON `{ "args": [...] }`, o multipart con `args` (JSON) y los archivos; un argumento "$form" recibe el
 * FormData. La sesión viaja en `Authorization: Bearer <access token>` y la acción corre dentro de conSesionMovil: los
 * clientes de Supabase del servidor la leen de ahí (src/lib/movil/contexto.ts). Sin sesión válida, 401 y la app la
 * renueva. Solo existe en el dominio de la app (app.peludesk.mx; el middleware la deja pasar ahí y en ningún otro).
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const NO_SESION = /sesi[oó]n se cerr[oó]/i;

export async function POST(request: NextRequest, contexto: { params: Promise<{ accion: string }> }) {
  const { accion } = await contexto.params;
  const def = Object.prototype.hasOwnProperty.call(ACCIONES, accion) ? ACCIONES[accion] : null;
  if (!def) return NextResponse.json({ error: "Esa acción no existe." }, { status: 404 });

  let args: unknown[] = [];
  try {
    const tipo = request.headers.get("content-type") ?? "";
    if (tipo.includes("multipart/form-data")) {
      const form = await request.formData();
      const crudos = JSON.parse(String(form.get("args") ?? "[]")) as unknown[];
      args = crudos.map((a) => (a === "$form" ? form : a));
    } else {
      const cuerpo = (await request.json().catch(() => ({}))) as { args?: unknown[] };
      args = Array.isArray(cuerpo.args) ? cuerpo.args : [];
    }
  } catch {
    return NextResponse.json({ error: "No entendimos la petición." }, { status: 400 });
  }
  if (args.length > 12) return NextResponse.json({ error: "No entendimos la petición." }, { status: 400 });

  const token = /^Bearer\s+([A-Za-z0-9._-]{20,4096})$/.exec(request.headers.get("authorization") ?? "")?.[1] ?? null;
  if (!def.publica && !token) return NextResponse.json({ error: "Tu sesión se cerró. Vuelve a entrar.", sesion: false }, { status: 401 });

  const correr = () => (def.fn as (...a: unknown[]) => Promise<unknown>)(...args);
  try {
    const resultado = token && !def.publica ? await conSesionMovil(token, correr) : await correr();
    // Las pantallas devuelven null sin sesión (o si lo pedido no es de la persona): 401 si no hay sesión, 404 si no es suyo.
    if (resultado === null) {
      const conSesion = token ? await conSesionMovil(token, async () => (await import("@/lib/app/sesion")).sesionApp()) : null;
      return conSesion ? NextResponse.json({ error: "No encontramos eso." }, { status: 404 }) : NextResponse.json({ error: "Tu sesión se cerró. Vuelve a entrar.", sesion: false }, { status: 401 });
    }
    const r = resultado as { error?: unknown };
    if (!def.publica && typeof r?.error === "string" && NO_SESION.test(r.error)) return NextResponse.json({ ...r, sesion: false }, { status: 401 });
    return NextResponse.json(resultado);
  } catch (e) {
    // Una acción de la web que navega al terminar (redirect) lanza NEXT_REDIRECT: la app nativa recibe a dónde iba.
    const digest = (e as { digest?: string })?.digest;
    if (typeof digest === "string" && digest.startsWith("NEXT_REDIRECT")) {
      const ir = digest.split(";")[2] ?? "/";
      return NextResponse.json({ error: null, ir });
    }
    console.error(`[movil] ${accion}`, e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Algo falló de nuestro lado. Intenta de nuevo en un momento." }, { status: 500 });
  }
}
