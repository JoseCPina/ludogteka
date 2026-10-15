// Cambiar el subdominio de un negocio existente, dejando el anterior como redirección (QA externa B2) — SOLO DESARROLLO.
//   node scripts/auditoria/subdominio-dev.mjs        (el tramo HTTP necesita `npm run build && npm run start -- -p 3001`)
// 1. Solo la plataforma lo cambia (admin de negocio, anónimo y recepción: no).
// 2. Validaciones: acentos y ñ, muy corto, reservado, ya en uso, el mismo, el de OTRO negocio que se mudó.
// 3. El anterior queda en negocios_slugs_anteriores; la dirección pública armada con el viejo se suelta; bitácora.
// 4. negocio_slug_actual (anónima) contesta el subdominio nuevo y nada más; un negocio suspendido no redirige.
// 5. Nadie toma un subdominio anterior (ni con la llave de servidor, ni slug_libre lo ofrece).
// 6. Volver a un subdominio propio anterior lo libera.
// 7. HTTP: el host viejo responde 308 al nuevo con la misma ruta y parámetros; el nuevo no redirige; uno desconocido da 404.
// 8. Borrar el negocio borra sus subdominios anteriores; auditoria_frontera() vacía.
import http from "node:http";
import { spawnSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, sesion, tokenDe } from "./sesiones-dev.mjs";
import { claveAleatoria } from "../lib/clave.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const ok = (c, t) => (c ? bien(t) : hallazgo(t));
const LUDO = "10000000-0000-4000-8000-000000000001";
const sufijo = String(Date.now()).slice(-6);
const personas = [];
const creados = [];
async function negocio(etiqueta, i) {
  const { data: u, error: e0 } = await A.auth.admin.createUser({ email: `aud-sub-${etiqueta}-${sufijo}@auditoria.invalid`, email_confirm: true, password: claveAleatoria() });
  if (e0) throw e0;
  personas.push(u.user.id);
  const tel = `55${sufijo}${i}1`.slice(0, 10);
  const { data, error } = await A.rpc("registrar_negocio_prueba", { p_nombre: `Aud Sub ${etiqueta} ${sufijo}`, p_ciudad: "Ciudad de México", p_telefono: tel, p_ip: `10.8.${i}.${sufijo.slice(-2)}`, p_persona_id: u.user.id, p_modelo: LUDO, p_dias: 15 });
  if (error) throw new Error(`registrar_negocio_prueba: ${error.message}`);
  const f = Array.isArray(data) ? data[0] : data;
  const n = { id: f.negocio_id, slug: f.slug, persona: u.user.id, telefono: tel };
  creados.push(n);
  return n;
}
const llamar = (opciones) => new Promise((resolve, reject) => {
  const r = http.request({ host: "127.0.0.1", port: 3001, path: opciones.path, method: "GET", headers: { host: opciones.host } }, (res) => {
    res.resume();
    res.on("end", () => resolve({ status: res.statusCode, location: res.headers.location ?? null }));
  });
  r.on("error", reject);
  r.setTimeout(30000, () => r.destroy(new Error("tiempo")));
  r.end();
});
const anonCli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

const { data: admins } = await A.from("plataforma_admins").select("profile_id").limit(1);
const P = await sesion(admins[0].profile_id);
try {
  const N1 = await negocio("uno", 1);
  const N2 = await negocio("dos", 2);
  const viejo = N1.slug;
  const nuevo = `aud-sub-${sufijo}`;
  const cambiar = (cli, id, slug) => cli.rpc("plataforma_cambiar_subdominio", { p_negocio_id: id, p_slug_nuevo: slug });

  console.log("── 1. Quién puede");
  const adminNeg = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(N1.persona)}`, "x-negocio-id": N1.id } } });
  const r1 = await cambiar(adminNeg, N1.id, nuevo);
  ok(r1.error && /administración de PeluDesk/.test(r1.error.message), `el admin del propio negocio no lo cambia («${r1.error?.message?.slice(0, 50)}»)`);
  const r2 = await cambiar(anonCli, N1.id, nuevo);
  ok(r2.error, "anónimo no lo cambia");
  ok((await A.from("negocios").select("slug").eq("id", N1.id).single()).data.slug === viejo, "y el subdominio sigue igual");

  console.log("── 2. Validaciones");
  for (const [slug, patron, etiqueta] of [
    ["prueba-estética", /sin acentos|minúsculas/, "con acento"], ["año-nuevo", /sin acentos|minúsculas/, "con ñ"], ["ab", /3 a 42|de 3/, "muy corto"],
    ["-guion", /guion/, "empieza con guion"], ["mi negocio", /minúsculas/, "con espacio"], ["www", /reservado/, "reservado"], ["huellitas", /ya lo usa/, "en uso por otro negocio"], [viejo, /ya es su subdominio/, "el mismo"],
  ]) {
    const r = await cambiar(P, N1.id, slug);
    ok(r.error && patron.test(r.error.message), `${etiqueta} → rechazado («${r.error?.message?.slice(0, 60)}»)`);
  }

  console.log("── 3. El cambio");
  await A.from("negocios").update({ url_publica: `https://${viejo}.peludesk.mx` }).eq("id", N1.id);
  const r3 = await cambiar(P, N1.id, nuevo.toUpperCase());
  ok(!r3.error && r3.data === nuevo, `cambia (y baja a minúsculas): ${r3.data ?? r3.error?.message}`);
  const fila = (await A.from("negocios").select("slug, url_publica").eq("id", N1.id).single()).data;
  ok(fila.slug === nuevo && fila.url_publica === null, "el negocio tiene el slug nuevo y la dirección pública armada con el viejo se soltó");
  const { data: ant } = await A.from("negocios_slugs_anteriores").select("slug, negocio_destino, deleted_at").eq("slug", viejo);
  ok(ant?.length === 1 && ant[0].negocio_destino === N1.id && !ant[0].deleted_at, "el anterior quedó en negocios_slugs_anteriores");
  const { data: ev } = await A.from("plataforma_eventos").select("accion, detalle").eq("negocio_id", N1.id).eq("accion", "cambiar_subdominio");
  ok(ev?.length === 1 && ev[0].detalle.de === viejo && ev[0].detalle.a === nuevo, "quedó en la bitácora de la plataforma");
  ok(((await P.from("negocios_slugs_anteriores").select("slug").eq("slug", viejo)).data ?? []).length === 1, "la plataforma lo ve");
  ok(((await adminNeg.from("negocios_slugs_anteriores").select("slug")).data ?? []).length === 0, "un admin de negocio no lo ve");

  console.log("── 4. negocio_slug_actual");
  const a1 = await anonCli.rpc("negocio_slug_actual", { p_slug: viejo });
  ok(a1.data === nuevo, "anónimo: el viejo contesta el nuevo");
  ok((await anonCli.rpc("negocio_slug_actual", { p_slug: "no-existe-xyz" })).data === null, "uno desconocido contesta nada");
  ok((await anonCli.rpc("negocio_slug_actual", { p_slug: nuevo })).data === null, "el subdominio vigente no redirige");
  await A.from("negocios").update({ activo: false }).eq("id", N1.id);
  ok((await anonCli.rpc("negocio_slug_actual", { p_slug: viejo })).data === null, "un negocio suspendido no redirige");
  await A.from("negocios").update({ activo: true }).eq("id", N1.id);

  console.log("── 5. Nadie toma el anterior");
  const r5 = await cambiar(P, N2.id, viejo);
  ok(r5.error && /fue de otro negocio/.test(r5.error.message), `otro negocio no lo puede escoger («${r5.error?.message?.slice(0, 50)}»)`);
  const r5b = await A.from("negocios").update({ slug: viejo }).eq("id", N2.id);
  ok(r5b.error && /fue de otro negocio/.test(r5b.error.message), "ni siquiera con la llave de servidor");
  const libre = await A.rpc("slug_libre", { p_base: viejo });
  ok(libre.data && libre.data !== viejo, `slug_libre no lo ofrece (${libre.data})`);

  console.log("── 6. Una segunda mudanza conserva las dos redirecciones");
  const nuevo2 = `aud-sub2-${sufijo}`;
  ok(!(await cambiar(P, N1.id, nuevo2)).error, "segunda mudanza");
  ok((await anonCli.rpc("negocio_slug_actual", { p_slug: viejo })).data === nuevo2 && (await anonCli.rpc("negocio_slug_actual", { p_slug: nuevo })).data === nuevo2, "los dos anteriores redirigen al vigente");

  console.log("── 7. HTTP (middleware)");
  const servidor = await llamar({ host: "huellitas.localhost:3001", path: "/" }).catch(() => null);
  if (!servidor) hallazgo("no hay servidor en el 3001 (npm run build && npm run start -- -p 3001)");
  else {
    const h = await llamar({ host: `${viejo}.localhost:3001`, path: "/portal/algo?x=1&y=a%20b" });
    ok(h.status === 308 && /^http:\/\/[^/]+\/portal\/algo\?x=1&y=a(\+|%20)b$/.test(h.location ?? "") && h.location.startsWith(`http://${nuevo2}.localhost:3001/`), `el host viejo → 308 al nuevo con ruta y parámetros (${h.status} ${h.location})`);
    const h2 = await llamar({ host: `${nuevo}.localhost:3001`, path: "/" });
    ok(h2.status === 308 && h2.location?.includes(nuevo2), "el intermedio también");
    const h3 = await llamar({ host: `${nuevo2}.localhost:3001`, path: "/login" });
    ok(h3.status !== 308 && h3.status !== 404, `el vigente no redirige (${h3.status})`);
    const h4 = await llamar({ host: `no-existe-${sufijo}.localhost:3001`, path: "/" });
    ok(h4.status === 404, `un subdominio que nunca existió da 404 (${h4.status})`);
  }

  console.log("── 8. Volver a uno propio");
  ok(!(await cambiar(P, N1.id, viejo)).error, "vuelve a su subdominio original");
  const { data: vuelta } = await A.from("negocios_slugs_anteriores").select("slug, deleted_at").eq("slug", viejo);
  ok(vuelta?.every((f) => f.deleted_at), "su redirección vieja se da de baja");
  ok((await anonCli.rpc("negocio_slug_actual", { p_slug: viejo })).data === null, "y ya no redirige");
  ok((await anonCli.rpc("negocio_slug_actual", { p_slug: nuevo })).data === viejo, "los otros siguen apuntando al vigente");
} finally {
  console.log("── 9. Limpieza y frontera");
  for (const n of creados) {
    const r = spawnSync("node", ["scripts/plataforma/eliminar-negocio.mjs", n.slug, "--telefono", n.telefono, "--aplicar"], { encoding: "utf8", env: process.env });
    const vivo = (await A.from("negocios").select("id").eq("id", n.id).maybeSingle()).data;
    ok(!vivo, `negocio de prueba borrado (${n.slug})${vivo ? ` — ${(r.stdout + r.stderr).slice(-300)}` : ""}`);
  }
  const { data: restos } = await A.from("negocios_slugs_anteriores").select("slug").in("negocio_destino", creados.map((n) => n.id));
  ok((restos ?? []).length === 0, "sus subdominios anteriores se borraron con el negocio");
  for (const p of personas) await A.auth.admin.deleteUser(p).catch(() => {});
  const { data: fr } = await A.rpc("auditoria_frontera");
  ok((fr ?? []).length === 0, "auditoria_frontera() vacía");
}
console.log(hallazgos.length ? `\nHALLAZGOS: ${hallazgos.length}` : "\n✔ Sin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
