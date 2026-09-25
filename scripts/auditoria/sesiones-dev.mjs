// Sesiones reales de desarrollo, con los JWT guardados para no pegarle al
// límite de Auth (los tokens duran una hora).
// Solo DESARROLLO (.env.local): los tokens se guardan en la carpeta temporal del sistema.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
const URL_ = globalThis.URL;
export const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
export const URL = env.NEXT_PUBLIC_SUPABASE_URL;

// PeluDesk: cada petición a la base va a UN negocio (encabezado
// x-negocio-id, el mismo que pone el middleware). Las auditorías corren
// contra Ludogteka salvo AUDITORIA_NEGOCIO_ID; una petición que ya trae su
// propio x-negocio-id (la auditoría entre negocios) se respeta. Se parcha
// fetch ANTES de crear cualquier cliente: supabase-js lo captura al crearse.
export const NEGOCIO = process.env.AUDITORIA_NEGOCIO_ID ?? "10000000-0000-4000-8000-000000000001";
//
// Y la secret key SALTA la RLS: una lectura, cambio o borrado con ella
// sobre una tabla que tiene negocio_id y que no filtra negocio vería (o
// tocaría) los dos negocios. Los scripts se escribieron con un solo
// negocio; aquí esas peticiones se acotan a NEGOCIO. Quien filtra
// negocio_id a mano (la auditoría entre negocios) queda como está.
const fetchOriginal = globalThis.fetch;
const specServicio = await (await fetchOriginal(URL + "/rest/v1/", { headers: { apikey: env.SUPABASE_SECRET_KEY, Authorization: `Bearer ${env.SUPABASE_SECRET_KEY}` } })).json();
const CON_NEGOCIO = new Set(Object.entries(specServicio.definitions).filter(([, d]) => d.properties?.negocio_id).map(([t]) => t));
globalThis.fetch = (input, init = {}) => {
  const destino = typeof input === "string" ? input : input instanceof URL_ ? input.href : input.url;
  if (destino.startsWith(URL)) {
    const h = new Headers(init.headers ?? (input instanceof Request ? input.headers : undefined));
    if (!h.has("x-negocio-id")) h.set("x-negocio-id", NEGOCIO);
    init = { ...init, headers: h };
    const u = new URL_(destino);
    const tabla = u.pathname.startsWith("/rest/v1/") && !u.pathname.startsWith("/rest/v1/rpc/") ? u.pathname.slice(9) : null;
    const metodo = (init.method ?? "GET").toUpperCase();
    if (tabla && CON_NEGOCIO.has(tabla) && metodo !== "POST" && h.get("authorization") === `Bearer ${env.SUPABASE_SECRET_KEY}` && !u.searchParams.has("negocio_id")) {
      u.searchParams.append("negocio_id", `eq.${h.get("x-negocio-id")}`);
      return fetchOriginal(u.href, init);
    }
  }
  return fetchOriginal(input, init);
};
export const A = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const CACHE = path.join(os.tmpdir(), "ludogteka-tokens-dev.json");
const cache = fs.existsSync(CACHE) ? JSON.parse(fs.readFileSync(CACHE, "utf8")) : {};
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

export async function tokenDe(profileId) {
  const c = cache[profileId];
  if (c && c.exp * 1000 > Date.now() + 5 * 60_000) return c.token;
  for (let intento = 0; intento < 6; intento++) {
    const { data: u } = await A.auth.admin.getUserById(profileId);
    const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
    const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
    if (!error) {
      cache[profileId] = { token: s.session.access_token, exp: s.session.expires_at };
      fs.writeFileSync(CACHE, JSON.stringify(cache));
      await espera(1500);
      return s.session.access_token;
    }
    if (error.status !== 429) throw error;
    await espera(20_000);
  }
  throw new Error("Auth sigue limitando");
}

export async function sesion(profileId) {
  const token = await tokenDe(profileId);
  return createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
}
