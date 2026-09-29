// Auditoría de la publicación en redes (desarrollo, JWT reales + llave anónima).
//
//   node scripts/auditoria/redes.mjs [http://127.0.0.1:3001]
//
// Nadie sin sesión de la plataforma ve ni dispara publicaciones:
//   - anon y los JWT de admin, recepción y cliente de Ludogteka: no leen
//     redes_publicaciones ni redes_ajustes, no insertan, no llaman
//     plataforma_redes_* ni las funciones del servidor (redes_tomar, secretos).
//   - la administración de la plataforma sí lee y llama plataforma_redes_*,
//     pero NUNCA redes_tomar ni los secretos (solo el servidor).
//   - /api/cron/redes sin CRON_SECRET (o con uno falso) da 401.
//   - /plataforma/redes sin sesión manda a /plataforma/entrar.
// Sale con 1 si encuentra algo.
import http from "node:http";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const BASE = process.argv[2] ?? "http://127.0.0.1:3001";
const LUDOGTEKA = "10000000-0000-4000-8000-000000000001";
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);

const cliente = (token, negocio = LUDOGTEKA) =>
  createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(negocio ? { "x-negocio-id": negocio } : {}) } },
  });
const miembro = async (rol) =>
  (await A.from("membresias").select("profile_id").eq("negocio_id", LUDOGTEKA).eq("rol", rol).is("deleted_at", null).order("created_at").limit(1).maybeSingle()).data?.profile_id;

// Una fila de prueba que todos deberían NO ver.
await A.rpc("plataforma_redes_probar", { p_red: "instagram", p_archivo: "auditoria.mp4" });
const { data: fila } = await A.from("redes_publicaciones").select("id").eq("prueba", true).eq("archivo", "auditoria.mp4").limit(1).single();

const RPC_PLATAFORMA = [
  ["plataforma_redes_programar", { p_filas: [{ video: "auditoria", red: "instagram", formato: "reel", archivo: "x.mp4", programada_at: "2030-01-01T00:00:00Z", pie: "x" }] }],
  ["plataforma_redes_reprogramar", { p_id: fila.id, p_fecha: "2030-01-01T00:00:00Z" }],
  ["plataforma_redes_publicar_ahora", { p_id: fila.id }],
  ["plataforma_redes_cancelar", { p_id: fila.id }],
  ["plataforma_redes_pausar", { p_pausa: true }],
  ["plataforma_redes_probar", { p_red: "tiktok", p_archivo: "x.mp4" }],
  ["plataforma_redes_resolver", { p_id: fila.id, p_salio: true, p_url: null }],
];
const RPC_SERVIDOR = [
  ["redes_tomar", { p_limite: 5, p_bloqueo_min: 1 }],
  ["redes_secreto_leer", { p_nombre: "tiktok" }],
  ["redes_secreto_guardar", { p_nombre: "tiktok", p_valor: "{}" }],
];

async function sinAcceso(nombre, c) {
  for (const t of ["redes_publicaciones", "redes_ajustes"]) {
    const { data, error } = await c.from(t).select("*").limit(5);
    if (!error && data?.length) hallazgo(`${nombre} lee ${t} (${data.length} filas)`);
    const ins = await c.from(t).insert(t === "redes_ajustes" ? { clave: "x", valor: "y" } : { video: "x", red: "instagram", formato: "reel", archivo: "x", programada_at: new Date().toISOString() });
    if (!ins.error) hallazgo(`${nombre} inserta en ${t}`);
    const upd = await c.from(t).update({ updated_at: new Date().toISOString() }).neq("id", "00000000-0000-0000-0000-000000000000").select("id");
    if (!upd.error && upd.data?.length) hallazgo(`${nombre} actualiza ${t}`);
  }
  for (const [f, args] of [...RPC_PLATAFORMA, ...RPC_SERVIDOR]) {
    const { error } = await c.rpc(f, args);
    if (!error) hallazgo(`${nombre} llama ${f}`);
  }
  bien(`${nombre}: sin lectura, sin escritura, sin funciones`);
}

console.log("\n1. Sin sesión de la plataforma");
await sinAcceso("anon", cliente(null));
for (const rol of ["admin", "recepcion", "cliente"]) {
  const id = await miembro(rol);
  if (!id) { console.log(`  · sin ${rol} en Ludogteka`); continue; }
  await sinAcceso(`${rol} de Ludogteka`, cliente(await tokenDe(id)));
}

console.log("\n2. La administración de la plataforma");
const { data: pa } = await A.from("plataforma_admins").select("profile_id").is("deleted_at", null).limit(1).maybeSingle();
if (!pa) console.log("  · no hay admin de plataforma en desarrollo");
else {
  const c = cliente(await tokenDe(pa.profile_id), null);
  const { data, error } = await c.from("redes_publicaciones").select("id").eq("id", fila.id);
  if (error || data?.length !== 1) hallazgo(`la plataforma no lee redes_publicaciones (${error?.message ?? data?.length})`);
  else bien("la plataforma lee el calendario");
  const r = await c.rpc("plataforma_redes_pausar", { p_pausa: false });
  if (r.error) hallazgo(`la plataforma no puede pausar/reanudar: ${r.error.message}`);
  else bien("la plataforma pausa y reanuda");
  for (const [f, args] of RPC_SERVIDOR) {
    const { error: e } = await c.rpc(f, args);
    if (!e) hallazgo(`la plataforma llama ${f} (solo el servidor)`);
  }
  bien("la plataforma no toma publicaciones ni lee credenciales");
}

console.log("\n3. HTTP");
const pedir = (ruta, cab = {}) => new Promise((ok) => {
  const u = new globalThis.URL(BASE + ruta);
  http.get({ host: u.hostname, port: u.port, path: u.pathname, headers: { Host: "plataforma.localhost:3001", ...cab } }, (res) => { res.resume(); ok({ status: res.statusCode, location: res.headers.location }); })
    .on("error", () => ok({ status: 0 }));
});
const sin = await pedir("/api/cron/redes");
const falso = await pedir("/api/cron/redes", { Authorization: "Bearer falso" });
if (sin.status === 0) console.log("  · el servidor no contesta: se salta la parte HTTP");
else {
  if (sin.status !== 401 || falso.status !== 401) hallazgo(`/api/cron/redes sin CRON_SECRET contesta ${sin.status}/${falso.status}`);
  else bien("/api/cron/redes sin CRON_SECRET: 401");
  const p = await pedir("/plataforma/redes");
  if (!(p.status >= 300 && p.status < 400 && String(p.location).includes("/plataforma/entrar"))) hallazgo(`/plataforma/redes sin sesión contesta ${p.status} ${p.location ?? ""}`);
  else bien("/plataforma/redes sin sesión manda a entrar");
}

// Limpieza (secret key): lo que la auditoría creó.
await A.from("redes_publicaciones").delete().in("archivo", ["auditoria.mp4", "x.mp4"]);
await A.from("redes_publicaciones").delete().eq("video", "auditoria");
await A.rpc("plataforma_redes_pausar", { p_pausa: false });

console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s)` : "\n✔ Sin hallazgos");
process.exit(hallazgos.length ? 1 : 0);
