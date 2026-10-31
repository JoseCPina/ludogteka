// Un médico veterinario designado en Huellitas mientras corre una auditoría (SOLO DESARROLLO). Huellitas no tiene
// ninguno vigente: la cuenta de estética que está en los dos negocios (`esteticaAmbos`) se designa médico con una
// cédula de prueba por la misma puerta que la app (`guardar_medico_veterinario`, con el JWT del admin) y se quita
// al terminar (`quitar_medico_veterinario`). Se designa ANTES de vencer la prueba: en solo lectura la base no deja.
// Si una corrida se corta, la siguiente quita primero el que quedó (archivo en la carpeta temporal).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { URL, env, tokenDe } from "../sesiones-dev.mjs";

const ESTADO = path.join(os.tmpdir(), "peludesk-auditoria-medico.json");

async function comoAdmin(B, adminId) {
  return createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${await tokenDe(adminId)}`, "x-negocio-id": B } },
  });
}

/** Quita el médico que dejó esta auditoría (o una corrida anterior cortada). */
export async function quitarMedicoTemporal() {
  if (!fs.existsSync(ESTADO)) return;
  const { B, adminId, medicoId } = JSON.parse(fs.readFileSync(ESTADO, "utf8"));
  const { error } = await (await comoAdmin(B, adminId)).rpc("quitar_medico_veterinario", { p_medico_id: medicoId });
  if (error && !/no existe|ya no/i.test(error.message)) throw new Error(`no se pudo quitar el médico de prueba: ${error.message}`);
  fs.rmSync(ESTADO, { force: true });
  console.log("  · médico de prueba de Huellitas quitado");
}

/** Designa a `profileId` médico en Huellitas y devuelve su id de médico. */
export async function designarMedicoTemporal({ B, adminId, profileId }) {
  await quitarMedicoTemporal();
  const cedula = String(90000000 + Math.floor(Math.random() * 9_999_999));
  const { data, error } = await (await comoAdmin(B, adminId)).rpc("guardar_medico_veterinario", { p_profile_id: profileId, p_cedula: cedula, p_cpa: null });
  if (error) throw new Error(`no se pudo designar el médico de prueba: ${error.message}`);
  fs.writeFileSync(ESTADO, JSON.stringify({ B, adminId, medicoId: data }));
  console.log("  · médico de prueba designado en Huellitas (se quita al terminar)");
  return data;
}
