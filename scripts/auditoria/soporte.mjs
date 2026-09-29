// Soporte: aislamiento de tickets y conversaciones con el asistente (SOLO
// DESARROLLO, contra la API, con JWT reales y la llave anónima).
//
//   node scripts/auditoria/soporte.mjs
//
// En Huellitas (negocio de prueba) arma dos personas de recepción (R1, R2)
// y usa a su admin; Ludogteka es «el otro negocio» (solo se lee: nunca se
// crea nada ahí). Comprueba:
//   1. recepción ve SUS tickets y no los de la otra recepción; el admin ve
//      todos los de su negocio; el admin de Ludogteka no ve ninguno de
//      Huellitas (ni suplantando el encabezado del negocio).
//   2. la conversación con el asistente solo la ve quien la tuvo (ni el
//      admin de su negocio).
//   3. estética, un cliente y la llave anónima no crean ni leen nada.
//   4. las funciones de la plataforma y de la bandeja de Telegram no las
//      llama nadie con sesión de un negocio.
//   5. un ticket va y viene: PeluDesk contesta (service_role, como la
//      bandeja), a quien lo creó le sale el aviso, lo abre y se apaga; si
//      contesta un ticket resuelto, se reabre.
//   6. el bucket de capturas no se lista ni se lee con una sesión.
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const LUDOGTEKA = "10000000-0000-4000-8000-000000000001";
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);

const { data: huellitas } = await A.from("negocios").select("id").eq("slug", "huellitas").single();
const H = huellitas.id;
const servicio = (negocio) => createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": negocio } } });
const SH = servicio(H);
const jwt = async (profileId, negocio) =>
  createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${await tokenDe(profileId)}`, "x-negocio-id": negocio } },
  });
const miembro = async (negocio, rol) =>
  (await A.from("membresias").select("profile_id").eq("negocio_id", negocio).eq("rol", rol).is("deleted_at", null).order("created_at").limit(1).maybeSingle()).data?.profile_id;

// La segunda recepción de Huellitas (se crea una vez).
async function recepcion2() {
  const email = "recepcion2@huellitas.prueba";
  let { data: id } = await A.rpc("usuario_por_email", { p_email: email });
  if (!id) {
    const { data, error } = await A.auth.admin.createUser({ email, password: `Prueba-${crypto.randomUUID()}`, email_confirm: true, user_metadata: { nombre_completo: "Recepción 2 Huellitas" } });
    if (error) throw error;
    id = data.user.id;
  }
  const { data: m } = await A.from("membresias").select("rol").eq("negocio_id", H).eq("profile_id", id).is("deleted_at", null).maybeSingle();
  if (!m) {
    const { error } = await SH.rpc("asignar_rol_staff", { p_user_id: id, p_rol: "recepcion", p_nombre_completo: "Recepción 2 Huellitas" });
    if (error) throw error;
  }
  return id;
}

const idAdminH = await miembro(H, "admin");
const idR1 = await miembro(H, "recepcion");
const idR2 = await recepcion2();
const idEst = await miembro(H, "estetica");
const idCli = await miembro(H, "cliente");
const idAdminL = await miembro(LUDOGTEKA, "admin");
const adminH = await jwt(idAdminH, H);
const r1 = await jwt(idR1, H);
const r2 = await jwt(idR2, H);
const est = await jwt(idEst, H);
const cli = await jwt(idCli, H);
const adminL = await jwt(idAdminL, LUDOGTEKA);
const adminLComoH = await jwt(idAdminL, H);
const anon = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": H } } });

const marca = `auditoría ${new Date().toISOString().slice(0, 16)}`;
const crear = async (cli_, asunto, conversacion = null) =>
  cli_.rpc("crear_ticket", { p_asunto: asunto, p_descripcion: `Descripción ${marca}`, p_pantalla: "/caja", p_navegador: "auditoría", p_conversacion_id: conversacion, p_sin_documentar: false });
const ids = (r) => new Set((r.data ?? []).map((x) => x.id));

console.log("\n1. Quién ve qué ticket");
const { data: conv1, error: eConv } = await r1.rpc("asistente_guardar", { p_conversacion_id: null, p_pantalla: "/caja", p_pregunta: `¿Cómo cobro? ${marca}`, p_respuesta: "Así se cobra.", p_articulos: ["cobrar-una-cuenta"], p_sin_respuesta: false });
if (eConv) hallazgo(`R1 no pudo guardar su conversación: ${eConv.message}`);
const t1 = await crear(r1, `Ticket de R1 ${marca}`, conv1);
const t2 = await crear(r2, `Ticket de R2 ${marca}`);
if (t1.error || t2.error) hallazgo(`no se crearon los tickets: ${t1.error?.message ?? t2.error?.message}`);
const T1 = t1.data?.id;
const T2 = t2.data?.id;
const vistosR1 = ids(await r1.from("soporte_tickets").select("id"));
const vistosR2 = ids(await r2.from("soporte_tickets").select("id"));
const vistosAdm = ids(await adminH.from("soporte_tickets").select("id"));
if (!vistosR1.has(T1) || vistosR1.has(T2)) hallazgo("recepción 1 ve un ticket que no es suyo (o no ve el suyo)");
else bien("recepción ve sus tickets y no los de la otra recepción");
if (!vistosR2.has(T2) || vistosR2.has(T1)) hallazgo("recepción 2 ve un ticket que no es suyo");
const mensajesR2 = await r2.from("soporte_ticket_mensajes").select("id").eq("ticket_id", T1);
if ((mensajesR2.data ?? []).length) hallazgo("recepción 2 lee los mensajes del ticket de recepción 1");
const respR2 = await r2.rpc("responder_ticket", { p_ticket_id: T1, p_texto: "me meto" });
if (!respR2.error) hallazgo("recepción 2 pudo contestar el ticket de recepción 1");
else bien("recepción 2 no lee ni contesta el ticket de recepción 1");
if (!vistosAdm.has(T1) || !vistosAdm.has(T2)) hallazgo("el admin no ve todos los tickets de su negocio");
else bien("el admin ve todos los tickets de su negocio");
const deL = ids(await adminL.from("soporte_tickets").select("id"));
const deLComoH = ids(await adminLComoH.from("soporte_tickets").select("id"));
const msjL = await adminLComoH.from("soporte_ticket_mensajes").select("id").in("ticket_id", [T1, T2]);
const respL = await adminLComoH.rpc("responder_ticket", { p_ticket_id: T1, p_texto: "soy de otro negocio" });
if (deL.has(T1) || deL.has(T2) || deLComoH.size || (msjL.data ?? []).length || !respL.error) hallazgo("el admin de Ludogteka alcanzó tickets de Huellitas");
else bien("el admin de otro negocio no ve ni contesta tickets de Huellitas (ni suplantando el encabezado)");

console.log("\n2. Conversaciones con el asistente");
const convR1 = ids(await r1.from("soporte_conversaciones").select("id"));
const convAdm = ids(await adminH.from("soporte_conversaciones").select("id"));
const msjAdm = await adminH.from("soporte_mensajes_asistente").select("id").eq("conversacion_id", conv1);
const convR2 = ids(await r2.from("soporte_conversaciones").select("id"));
if (!convR1.has(conv1)) hallazgo("R1 no ve su conversación");
if (convAdm.has(conv1) || (msjAdm.data ?? []).length || convR2.has(conv1)) hallazgo("alguien más ve la conversación de R1 con el asistente");
else bien("la conversación con el asistente solo la ve quien la tuvo (ni el admin)");
const robo = await r2.rpc("asistente_guardar", { p_conversacion_id: conv1, p_pantalla: null, p_pregunta: "x", p_respuesta: "y", p_articulos: [], p_sin_respuesta: false });
const ticketRobo = await crear(r2, "robo", conv1);
if (!robo.error || !ticketRobo.error) hallazgo("R2 pudo escribir en la conversación de R1 o adjuntarla a su ticket");
else bien("nadie escribe en la conversación de otro ni la adjunta a su ticket");

console.log("\n3. Estética, cliente y llave anónima");
for (const [nombre, c] of [["estética", est], ["cliente", cli], ["anónima", anon]]) {
  const r = await crear(c, `no ${nombre}`);
  const lee = await c.from("soporte_tickets").select("id");
  const conv = await c.rpc("asistente_guardar", { p_conversacion_id: null, p_pantalla: null, p_pregunta: "x", p_respuesta: "y", p_articulos: [], p_sin_respuesta: false });
  if (!r.error || (lee.data ?? []).length || !conv.error) hallazgo(`${nombre} creó o leyó tickets o conversaciones`);
  else bien(`${nombre}: no crea tickets, no los lee y no usa el asistente`);
}
const directo = await r1.from("soporte_tickets").insert({ numero: 999, rol: "recepcion", asunto: "x", descripcion: "y", updated_at: new Date().toISOString() });
const cambio = await r1.from("soporte_tickets").update({ estado: "resuelto" }).eq("id", T1).select("id");
if (!directo.error || (cambio.data ?? []).length) hallazgo("recepción escribió directo en soporte_tickets");
else bien("nadie escribe directo en las tablas (solo por las funciones)");

console.log("\n4. Funciones de la plataforma");
for (const [nombre, c] of [["admin de Huellitas", adminH], ["anónima", anon]]) {
  const a = await c.rpc("plataforma_tickets", { p_estado: null });
  const b = await c.rpc("plataforma_responder_ticket", { p_ticket_id: T1, p_texto: "x", p_origen: "plataforma" });
  const d = await c.rpc("plataforma_ticket_de_telegram", { p_message_id: 1 });
  const e = await c.rpc("plataforma_anotar_telegram", { p_ticket_id: T1, p_message_id: 1 });
  if (!a.error || !b.error || !d.error || !e.error) hallazgo(`${nombre} llamó una función de la plataforma`);
  else bien(`${nombre}: las funciones de la plataforma y de la bandeja lo rechazan`);
}

console.log("\n5. Un ticket va y viene");
const resp = await A.rpc("plataforma_responder_ticket", { p_ticket_id: T1, p_texto: `Respuesta de PeluDesk ${marca}`, p_origen: "telegram" });
if (resp.error) hallazgo(`PeluDesk no pudo contestar: ${resp.error.message}`);
const aviso = (await r1.rpc("mis_tickets_con_respuesta")).data ?? [];
const avisoR2 = (await r2.rpc("mis_tickets_con_respuesta")).data ?? [];
const avisoAdm = (await adminH.rpc("mis_tickets_con_respuesta")).data ?? [];
if (!aviso.some((t) => t.id === T1)) hallazgo("a R1 no le sale el aviso de la respuesta");
else if (avisoR2.some((t) => t.id === T1) || avisoAdm.some((t) => t.id === T1)) hallazgo("el aviso de R1 le sale a alguien más");
else bien("a quien creó el ticket le sale el aviso (y a nadie más)");
const { data: estado1 } = await r1.from("soporte_tickets").select("estado").eq("id", T1).single();
if (estado1.estado !== "en_proceso") hallazgo(`contestar no lo pasó a «en proceso»: ${estado1.estado}`);
await r1.rpc("marcar_ticket_visto", { p_ticket_id: T1 });
if (((await r1.rpc("mis_tickets_con_respuesta")).data ?? []).some((t) => t.id === T1)) hallazgo("abrirlo no apagó el aviso");
else bien("al abrirlo se apaga el aviso");
await A.rpc("plataforma_estado_ticket", { p_ticket_id: T1, p_estado: "resuelto" });
const re = await r1.rpc("responder_ticket", { p_ticket_id: T1, p_texto: "Sigue pasando" });
const { data: estado2 } = await r1.from("soporte_tickets").select("estado").eq("id", T1).single();
const { data: hilo } = await r1.from("soporte_ticket_mensajes").select("autor").eq("ticket_id", T1).order("created_at");
if (re.error || estado2.estado !== "abierto" || hilo.map((m) => m.autor).join(",") !== "negocio,plataforma,negocio") hallazgo(`el hilo no va y viene bien: ${re.error?.message} ${estado2.estado} ${JSON.stringify(hilo)}`);
else bien("contestar un ticket resuelto lo reabre; el hilo queda negocio → PeluDesk → negocio");
const { data: todos } = await A.rpc("plataforma_tickets", { p_estado: null });
if (!(todos ?? []).some((t) => t.id === T1 && t.negocio)) hallazgo("la plataforma no ve el ticket con su negocio");
else bien("la plataforma lo ve en su lista con el nombre del negocio");

console.log("\n6. Capturas");
const lista = await r1.storage.from("soporte-capturas").list(H);
const bajada = await r1.storage.from("soporte-capturas").download(`${H}/${T1}/captura.png`);
const subida = await r1.storage.from("soporte-capturas").upload(`${H}/${T1}/x.png`, new Blob(["x"]), { contentType: "image/png" });
if ((lista.data ?? []).length || bajada.data || !subida.error) hallazgo("con una sesión se lista, baja o sube en el bucket de capturas");
else bien("el bucket de capturas no se toca con una sesión (lo sube y firma el servidor)");

// Limpieza: los tickets de la auditoría se dan de baja.
await SH.from("soporte_tickets").update({ deleted_at: new Date().toISOString() }).eq("negocio_id", H).like("asunto", `%${marca}%`);

console.log(hallazgos.length ? `\n✘ ${hallazgos.length} hallazgo(s).` : "\n✔ Sin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
