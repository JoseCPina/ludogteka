// Sesiones de Huellitas en el navegador (SOLO DESARROLLO): cookies de una persona por enlace mágico, sin contraseña,
// para `http://huellitas.localhost:3001`. Las usan las auditorías de pantalla de la QA S36.
import { createClient } from "@supabase/supabase-js";
import { A, URL, env } from "../sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const REF = new globalThis.URL(URL).hostname.split(".")[0];
export const BASE = "http://huellitas.localhost:3001";

export async function cookiesDe(profileId, host = "huellitas.localhost") {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  const galletas = (nombre) => (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t]));
  return {
    token: s.session.access_token,
    cookies: [...galletas(`sb-${REF}-auth-token`), ...galletas(`sb-${REF}-portal-auth-token`)].map(([name, value]) => ({ name, value, domain: host, path: "/" })),
  };
}

/** Una pestaña con la sesión de esa persona (y su cliente de la API con el negocio). */
export async function abrirComo(nav, profileId, negocioId, viewport = { width: 1280, height: 900 }) {
  const { token, cookies } = await cookiesDe(profileId);
  const c = await nav.newContext({ viewport });
  await c.addCookies(cookies);
  const p = await c.newPage();
  p.setDefaultTimeout(30000);
  p.setDefaultNavigationTimeout(90000);
  p.on("dialog", (d) => d.accept());
  const api = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}`, "x-negocio-id": negocioId } } });
  return { c, p, api };
}

export const textoDe = async (p) => (await p.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
export async function esperarTexto(p, re, ms = 25000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) {
    if (re.test(await textoDe(p))) return true;
    await p.waitForTimeout(400);
  }
  return false;
}
