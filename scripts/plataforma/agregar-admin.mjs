// Uso: node scripts/plataforma/agregar-admin.mjs <correo> [--prod]
//
// Da de alta a un administrador de PeluDesk: una cuenta SIN membresía en
// ningún negocio (la base lo exige). Si la cuenta no existe, se crea y se
// imprime un link para que la persona escoja su contraseña en el dominio
// de la plataforma; si existe, solo se le da el rol.
//
// Desarrollo: lee .env.local. Producción (--prod): lee la llave de
// servicio al vuelo con el CLI de Supabase (nunca se imprime ni se guarda)
// y la URL de la plataforma de PELUDESK_URL_PLATAFORMA (por omisión
// https://peludesk.mx).
import fs from "node:fs";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const correo = (process.argv[2] ?? "").trim().toLowerCase();
const prod = process.argv.includes("--prod");
if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) throw new Error("Uso: node scripts/plataforma/agregar-admin.mjs <correo> [--prod]");

let url, llave, base;
if (prod) {
  const ref = "xdsxjhytggpsgrmfuuff";
  const llaves = JSON.parse(execFileSync("node", ["node_modules/supabase/dist/supabase.js", "projects", "api-keys", "--project-ref", ref, "-o", "json"], { encoding: "utf8" }));
  llave = llaves.find((x) => x.name === "service_role" && (x.type ?? "legacy") === "legacy").api_key;
  url = `https://${ref}.supabase.co`;
  base = process.env.PELUDESK_URL_PLATAFORMA ?? "https://peludesk.mx";
} else {
  const env = Object.fromEntries(fs.readFileSync(".env.local", "utf8").split(/\r?\n/).filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }));
  url = env.NEXT_PUBLIC_SUPABASE_URL;
  llave = env.SUPABASE_SECRET_KEY;
  base = (env.PELUDESK_URL_PLATAFORMA ?? "http://plataforma.localhost:3001").replace(/\/$/, "");
}
const S = createClient(url, llave, { auth: { persistSession: false } });

let { data: id } = await S.rpc("usuario_por_email", { p_email: correo });
let link = null;
if (!id) {
  const { data, error } = await S.auth.admin.generateLink({ type: "invite", email: correo });
  if (error) throw error;
  id = data.user.id;
  link = `${base}/auth/callback?token_hash=${data.properties.hashed_token}&type=invite&next=/plataforma`;
}
const { error } = await S.rpc("agregar_admin_plataforma", { p_profile_id: id });
if (error) throw new Error(error.message);
console.log(`${correo} es administrador de PeluDesk.`);
if (link) console.log(`Para que escoja su contraseña (un solo uso): ${link}`);
