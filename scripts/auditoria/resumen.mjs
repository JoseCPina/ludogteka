// Auditoría del resumen diario (desarrollo, JWT reales + llave anónima).
//
//   node scripts/auditoria/resumen.mjs [http://127.0.0.1:3001]
//
// Nadie sin sesión de la plataforma ve ni dispara nada:
//   - anon y los JWT de admin, recepción y cliente de Ludogteka: no leen
//     resumenes_diarios ni resumen_ajustes, no insertan, no actualizan, no
//     llaman plataforma_resumen_ajustes ni las funciones del servidor
//     (resumen_reservar, resumen_datos).
//   - la administración de la plataforma sí lee y cambia ajustes, pero NUNCA
//     llama resumen_reservar ni resumen_datos (solo el servidor).
//   - /api/cron/resumen sin CRON_SECRET (o con uno falso) da 401.
//   - /plataforma/resumen sin sesión manda a /plataforma/entrar.
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

// Una fila que todos deberían NO ver.
await A.from("resumenes_diarios").delete().eq("fecha", "2001-02-03");
const { data: fila, error: eFila } = await A.from("resumenes_diarios").insert({ fecha: "2001-02-03", estado: "enviado", origen: "manual", texto: "auditoria", partes: 1 }).select("id").single();
if (eFila) throw new Error(`no se pudo sembrar la fila: ${eFila.message}`);

const RPC_PLATAFORMA = [["plataforma_resumen_ajustes", { p_valores: { pausa: "no" } }]];
const RPC_SERVIDOR = [
  ["resumen_reservar", { p_fecha: "2001-02-04", p_origen: "cron", p_forzar: false }],
  ["resumen_datos", { p_dia: "2001-02-03", p_modo: "test", p_utm_campana: "x", p_horas_sin_contestar: 2 }],
];

async function sinAcceso(nombre, c) {
  for (const t of ["resumenes_diarios", "resumen_ajustes"]) {
    const { data, error } = await c.from(t).select("*").limit(5);
    if (!error && data?.length) hallazgo(`${nombre} lee ${t} (${data.length} filas)`);
    const ins = await c.from(t).insert(t === "resumen_ajustes" ? { clave: "x", valor: "y" } : { fecha: "2001-02-05", estado: "enviado" });
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

try {
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
    const { data, error } = await c.from("resumenes_diarios").select("id").eq("id", fila.id);
    if (error || data?.length !== 1) hallazgo(`la plataforma no lee resumenes_diarios (${error?.message ?? data?.length})`);
    else bien("la plataforma lee los resúmenes");
    const r = await c.rpc("plataforma_resumen_ajustes", { p_valores: { pausa: "no" } });
    if (r.error) hallazgo(`la plataforma no puede cambiar ajustes: ${r.error.message}`);
    else bien("la plataforma cambia ajustes");
    const mala = await c.rpc("plataforma_resumen_ajustes", { p_valores: { llave_secreta: "x" } });
    if (!mala.error) hallazgo("la función de ajustes acepta una clave desconocida");
    else bien("un ajuste desconocido se rechaza");
    for (const [f, args] of RPC_SERVIDOR) {
      const { error: e } = await c.rpc(f, args);
      if (!e) hallazgo(`la plataforma llama ${f} (solo el servidor)`);
    }
    bien("la plataforma no toma días ni lee los datos agregados (solo el servidor)");
  }

  console.log("\n3. HTTP");
  const pedir = (ruta, cab = {}) => new Promise((ok) => {
    const u = new globalThis.URL(BASE + ruta);
    http.get({ host: u.hostname, port: u.port, path: u.pathname, headers: { Host: "plataforma.localhost:3001", ...cab } }, (res) => { res.resume(); ok({ status: res.statusCode, location: res.headers.location }); })
      .on("error", () => ok({ status: 0 }));
  });
  const sin = await pedir("/api/cron/resumen");
  const falso = await pedir("/api/cron/resumen", { Authorization: "Bearer falso" });
  if (sin.status === 0) console.log("  · el servidor no contesta: se salta la parte HTTP");
  else {
    if (sin.status !== 401 || falso.status !== 401) hallazgo(`/api/cron/resumen sin CRON_SECRET contesta ${sin.status}/${falso.status}`);
    else bien("/api/cron/resumen sin CRON_SECRET: 401");
    const p = await pedir("/plataforma/resumen");
    if (!(p.status >= 300 && p.status < 400 && String(p.location).includes("/plataforma/entrar"))) hallazgo(`/plataforma/resumen sin sesión contesta ${p.status} ${p.location ?? ""}`);
    else bien("/plataforma/resumen sin sesión manda a entrar");
  }
} finally {
  await A.from("resumenes_diarios").delete().eq("fecha", "2001-02-03");
}
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s)` : "\n✔ Sin hallazgos");
process.exit(hallazgos.length ? 1 : 0);
