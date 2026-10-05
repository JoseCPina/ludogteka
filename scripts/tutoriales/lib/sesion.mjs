// Entrar a la app como una cuenta del demo (en DESARROLLO) sin pasar por /demo/entrar
// (esas cuentas son de solo lectura; para grabar acciones de verdad se desbloquean
// en `preparar`). La sesión sale de un enlace mágico de Auth (llave de servicio) y
// se pone como cookie del dominio del negocio demo.
import { createClient } from "@supabase/supabase-js";

export const CUENTAS = {
  admin: "demo.admin@peludesk.mx",
  recepcion: "demo.recepcion@peludesk.mx",
  estetica: "demo.estetica@peludesk.mx",
  cliente: "t4420000201@telefono.ludogteka.mx",
  clienteAna: "t4420000203@telefono.ludogteka.mx", // Ana Sofía Treviño: tiene un contrato por firmar
};

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
