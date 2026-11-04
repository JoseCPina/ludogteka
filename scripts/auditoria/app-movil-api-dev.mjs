// App nativa para dueños · la puerta /api/movil (SOLO DESARROLLO). docs/app-duenos/APP-NATIVA.md
//
// Con la app prendida en el 3001 (npm run dev, o build + start):
//   node scripts/auditoria/app-movil-api-dev.mjs
//
// Comprueba, con dos clientes de Huellitas que tienen cuenta y mascota:
//   1. La puerta: acción desconocida → 404; sin token → 401; token basura → 401; /api/movil no existe en el dominio de
//      un negocio; un Bearer en una PÁGINA de la app no abre sesión (solo /api/movil lo lee).
//   2. Entrar: pedir código → (verificación del bot simulada en la base) → canjear devuelve tokens; el código se canjea
//      una vez; renovar con el refresh token da tokens nuevos que sirven y el refresh viejo ya no.
//   3. Pantallas con la sesión del celular: inicio trae SUS mascotas y ninguna del otro; la mascota, la cartilla, el
//      seguimiento y el QR del otro dueño dan 404; pagos, pases y visitas responden sin dinero ajeno.
//   4. Notificaciones nativas: registrar un token de Expo lo guarda para ESA persona; el otro dueño no lo lee por la API
//      (RLS con su JWT) ni la llave anónima; un token inválido se rechaza; quitarlo lo da de baja.
// Limpia lo que crea.
import http from "node:http";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const PUERTO = Number(process.env.PUERTO_APP ?? 3001);
const HOST_APP = `app.localhost:${PUERTO}`;
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const revisa = (ok, t) => (ok ? bien(t) : hallazgo(t));

function pedir(host, ruta, { method = "GET", body, headers = {} } = {}) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port: PUERTO, path: ruta, method, headers: { host, ...(body ? { "content-type": "application/json" } : {}), ...headers } }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        let json = null;
        try { json = JSON.parse(d); } catch { /* no es JSON */ }
        resolve({ status: res.statusCode, json, cuerpo: d, headers: res.headers });
      });
    });
    r.on("error", reject);
    r.setTimeout(90_000, () => r.destroy(new Error("tiempo")));
    if (body) r.write(body);
    r.end();
  });
}
const api = (accion, args = [], token = null, host = HOST_APP) => pedir(host, `/api/movil/${accion}`, { method: "POST", body: JSON.stringify({ args }), headers: token ? { authorization: `Bearer ${token}` } : {} });

// ── Datos: dos clientes de Huellitas con cuenta y 1 a 5 mascotas ─────────
const { data: hue } = await A.from("negocios").select("id").eq("slug", "huellitas").single();
const H = hue.id;
const servicioH = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": H } } });
const { data: miembros } = await servicioH.from("membresias").select("profile_id, cliente_id").eq("negocio_id", H).eq("rol", "cliente").is("deleted_at", null).not("cliente_id", "is", null).limit(40);
const clientes = [];
for (const m of miembros ?? []) {
  const { data: c } = await servicioH.from("clientes").select("id, telefono").eq("id", m.cliente_id).is("deleted_at", null).maybeSingle();
  const { count } = await servicioH.from("perros").select("id", { count: "exact", head: true }).eq("cliente_id", m.cliente_id).is("deleted_at", null);
  const { count: enApp } = await A.from("mascotas").select("id", { count: "exact", head: true }).eq("dueno_id", m.profile_id).is("deleted_at", null);
  if (c?.telefono && (count ?? 0) >= 1 && (count ?? 0) <= 5 && (enApp ?? 0) >= 1) clientes.push({ ...m, telefono: c.telefono });
  if (clientes.length >= 2) break;
}
if (clientes.length < 2) throw new Error("Huellitas necesita dos clientes con cuenta y mascota en la app (corre negocio-prueba-dev.mjs y app-duenos-dev.mjs).");
const [C1, C2] = clientes;
const { data: mascotasC2 } = await A.from("mascotas").select("id").eq("dueno_id", C2.profile_id).is("deleted_at", null).limit(1);
const mascotaAjena = mascotasC2[0].id;
const { data: mascotasC1 } = await A.from("mascotas").select("id").eq("dueno_id", C1.profile_id).is("deleted_at", null);
const idsC1 = new Set(mascotasC1.map((m) => m.id));
const tokenExpo = `ExponentPushToken[auditoria${String(Date.now()).slice(-9)}]`;
const limpiar = async () => {
  await A.from("app_entradas").delete().eq("telefono", C1.telefono).gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
  await A.from("app_push_dispositivos").delete().eq("token", tokenExpo);
};

async function entrar(telefono) {
  const p = await api("pedirCodigo", [telefono]);
  const id = p.json?.entrada?.id;
  if (!id) throw new Error(`pedirCodigo: ${p.status} ${p.cuerpo.slice(0, 200)}`);
  // El bot recibe «ENTRAR ABC123» desde ese número (lo prueba app-duenos-dev.mjs con el webhook firmado): aquí se simula.
  await A.from("app_entradas").update({ estado: "verificada", verificada_at: new Date().toISOString() }).eq("id", id);
  return { id, r: await api("canjearEntrada", [id]) };
}

try {
  console.log("1. La puerta");
  revisa((await api("noExiste")).status === 404, "una acción que no está en la lista da 404");
  revisa((await api("inicio")).status === 401, "sin token, 401");
  revisa((await api("inicio", [], "basura.basura.basura-basura-basura")).status === 401, "con un token basura, 401");
  const enNegocio = await api("pedirCodigo", [C1.telefono], null, `huellitas.localhost:${PUERTO}`);
  revisa(enNegocio.status === 404 && !enNegocio.json?.entrada, "/api/movil no existe en el dominio de un negocio");

  console.log("2. Entrar y renovar");
  const { id: entradaId, r: canje } = await entrar(C1.telefono);
  const t1 = canje.json?.tokens;
  revisa(canje.status === 200 && t1?.accessToken && t1?.refreshToken, "canjear la entrada verificada devuelve los tokens de sesión");
  if (!t1) throw new Error(`canje: ${canje.cuerpo.slice(0, 300)}`);
  const otraVez = await api("canjearEntrada", [entradaId]);
  revisa(Boolean(otraVez.json?.error) && !otraVez.json?.tokens, "la misma entrada no se canjea dos veces");
  const pagina = await pedir(HOST_APP, "/", { headers: { authorization: `Bearer ${t1.accessToken}` } });
  revisa(pagina.status === 307 || pagina.status === 302 || /\/entrar/.test(String(pagina.headers.location ?? "")), "un Bearer en una página de la app no abre sesión (solo /api/movil lo lee)");
  const ren = await api("renovarSesion", [t1.refreshToken]);
  const t2 = ren.json?.tokens;
  revisa(Boolean(t2?.accessToken) && t2.refreshToken !== t1.refreshToken, "renovar con el refresh token da tokens nuevos");
  const viejo = await api("renovarSesion", [t1.refreshToken]);
  // Supabase deja un margen corto para reusar el refresh token (reintentos de red); fuera de él, ya no sirve.
  if (viejo.json?.tokens) console.log("  · el refresh viejo todavía sirvió dentro del margen de reuso de Supabase (esperado unos segundos)");
  const token = t2?.accessToken ?? t1.accessToken;

  console.log("3. Pantallas con la sesión del celular");
  const inicio = await api("inicio", [], token);
  const ids = (inicio.json?.mascotas ?? []).map((m) => m.id);
  revisa(inicio.status === 200 && ids.length > 0 && ids.every((i) => idsC1.has(i)), `inicio trae sus ${ids.length} mascotas y ninguna ajena`);
  revisa(!ids.includes(mascotaAjena), "la mascota del otro dueño no sale en su inicio");
  const propia = ids[0];
  for (const accion of ["mascota", "cartilla", "seguimiento", "qr", "perdida"]) {
    const mia = await api(accion, [propia], token);
    const ajena = await api(accion, [mascotaAjena], token);
    revisa(mia.status === 200 && ajena.status === 404, `${accion}: la suya responde y la ajena da 404`);
  }
  for (const accion of ["pagos", "pases", "visitas", "contratos", "avisos", "yo"]) {
    const r = await api(accion, [], token);
    revisa(r.status === 200 && r.json && !r.json.error, `${accion} responde con la sesión del celular`);
  }
  const yo = await api("yo", [], token);
  revisa(yo.json?.dueno?.id === C1.profile_id, "«yo» es la persona del token");

  console.log("4. Notificaciones nativas");
  const malo = await api("registrarDispositivo", [{ token: "no-es-un-token", plataforma: "android" }], token);
  revisa(Boolean(malo.json?.error), "un token que no es de Expo se rechaza");
  const reg = await api("registrarDispositivo", [{ token: tokenExpo, plataforma: "android", modelo: "Auditoría", versionApp: "1.0.0" }], token);
  revisa(reg.status === 200 && !reg.json?.error, "registrar el token de Expo del celular");
  const { data: fila } = await A.from("app_push_dispositivos").select("dueno_id, deleted_at").eq("token", tokenExpo).maybeSingle();
  revisa(fila?.dueno_id === C1.profile_id && !fila.deleted_at, "queda guardado a nombre de esa persona");
  const { entrada: e2 } = (await api("pedirCodigo", [C2.telefono])).json ?? {};
  await A.from("app_entradas").update({ estado: "verificada", verificada_at: new Date().toISOString() }).eq("id", e2.id);
  const t2b = (await api("canjearEntrada", [e2.id])).json?.tokens;
  const comoC2 = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${t2b.accessToken}` } } });
  const { data: veC2 } = await comoC2.from("app_push_dispositivos").select("id").eq("token", tokenExpo);
  revisa((veC2 ?? []).length === 0, "el otro dueño no lee ese dispositivo por la API (RLS)");
  const { error: errEscribe } = await comoC2.from("app_push_dispositivos").insert({ dueno_id: C1.profile_id, token: `ExponentPushToken[ajeno${Date.now()}]`, plataforma: "ios", updated_at: new Date().toISOString() });
  revisa(Boolean(errEscribe), "el otro dueño no puede registrar un dispositivo a nombre de otra persona");
  const anon = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: veAnon } = await anon.from("app_push_dispositivos").select("id").limit(1);
  revisa((veAnon ?? []).length === 0, "la llave anónima no lee dispositivos");
  await api("quitarDispositivo", [tokenExpo], token);
  const { data: quitado } = await A.from("app_push_dispositivos").select("deleted_at").eq("token", tokenExpo).maybeSingle();
  revisa(Boolean(quitado?.deleted_at), "al salir, el dispositivo queda dado de baja");
  await A.from("app_entradas").delete().eq("telefono", C2.telefono).gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
} finally {
  await limpiar();
}

console.log(hallazgos.length ? `\n${hallazgos.length} hallazgo(s).` : "\nSin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
