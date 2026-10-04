// Una página pública que se pinta en el servidor con una sesión CADUCADA
// (access token vencido, refresh token bueno) no debe tronar con «Cookies can
// only be modified in a Server Action or Route Handler» (SOLO DESARROLLO).
//
//   npm run build && node scripts/auditoria/cookie-render-dev.mjs
//
// supabase-js renueva el token al consultar; el cliente de servidor intenta
// escribir la cookie nueva y en un render eso lanza. Levanta su propio
// `next start` en el 3003, abre cada ruta con la cookie vencida y revisa que
// responda sin 500 y que el servidor no registre ese error.
import { spawn } from "node:child_process";
import http from "node:http";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const PUERTO = 3003;
const REF = new globalThis.URL(URL).hostname.split(".")[0];
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);

const { data: neg } = await A.from("negocios").select("id").eq("slug", "huellitas").single();
const { data: m } = await A.from("membresias").select("profile_id").eq("negocio_id", neg.id).eq("rol", "admin").is("deleted_at", null).limit(1).single();
const { data: u } = await A.auth.admin.getUserById(m.profile_id);
const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
if (error) throw error;
const vencida = { ...s.session, expires_at: Math.floor(Date.now() / 1000) - 600, expires_in: 0 };
const valor = "base64-" + Buffer.from(JSON.stringify(vencida)).toString("base64url");
const trozos = valor.match(/.{1,3180}/g);
const nombre = `sb-${REF}-auth-token`;
const cookie = (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t])).map(([k, v]) => `${k}=${v}`).join("; ");

let log = "";
const srv = spawn("node", ["node_modules/next/dist/bin/next", "start", "-p", String(PUERTO)], { env: { ...process.env, PORT: String(PUERTO) } });
srv.stdout.on("data", (d) => (log += d));
srv.stderr.on("data", (d) => (log += d));
const pedir = (ruta) => new Promise((resolve, reject) => {
  http.get({ host: "127.0.0.1", port: PUERTO, path: ruta, timeout: 20000, headers: { host: `huellitas.localhost:${PUERTO}`, cookie } }, (res) => { res.resume(); res.on("end", () => resolve(res.statusCode)); }).on("timeout", function () { this.destroy(new Error("sin respuesta")); }).on("error", reject);
});
try {
  for (let i = 0; i < 60; i += 1) { try { await pedir("/login"); break; } catch { await new Promise((r) => setTimeout(r, 1000)); } }
  for (const ruta of ["/", "/login", "/alta/zz-token-que-no-existe", "/demo", "/portal", "/recepcion", "/perros/razas"]) {
    const status = await pedir(ruta);
    if (status >= 500) hallazgo(`${ruta} respondió ${status} con la sesión vencida`);
    else bien(`${ruta} → ${status}`);
  }
  await new Promise((r) => setTimeout(r, 1500));
  if (/Cookies can only be modified/.test(log)) hallazgo("el servidor registró «Cookies can only be modified…» al renovar la sesión en un render");
  else bien("el servidor no registró «Cookies can only be modified…»");
} finally {
  srv.kill();
}
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s).` : "\n✔ Sin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
