// Tramo 11 · Apagar Veterinaria con pendientes (pide confirmación, nada se borra) y volver a prenderla.
import { BASE, comprobar, seccion, cuerpo } from "../comun.mjs";

export async function tramo(c) {
  const S = c.S, NEG = c.e.negocioId, adm = c.api.admin;
  seccion("11a. Apagar con pendientes");
  const antes = await Promise.all(["vet_consultas", "carnet_vacunas", "hospitalizaciones", "vet_estimados"].map(async (t) => (await S.from(t).select("id", { count: "exact", head: true }).eq("negocio_id", NEG)).count));
  const imp = await adm.rpc("impacto_apagar_modulo", { p_modulo: "veterinaria" });
  comprobar(!imp.error, `impacto_apagar_modulo responde (${imp.error?.message ?? JSON.stringify(imp.data).slice(0, 120)})`);
  const sin = await adm.rpc("cambiar_modulo", { p_modulo: "veterinaria", p_activo: false, p_confirmado: false });
  comprobar(!!sin.error || sin.data?.requiere_confirmacion === true || JSON.stringify(sin.data ?? "").includes("confirm"), `sin confirmar, no apaga (${sin.error?.message ?? JSON.stringify(sin.data).slice(0, 100)})`);
  const rec = await c.api.recepcion.rpc("cambiar_modulo", { p_modulo: "veterinaria", p_activo: false, p_confirmado: true });
  comprobar(!!rec.error, `recepción sin «Administrar módulos» no puede apagarla (${rec.error?.message ?? "¡pudo!"})`);
  const ok = await adm.rpc("cambiar_modulo", { p_modulo: "veterinaria", p_activo: false, p_confirmado: true });
  comprobar(!ok.error, `con confirmación se apaga (${ok.error?.message ?? "ok"})`);

  seccion("11b. Apagada: se bloquea y no se pierde nada");
  const fila = await adm.rpc("modulos_activos");
  comprobar(!JSON.stringify(fila.data).includes("veterinaria"), "veterinaria sale de los módulos activos");
  const esc = await adm.rpc("vet_agendar_cita", { p_perro: c.e.perroLiga, p_tipo: "consulta", p_inicia: new Date(Date.now() + 864e5 * 9).toISOString(), p_medico: c.e.medicoId });
  comprobar(!!esc.error, `escribir con el módulo apagado se rechaza (${esc.error?.message?.slice(0, 70) ?? "¡pasó!"})`);
  const despues = await Promise.all(["vet_consultas", "carnet_vacunas", "hospitalizaciones", "vet_estimados"].map(async (t) => (await S.from(t).select("id", { count: "exact", head: true }).eq("negocio_id", NEG)).count));
  comprobar(JSON.stringify(antes) === JSON.stringify(despues), `no se borró nada (${antes} → ${despues})`);
  const q = await c.abrir("admin");
  await q.p.goto(`${BASE}/veterinaria`, { waitUntil: "networkidle" });
  const t = await cuerpo(q.p);
  comprobar(!/Nueva consulta|Agenda clínica/.test(t) || /apagad|módulo/i.test(t), "/veterinaria ya no abre la zona (aviso de módulo apagado)");
  await q.c.close();

  seccion("11c. Volver a prenderla");
  const on = await adm.rpc("cambiar_modulo", { p_modulo: "veterinaria", p_activo: true, p_confirmado: true });
  comprobar(!on.error, `se prende otra vez (${on.error?.message ?? "ok"})`);
  const volvio = await Promise.all(["vet_consultas", "carnet_vacunas", "hospitalizaciones", "vet_estimados"].map(async (t) => (await S.from(t).select("id", { count: "exact", head: true }).eq("negocio_id", NEG)).count));
  comprobar(JSON.stringify(antes) === JSON.stringify(volvio), "todo sigue ahí al prenderla");
  const q2 = await c.abrir("admin");
  await q2.p.goto(`${BASE}/veterinaria`, { waitUntil: "networkidle" });
  comprobar(/Veterinaria|consulta/i.test(await cuerpo(q2.p)), "/veterinaria abre de nuevo");
  await q2.c.close();
}
