// Uso: node scripts/plataforma/sembrar-pruebas-b.mjs     (SOLO DESARROLLO; idempotente)
//
// Arma «Patitas Pruebas B» (slug patitas-pruebas-b), el negocio de prueba EXCLUSIVO del carril B (la PC),
// para que sus auditorías no escriban en Huellitas (carril A) al mismo tiempo que las del otro carril.
//   · plan Completo con todos los módulos prendidos (Veterinaria incluida);
//   · un admin, dos recepciones, una estética y un MVZ de prueba (designado con cédula);
//   · datos mínimos por las mismas funciones que usa la app: clientes, perros, una cuenta cobrada,
//     turno de caja abierto, contrato, empleado, gasto, reportes (los siembra negocio-prueba-dev.mjs
//     con `--slug patitas-pruebas-b`).
// Deja los ids para las auditorías en la carpeta temporal (peludesk-negocio-patitas-pruebas-b.json).
// Nunca producción: se niega si .env.local no apunta al proyecto de desarrollo, y ni siquiera tiene
// una opción --prod.
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { A, URL, env, tokenDe } from "../auditoria/sesiones-dev.mjs";
import { SLUG_CARRIL_B, archivoDatos, datosDelNegocio } from "../auditoria/lib/negocio-prueba.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");
if (process.argv.includes("--prod")) throw new Error("Este negocio de prueba no existe ni se siembra en producción.");

const SLUG = SLUG_CARRIL_B;
const NOMBRE = "Patitas Pruebas B";
const aqui = path.dirname(fileURLToPath(import.meta.url));
const exigir = (r, que) => {
  if (r.error) throw new Error(`${que}: ${r.error.message}`);
  return r.data;
};

// 1. El negocio y sus datos mínimos (mismo sembrado que Huellitas, con su propia marca).
const hijo = spawnSync(
  process.execPath,
  [path.join(aqui, "..", "auditoria", "negocio-prueba-dev.mjs"), "--slug", SLUG, "--nombre", NOMBRE, "--zona", "America/Tijuana", "--ciudad", "Tijuana"],
  { stdio: "inherit", env: process.env }
);
if (hijo.status !== 0) throw new Error(`negocio-prueba-dev.mjs terminó con ${hijo.status}`);

const datos = datosDelNegocio(SLUG);
const B = datos.B;
const SB = createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": B } } });
const comoPersona = async (id) =>
  createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${await tokenDe(id)}`, "x-negocio-id": B } },
  });
const ADM = await comoPersona(datos.adminB);

async function cuenta(email, nombre) {
  const { data: existente } = await A.rpc("usuario_por_email", { p_email: email });
  if (existente) return existente;
  const creado = exigir(
    await A.auth.admin.createUser({ email, password: `Prueba-${crypto.randomUUID()}`, email_confirm: true, user_metadata: { nombre_completo: nombre } }),
    `crear ${email}`
  );
  return creado.user.id;
}
const esMiembro = async (profileId) =>
  (await A.from("membresias").select("rol").eq("profile_id", profileId).eq("negocio_id", B).is("deleted_at", null).maybeSingle()).data;

// 2. Plan Completo + el complemento de página web (así quedan disponibles todos los módulos).
const { data: plan } = await A.from("planes").select("id").eq("nombre", "Completo").eq("tipo", "plan").single();
const { data: neg } = await A.from("negocios").select("plan_id, complementos").eq("id", B).single();
if (neg.plan_id !== plan.id || !(neg.complementos ?? []).includes("pagina_web")) {
  // Solo la administración de PeluDesk cambia el plan (plataforma_asignar_plan): entra con la sesión de una de sus cuentas.
  const { data: admins } = await A.from("plataforma_admins").select("profile_id").limit(1);
  if (!admins?.length) throw new Error("No hay administradores de la plataforma en desarrollo (scripts/plataforma/agregar-admin.mjs).");
  const PLAT = await comoPersona(admins[0].profile_id);
  const r = await PLAT.rpc("plataforma_asignar_plan", { p_negocio_id: B, p_plan_id: plan.id, p_complementos: ["pagina_web"], p_modulos_cortesia: [], p_motivo: "Negocio de prueba del carril B" });
  if (r.error) throw new Error(`No pude poner el plan Completo (${r.error.message}). Asígnalo en /plataforma/negocios y vuelve a correr.`);
}

// 3. Todos los módulos prendidos (los que no traen fila ya están prendidos; Veterinaria viene apagada).
const { data: catalogo } = await A.from("modulos").select("clave");
const { data: disponibles } = await ADM.rpc("modulos_activos");
const activos = new Set(Array.isArray(disponibles) ? disponibles.map((m) => (typeof m === "string" ? m : m.clave ?? m.modulo)) : []);
for (const { clave } of catalogo ?? []) {
  if (activos.has(clave)) continue;
  const r = await ADM.rpc("cambiar_modulo", { p_modulo: clave, p_activo: true, p_confirmado: true });
  if (r.error) console.log(`  · módulo ${clave}: ${r.error.message}`);
}

// 4. Segunda recepción (las auditorías de caja y de cobro agrupado la piden), estética y MVZ de prueba.
const recepcion2 = await cuenta(`recepcion2@${SLUG}.prueba`, `Recepción 2 ${NOMBRE} ${datos.marca}`);
if (!(await esMiembro(recepcion2))) {
  exigir(await SB.rpc("asignar_rol_staff", { p_user_id: recepcion2, p_rol: "recepcion", p_nombre_completo: `Recepción 2 ${NOMBRE} ${datos.marca}` }), "recepción 2");
}
const mvz = await cuenta(`mvz@${SLUG}.prueba`, `MVZ ${NOMBRE} ${datos.marca}`);
if (!(await esMiembro(mvz))) {
  exigir(await SB.rpc("asignar_rol_staff", { p_user_id: mvz, p_rol: "estetica", p_nombre_completo: `MVZ ${NOMBRE} ${datos.marca}` }), "MVZ");
}
const { data: yaMedico } = await SB.from("medicos_veterinarios").select("id").eq("negocio_id", B).eq("profile_id", mvz).is("deleted_at", null).maybeSingle();
if (!yaMedico) exigir(await ADM.rpc("guardar_medico_veterinario", { p_profile_id: mvz, p_cedula: "PRUEBAB0001", p_cpa: null }), "designar MVZ");

// 5. Resumen y datos para las auditorías (se agregan los ids nuevos al archivo).
const final = { ...datos, recepcion2, mvz };
fs.writeFileSync(archivoDatos(SLUG), JSON.stringify(final, null, 1));
const roles = (await A.from("membresias").select("rol").eq("negocio_id", B).is("deleted_at", null)).data ?? [];
const cuentaRol = (r) => roles.filter((x) => x.rol === r).length;
const { data: act } = await ADM.rpc("modulos_activos");
console.log(`\n${NOMBRE} (${SLUG}) ${B}`);
console.log(`  plan Completo: sí · módulos activos: ${JSON.stringify(act)}`);
console.log(`  admin ${cuentaRol("admin")} · recepción ${cuentaRol("recepcion")} · estética/MVZ ${cuentaRol("estetica")} · clientes con cuenta ${cuentaRol("cliente")}`);
console.log(`  ids para las auditorías → ${archivoDatos(SLUG)}`);
console.log(`  uso: node scripts/auditoria/<auditoria>.mjs  (desde la PC usa este negocio por omisión; --negocio <slug> para otro)`);
