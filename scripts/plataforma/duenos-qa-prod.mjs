// Cuentas de dueño para la QA en PRODUCCIÓN, SOLO en negocios de prueba («prueba-…», nunca Ludogteka ni la demo):
// por negocio, un cliente «PRUEBA Dueño App» con una mascota, cuenta con contraseña para entrar a la app de dueños
// (app.peludesk.mx y el APK: «Entrar con contraseña», teléfono + contraseña) y visitas FINALIZADAS de su mascota para
// poder dejar reseñas (estancia de hotel/guardería y cita de estética, según los módulos del negocio).
//
//   node scripts/plataforma/duenos-qa-prod.mjs --negocios prueba-qa-hotel-s62,prueba-qa-estetica-s62,prueba-qa-vet-s62
//
// Teléfonos ficticios del rango 442000xxxx (el del demo), uno por negocio. Si la cuenta ya existe, le pone contraseña
// nueva. La contraseña se genera aquí (claveAleatoria), se imprime UNA vez en la terminal para el dueño de PeluDesk y no
// se guarda en ningún archivo: no redirigir la salida de este script a un log.
import { createClient } from "@supabase/supabase-js";
import { URL_PROD, llavesProd, LUDOGTEKA_ID } from "../lib/prod.mjs";
import { claveAleatoria } from "../lib/clave.mjs";

const i = process.argv.indexOf("--negocios");
const SLUGS = (i > 0 ? process.argv[i + 1] : "").split(",").map((s) => s.trim()).filter(Boolean);
if (!SLUGS.length) throw new Error("Falta --negocios <slug,slug>.");
const sin = { auth: { persistSession: false, autoRefreshToken: false } };
const S = createClient(URL_PROD, llavesProd().servicio, sin);
const hoyMx = () => new Date(Date.now() - 6 * 3600_000).toISOString().slice(0, 10);
const restar = (f, d) => new Date(new Date(`${f}T12:00:00Z`).getTime() - d * 86400000).toISOString().slice(0, 10);

async function sesion(profileId) {
  const { data: u } = await S.auth.admin.getUserById(profileId);
  const { data: link, error: eL } = await S.auth.admin.generateLink({ type: "magiclink", email: u.user.email });
  if (eL) throw eL;
  const { data: s, error } = await createClient(URL_PROD, llavesProd().anon, sin).auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw error;
  return s.session;
}

const resultado = [];
for (const [k, slug] of SLUGS.entries()) {
  const { data: neg } = await S.from("negocios").select("id, slug, nombre, plan, dominio").eq("slug", slug).is("deleted_at", null).single();
  if (!neg || neg.id === LUDOGTEKA_ID || neg.plan === "demo" || !/^prueba/.test(neg.slug)) throw new Error(`«${slug}» no es un negocio de prueba.`);
  const SN = createClient(URL_PROD, llavesProd().servicio, { ...sin, global: { headers: { "x-negocio-id": neg.id } } });
  const telefono = `44200006${30 + k}`;
  const email = `t${telefono}@telefono.ludogteka.mx`;
  const clave = claveAleatoria();
  console.log(`\n${neg.nombre} (${slug}) · teléfono ${telefono}`);

  // 1. La persona (cuenta por teléfono, con contraseña).
  let { data: uid } = await S.rpc("usuario_por_email", { p_email: email }).then((r) => r, () => ({ data: null }));
  if (typeof uid !== "string") {
    const { data: lista } = await S.auth.admin.listUsers({ page: 1, perPage: 1000 });
    uid = lista?.users?.find((u) => u.email === email)?.id ?? null;
  }
  if (uid) {
    const { error } = await S.auth.admin.updateUserById(uid, { password: clave, email_confirm: true });
    if (error) throw new Error(`contraseña: ${error.message}`);
  } else {
    const { data: u, error } = await S.auth.admin.createUser({ email, password: clave, email_confirm: true, user_metadata: { nombre_completo: "PRUEBA Dueño App S63" } });
    if (error) throw new Error(`cuenta: ${error.message}`);
    uid = u.user.id;
  }
  await S.from("profiles").update({ nombre_completo: "PRUEBA Dueño App S63", telefono }).eq("id", uid);

  // 2. Cliente del negocio con su membresía y una mascota (el disparador la liga a la app del dueño).
  let { data: cli } = await SN.from("clientes").select("id").eq("negocio_id", neg.id).eq("telefono", telefono).is("deleted_at", null).maybeSingle();
  if (!cli) {
    const r = await SN.from("clientes").insert({ negocio_id: neg.id, nombre: "PRUEBA Dueño App S63", telefono }).select("id").single();
    if (r.error) throw new Error(`cliente: ${r.error.message}`);
    cli = r.data;
  }
  const { data: mem } = await SN.from("membresias").select("id").eq("negocio_id", neg.id).eq("profile_id", uid).is("deleted_at", null).maybeSingle();
  if (!mem) {
    const r = await SN.from("membresias").insert({ negocio_id: neg.id, profile_id: uid, rol: "cliente", cliente_id: cli.id });
    if (r.error) throw new Error(`membresía: ${r.error.message}`);
  }
  let { data: perro } = await SN.from("perros").select("id").eq("negocio_id", neg.id).eq("cliente_id", cli.id).is("deleted_at", null).limit(1).maybeSingle();
  if (!perro) {
    const { data: modelo } = await SN.from("perros").select("raza, raza_id, tamano_id, pelaje_id").eq("negocio_id", neg.id).not("tamano_id", "is", null).is("deleted_at", null).limit(1).maybeSingle();
    const r = await SN.from("perros").insert({ negocio_id: neg.id, cliente_id: cli.id, nombre: "PRUEBA Rocky App", ...(modelo ?? {}) }).select("id").single();
    if (r.error) throw new Error(`perro: ${r.error.message}`);
    perro = r.data;
  }
  const { data: vinc } = await S.from("mascotas_vinculos").select("mascota_id").eq("perro_id", perro.id).is("deleted_at", null).maybeSingle();
  console.log(`  ✔ cuenta, cliente y mascota${vinc ? " (ligada a la app)" : " (SIN liga a la app: revisar)"}`);

  // 3. Visitas finalizadas, con la sesión del admin del negocio (como en el mostrador).
  const { data: adm } = await SN.from("membresias").select("profile_id").eq("negocio_id", neg.id).eq("rol", "admin").is("deleted_at", null).order("created_at").limit(1).single();
  const sAdm = await sesion(adm.profile_id);
  const A = createClient(URL_PROD, llavesProd().anon, { ...sin, global: { headers: { "x-negocio-id": neg.id, Authorization: `Bearer ${sAdm.access_token}` } } });
  const { data: mods } = await A.rpc("modulos_activos");
  const activos = new Set((Array.isArray(mods) ? mods : []).map((m) => (typeof m === "string" ? m : m.modulo ?? m.clave)));
  const visitas = [];
  const hoy = hoyMx();
  if (activos.has("hotel") || activos.has("guarderia")) {
    const { data: ya } = await SN.from("estancias").select("id").eq("perro_id", perro.id).eq("estado", "finalizada").is("deleted_at", null).limit(1);
    if (ya?.length) visitas.push(`estancia ${ya[0].id.slice(0, 8)} (ya estaba)`);
    else {
      const cat = activos.has("hotel") ? "hotel" : "guarderia";
      const { data: serv } = await SN.from("servicios").select("id").eq("negocio_id", neg.id).eq("categoria", cat).is("deleted_at", null).limit(1).single();
      const { data: r } = await A.from("reservas").insert({ cliente_id: cli.id }).select("id").single();
      const entrada = restar(hoy, 1);
      const e = await A.from("estancias").insert({
        reserva_id: r.id, perro_id: perro.id, servicio_id: serv.id, fecha_entrada: entrada, fecha_salida: cat === "hotel" ? hoy : restar(hoy, 0),
        dia_cerrado_confirmado: "confirmado", bloqueo_sanitario_superado: true, motivo_excepcion_sanitaria: "Cuenta de QA",
        bloqueo_comportamiento_superado: true, motivo_excepcion_comportamiento: "Cuenta de QA",
      }).select("id").single();
      if (e.error) visitas.push(`estancia: ${e.error.message}`);
      else {
        const u1 = await A.from("estancias").update({ estado: "en_curso", entregado_por_nombre: "PRUEBA Dueño App S63", hora_entrada_real: new Date(Date.now() - 26 * 3600_000).toISOString(), checkin_fuera_horario: "confirmado" }).eq("id", e.data.id);
        const u2 = await A.from("estancias").update({ estado: "finalizada", recogido_por_nombre: "PRUEBA Dueño App S63", recogido_por_es_dueno: true, checkout_fuera_horario: "confirmado" }).eq("id", e.data.id);
        visitas.push(u1.error || u2.error ? `estancia: ${(u1.error ?? u2.error).message}` : `estancia ${e.data.id.slice(0, 8)} finalizada`);
      }
    }
  }
  if (activos.has("estetica")) {
    const { data: ya } = await SN.from("citas_estetica").select("id").eq("perro_id", perro.id).eq("estado", "finalizada").is("deleted_at", null).limit(1);
    if (ya?.length) visitas.push(`cita ${ya[0].id.slice(0, 8)} (ya estaba)`);
    else {
      const { data: base } = await SN.from("citas_estetica").select("servicio_id, empleado_id").eq("negocio_id", neg.id).is("deleted_at", null).not("empleado_id", "is", null).limit(1).maybeSingle();
      if (!base) visitas.push("cita: el negocio no tiene citas de estética de donde tomar servicio y estilista");
      else {
        const { data: reservaId } = await A.rpc("crear_reserva_para_cita", { p_perro_id: perro.id });
        const inicio = `${restar(hoy, 1)}T17:00:00+00:00`;
        const c = await A.from("citas_estetica").insert({ reserva_id: reservaId, perro_id: perro.id, servicio_id: base.servicio_id, empleado_id: base.empleado_id, inicio }).select("id").single();
        if (c.error) visitas.push(`cita: ${c.error.message}`);
        else {
          let error = null;
          for (const estado of ["confirmada", "en_curso", "finalizada"]) {
            const u = await A.from("citas_estetica").update({ estado }).eq("id", c.data.id);
            if (u.error) { error = `${estado}: ${u.error.message}`; break; }
          }
          visitas.push(error ? `cita: ${error}` : `cita ${c.data.id.slice(0, 8)} finalizada`);
        }
      }
    }
  }
  console.log(`  visitas: ${visitas.join(" · ") || "ninguna (el negocio no tiene guardería, hotel ni estética: las reseñas son de esas visitas)"}`);
  resultado.push({ negocio: slug, telefono, clave, visitas });
}

console.log("\nPARA EL DUEÑO DE PELUDESK (no se guarda en ningún lado):");
for (const r of resultado) console.log(`  ${r.negocio} · teléfono ${r.telefono} · contraseña ${r.clave}`);
