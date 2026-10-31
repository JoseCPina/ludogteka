import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { configWhatsApp, ClienteWA, graphBase, VERSION_GRAPH } from "@/lib/whatsapp/infra";
import { limpiarVariable } from "@/lib/recordatorios/plantillas";
import { telefonoDeCorreoSintetico } from "@/lib/auth/identidad";
import { urlApp } from "@/lib/negocio/host";
import perdida from "./plantilla-perdida.json";
import { enviarPush } from "./push";
import { crearAviso } from "./avisos";

/**
 * «Mascota perdida» (app para dueños, Fase 1). El dueño la marca perdida con su zona y una nota; se avisa por push y al
 * centro de avisos a los dueños de la app a 5 km (su zona guardada, redondeada a ~1 km), y por WhatsApp a los admins de
 * los negocios PeluDesk con sucursal a 15 km (plantilla peludesk_mascota_perdida_v1, solo si Meta la aprobó). El cartel
 * y el perfil público llevan el QR. «La encontré» la cierra con un toque y suma a la métrica pública.
 */
const KM_DUENOS = 5;
const KM_NEGOCIOS = 15;
let cachePlantilla: { ok: boolean; en: number } | null = null;

async function plantillaPerdidaAprobada(): Promise<boolean> {
  if (process.env.VERCEL_ENV !== "production" && process.env.WHATSAPP_GRAPH_URL) return true;
  if (cachePlantilla && Date.now() - cachePlantilla.en < 10 * 60_000) return cachePlantilla.ok;
  const cfg = configWhatsApp();
  const waba = process.env.PELUDESK_WABA_ID ?? "";
  if (!cfg.token || !waba) return false;
  try {
    const r = await fetch(`${graphBase()}/${VERSION_GRAPH}/${waba}/message_templates?fields=name,status,category&name=${perdida.nombre}`, { headers: { Authorization: `Bearer ${cfg.token}` }, signal: AbortSignal.timeout(10_000) });
    const j = (await r.json()) as { data?: { name: string; status: string; category: string }[] };
    const p = (j.data ?? []).find((x) => x.name === perdida.nombre);
    cachePlantilla = { ok: p?.status === "APPROVED" && p.category === "UTILITY", en: Date.now() };
  } catch {
    cachePlantilla = { ok: false, en: Date.now() };
  }
  return cachePlantilla.ok;
}

export type ResultadoAlerta = { duenosAvisados: number; pushEnviadas: number; negociosAvisados: number; negociosCerca: number; plantillaAprobada: boolean };

export async function avisarPerdida(mascotaId: string): Promise<ResultadoAlerta> {
  const db = createSupabaseAdminClient();
  const { data: m } = await db.from("mascotas").select("id, dueno_id, nombre, especie, sexo, raza_texto, token_publico, perdida_lat, perdida_lng, perdida_nota, perdida_at, encontrada_at").eq("id", mascotaId).maybeSingle();
  const r: ResultadoAlerta = { duenosAvisados: 0, pushEnviadas: 0, negociosAvisados: 0, negociosCerca: 0, plantillaAprobada: false };
  if (!m || !m.perdida_at || m.encontrada_at || m.perdida_lat == null || m.perdida_lng == null) return r;
  const especie = m.especie === "gato" ? (m.sexo === "hembra" ? "gata" : "gato") : m.especie === "perro" ? (m.sexo === "hembra" ? "perra" : "perro") : "mascota";
  const descripcion = `${especie}${m.raza_texto ? ` ${m.raza_texto}` : ""}`;
  const url = `${urlApp()}/m/${m.token_publico}`;
  const zona = m.perdida_nota?.trim() ? m.perdida_nota.trim().slice(0, 80) : "tu zona";

  // Dueños de la app a 5 km.
  const { data: cerca } = await db.rpc("app_duenos_cerca", { p_lat: m.perdida_lat, p_lng: m.perdida_lng, p_km: KM_DUENOS, p_excluir: m.dueno_id });
  for (const d of (cerca ?? []) as { dueno_id: string; distancia_km: number }[]) {
    const titulo = `Se perdió ${m.nombre} cerca de ti`;
    const cuerpo = `${descripcion[0].toUpperCase()}${descripcion.slice(1)}, a ${d.distancia_km < 1 ? "menos de 1 km" : `${Math.round(d.distancia_km)} km`}. Si la ves, avísale a su dueño desde su perfil.`;
    const { enviadas } = await enviarPush(d.dueno_id, { titulo, cuerpo, url: `/m/${m.token_publico}`, etiqueta: `perdida-${m.id}` });
    r.pushEnviadas += enviadas;
    await crearAviso({ duenoId: d.dueno_id, tipo: "perdida", titulo, cuerpo, url: `/m/${m.token_publico}`, mascotaId: null, push: false, datos: { mascota_id: m.id } });
    r.duenosAvisados += 1;
  }

  // Negocios PeluDesk a 15 km, por WhatsApp a sus admins (plantilla aprobada).
  const { data: negocios } = await db.rpc("app_negocios_cerca", { p_lat: m.perdida_lat, p_lng: m.perdida_lng, p_km: KM_NEGOCIOS });
  const lista = (negocios ?? []) as { negocio_id: string; nombre: string; slug: string; distancia_km: number }[];
  r.negociosCerca = lista.length;
  r.plantillaAprobada = lista.length ? await plantillaPerdidaAprobada() : false;
  const cfg = configWhatsApp();
  if (!lista.length || !r.plantillaAprobada || !cfg.token || !cfg.phoneNumberId) return r;
  const wa = new ClienteWA(cfg.token, cfg.phoneNumberId);
  for (const n of lista.slice(0, 30)) {
    const { data: admins } = await db.from("membresias").select("profile_id").eq("negocio_id", n.negocio_id).eq("rol", "admin").is("deleted_at", null).limit(3);
    const telefonos = new Set<string>();
    for (const a of (admins ?? []) as { profile_id: string }[]) {
      const { data: u } = await db.auth.admin.getUserById(a.profile_id);
      const tel = telefonoDeCorreoSintetico(u?.user?.email);
      if (tel) telefonos.add(tel);
    }
    let avisado = false;
    for (const tel of telefonos) {
      const res = await wa.plantillaConParametros(`52${tel}`, perdida.nombre, [limpiarVariable(n.nombre), limpiarVariable(m.nombre), limpiarVariable(descripcion), limpiarVariable(zona), url], [], { origen: "bot", negocioId: n.negocio_id, refId: m.id, etiqueta: "mascota perdida" });
      avisado ||= res.ok;
    }
    if (avisado) r.negociosAvisados += 1;
  }
  return r;
}

export async function totalEncontradas(): Promise<number> {
  const { data } = await createSupabaseAdminClient().rpc("app_mascotas_encontradas");
  return Number(data ?? 0);
}
