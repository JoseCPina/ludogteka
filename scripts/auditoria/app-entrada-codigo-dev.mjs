// Entrar con un código de 6 dígitos (SOLO DESARROLLO, con dobles de WhatsApp y de SMS). docs/app-duenos/APP-NATIVA.md
//
// La app compilada con los dobles (en otra terminal):
//   WHATSAPP_GRAPH_URL=http://127.0.0.1:4456 WHATSAPP_TOKEN=wa-prueba WHATSAPP_PHONE_NUMBER_ID=PHONE_PRUEBA \
//   SMS_API_URL=http://127.0.0.1:4456 npm run start -- -p 3001
//   node scripts/auditoria/app-entrada-codigo-dev.mjs
//
// Prueba por /api/movil y por la pantalla web:
//   1. WhatsApp: sale la plantilla de autenticación con el código en cuerpo y botón; un código equivocado no entra y dice
//      cuántos intentos quedan; el correcto entrega tokens que sirven; no se reusa.
//   2. Plantilla sin aprobar: con la ventana cerrada sale por SMS con la huella para el SMS Retriever; con la ventana
//      abierta, por mensaje de sesión. «Mandar por SMS» va directo a SMS.
//   3. Reglas: reenvío con espera; solo sirve el último; vence a los 10 minutos; 5 intentos y bloqueo por número.
//   4. El código nunca se guarda ni se devuelve; la llave anónima no lee la tabla.
//   5. La web app.peludesk.mx entra con el mismo código.
import http from "node:http";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env } from "./sesiones-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const PUERTO = Number(process.env.PUERTO_APP ?? 3001);
const HOST_APP = `app.localhost:${PUERTO}`;
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const revisa = (ok, t) => (ok ? console.log(`  ✔ ${t}`) : hallazgo(t));
const seccion = (t) => console.log(`\n── ${t}`);

const mock = { wa: [], sms: [], plantillaAprobada: true };
const doble = http.createServer(async (req, res) => {
  let cuerpo = "";
  for await (const c of req) cuerpo += c;
  const json = (s, o) => { res.writeHead(s, { "Content-Type": "application/json" }); res.end(JSON.stringify(o)); };
  if (req.method === "POST" && /\/messages$/.test(req.url ?? "")) {
    const m = JSON.parse(cuerpo || "{}");
    if (m.type === "template" && !mock.plantillaAprobada) return json(400, { error: { code: 132001, message: "Template name does not exist in the translation" } });
    mock.wa.push(m);
    return json(200, { messages: [{ id: `wamid.${randomUUID()}` }] });
  }
  if (req.method === "POST" && /Messages\.json$/.test(req.url ?? "")) {
    mock.sms.push(Object.fromEntries(new URLSearchParams(cuerpo)));
    return json(201, { sid: "SM-doble" });
  }
  return json(200, {});
});
await new Promise((r) => doble.listen(4456, "127.0.0.1", r));

function pedir(ruta, body) {
  return new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port: PUERTO, path: ruta, method: "POST", headers: { host: HOST_APP, "content-type": "application/json" } }, (res) => {
      let d = "";
      res.on("data", (c) => (d += c));
      res.on("end", () => {
        let j = null;
        try { j = JSON.parse(d); } catch { /* no es JSON */ }
        resolve({ status: res.statusCode, json: j, cuerpo: d });
      });
    });
    r.on("error", reject);
    r.setTimeout(90_000, () => r.destroy(new Error("tiempo")));
    r.write(JSON.stringify(body));
    r.end();
  });
}
const api = (accion, args = []) => pedir(`/api/movil/${accion}`, { args });

const SUFIJO = String(Date.now()).slice(-6);
const tel = (n) => `4429${n}${SUFIJO}`.slice(0, 10);
const telefonos = [tel(1), tel(2), tel(3), tel(4), tel(5), tel(6)];
const codigoDePlantilla = (m) => m?.template?.components?.[0]?.parameters?.[0]?.text;
const atras = (telefono) => A.from("app_codigos_entrada").update({ created_at: new Date(Date.now() - 61_000).toISOString() }).eq("telefono", telefono);
const nav = await abrirNavegador();

try {
  seccion("1. Por WhatsApp, con la plantilla");
  const T1 = telefonos[0];
  const p1 = await api("pedirCodigoEntrada", [T1]);
  revisa(p1.status === 200 && p1.json?.envio?.canal === "plantilla", `se manda con la plantilla (${p1.cuerpo.slice(0, 120)})`);
  const msg = mock.wa.at(-1);
  const cod1 = codigoDePlantilla(msg);
  revisa(msg?.template?.name === "peludesk_entrada_v1" && /^\d{6}$/.test(cod1 ?? ""), "la plantilla peludesk_entrada_v1 lleva 6 dígitos");
  revisa(msg?.template?.components?.[1]?.sub_type === "url" && msg.template.components[1].parameters[0].text === cod1, "el botón lleva el mismo código");
  revisa(!p1.cuerpo.includes(cod1), "la respuesta no trae el código");
  const { data: fila1 } = await A.from("app_codigos_entrada").select("*").eq("telefono", T1).single();
  revisa(fila1?.codigo_hash && !JSON.stringify(fila1).includes(cod1), "en la base solo queda el hash");
  const otro = cod1 === "000000" ? "000001" : "000000";
  const malo = await api("verificarCodigoEntrada", [T1, otro]);
  revisa(/no es/.test(malo.json?.error ?? "") && /4 intentos/.test(malo.json.error) && !malo.json.tokens, `equivocado no entra (${malo.json?.error})`);
  const bueno = await api("verificarCodigoEntrada", [T1, cod1]);
  revisa(bueno.json?.tokens?.accessToken && bueno.json?.tokens?.refreshToken, `el correcto entrega tokens (${bueno.json?.error ?? "ok"})`);
  const inicio = await new Promise((resolve, reject) => {
    const r = http.request({ host: "127.0.0.1", port: PUERTO, path: "/api/movil/yo", method: "POST", headers: { host: HOST_APP, "content-type": "application/json", authorization: `Bearer ${bueno.json?.tokens?.accessToken}` } }, (res) => { res.resume(); res.on("end", () => resolve(res.statusCode)); });
    r.on("error", reject);
    r.write(JSON.stringify({ args: [] }));
    r.end();
  });
  revisa(inicio === 200, `los tokens abren la app (${inicio})`);
  const otraVez = await api("verificarCodigoEntrada", [T1, cod1]);
  revisa(!otraVez.json?.tokens && /no sirve|Pide uno/.test(otraVez.json?.error ?? ""), "el código no se reusa");

  seccion("2. Plantilla sin aprobar");
  mock.plantillaAprobada = false;
  const T2 = telefonos[1];
  const s0 = mock.sms.length;
  const p2 = await api("pedirCodigoEntrada", [T2]);
  revisa(p2.json?.envio?.canal === "sms" && mock.sms.length === s0 + 1, `ventana cerrada: sale por SMS (${p2.cuerpo.slice(0, 100)})`);
  const sms = mock.sms.at(-1);
  revisa(sms?.To === `+52${T2}` && sms?.Body.startsWith("<#>") && sms?.Body.endsWith("vUXddizbZnP"), "el SMS trae lo que necesita el SMS Retriever");
  const codSms = /\b(\d{6})\b/.exec(sms?.Body ?? "")?.[1];
  revisa((await api("verificarCodigoEntrada", [T2, codSms])).json?.tokens, "el código del SMS entra");
  const T3 = telefonos[2];
  await A.from("wa_hilos").insert({ telefono: `52${T3}`, ultimo_entrante_at: new Date().toISOString() });
  const p3 = await api("pedirCodigoEntrada", [T3]);
  revisa(p3.json?.envio?.canal === "sesion" && mock.wa.at(-1)?.type === "text", `ventana abierta: mensaje de sesión (${p3.json?.envio?.canal ?? p3.cuerpo.slice(0, 100)})`);
  mock.plantillaAprobada = true;
  await atras(T3);
  const s1 = mock.sms.length;
  const p3b = await api("pedirCodigoEntrada", [T3, "sms"]);
  revisa(p3b.json?.envio?.canal === "sms" && mock.sms.length === s1 + 1, "«Mandar por SMS» va directo a SMS");

  seccion("3. Reglas");
  const T4 = telefonos[3];
  await api("pedirCodigoEntrada", [T4]);
  const c4a = codigoDePlantilla(mock.wa.at(-1));
  const pronto = await api("pedirCodigoEntrada", [T4]);
  revisa(/Espera \d+ segundos/.test(pronto.json?.error ?? ""), `no se reenvía de inmediato (${pronto.json?.error})`);
  await atras(T4);
  await api("pedirCodigoEntrada", [T4]);
  const c4b = codigoDePlantilla(mock.wa.at(-1));
  if (c4a !== c4b) revisa(!(await api("verificarCodigoEntrada", [T4, c4a])).json?.tokens, "el código anterior ya no sirve");
  await A.from("app_codigos_entrada").update({ expira_at: new Date(Date.now() - 1000).toISOString() }).eq("telefono", T4).is("usado_at", null);
  const vencido = await api("verificarCodigoEntrada", [T4, c4b]);
  revisa(/venció/.test(vencido.json?.error ?? "") && !vencido.json?.tokens, `vence a los 10 minutos (${vencido.json?.error})`);
  const T5 = telefonos[4];
  await api("pedirCodigoEntrada", [T5]);
  const c5 = codigoDePlantilla(mock.wa.at(-1));
  const { data: f5 } = await A.from("app_codigos_entrada").select("created_at, expira_at").eq("telefono", T5).single();
  const minutos = Math.round((Date.parse(f5.expira_at) - Date.parse(f5.created_at)) / 60000);
  revisa(minutos === 10, `dura ${minutos} minutos`);
  const equivocado = c5 === "111111" ? "222222" : "111111";
  let ultimo = null;
  for (let i = 0; i < 5; i++) ultimo = await api("verificarCodigoEntrada", [T5, equivocado]);
  revisa(/Demasiados intentos/.test(ultimo.json?.error ?? ""), `al quinto intento se bloquea (${ultimo.json?.error})`);
  revisa(!(await api("verificarCodigoEntrada", [T5, c5])).json?.tokens, "el código correcto ya no entra durante el bloqueo");
  await atras(T5);
  const bloqueado = await api("pedirCodigoEntrada", [T5]);
  revisa(/en pausa/.test(bloqueado.json?.error ?? ""), `tampoco se puede pedir otro (${bloqueado.json?.error})`);

  seccion("4. Quién lee la tabla");
  const anon = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const lectura = await anon.from("app_codigos_entrada").select("id").limit(1);
  revisa(Boolean(lectura.error) || !(lectura.data ?? []).length, "la llave anónima no la lee");

  seccion("5. La web usa el mismo código");
  const T6 = telefonos[5];
  const ctx = await nav.newContext({ viewport: { width: 390, height: 844 } });
  const pag = await ctx.newPage();
  pag.setDefaultTimeout(60_000);
  await pag.goto(`http://${HOST_APP}/entrar`, { waitUntil: "networkidle" });
  await pag.locator("#entrar-tel").fill(T6);
  await pag.getByRole("button", { name: /Mandarme mi código/ }).click();
  await pag.locator("[data-codigo-entrada]").waitFor();
  revisa((await pag.locator("[data-entrada-paso2]").innerText()).includes(T6.slice(-4)), "dice a qué número se mandó");
  await pag.locator("[data-codigo-entrada]").fill(codigoDePlantilla(mock.wa.at(-1)));
  await pag.waitForURL((u) => !u.pathname.startsWith("/entrar"), { timeout: 60_000 }).catch(() => {});
  revisa(!new globalThis.URL(pag.url()).pathname.startsWith("/entrar"), `entra y navega (${pag.url()})`);
  await ctx.close();
} finally {
  await nav.close();
  doble.close();
  // Limpieza: los códigos, las entradas y las cuentas de estos teléfonos de prueba.
  await A.from("app_codigos_entrada").delete().in("telefono", telefonos);
  await A.from("app_entradas").delete().in("telefono", telefonos);
  await A.from("wa_hilos").delete().in("telefono", telefonos.map((t) => `52${t}`));
  for (const t of telefonos) {
    const { data: email } = await A.rpc("email_de_persona_por_telefono", { p_telefono: t });
    if (typeof email === "string" && email) {
      const { data: lista } = await A.from("profiles").select("id").eq("telefono", t);
      for (const p of lista ?? []) await A.auth.admin.deleteUser(p.id).catch(() => {});
    }
  }
}
console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s)` : "\n✔ Sin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
