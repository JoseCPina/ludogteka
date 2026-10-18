// Completa un prospecto con lo que dice su web: correo, Instagram, Facebook y WhatsApp (si el sitio lo trae
// como wa.me o api.whatsapp.com: es la única forma de distinguir un WhatsApp de un teléfono fijo).
// Sin imports (también lo usa scripts/prospectos/buscar.mjs con Node directo).

export type ContactosWeb = { correo: string | null; instagram: string | null; facebook: string | null; whatsapp: string | null };

const CORREO = /[a-z0-9][a-z0-9._%+-]{0,63}@[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}/gi;
const CORREO_BASURA = /\.(png|jpe?g|gif|webp|svg|css|js)$|@(\d+x|example|domain|email|correo|sentry|wixpress|sentry-next|godaddy|ingest|mysite|tudominio|dominio)\./i;
const IG_NO = new Set(["p", "reel", "reels", "explore", "accounts", "stories", "tv", "sharer", "share", "instagram", "about", "developer", "legal", "direct", "web"]);
const FB_NO = new Set(["sharer", "sharer.php", "share", "share.php", "plugins", "tr", "dialog", "login", "login.php", "help", "policies", "privacy", "watch", "events", "groups", "hashtag", "home.php", "facebook", "photo.php", "photos", "story.php", "permalink.php", "people", "public", "business"]);

const decodificar = (html: string) =>
  html
    .replace(/&#64;|&commat;|\\u0040|%40/gi, "@")
    .replace(/&#46;|&period;/gi, ".")
    .replace(/&amp;/gi, "&")
    .replace(/\\\//g, "/");

function correoDe(html: string, dominio: string | null): string | null {
  const vistos = [...new Set((html.match(CORREO) ?? []).map((c) => c.toLowerCase().replace(/^[.]+|[.]+$/g, "")))].filter((c) => !CORREO_BASURA.test(c));
  if (vistos.length === 0) return null;
  const propio = dominio ? vistos.find((c) => c.endsWith(`@${dominio}`)) : undefined;
  return propio ?? vistos[0];
}

export function instagramDe(texto: string): string | null {
  for (const m of texto.matchAll(/instagram\.com\/([A-Za-z0-9._]{2,30})/gi)) {
    const h = m[1].replace(/\.+$/, "");
    if (h && !IG_NO.has(h.toLowerCase())) return `https://www.instagram.com/${h}`;
  }
  return null;
}

export function facebookDe(texto: string): string | null {
  for (const m of texto.matchAll(/(?:facebook|fb)\.com\/((?:pages\/[^/"'?#\s]+\/\d+)|(?:profile\.php\?id=\d+)|[A-Za-z0-9.\-]{2,80})/gi)) {
    const h = m[1];
    if (!FB_NO.has(h.toLowerCase()) && !/^\d+$/.test(h)) return `https://www.facebook.com/${h}`;
  }
  return null;
}

export function whatsappDe(texto: string): string | null {
  const m = texto.match(/(?:wa\.me\/|api\.whatsapp\.com\/send\/?\?(?:[^"'\s]*?&(?:amp;)?)?phone=|whatsapp:\/\/send\/?\?phone=)\+?(\d{10,13})/i);
  return m ? m[1].slice(-10) : null;
}

export function extraerContactos(html: string, dominio: string | null): ContactosWeb {
  const t = decodificar(html);
  return { correo: correoDe(t, dominio), instagram: instagramDe(t), facebook: facebookDe(t), whatsapp: whatsappDe(t) };
}

const dominioDe = (url: string) => {
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
};

async function bajar(url: string, topeMs: number): Promise<string> {
  const r = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; PeluDeskBot/1.0; +https://peludesk.mx)", Accept: "text/html,application/xhtml+xml" },
    redirect: "follow",
    signal: AbortSignal.timeout(topeMs),
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  const tipo = r.headers.get("content-type") ?? "";
  if (tipo && !/html|text/i.test(tipo)) throw new Error("No es una página");
  return (await r.text()).slice(0, 1_500_000);
}

/** Revisa la web de un prospecto. Nunca lanza: si no se puede leer, devuelve `error`. */
export async function revisarWeb(url: string, topeMs = 8_000): Promise<ContactosWeb & { error: string | null }> {
  const vacio = { correo: null, instagram: null, facebook: null, whatsapp: null };
  const dominio = dominioDe(url);
  if (!dominio) return { ...vacio, error: "Dirección web inválida" };
  // La «web» es su red social: de ahí sale el perfil, sin bajar nada (Facebook e Instagram no dejan leerse).
  if (/(^|\.)instagram\.com$/.test(dominio)) return { ...vacio, instagram: instagramDe(url), error: null };
  if (/(^|\.)(facebook|fb)\.com$/.test(dominio)) return { ...vacio, facebook: facebookDe(url), error: null };
  if (/(^|\.)wa\.me$|whatsapp\.com$/.test(dominio)) return { ...vacio, whatsapp: whatsappDe(url), error: null };
  try {
    const html = await bajar(url, topeMs);
    const c = extraerContactos(html, dominio);
    if (!c.correo) {
      // Una página de contacto del mismo sitio, una sola vez.
      const enlace = html.match(/href=["']([^"'#]*contact[^"'#]*)["']/i)?.[1];
      if (enlace) {
        try {
          const destino = new URL(enlace, url);
          if (dominioDe(destino.href) === dominio) {
            const c2 = extraerContactos(await bajar(destino.href, topeMs), dominio);
            return { correo: c2.correo, instagram: c.instagram ?? c2.instagram, facebook: c.facebook ?? c2.facebook, whatsapp: c.whatsapp ?? c2.whatsapp, error: null };
          }
        } catch {
          /* la de contacto no abrió: se queda con lo de la portada */
        }
      }
    }
    return { ...c, error: null };
  } catch (e) {
    const m = e instanceof Error ? (e.name === "TimeoutError" ? "No contestó a tiempo" : e.message) : String(e);
    return { ...vacio, error: m.slice(0, 200) };
  }
}
