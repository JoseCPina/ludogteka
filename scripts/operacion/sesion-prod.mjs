// Sesión real de una persona de Ludogteka en PRODUCCIÓN (magic link por Auth, sin contraseña): un JWT para llamar las
// funciones con SUS reglas (RLS, permisos) y que quede su nombre como quien lo hizo. Complemento de ludogteka-prod.mjs.
// La llave anónima y la de servicio se leen al vuelo por el CLI de Supabase y nunca se imprimen ni se guardan.
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { REF_PROD, LUDOGTEKA_ID } from "./ludogteka-prod.mjs";

const URL = `https://${REF_PROD}.supabase.co`;
const base = `${URL}/rest/v1`;
let llaves;
function leerLlaves() {
  if (llaves) return llaves;
  const lista = JSON.parse(execFileSync("node", ["node_modules/supabase/dist/supabase.js", "projects", "api-keys", "--project-ref", REF_PROD, "-o", "json"], { encoding: "utf8", env: process.env }));
  const dame = (n) => lista.find((k) => k.name === n && (k.type ?? "legacy") === "legacy")?.api_key;
  llaves = { servicio: dame("service_role"), anon: dame("anon") };
  if (!llaves.servicio || !llaves.anon) throw new Error("No pude leer las llaves de producción por el CLI.");
  return llaves;
}

export async function tokenDe(profileId) {
  const { servicio, anon } = leerLlaves();
  const S = createClient(URL, servicio, { auth: { persistSession: false } });
  const { data: u, error: e0 } = await S.auth.admin.getUserById(profileId);
  if (e0 || !u?.user?.email) throw new Error(`No encontré la cuenta ${profileId}.`);
  const { data: link, error: e1 } = await S.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  if (e1) throw e1;
  const A = createClient(URL, anon, { auth: { persistSession: false } });
  const { data: s, error: e2 } = await A.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (e2) throw e2;
  return s.session.access_token;
}

/** Lecturas y escrituras COMO una persona (su JWT + el negocio): la RLS y los triggers aplican como en la app. */
export function comoPersona(token, negocioId = LUDOGTEKA_ID) {
  const h = () => ({ apikey: leerLlaves().anon, Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(negocioId ? { "x-negocio-id": negocioId } : {}) });
  return {
    async leer(ruta) {
      const r = await fetch(`${base}/${ruta}`, { headers: h() });
      if (!r.ok) throw new Error(`${ruta}: ${r.status} ${(await r.text()).slice(0, 300)}`);
      return r.json();
    },
    async rpc(fn, cuerpo = {}) {
      const r = await fetch(`${base}/rpc/${fn}`, { method: "POST", headers: h(), body: JSON.stringify(cuerpo) });
      const t = await r.text();
      if (!r.ok) throw new Error(`${fn}: ${r.status} ${t.slice(0, 500)}`);
      return t ? JSON.parse(t) : null;
    },
    async patch(tabla, filtro, cambios) {
      if (process.env.LUDOGTEKA_OPERACION !== "1") throw new Error("Escribir en Ludogteka exige LUDOGTEKA_OPERACION=1.");
      const r = await fetch(`${base}/${tabla}?${filtro}`, { method: "PATCH", headers: { ...h(), Prefer: "return=representation" }, body: JSON.stringify(cambios) });
      const t = await r.text();
      if (!r.ok) throw new Error(`PATCH ${tabla}: ${r.status} ${t.slice(0, 500)}`);
      return JSON.parse(t);
    },
  };
}
