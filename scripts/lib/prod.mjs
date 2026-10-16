// Acceso a PRODUCCIÓN para el negocio de pruebas internas «Clínica Demo PeluDesk» (y SOLO a ese negocio).
// La llave de servicio se lee al vuelo con el CLI de Supabase (nunca se imprime ni se guarda) y todo cliente
// que sale de aquí va acotado al negocio de pruebas: si el slug no es el permitido, no abre nada.
// Nunca Ludogteka ni un cliente real.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

export const REF_PROD = "xdsxjhytggpsgrmfuuff";
export const URL_PROD = `https://${REF_PROD}.supabase.co`;
export const SLUG_CLINICA = "clinicademo";
export const NOMBRE_CLINICA = "Clínica Demo PeluDesk";
export const LUDOGTEKA_ID = "10000000-0000-4000-8000-000000000001";
export const DOMINIO_CLINICA = `${SLUG_CLINICA}.peludesk.mx`;
export const BASE_CLINICA = `https://${DOMINIO_CLINICA}`;
export const TELEFONO_DUENO = "4441301539";
const ESTADO = path.join(os.tmpdir(), "clinica-demo-prod.json");

let llaves;
export function llavesProd() {
  if (llaves) return llaves;
  const lista = JSON.parse(execFileSync("node", ["node_modules/supabase/dist/supabase.js", "projects", "api-keys", "--project-ref", REF_PROD, "-o", "json"], { encoding: "utf8", env: process.env }));
  const dame = (nombre) => lista.find((x) => x.name === nombre && (x.type ?? "legacy") === "legacy")?.api_key;
  llaves = { servicio: dame("service_role"), anon: dame("anon") };
  if (!llaves.servicio || !llaves.anon) throw new Error("No pude leer las llaves de producción por el CLI.");
  return llaves;
}

/** Cliente con la llave de servicio, SIN negocio (para Auth y la plataforma). */
export function servicioSinNegocio() {
  return createClient(URL_PROD, llavesProd().servicio, { auth: { persistSession: false } });
}

/** Cliente con la llave de servicio acotado a un negocio. Rechaza Ludogteka. */
export function servicioEn(negocioId) {
  if (!negocioId || negocioId === LUDOGTEKA_ID) throw new Error("Este script nunca toca Ludogteka.");
  return createClient(URL_PROD, llavesProd().servicio, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": negocioId } } });
}

export function estado() {
  try { return JSON.parse(fs.readFileSync(ESTADO, "utf8")); } catch { return {}; }
}
export function guardarEstado(parcial) {
  const nuevo = { ...estado(), ...parcial };
  fs.writeFileSync(ESTADO, JSON.stringify(nuevo, null, 1));
  return nuevo;
}

/** Sesión real de una persona (magic link por Auth, sin contraseña): { token, session, cookies }. */
export async function sesionDe(profileId, dominioCookie = DOMINIO_CLINICA) {
  const S = servicioSinNegocio();
  const { data: u, error: e0 } = await S.auth.admin.getUserById(profileId);
  if (e0 || !u?.user?.email) throw new Error(`No encontré la cuenta ${profileId}.`);
  const { data: link, error: e1 } = await S.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  if (e1) throw e1;
  const cli = createClient(URL_PROD, llavesProd().anon, { auth: { persistSession: false } });
  const { data: s, error: e2 } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (e2) throw e2;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  const galletas = (nombre) => (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t]));
  // Dos cookies de sesión (personal y portal): el servidor lee la que le toca por la ruta.
  const cookies = [...galletas(`sb-${REF_PROD}-auth-token`), ...galletas(`sb-${REF_PROD}-portal-auth-token`)].map(([name, value]) => ({
    name, value, domain: dominioCookie, path: "/", secure: true, sameSite: "Lax",
  }));
  return { token: s.session.access_token, session: s.session, cookies };
}

/** Cliente de la API con el JWT de una persona y el encabezado del negocio (como lo manda la app). */
export function comoPersona(token, negocioId) {
  if (negocioId === LUDOGTEKA_ID) throw new Error("Este script nunca toca Ludogteka.");
  return createClient(URL_PROD, llavesProd().anon, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${token}`, "x-negocio-id": negocioId } } });
}
