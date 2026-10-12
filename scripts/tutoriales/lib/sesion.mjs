// Entrar a la app como una cuenta del CORREDOR en el demo (en DESARROLLO) sin pasar por /demo/entrar.
// Las del personal son gemelas de las de «Ver demo» (tutoriales.*, siempre con escritura: scripts/demo/cuentas-corredor.mjs);
// los dueños usan las mismas que el visitante y se abren solo mientras graba su video. La sesión sale de un enlace mágico de Auth (llave de servicio) y
// se pone como cookie del dominio del negocio demo.
import { createClient } from "@supabase/supabase-js";

export const CUENTAS = {
  admin: "tutoriales.admin@peludesk.mx",
  recepcion: "tutoriales.recepcion@peludesk.mx",
  estetica: "tutoriales.estetica@peludesk.mx",
  mvz: "demo.mvz@peludesk.mx", // Dr. Emilio Navarro, médico veterinario designado (lo siembra scripts/demo/sembrar-veterinaria.mjs)
  mvz2: "demo.mvz2@peludesk.mx", // Dra. Paulina Reyes
  cliente: "t4420000201@telefono.ludogteka.mx",
  clienteAna: "t4420000203@telefono.ludogteka.mx", // Ana Sofía Treviño: tiene un contrato por firmar
};

/** Cuentas de dueño: son las del visitante (solo lectura); el corredor las abre mientras graba. */
export const ROLES_DUENO = new Set(["cliente", "clienteAna"]);

export async function cookiesDe(c, rol, dominio, anon) {
  const email = CUENTAS[rol];
  if (!email) throw new Error(`Cuenta desconocida: ${rol}`);
  const { data: link, error: e1 } = await c.cliente.auth.admin.generateLink({ type: "magiclink", email });
  if (e1) throw new Error(`generateLink ${rol}: ${e1.message}`);
  const cli = createClient(c.url, anon, { auth: { persistSession: false } });
  const { data: s, error } = await cli.auth.verifyOtp({ type: "magiclink", token_hash: link.properties.hashed_token });
  if (error) throw new Error(`verifyOtp ${rol}: ${error.message}`);
  const valor = "base64-" + Buffer.from(JSON.stringify(s.session)).toString("base64url");
  const trozos = valor.match(/.{1,3180}/g);
  const nombre = `sb-${c.ref}-auth-token`;
  return (trozos.length === 1 ? [[nombre, valor]] : trozos.map((t, i) => [`${nombre}.${i}`, t])).map(([name, value]) => ({ name, value, domain: dominio, path: "/" }));
}
