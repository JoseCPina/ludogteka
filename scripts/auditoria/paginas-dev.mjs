// Uso: node scripts/auditoria/paginas-dev.mjs [base] [negocio-slug]
//   base: http://localhost:3001 por omisión (con PELUDESK: http://huellitas.localhost:3001)
//   negocio-slug: ludogteka por omisión
// SOLO DESARROLLO. Prueba de humo por HTTP: con la sesión real de cada rol
// del negocio (la cookie que pone @supabase/ssr), abre las pantallas
// principales y revisa que respondan 200, sin mandar a /login ni a
// /sin-acceso, sin error de servidor y con datos del negocio adentro.
import http from "node:http";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const BASE = (process.argv[2] ?? "http://localhost:3001").replace(/\/$/, "");
const SLUG = process.argv[3] ?? "ludogteka";
const REF = new globalThis.URL(URL).hostname.split(".")[0];

const { data: negocio } = await A.from("negocios").select("id, nombre").eq("slug", SLUG).single();
const persona = async (rol) =>
  (await A.from("membresias").select("profile_id, cliente_id").eq("negocio_id", negocio.id).eq("rol", rol).is("deleted_at", null).order("created_at").limit(1).single()).data;

async function cookieDe(profileId) {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  // @supabase/ssr parte la cookie en trozos de 3180.
  const trozos = valor.match(/.{1,3180}/g);
  const nombre = `sb-${REF}-auth-token`;
  return trozos.length === 1 ? `${nombre}=${valor}` : trozos.map((t, i) => `${nombre}.${i}=${t}`).join("; ");
}

// Un negocio recién dado de alta no tiene clientes ni perros: esas dos
// pantallas se saltan (y se dice).
const { data: unCliente } = await A.from("clientes").select("id, nombre").eq("negocio_id", negocio.id).is("deleted_at", null).order("created_at").limit(1).maybeSingle();
const { data: unPerro } = await A.from("perros").select("id, nombre").eq("negocio_id", negocio.id).is("deleted_at", null).order("created_at").limit(1).maybeSingle();
if (!unCliente || !unPerro) console.log("  · sin clientes o perros todavía: se saltan la ficha del cliente y la del perro");

const RUTAS = {
  admin: ["/admin", "/reportes", "/servicios", "/empleados", "/gastos", "/admin/permisos", "/inventario"],
  recepcion: ["/recepcion", "/clientes", ...(unCliente ? [`/clientes/${unCliente.id}`] : []), ...(unPerro ? [`/perros/${unPerro.id}`] : []), "/caja", "/caja/turno", "/guarderia", "/hotel", "/estetica", "/recepcion/contratos", "/vinculacion", "/clientes/invitaciones"],
  estetica: ["/estetica"],
  cliente: ["/portal"],
};
const MARCADORES = { recepcion: unCliente ? { "/clientes": unCliente.nombre } : {} };

// Node no resuelve *.localhost y fetch no deja fijar Host: se va a
// 127.0.0.1 con http.request y el Host del negocio.
function pedir(url, cookie) {
  const u = new globalThis.URL(url);
  return new Promise((resolver, rechazar) => {
    const req = http.request(
      { host: u.hostname.endsWith(".localhost") ? "127.0.0.1" : u.hostname, port: u.port || 80, path: u.pathname + u.search, method: "GET", headers: { host: u.host, ...(cookie ? { cookie } : {}) } },
      (res) => {
        let cuerpo = "";
        res.setEncoding("utf8");
        res.on("data", (c) => (cuerpo += c));
        res.on("end", () => resolver({ status: res.statusCode, location: res.headers.location ?? null, cuerpo }));
      }
    );
    req.on("error", rechazar);
    req.end();
  });
}

let fallas = 0;
const revisar = async (rol, ruta, cookie) => {
  const r = await pedir(BASE + ruta, cookie);
  const cuerpo = r.status === 200 ? r.cuerpo : "";
  const destino = r.location;
  let problema = null;
  if (r.status !== 200) problema = `${r.status}${destino ? ` → ${destino}` : ""}`;
  else if (/Application error|Internal Server Error|digest/i.test(cuerpo)) problema = "error de servidor en la página";
  else if (MARCADORES[rol]?.[ruta] && !cuerpo.includes(MARCADORES[rol][ruta])) problema = `no aparece «${MARCADORES[rol][ruta]}»`;
  else if (ruta !== "/" && !cuerpo.includes(negocio.nombre)) problema = `no dice «${negocio.nombre}»`;
  if (problema) fallas++;
  console.log(`  ${problema ? "✘" : "✔"} ${rol.padEnd(9)} ${ruta}${problema ? `  ${problema}` : ""}`);
};

console.log(`${BASE} (${negocio.nombre})`);
await revisar("anonimo", "/", null);
await revisar("anonimo", "/login", null);
for (const [rol, rutas] of Object.entries(RUTAS)) {
  const p = await persona(rol);
  if (!p) { console.log(`  · sin ${rol} en ${negocio.nombre}`); continue; }
  const cookie = await cookieDe(p.profile_id);
  for (const ruta of rutas) await revisar(rol, ruta, cookie);
}
console.log(fallas ? `FALLAS: ${fallas}` : "TODO BIEN");
process.exit(fallas ? 1 : 0);
