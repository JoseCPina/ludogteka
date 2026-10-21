// QA S22 del 21 de octubre de 2026, EN PANTALLA (SOLO DESARROLLO, Huellitas). Con `npm run build && npm run start -- -p 3001`.
//
//   node scripts/auditoria/qa-s22-ui-dev.mjs
//
// N70.  «Cómo se cobra este servicio»: sin tramos, ejemplo ilustrativo marcado y «Capturar tramos»; con tramos, los reales
//       y «A 7 km se cobra $…» calculado con ellos.
// N111. Al firmar se guarda solo lo capturado: las etiquetas vacías de la plantilla no quedan ni se muestran.
// N112. El renglón de un medicamento sale una vez (portal y receta); las indicaciones solo si dicen algo más.
// N113. Check-out a 393 px: Notas a lo ancho con «Aplicar» debajo y «Sí, es el dueño / No, persona autorizada» apilados.
// 6.    Login con un solo admin: el aviso de recuperación manda a la ficha del cliente.
import { createClient } from "@supabase/supabase-js";
import { B, SB, A, URL, env, datos, rpc, personas, dar, quitar, fijarModulo, comprobar, seccion, terminar } from "./veterinaria-comun-dev.mjs";
import { abrirNavegador } from "../lib/navegador.mjs";

const REF = new globalThis.URL(URL).hostname.split(".")[0];
const sufijo = String(Date.now()).slice(-6);
const P = await personas();
const BASE = "http://huellitas.localhost:3001";

async function cookiesDe(profileId) {
  const { data: u } = await A.auth.admin.getUserById(profileId);
  const { data: link } = await A.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  const cli = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  const galletas = (nombre) => (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t]));
  return [...galletas(`sb-${REF}-auth-token`), ...galletas(`sb-${REF}-portal-auth-token`)].map(([name, value]) => ({ name, value, domain: "huellitas.localhost", path: "/" }));
}
const nav = await abrirNavegador();
const abrir = async (profileId, ancho = 393) => {
  const c = await nav.newContext({ viewport: { width: ancho, height: 860 } });
  if (profileId) await c.addCookies(await cookiesDe(profileId));
  const p = await c.newPage();
  p.setDefaultTimeout(45000);
  return { c, p };
};
const texto = async (p) => (await p.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ");
const limpieza = [];
const medicos = [];
const nuevoPerro = async (nombre) => {
  const r = await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `${nombre} ${sufijo}`, especie: "perro" }).select("id").single();
  if (r.error) throw new Error(r.error.message);
  limpieza.push(async () => { await SB.from("perros").update({ deleted_at: new Date().toISOString() }).eq("id", r.data.id); });
  return r.data.id;
};

try {
  await fijarModulo("veterinaria", true);
  await fijarModulo("inventario", true);
  const med = await rpc(P.admin, "guardar_medico_veterinario", { p_profile_id: P.recConId, p_cedula: String(Date.now()).slice(-7), p_cpa: null });
  medicos.push(med.cuerpo);

  seccion("N70. Cómo se cobra un servicio por kilómetro");
  {
    const nuevo = await SB.from("servicios").insert({ negocio_id: B, clave: `km_prueba_${sufijo}`, nombre: `Recolección prueba ${sufijo}`, categoria: "cargo", unidad: "km", depende_cantidad: true }).select("id").single();
    if (nuevo.error) throw new Error(`servicio km: ${nuevo.error.message}`);
    const id = nuevo.data.id;
    limpieza.push(async () => { await SB.from("servicios").update({ deleted_at: new Date().toISOString() }).eq("id", id); });
    const { c, p } = await abrir(datos.adminB, 393);
    await p.goto(`${BASE}/servicios/${id}`, { waitUntil: "networkidle" });
    const bloque = p.locator("[data-como-se-cobra]");
    const t1 = (await bloque.innerText()).replace(/\s+/g, " ");
    comprobar((await bloque.locator("[data-ejemplo-ilustrativo]").count()) === 1 && /cifras de ejemplo/.test(t1) && /A 7 kilómetros se cobraría 7 × \$8(\.00)? = \$56/.test(t1), `sin tramos: ejemplo ilustrativo marcado («${t1.slice(0, 200)}»)`);
    comprobar(((await bloque.locator("[data-capturar-tramos]").getAttribute("href")) ?? "") === `/servicios/${id}/tarifas#capturar-tramos`, "«Capturar tramos» lleva directo a la matriz");
    const tr = await SB.from("tarifas").insert([
      { negocio_id: B, servicio_id: id, cantidad_desde: 1, cantidad_hasta: 5, precio: 12, vigencia_desde: "2020-01-01" },
      { negocio_id: B, servicio_id: id, cantidad_desde: 6, cantidad_hasta: null, precio: 9, vigencia_desde: "2020-01-01" },
    ]);
    if (tr.error) comprobar(false, `no se guardaron los tramos de prueba: ${tr.error.message}`);
    await p.goto(`${BASE}/servicios/${id}`, { waitUntil: "networkidle" });
    const t2 = (await bloque.innerText()).replace(/\s+/g, " ");
    comprobar((await bloque.locator("[data-tramos-reales]").count()) === 1 && /A 7 kilómetros se cobra \$63/.test(t2) && !/Todavía no tiene precios/.test(t2), `con tramos: los reales y «A 7 kilómetros se cobra $63» («${t2.slice(0, 220)}»)`);
    await p.goto(`${BASE}/servicios/${id}/tarifas`, { waitUntil: "networkidle" });
    comprobar((await p.locator("#capturar-tramos").count()) === 1, "la pantalla de tarifas tiene el ancla de la matriz");
    await c.close();
  }

  seccion("N111. Consulta firmada sin etiquetas vacías");
  let consultaId;
  let perroRx;
  {
    await dar(P.admin, P.recConId, "emitir_recetas");
    perroRx = await nuevoPerro("S22");
    const ini = await rpc(P.recCon, "vet_consulta_iniciar", { p_perro: perroRx, p_cita: null, p_tipo: "consulta", p_medico: med.cuerpo });
    consultaId = ini.cuerpo;
    await rpc(P.recCon, "vet_consulta_guardar", {
      p_id: consultaId,
      p_datos: {
        motivo: "Revisión",
        anamnesis: "Tiempo de evolución:\nApetito y sed: normal\nMucosas:",
        examen_fisico: "Estado general:\nMucosas:\nGanglios:",
        plan: "Estudios solicitados:\nSeguimiento / próxima revisión:\nRecomendaciones al propietario:\n- Dieta blanda",
        tratamiento: "Amoxicilina 250 mg, 1 tableta VO cada 12 horas, 7 días",
        diagnosticos: [{ ref_id: null, origen: "libre", nombre: "Otitis", tipo: "definitivo", nota: "" }],
      },
    });
    const lineas = (await rpc(P.recCon, "vet_consulta_cargos", { p_consulta: consultaId })).cuerpo?.lineas ?? [];
    for (const l of lineas) await rpc(P.recCon, "vet_consulta_cargo_quitar", { p_id: l.id, p_motivo: "Sin cobro: prueba" });
    const f = await rpc(P.recCon, "vet_consulta_firmar", { p_id: consultaId });
    comprobar(f.ok, `consulta firmada (${f.mensaje ?? ""})`);
    const fila = (await SB.from("vet_consultas").select("anamnesis, examen_fisico, plan").eq("id", consultaId).single()).data;
    comprobar(fila.anamnesis === "Apetito y sed: normal", `anamnesis guardada solo con lo capturado («${fila.anamnesis}»)`);
    comprobar(!fila.examen_fisico, `examen físico sin nada capturado queda vacío («${fila.examen_fisico}»)`);
    comprobar(fila.plan === "Recomendaciones al propietario:\n- Dieta blanda", `plan: la etiqueta con contenido se queda, las vacías no («${fila.plan}»)`);
    const { c, p } = await abrir(datos.adminB, 393);
    await p.goto(`${BASE}/veterinaria/consulta/${consultaId}`, { waitUntil: "networkidle" });
    const t = await texto(p);
    comprobar(!/Tiempo de evolución:|Estudios solicitados:|Ganglios:/.test(t), "la vista del personal no enseña etiquetas vacías");
    comprobar(!/Examen físico/i.test((await p.locator("article").first().innerText()).replace(/Signos vitales[\s\S]*/, "")) || !fila.examen_fisico, "una sección vacía no sale");
    await c.close();
  }

  seccion("N112. Receta: el renglón una sola vez");
  {
    const linea = { insumo_id: null, producto: "Amoxicilina", dosis: "1 tableta", dosis_cantidad: 1, via: "Oral", frecuencia: "Cada 12 horas", frecuencia_horas: 12, duracion_dias: 7, cantidad_surtir: 14, indicaciones: "1 tableta cada 12 horas por 7 días" };
    const r = await rpc(P.recCon, "vet_receta_emitir", { p_perro: perroRx, p_consulta: consultaId, p_lineas: [linea], p_diagnostico: "Otitis", p_observaciones: null });
    comprobar(r.ok, `receta emitida (${r.mensaje ?? ""})`);
    const { c, p } = await abrir(datos.cuentaSoloB, 393);
    await p.goto(`${BASE}/portal/perros/${perroRx}`, { waitUntil: "networkidle" });
    const t = (await p.locator("[data-recetas-cliente]").innerText()).replace(/\s+/g, " ");
    const veces = (t.match(/cada 12 horas/gi) ?? []).length;
    comprobar(/Amoxicilina, 1 tableta, vía oral, cada 12 horas, por 7 días/.test(t) && veces === 1, `portal: «Amoxicilina, 1 tableta, vía oral, cada 12 horas, por 7 días» una sola vez (${veces})`);
    await c.close();
    const id = r.cuerpo?.id ?? r.cuerpo;
    if (id) {
      const { c: c2, p: p2 } = await abrir(P.recConId, 1100);
      await p2.goto(`${BASE}/veterinaria/recetas/${id}`, { waitUntil: "networkidle" });
      comprobar((await p2.locator("[data-indicaciones-extra]").count()) === 0, "receta impresa: sin indicaciones repetidas");
      await c2.close();
    }
    await quitar(P.admin, P.recConId, "emitir_recetas");
  }

  seccion("N113. Check-out a 393 px");
  {
    const { data: gD } = await SB.from("servicios").select("id").eq("negocio_id", B).eq("categoria", "guarderia").eq("unidad", "dia").is("deleted_at", null).limit(1).single();
    const perro = await nuevoPerro("S22 salida");
    const cliente = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false }, global: { headers: { Authorization: `Bearer ${P.admin}`, "x-negocio-id": B } } });
    const rG = (await cliente.from("reservas").insert({ cliente_id: datos.clienteSoloB }).select("id").single()).data;
    let d = new Date(Date.now() + 95 * 86400000);
    while (d.getUTCDay() === 0) d = new Date(d.getTime() + 86400000);
    const dia = d.toISOString().slice(0, 10);
    const sig = new Date(d.getTime() + 86400000).toISOString().slice(0, 10);
    const e = await cliente.from("estancias").insert({ reserva_id: rG.id, perro_id: perro, servicio_id: gD.id, fecha_entrada: dia, fecha_salida: sig, bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: "Prueba", bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: "Prueba" }).select("id").single();
    if (e.error) throw new Error(`estancia: ${e.error.message}`);
    limpieza.push(async () => { await SB.from("estancias").update({ deleted_at: new Date().toISOString() }).eq("id", e.data.id); });
    await SB.from("estancias").update({ estado: "en_curso", entregado_por_nombre: "Prueba" }).eq("id", e.data.id);
    const { c, p } = await abrir(datos.adminB, 393);
    await p.goto(`${BASE}/reservas/estancias/${e.data.id}/checkout`, { waitUntil: "networkidle" });
    const ancho = 393;
    const quien = p.locator("[data-quien-recoge] button");
    if (await quien.count()) {
      const cajas = await quien.evaluateAll((bs) => bs.map((b) => { const r = b.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }));
      comprobar(cajas.length === 2 && cajas[1].y > cajas[0].y && cajas.every((x) => x.w > ancho * 0.7 && x.h < 60), `«Sí, es el dueño» y «No, persona autorizada» apilados a lo ancho, en un renglón cada uno (${JSON.stringify(cajas)})`);
    } else comprobar(false, "no encontré los botones de quién recoge");
    const aplicar = p.locator("[data-aplicar-cargo]");
    if (await aplicar.count()) {
      const notas = p.getByPlaceholder("ej. Se dejó comida especial 3 días");
      const bN = await notas.boundingBox();
      const bA = await aplicar.boundingBox();
      comprobar(bN && bA && bN.width > ancho * 0.7 && bA.y > bN.y + bN.height - 2, `Notas a lo ancho y «Aplicar» debajo (${JSON.stringify({ bN, bA })})`);
    } else comprobar(false, "no encontré «Aplicar» de cargos");
    await c.close();
  }

  seccion("6. Recuperar contraseña con un solo admin");
  {
    const { count } = await SB.from("membresias").select("id", { count: "exact", head: true }).eq("negocio_id", B).eq("rol", "admin").is("deleted_at", null);
    const { c, p } = await abrir(null, 393);
    await p.goto(`${BASE}/login`, { waitUntil: "networkidle" });
    await p.getByRole("button", { name: "¿Olvidaste tu contraseña?" }).click();
    const uno = (await p.locator("[data-recuperar-un-admin]").count()) === 1;
    const t = await texto(p);
    if ((count ?? 0) <= 1) comprobar(uno && !/pídele a un admin/.test(t) && (await p.locator('[data-recuperar-un-admin] a[href="/clientes"]').count()) === 1, "con un admin: manda a la ficha del cliente, con el enlace");
    else comprobar(!uno && /pídele a un admin/.test(t), `con ${count} admins: «pídele a un admin»`);
    await c.close();
  }
} catch (e) {
  console.error(e);
  process.exitCode = 1;
} finally {
  for (const f of limpieza) await f().catch(() => {});
  for (const m of medicos) await SB.from("medicos_veterinarios").update({ deleted_at: new Date().toISOString() }).eq("id", m);
  await nav.close();
  terminar();
}
