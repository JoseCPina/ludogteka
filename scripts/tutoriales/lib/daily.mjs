// Las salas de videollamada que el corredor crea en el demo son REALES (Daily): se borran al terminar la grabación.
// La llave (DAILY_API_KEY) solo se lee del entorno de esta máquina (.env.local); nunca se imprime.
import fs from "node:fs";

function llave() {
  if (process.env.DAILY_API_KEY?.trim()) return process.env.DAILY_API_KEY.trim();
  try { return fs.readFileSync(".env.local", "utf8").match(/^DAILY_API_KEY=(.+)$/m)?.[1].trim() ?? ""; } catch { return ""; }
}

/** Borra en Daily las salas de las teleconsultas del demo y devuelve cuántas borró. `sb` = cliente de servicio con el negocio del demo. */
export async function borrarSalasDelDemo(sb, negocioId) {
  const k = llave();
  if (!k) return 0;
  const { data, error } = await sb.from("vet_telemedicina").select("sala_nombre").eq("negocio_id", negocioId).eq("proveedor", "daily");
  if (error) throw new Error(error.message);
  let n = 0;
  for (const { sala_nombre: nombre } of data ?? []) {
    const r = await fetch(`https://api.daily.co/v1/rooms/${encodeURIComponent(nombre)}`, { method: "DELETE", headers: { Authorization: `Bearer ${k}` }, signal: AbortSignal.timeout(20000) });
    if (r.ok || r.status === 404) n++;
  }
  return n;
}
