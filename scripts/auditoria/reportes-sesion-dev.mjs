// Ayudas de las pruebas del reporte y de fotos y videos (SOLO DESARROLLO,
// Huellitas): cookies de sesión para el navegador (huellitas.localhost),
// clientes con el JWT de una persona y un teléfono-con-estancias ya listo.
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";

export const REF = "sgfolltpvktbsiisfuzq";
export const PUERTO = Number(process.env.PUERTO_DEV ?? 3001);

/** Cookies de Supabase para un navegador de Playwright, en el dominio de un negocio. */
export async function cookiesDe(profileId, dominio = "huellitas.localhost") {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  const nombre = `sb-${REF}-auth-token`;
  return (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t])).map(([name, value]) => ({
    name,
    value,
    domain: dominio,
    path: "/",
  }));
}

/** Cliente de Supabase con el JWT de una persona y el negocio en el encabezado. */
export async function comoPersona(profileId, negocioId) {
  return createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${await tokenDe(profileId)}`, "x-negocio-id": negocioId } },
  });
}

/** Cliente con la secret key (salta la RLS) atado a un negocio. */
export function servicioEn(negocioId) {
  return createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": negocioId } } });
}
