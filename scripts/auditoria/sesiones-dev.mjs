// Sesiones reales de desarrollo, con los JWT guardados para no pegarle al
// límite de Auth (los tokens duran una hora).
// Solo DESARROLLO (.env.local): los tokens se guardan en la carpeta temporal del sistema.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
export const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
export const URL = env.NEXT_PUBLIC_SUPABASE_URL;
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
