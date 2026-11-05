// Operación A1 (4 de noviembre de 2026, pedido del dueño): Dulce pasa a admin de Ludogteka con todos los permisos.
// Lo hace la PLATAFORMA con la sesión real de su administrador (agregar_admin_negocio: sube la membresía existente a
// admin y deja el evento en plataforma_eventos). Un admin tiene todos los permisos (tiene_permiso → is_admin).
//   node scripts/operacion/a1-dulce-admin.mjs --revisar      (no escribe)
//   LUDOGTEKA_OPERACION=1 node scripts/operacion/a1-dulce-admin.mjs --aplicar
// Reversa: desde /plataforma (o SQL operativo documentado) regresar la membresía a 'recepcion'.
import { leer, respaldar, LUDOGTEKA_ID } from "./ludogteka-prod.mjs";
import { tokenDe, comoPersona } from "./sesion-prod.mjs";

const APLICAR = process.argv.includes("--aplicar");
const DULCE = "5fcb4a04-3ca3-4533-b259-ea61eedaba43";
const PLATAFORMA = "cfb21109-1658-4e88-a02e-9adeb7116ea1"; // único admin de la plataforma (plataforma_admins)

const [m] = await leer(`membresias?negocio_id=eq.${LUDOGTEKA_ID}&profile_id=eq.${DULCE}&deleted_at=is.null&select=id,rol,updated_at,profiles(nombre_completo)`);
if (!m) throw new Error("Dulce no tiene membresía en Ludogteka.");
const permisos = await leer(`permisos_staff?negocio_id=eq.${LUDOGTEKA_ID}&profile_id=eq.${DULCE}&revocado_at=is.null&deleted_at=is.null&select=permiso`);
console.log(`Dulce (${m.profiles?.nombre_completo}) hoy: rol ${m.rol}; permisos por persona: ${permisos.map((p) => p.permiso).join(", ") || "ninguno"}`);
if (m.rol === "admin") { console.log("✔ Ya es admin: nada que hacer."); process.exit(0); }
if (!APLICAR) { console.log("Sin --aplicar no escribo nada. Con --aplicar: agregar_admin_negocio(Ludogteka, Dulce) con la sesión de la plataforma."); process.exit(0); }
if (process.env.LUDOGTEKA_OPERACION !== "1") throw new Error("Exige LUDOGTEKA_OPERACION=1.");
console.log("respaldo:", respaldar("a1-membresia-dulce", { membresia: m, permisos }));
const P = comoPersona(await tokenDe(PLATAFORMA), null);
await P.rpc("agregar_admin_negocio", { p_negocio_id: LUDOGTEKA_ID, p_profile_id: DULCE });
const [despues] = await leer(`membresias?negocio_id=eq.${LUDOGTEKA_ID}&profile_id=eq.${DULCE}&deleted_at=is.null&select=id,rol,updated_at`);
const [ev] = await leer(`plataforma_eventos?accion=eq.agregar_admin_negocio&negocio_id=eq.${LUDOGTEKA_ID}&persona_id=eq.${DULCE}&select=id,created_at&order=created_at.desc&limit=1`);
console.log(`✔ Dulce ahora: rol ${despues.rol} · evento de plataforma ${ev?.id ?? "(no registrado)"}`);
