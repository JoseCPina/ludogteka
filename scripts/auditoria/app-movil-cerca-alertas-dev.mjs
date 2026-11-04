// App nativa · Fase 4 (Cerca de mí) y Fase 5 (Alertas) por /api/movil (SOLO DESARROLLO). docs/app-duenos/FASE-4.md y FASE-5.md
//
// Con la app prendida en el 3001 (npm run dev, o build + start):
//   node scripts/auditoria/app-movil-cerca-alertas-dev.mjs
//
// Con dos dueños de Huellitas (C1 y C2) que tienen cuenta y mascota:
//   Cerca de mí
//     1. Sin sesión, 401. Con sesión responde en el punto de un negocio del directorio y lo trae; una categoría que no
//        existe se rechaza. Los negocios PeluDesk van antes que los demás.
//     2. Las funciones del servidor (cerca_negocios_peludesk, cerca_cupo_hotel_esta_noche) no las llama un dueño ni la
//        llave anónima.
//   Alertas
//     3. C1 sube una alerta con una foto que trae metadatos (EXIF): la foto guardada ya no los trae.
//     4. Quien subió la alerta no aparece en ningún lado: C2 la ve en el mapa (es_mia = false) y en el detalle, y en
//        ninguna respuesta va el id de C1. Por la API, C2 no lee alertas_calle ni los mensajes; la llave anónima no lee
//        ni llama nada.
//     5. Avisos: C2 (con su zona a menos de 3 km) recibe «Vieron … cerca de ti». Si C2 tiene una mascota perdida de la
//        misma especie a menos de 5 km, recibe «¿Puede ser …?» y queda la coincidencia.
//     6. Anti abuso: una segunda alerta inmediata se rechaza; C1 no puede reportar la suya; C2 sí, una vez; un dueño no
//        puede moderar ni leer las métricas.
//     7. Actualización de C2 con estado «rescatado»: la alerta cambia y C1 recibe el aviso.
//     8. Mensajes: C2 escribe, C1 contesta a la «Persona 1», C2 ve la respuesta; ninguno ve ids del otro.
//     9. Caducidad: sin actividad en 72 horas, alertas_calle_caducar la deja «caducada».
// Limpia lo que crea.
import { createClient } from "@supabase/supabase-js";
import sharp from "sharp";
import { createHash } from "node:crypto";
import { A, URL, env } from "./sesiones-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
const BASE = `http://app.localhost:${Number(process.env.PUERTO_APP ?? 3001)}`;
const hallazgos = [];
const hallazgo = (t) => { hallazgos.push(t); console.log(`  ✘ ${t}`); };
const bien = (t) => console.log(`  ✔ ${t}`);
const revisa = (ok, t) => (ok ? bien(t) : hallazgo(t));

async function api(accion, args = [], token = null, form = null) {
  const headers = token ? { authorization: `Bearer ${token}` } : {};
  let body;
  if (form) {
    form.append("args", JSON.stringify(args));
    body = form;
  } else {
    headers["content-type"] = "application/json";
    body = JSON.stringify({ args });
  }
  const r = await fetch(`${BASE}/api/movil/${accion}`, { method: "POST", headers, body, signal: AbortSignal.timeout(90_000) });
  const texto = await r.text();
  let json = null;
  try { json = JSON.parse(texto); } catch { /* no es JSON */ }
  return { status: r.status, json, texto };
}

// ── Datos ─────────────────────────────────────────────────────────────────
const { data: hue } = await A.from("negocios").select("id").eq("slug", "huellitas").single();
const servicioH = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": hue.id } } });
const { data: miembros } = await servicioH.from("membresias").select("profile_id, cliente_id").eq("negocio_id", hue.id).eq("rol", "cliente").is("deleted_at", null).not("cliente_id", "is", null).limit(40);
const duenos = [];
for (const m of miembros ?? []) {
  const { data: c } = await servicioH.from("clientes").select("telefono").eq("id", m.cliente_id).is("deleted_at", null).maybeSingle();
  const { data: ms } = await A.from("mascotas").select("id, especie, perdida_at, perdida_lat, perdida_lng, perdida_nota, encontrada_at").eq("dueno_id", m.profile_id).is("deleted_at", null).eq("fallecido", false).limit(1);
  if (c?.telefono && ms?.length) duenos.push({ id: m.profile_id, telefono: c.telefono, mascota: ms[0] });
  if (duenos.length >= 2) break;
}
if (duenos.length < 2) throw new Error("Huellitas necesita dos dueños con cuenta y mascota en la app (corre negocio-prueba-dev.mjs y app-duenos-dev.mjs).");
const [C1, C2] = duenos;
const { data: zonas } = await A.from("duenos").select("id, lat, lng").in("id", [C1.id, C2.id]);
const zonaAntes = new Map((zonas ?? []).map((z) => [z.id, z]));
// Un punto con negocios en el directorio de desarrollo (o, si no hay, San Luis Potosí).
const { data: unProspecto } = await A.from("prospectos").select("id, lat, lng, nombre").not("lat", "is", null).is("deleted_at", null).neq("etapa", "descartado").is("principal_id", null).limit(1).maybeSingle();
const P = unProspecto ? { lat: unProspecto.lat, lng: unProspecto.lng } : { lat: 22.1565, lng: -100.9855 };
const creadas = [];
const inicioPrueba = new Date().toISOString();

async function entrar(tel) {
  const p = await api("pedirCodigo", [tel]);
  const id = p.json?.entrada?.id;
  if (!id) throw new Error(`pedirCodigo ${p.status}: ${p.texto.slice(0, 200)}`);
  await A.from("app_entradas").update({ estado: "verificada", verificada_at: new Date().toISOString() }).eq("id", id);
  const c = await api("canjearEntrada", [id]);
  if (!c.json?.tokens?.accessToken) throw new Error(`canjear: ${c.texto.slice(0, 200)}`);
  return c.json.tokens.accessToken;
}
const limpiar = async () => {
  if (creadas.length) {
    const { data: fotos } = await A.from("alertas_calle").select("foto_path").in("id", creadas);
    const { data: fotosAct } = await A.from("alertas_calle_actualizaciones").select("foto_path").in("alerta_id", creadas);
    const paths = [...(fotos ?? []), ...(fotosAct ?? [])].map((f) => f.foto_path).filter(Boolean);
    if (paths.length) await A.storage.from("alertas-calle").remove(paths);
    await A.from("alertas_calle").delete().in("id", creadas);
  }
  await A.from("app_avisos").delete().in("dueno_id", [C1.id, C2.id]).eq("tipo", "alerta").gte("created_at", inicioPrueba);
  await A.from("app_entradas").delete().in("telefono", [C1.telefono, C2.telefono]).gte("created_at", inicioPrueba);
  for (const d of [C1, C2]) {
    const z = zonaAntes.get(d.id);
    await A.from("duenos").update({ lat: z?.lat ?? null, lng: z?.lng ?? null }).eq("id", d.id);
    await A.from("mascotas").update({ perdida_at: d.mascota.perdida_at, perdida_lat: d.mascota.perdida_lat, perdida_lng: d.mascota.perdida_lng, perdida_nota: d.mascota.perdida_nota, encontrada_at: d.mascota.encontrada_at }).eq("id", d.mascota.id);
  }
};

try {
  const t1 = await entrar(C1.telefono);
  const t2 = await entrar(C2.telefono);
  const comoC2 = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${t2}` } } });
  const anon = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });

  console.log("1. Cerca de mí");
  revisa((await api("cercaDeMi", [P.lat, P.lng, "veterinaria"])).status === 401, "sin sesión, 401");
  revisa(Boolean((await api("cercaDeMi", [P.lat, P.lng, "no-existe"], t1)).json?.error), "una categoría que no existe se rechaza");
  for (const cat of ["veterinaria", "estetica", "hotel"]) {
    const r = await api("cercaDeMi", [P.lat, P.lng, cat], t1);
    const ls = r.json?.lugares ?? [];
    revisa(r.status === 200 && Array.isArray(ls), `${cat}: responde (${ls.length} lugares)`);
    const primerNoPeluDesk = ls.findIndex((l) => !l.enPeluDesk);
    revisa(primerNoPeluDesk === -1 || ls.slice(primerNoPeluDesk).every((l) => !l.enPeluDesk), `${cat}: los negocios PeluDesk van primero`);
    revisa(ls.every((l) => typeof l.lat === "number" && typeof l.distanciaM === "number"), `${cat}: cada lugar trae ubicación y distancia`);
    if (cat === "veterinaria" && unProspecto) revisa(ls.some((l) => l.id === `d:${unProspecto.id}`), `veterinaria: trae el negocio del directorio de ese punto (${unProspecto.nombre}) o no es veterinaria`);
  }
  console.log("2. Funciones solo del servidor");
  for (const [fn, args] of [["cerca_negocios_peludesk", { p_lat: P.lat, p_lng: P.lng, p_km: 5 }], ["cerca_cupo_hotel_esta_noche", {}], ["alerta_calle_coincidencias", { p_alerta: "00000000-0000-0000-0000-000000000000" }], ["alertas_calle_caducar", {}]]) {
    const { error: e1 } = await comoC2.rpc(fn, args);
    const { error: e2 } = await anon.rpc(fn, args);
    revisa(Boolean(e1) && Boolean(e2), `${fn}: ni un dueño ni la llave anónima la llaman`);
  }

  console.log("3. Subir una alerta (foto sin metadatos)");
  // Las zonas: C2 a ~1 km del punto; la mascota de C2, perdida a ~1 km y de la misma especie que la alerta.
  await A.from("duenos").update({ lat: P.lat + 0.008, lng: P.lng }).eq("id", C2.id);
  await A.from("mascotas").update({ perdida_at: new Date(Date.now() - 2 * 86_400_000).toISOString(), perdida_lat: P.lat + 0.006, perdida_lng: P.lng + 0.004, perdida_nota: "Auditoría", encontrada_at: null }).eq("id", C2.mascota.id);
  const conExif = await sharp({ create: { width: 640, height: 480, channels: 3, background: { r: 180, g: 120, b: 60 } } }).jpeg().withExif({ IFD0: { Copyright: "MARCA-EXIF-AUDITORIA", Artist: "Auditoria" } }).toBuffer();
  revisa(Boolean((await sharp(conExif).metadata()).exif), "la foto de prueba trae EXIF");
  const form = new FormData();
  form.append("foto", new Blob([conExif], { type: "image/jpeg" }), "calle.jpg");
  for (const [k, v] of Object.entries({ tipo: "perdido", especie: C2.mascota.especie, descripcion: "Auditoría: perro con collar rojo", color: "café", tamano: "mediano", lat: String(P.lat), lng: String(P.lng), precision: "8" })) form.append(k, v);
  const crear = await api("crearAlerta", ["$form"], t1, form);
  const alertaId = crear.json?.id;
  if (alertaId) creadas.push(alertaId);
  revisa(crear.status === 200 && Boolean(alertaId), `C1 publica la alerta (avisados: ${crear.json?.avisados ?? "?"}, coincidencias: ${crear.json?.coincidencias ?? "?"})`);
  if (!alertaId) throw new Error(crear.texto.slice(0, 300));
  const { data: fila } = await A.from("alertas_calle").select("foto_path, autor_id").eq("id", alertaId).single();
  const { data: archivo } = await A.storage.from("alertas-calle").download(fila.foto_path);
  const meta = await sharp(Buffer.from(await archivo.arrayBuffer())).metadata();
  revisa(!meta.exif && !meta.xmp && !meta.iptc, "la foto guardada ya no trae metadatos (EXIF, XMP, IPTC)");
  const carpeta = createHash("sha256").update(`${C1.id}:alertas-calle`).digest("hex").slice(0, 24);
  revisa(fila.foto_path.startsWith(`${carpeta}/`) && !fila.foto_path.includes(C1.id) && fila.autor_id === C1.id, "la alerta queda a nombre de C1 en la base y la carpeta de la foto no lleva su id");

  console.log("4. Nunca se sabe quién la subió");
  const cerca2 = await api("alertasCerca", [P.lat, P.lng, 10], t2);
  const vista = (cerca2.json?.alertas ?? []).find((a) => a.id === alertaId);
  revisa(Boolean(vista) && vista.es_mia === false, "C2 la ve en el mapa, como ajena");
  revisa(!cerca2.texto.includes(C1.id), "en la lista de alertas no va el id de C1");
  const det2 = await api("alerta", [alertaId], t2);
  revisa(det2.status === 200 && !det2.texto.includes(C1.id), "el detalle (con la URL de su foto) no trae el id de C1");
  const det1 = await api("alerta", [alertaId], t1);
  revisa(det1.json?.alerta?.es_mia === true, "C1 la ve como suya");
  const { data: directo } = await comoC2.from("alertas_calle").select("id, autor_id").eq("id", alertaId);
  revisa((directo ?? []).length === 0, "C2 no lee la alerta (ni su autor) directo por la API");
  const { data: anonA } = await anon.from("alertas_calle").select("id").limit(1);
  const { error: anonRpc } = await anon.rpc("alertas_calle_cerca", { p_lat: P.lat, p_lng: P.lng, p_km: 10 });
  revisa((anonA ?? []).length === 0 && Boolean(anonRpc), "la llave anónima no lee alertas ni llama la función");

  console.log("5. Avisos al publicar");
  const { data: avisosC2 } = await A.from("app_avisos").select("titulo, datos").eq("dueno_id", C2.id).eq("tipo", "alerta").gte("created_at", inicioPrueba);
  const coincide = (avisosC2 ?? []).some((a) => /Puede ser/.test(a.titulo));
  const cerca = (avisosC2 ?? []).some((a) => /cerca de ti/.test(a.titulo));
  revisa(coincide || cerca, `C2 recibió un aviso (${coincide ? "«¿Puede ser…?»" : "«cerca de ti»"})`);
  const { data: coinc } = await A.from("alertas_calle_coincidencias").select("mascota_id").eq("alerta_id", alertaId);
  revisa((coinc ?? []).some((x) => x.mascota_id === C2.mascota.id), "queda la coincidencia con la mascota perdida de C2");
  const { data: coincC2 } = await comoC2.from("alertas_calle_coincidencias").select("alerta_id, mascota_id").eq("alerta_id", alertaId);
  revisa((coincC2 ?? []).length === 1, "C2 ve la coincidencia de SU mascota por la API");
  const { data: avisosC1 } = await A.from("app_avisos").select("id").eq("dueno_id", C1.id).eq("tipo", "alerta").gte("created_at", inicioPrueba);
  revisa((avisosC1 ?? []).length === 0, "a C1 no le llega el aviso de su propia alerta");

  console.log("6. Anti abuso");
  const f2 = new FormData();
  f2.append("foto", new Blob([conExif], { type: "image/jpeg" }), "otra.jpg");
  for (const [k, v] of Object.entries({ tipo: "herido", especie: "perro", lat: String(P.lat), lng: String(P.lng) })) f2.append(k, v);
  const otra = await api("crearAlerta", ["$form"], t1, f2);
  if (otra.json?.id) creadas.push(otra.json.id);
  revisa(Boolean(otra.json?.error) && /minutos/.test(otra.json.error), `una segunda alerta inmediata se rechaza («${otra.json?.error ?? ""}»)`);
  revisa(Boolean((await api("reportarAlerta", [alertaId, "falsa", ""], t1)).json?.error), "C1 no puede reportar su propia alerta");
  revisa(!(await api("reportarAlerta", [alertaId, "falsa", "auditoría"], t2)).json?.error, "C2 la reporta");
  await api("reportarAlerta", [alertaId, "falsa", "otra vez"], t2);
  const { data: rep } = await A.from("alertas_calle").select("reportes, oculta_at").eq("id", alertaId).single();
  revisa(rep.reportes === 1 && !rep.oculta_at, "un reporte por persona: cuenta 1 y no la esconde");
  const { error: mod } = await comoC2.rpc("plataforma_alerta_calle_moderar", { p_id: alertaId, p_accion: "borrar", p_motivo: "x" });
  const { error: met } = await comoC2.rpc("app_alertas_metricas");
  revisa(Boolean(mod) && Boolean(met), "un dueño no modera ni lee las métricas");

  console.log("7. Actualización");
  const fa = new FormData();
  fa.append("texto", "Auditoría: lo llevaron con una vet");
  fa.append("estado", "rescatado");
  const act = await api("actualizarAlerta", [alertaId, "$form"], t2, fa);
  revisa(!act.json?.error, "C2 la actualiza como «rescatado»");
  const { data: tras } = await A.from("alertas_calle").select("estado, resuelta_at").eq("id", alertaId).single();
  revisa(tras.estado === "rescatado" && Boolean(tras.resuelta_at), "la alerta queda «rescatado»");
  const { data: avAct } = await A.from("app_avisos").select("titulo").eq("dueno_id", C1.id).eq("tipo", "alerta").gte("created_at", inicioPrueba);
  revisa((avAct ?? []).some((a) => /rescataron/i.test(a.titulo)), "a C1 le llega «Lo rescataron»");

  console.log("8. Mensajes relevados");
  revisa(!(await api("mensajeAlerta", [alertaId, "Auditoría: ¿sigue ahí?", null], t2)).json?.error, "C2 le escribe a quien la subió");
  revisa(!(await api("mensajeAlerta", [alertaId, "Auditoría: sí, gracias", 1], t1)).json?.error, "C1 contesta a la «Persona 1»");
  const hilo2 = await api("alerta", [alertaId], t2);
  const msjs = hilo2.json?.alerta?.mensajes ?? [];
  revisa(msjs.length === 2 && msjs.some((m) => !m.mio && /gracias/.test(m.texto)), "C2 ve su mensaje y la respuesta");
  revisa(!hilo2.texto.includes(C1.id) && !(await api("alerta", [alertaId], t1)).texto.includes(C2.id), "ninguno ve el id del otro");
  const { data: msjDirecto, error: msjError } = await comoC2.from("alertas_calle_mensajes").select("para_id").eq("alerta_id", alertaId);
  revisa(Boolean(msjError) || (msjDirecto ?? []).length === 0, "C2 no lee los mensajes directo por la API (no ve a quién le escribió)");

  console.log("9. Caducidad");
  await A.from("alertas_calle").update({ estado: "sigue_ahi", resuelta_at: null, ultima_actividad_at: new Date(Date.now() - 73 * 3_600_000).toISOString() }).eq("id", alertaId);
  const { data: n } = await A.rpc("alertas_calle_caducar");
  const { data: cad } = await A.from("alertas_calle").select("estado").eq("id", alertaId).single();
  revisa(Number(n) >= 1 && cad.estado === "caducada", "sin actividad en 72 horas queda «caducada»");
  const sinCaducada = await api("alertasCerca", [P.lat, P.lng, 10], t2);
  revisa(!(sinCaducada.json?.alertas ?? []).some((a) => a.id === alertaId), "y deja de salir en el mapa");
} finally {
  await limpiar();
}

console.log(hallazgos.length ? `\n${hallazgos.length} hallazgo(s).` : "\nSin hallazgos.");
process.exit(hallazgos.length ? 1 : 0);
