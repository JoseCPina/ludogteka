// «Leer contrato» del dueño (portal y alta por link) abre /api/contratos/<id>/preview con SU sesión del portal
// (SOLO DESARROLLO, Huellitas).
//
//   npm run build && node scripts/auditoria/contrato-preview-sesion-dev.mjs
//
// Desde N12 el personal y el portal guardan la sesión en cookies distintas y /api cae en el área «personal»: la
// vista previa solo leía esa cookie, el dueño llegaba sin sesión y veía «No encontramos este contrato» (27 de octubre
// de 2026, un cliente de Ludogteka en producción). Levanta su propio `next start` en el 3004 y pide la vista previa de
// un contrato pendiente de Huellitas con: (1) la sesión del dueño SOLO en la cookie del portal → PDF; (2) la del
// personal (admin) → PDF; (3) sin sesión → 404; (4) la sesión del portal de OTRO cliente → 404.
import { spawn } from "node:child_process";
import http from "node:http";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const PUERTO = 3004;
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);

const { data: neg } = await A.from("negocios").select("id").eq("slug", "huellitas").single();
const { data: miembros } = await A.from("membresias").select("profile_id, rol, cliente_id").eq("negocio_id", neg.id).is("deleted_at", null);
const clientes = new Map(miembros.filter((m) => m.rol === "cliente" && m.cliente_id).map((m) => [m.cliente_id, m.profile_id]));
const { data: pendientes } = await A.from("contratos").select("id, cliente_id").eq("negocio_id", neg.id).eq("estado", "pendiente_firma").is("deleted_at", null);
const contrato = pendientes.find((k) => clientes.has(k.cliente_id));
if (!contrato) throw new Error("Huellitas no tiene un contrato pendiente de un cliente con cuenta: corre negocio-prueba-dev.mjs.");
const dueno = clientes.get(contrato.cliente_id);
const otro = [...clientes.entries()].find(([c]) => c !== contrato.cliente_id)?.[1];
const admin = miembros.find((m) => m.rol === "admin")?.profile_id;

async function sesion(profileId) {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  return valor.match(/.{1,3180}/g);
}
const galleta = (nombre, trozos) => (trozos.length === 1 ? [[nombre, trozos[0]]] : trozos.map((t, i) => [`${nombre}.${i}`, t]));
const enPortal = (trozos) => galleta(`sb-${REF}-portal-auth-token`, trozos).map(([k, v]) => `${k}=${v}`).join("; ");
const enPersonal = (trozos) => galleta(`sb-${REF}-auth-token`, trozos).map(([k, v]) => `${k}=${v}`).join("; ");

const srv = spawn("node", ["node_modules/next/dist/bin/next", "start", "-p", String(PUERTO)], { env: { ...process.env, PORT: String(PUERTO) } });
srv.stdout.on("data", () => {});
srv.stderr.on("data", () => {});
const pedir = (ruta, cookie = "") => new Promise((resolve, reject) => {
  http.get({ host: "127.0.0.1", port: PUERTO, path: ruta, timeout: 60000, headers: { host: `huellitas.localhost:${PUERTO}`, cookie } }, (res) => {
    res.resume();
    res.on("end", () => resolve({ status: res.statusCode, tipo: String(res.headers["content-type"] ?? "") }));
  }).on("timeout", function () { this.destroy(new Error("sin respuesta")); }).on("error", reject);
});
const ruta = `/api/contratos/${contrato.id}/preview`;
const esPdf = (r) => r.status === 200 && r.tipo.includes("application/pdf");
try {
  for (let i = 0; i < 60; i += 1) { try { await pedir("/login"); break; } catch { await new Promise((r) => setTimeout(r, 1000)); } }

  const r1 = await pedir(ruta, enPortal(await sesion(dueno)));
  if (esPdf(r1)) bien("el dueño, con solo la cookie del portal, recibe el PDF");
  else hallazgo(`el dueño con la cookie del portal recibió ${r1.status} ${r1.tipo} (esperaba el PDF)`);

  if (admin) {
    const r2 = await pedir(ruta, enPersonal(await sesion(admin)));
    if (esPdf(r2)) bien("el admin, con la cookie del personal, recibe el PDF");
    else hallazgo(`el admin con la cookie del personal recibió ${r2.status} ${r2.tipo}`);
  }

  const r3 = await pedir(ruta);
  if (r3.status === 404 && !r3.tipo.includes("pdf")) bien("sin sesión → 404");
  else hallazgo(`sin sesión respondió ${r3.status} ${r3.tipo}`);

  if (otro) {
    const r4 = await pedir(ruta, enPortal(await sesion(otro)));
    if (r4.status === 404 && !r4.tipo.includes("pdf")) bien("otro cliente con su cookie del portal → 404");
    else hallazgo(`otro cliente recibió ${r4.status} ${r4.tipo}: ve un contrato ajeno`);
  }
} finally {
  srv.kill();
}
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s).` : "\n✔ Sin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
