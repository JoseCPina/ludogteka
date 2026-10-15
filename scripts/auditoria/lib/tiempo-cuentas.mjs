// Mide cuentas_abiertas_json con la sesión real de un admin de Huellitas (RLS). Uso: node scripts/auditoria/lib/tiempo-cuentas.mjs [negocio_id admin_profile_id]
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { URL, env, tokenDe } from "../sesiones-dev.mjs";
const d = JSON.parse(fs.readFileSync(path.join(os.tmpdir(), "peludesk-negocio-b.json"), "utf8"));
const H = process.argv[2] ?? d.B, adm = process.argv[3] ?? d.adminB;
const c = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false }, global: { headers: { Authorization: `Bearer ${await tokenDe(adm)}`, "x-negocio-id": H } } });
for (let i = 0; i < 3; i++) {
  const t = Date.now();
  const r = await c.rpc("cuentas_abiertas_json", { p_dias: 30 });
  console.log(`intento ${i + 1}: ${Date.now() - t} ms · ${r.error ? "ERROR " + r.error.message : r.data.length + " cuentas"}`);
}
