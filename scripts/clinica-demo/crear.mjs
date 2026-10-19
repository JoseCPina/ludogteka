// Crea (o completa) el negocio INTERNO «Clínica Demo PeluDesk» en PRODUCCIÓN: plan Completo con Hotel y guardería,
// Estética y Veterinaria prendidos, personal de prueba (admin, recepción y un MVZ con rol de estética, cédula y CPA
// marcadas PRUEBA) y su teléfono de recepción. Idempotente: se puede volver a correr.
//
//   node scripts/clinica-demo/crear.mjs
//
// Usa la llave de servicio de producción leída al vuelo con el CLI (nunca se imprime). Las cuentas del personal se
// crean con una contraseña aleatoria que NO se guarda: para entrar se restablece desde /plataforma/personas.
import crypto from "node:crypto";
import { servicioSinNegocio, servicioEn, sesionDe, comoPersona, SLUG_CLINICA, NOMBRE_CLINICA, DOMINIO_CLINICA, TELEFONO_DUENO, guardarEstado, estado } from "../lib/prod.mjs";

const S = servicioSinNegocio();
const ok = (t) => console.log(`  ✔ ${t}`);
const falla = (t) => { console.log(`  ✘ ${t}`); process.exitCode = 1; };

// 1. El negocio.
let { data: neg } = await S.from("negocios").select("id, slug, plan, interno, plan_id").eq("slug", SLUG_CLINICA).is("deleted_at", null).maybeSingle();
if (!neg) {
  const r = await S.rpc("crear_negocio", { p_slug: SLUG_CLINICA, p_nombre: NOMBRE_CLINICA, p_zona_horaria: "America/Mexico_City", p_ciudad: "San Luis Potosí", p_dominio: null });
  if (r.error) throw new Error(`crear_negocio: ${r.error.message}`);
  neg = { id: r.data };
  ok(`negocio creado (${NOMBRE_CLINICA})`);
} else ok(`el negocio ya existe`);
const id = neg.id;
guardarEstado({ negocioId: id });

// 2. Plan Completo, página web, interno y exento del cobro.
const { data: completo } = await S.from("planes").select("id").eq("clave", "completo").eq("tipo", "plan").is("deleted_at", null).single();
const up = await S.from("negocios").update({ plan: "activo", plan_id: completo.id, complementos: ["pagina_web"], interno: true, cobro_exento: true, prueba_termina_at: null }).eq("id", id);
up.error ? falla(`plan/interno: ${up.error.message}`) : ok("plan Completo + página web, interno, exento del cobro");

// 3. Personal.
const N = servicioEn(id);
async function cuenta(correo, nombre) {
  let { data: uid } = await S.rpc("usuario_por_email", { p_email: correo });
  if (!uid) {
    const c = await S.auth.admin.createUser({ email: correo, password: crypto.randomBytes(18).toString("base64url"), email_confirm: true, user_metadata: { nombre_completo: nombre } });
    if (c.error) throw new Error(`crear cuenta ${correo}: ${c.error.message}`);
    uid = c.data.user.id;
  }
  return uid;
}
const gente = {
  admin: ["admin@clinicademo.peludesk.mx", "Admin Clínica Demo"],
  recepcion: ["recepcion@clinicademo.peludesk.mx", "Recepción Clínica Demo"],
  mvz: ["mvz@clinicademo.peludesk.mx", "MVZ PRUEBA Clínica Demo"],
};
const ids = {};
for (const [k, [correo, nombre]] of Object.entries(gente)) ids[k] = await cuenta(correo, nombre);
const a1 = await S.rpc("agregar_admin_negocio", { p_negocio_id: id, p_profile_id: ids.admin });
a1.error ? falla(`admin: ${a1.error.message}`) : ok("admin asignado");
for (const [k, rol] of [["recepcion", "recepcion"], ["mvz", "estetica"]]) {
  const r = await N.rpc("asignar_rol_staff", { p_user_id: ids[k], p_rol: rol, p_nombre_completo: gente[k][1] });
  r.error ? falla(`${k}: ${r.error.message}`) : ok(`${gente[k][1]} con rol ${rol}`);
}
await S.from("profiles").update({ nombre_completo: gente.admin[1] }).eq("id", ids.admin);
guardarEstado({ personal: ids });

// 4. Veterinaria prendida y el MVZ designado (con la sesión del admin, como lo haría la app).
const { token } = await sesionDe(ids.admin);
const adm = comoPersona(token, id);
const m = await adm.rpc("cambiar_modulo", { p_modulo: "veterinaria", p_activo: true, p_confirmado: true });
m.error ? falla(`módulo veterinaria: ${m.error.message}`) : ok("módulo Veterinaria prendido");
const md = await adm.rpc("guardar_medico_veterinario", { p_profile_id: ids.mvz, p_cedula: "0000001", p_cpa: "PRUEBA-CPA-001" });
md.error ? falla(`MVZ: ${md.error.message}`) : ok("MVZ designado (cédula y CPA de PRUEBA)");
guardarEstado({ medicoId: md.data });
const { data: mods } = await adm.rpc("modulos_activos");
console.log("  módulos activos:", [].concat(mods ?? []).join(", "));

// 5. Teléfono de recepción (lo usa el recordatorio de dosis por WhatsApp).
const cupo = await N.from("cupo_configuracion").select("id").eq("negocio_id", id).is("deleted_at", null).maybeSingle();
if (cupo.data) {
  const u = await N.from("cupo_configuracion").update({ telefono_recepcion: TELEFONO_DUENO }).eq("id", cupo.data.id);
  u.error ? falla(`teléfono de recepción: ${u.error.message}`) : ok("teléfono de recepción puesto");
} else falla("el negocio no tiene cupo_configuracion");
console.log(`\nListo: https://${DOMINIO_CLINICA}  ·  id ${id}`);
console.log(JSON.stringify(estado().personal ? Object.keys(estado().personal) : []));
