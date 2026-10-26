import { NextResponse, type NextRequest } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { urlDelNegocio } from "@/lib/negocio/actual";
import { canjearAcceso } from "@/lib/whatsapp/flow/servidor";

/**
 * peludesk.mx/entrar/<token>: la liga de entrada que el bot de WhatsApp manda al abrir un negocio desde el Flow de
 * prueba gratis (o a quien ya tenía uno). Un solo uso y 24 horas (wa_accesos).
 *
 *   GET   una página con el botón «Entrar a mi negocio»: abrir la liga NO la gasta (los revisores de links y las
 *         vistas previas hacen GET; si la gastaran, a la persona le llegaría ya usada).
 *   POST  la gasta (UPDATE condicionado: dos clics a la vez, uno gana), pide un enlace mágico para esa persona y la
 *         manda a /auth/entrar de SU negocio, que abre la sesión en ese dominio.
 */
export const dynamic = "force-dynamic";

function escapar(t: string) {
  return t.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);
}

function pagina(titulo: string, cuerpo: string, status = 200) {
  const html = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>${escapar(titulo)} · PeluDesk</title>
<style>
  body{margin:0;background:#fff8ee;color:#2b2a33;font-family:Outfit,system-ui,-apple-system,"Segoe UI",sans-serif;line-height:1.5}
  main{max-width:30rem;margin:3rem auto;padding:0 1rem}
  .tarjeta{background:#fff;border-radius:12px;padding:1.5rem;box-shadow:0 1px 3px rgba(0,0,0,.08)}
  h1{font-size:1.35rem;margin:0 0 .5rem}
  p{margin:.5rem 0}
  button{margin-top:1rem;width:100%;border:0;background:#4b3f72;color:#fff;font:inherit;font-weight:700;padding:.85rem 1.25rem;border-radius:999px;cursor:pointer}
  .marca{font-weight:700;color:#4b3f72;margin-bottom:1rem}
</style>
</head>
<body>
<main>
  <p class="marca">PeluDesk</p>
  <div class="tarjeta">
    <h1>${escapar(titulo)}</h1>
    ${cuerpo}
  </div>
</main>
</body>
</html>`;
  return new NextResponse(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
}

const valido = (t: string) => /^[A-Za-z0-9_-]{30,60}$/.test(t);

export async function GET(_request: NextRequest, contexto: { params: Promise<{ token: string }> }) {
  const { token } = await contexto.params;
  if (!valido(token)) return sinLiga("no_existe");
  return pagina(
    "Entra a tu negocio",
    `<p>Toca el botón para entrar a PeluDesk con tu cuenta. Esta liga sirve una sola vez.</p>
    <form method="post" action="/entrar/${escapar(token)}"><button type="submit">Entrar a mi negocio</button></form>`,
  );
}

export async function POST(_request: NextRequest, contexto: { params: Promise<{ token: string }> }) {
  const { token } = await contexto.params;
  if (!valido(token)) return sinLiga("no_existe");
  const canje = await canjearAcceso(token);
  if (!canje.ok) return sinLiga(canje.motivo);

  const admin = createSupabaseAdminClient();
  const [{ data: negocio }, { data: usuario }] = await Promise.all([
    admin.from("negocios").select("slug, dominio, url_publica").eq("id", canje.negocioId).is("deleted_at", null).maybeSingle(),
    admin.auth.admin.getUserById(canje.personaId),
  ]);
  const email = usuario?.user?.email;
  if (!negocio || !email) {
    console.error("[entrar] negocio o cuenta no encontrados", { negocio: Boolean(negocio), cuenta: Boolean(email) });
    return sinLiga("no_existe");
  }
  const destino = urlDelNegocio({ slug: negocio.slug as string, dominio: (negocio.dominio as string | null) ?? null, url_publica: (negocio.url_publica as string | null) ?? null });
  const { data: link, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
  if (error || !link.properties?.hashed_token) {
    console.error("[entrar] generateLink", error?.message);
    return pagina("No pudimos abrir tu sesión", `<p>Entra con tu teléfono y tu contraseña en <b>${escapar(destino.replace(/^https?:\/\//, ""))}/login</b>.</p>`, 500);
  }
  // Destino absoluto en OTRO dominio (el del negocio), nunca armado con el origen de esta petición.
  return new NextResponse(null, {
    status: 303,
    headers: { Location: `${destino}/auth/entrar?token_hash=${encodeURIComponent(link.properties.hashed_token)}&next=${encodeURIComponent(canje.destino)}`, "Cache-Control": "no-store" },
  });
}

function sinLiga(motivo: "no_existe" | "usada" | "vencida") {
  const titulo = motivo === "usada" ? "Esta liga ya se usó" : motivo === "vencida" ? "Esta liga ya venció" : "Esta liga no es válida";
  return pagina(
    titulo,
    `<p>Las ligas de entrada sirven una sola vez y duran 24 horas.</p>
    <p>Si ya escogiste tu contraseña, entra con tu teléfono en la dirección de tu negocio (termina en <b>/login</b>). Si no, escríbele «Probar gratis» al WhatsApp de PeluDesk y te mandamos una liga nueva.</p>`,
    motivo === "no_existe" ? 404 : 410,
  );
}
