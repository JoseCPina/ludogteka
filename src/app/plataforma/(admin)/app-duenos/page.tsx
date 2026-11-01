import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { leerTodo } from "@/lib/supabase/paginar";
import { TablaResponsiva } from "@/components/ui/tabla-responsiva";
import { formatearFecha } from "@/lib/formato";

const ZONA = "America/Mexico_City";
/** El instante de hace N días (la página se pinta en el servidor en cada visita). */
const haceDias = (dias: number) => new Date(Date.now() - dias * 86_400_000).toISOString();

type Etapa = "por_reclamar" | "reclamado" | "en_prueba" | "pagando";
const ETIQUETA: Record<Etapa, string> = { por_reclamar: "Por reclamar", reclamado: "Reclamado", en_prueba: "En prueba", pagando: "Pagando" };

/**
 * App para dueños: el embudo del QR (Fase 2, docs/app-duenos/FASE-2.md). Escaneos (cada vez que un negocio abre el
 * formulario de una mascota), negocios que registraron atenciones y en qué etapa van: por reclamar, reclamado (comprobó
 * su WhatsApp), en prueba o pagando. Lee con el servidor después de comprobar que es administración de la plataforma.
 */
export default async function AppDuenosPlataforma() {
  await exigirPlataforma();
  const db = createSupabaseAdminClient();
  const hace30 = haceDias(30);
  const [escaneos, escaneos30, sinRegistro, atenciones30, { count: duenos }, { count: mascotas }, filas] = await Promise.all([
    db.from("app_qr_escaneos").select("id", { count: "exact", head: true }).is("deleted_at", null),
    db.from("app_qr_escaneos").select("id", { count: "exact", head: true }).is("deleted_at", null).gte("created_at", hace30),
    db.from("app_qr_escaneos").select("id", { count: "exact", head: true }).is("deleted_at", null).is("prospecto_id", null),
    db.from("app_atenciones").select("id", { count: "exact", head: true }).is("deleted_at", null).gte("created_at", hace30),
    db.from("duenos").select("id", { count: "exact", head: true }),
    db.from("mascotas").select("id", { count: "exact", head: true }).is("deleted_at", null),
    leerTodo<{ prospecto_id: string; giro: string; created_at: string; oculto_at: string | null }>(() => db.from("app_atenciones").select("prospecto_id, giro, created_at, oculto_at").is("deleted_at", null).order("created_at").order("id")),
  ]);
  const porProspecto = new Map<string, { atenciones: number; ocultas: number; giros: Set<string>; ultima: string }>();
  for (const a of filas.data ?? []) {
    const p = porProspecto.get(a.prospecto_id) ?? { atenciones: 0, ocultas: 0, giros: new Set<string>(), ultima: a.created_at };
    p.atenciones += 1;
    if (a.oculto_at) p.ocultas += 1;
    p.giros.add(a.giro);
    p.ultima = a.created_at > p.ultima ? a.created_at : p.ultima;
    porProspecto.set(a.prospecto_id, p);
  }
  const ids = [...porProspecto.keys()];
  const [prospectos, reclamos, escaneosPorProspecto] = await Promise.all([
    ids.length ? db.from("prospectos").select("id, nombre, ciudad, fuente, negocio_cliente_id").in("id", ids.slice(0, 500)) : Promise.resolve({ data: [] }),
    ids.length ? db.from("prospectos_reclamos").select("prospecto_id, estado").in("prospecto_id", ids.slice(0, 500)).is("deleted_at", null).in("estado", ["verificado", "registrado"]) : Promise.resolve({ data: [] }),
    ids.length ? db.from("app_qr_escaneos").select("prospecto_id").in("prospecto_id", ids.slice(0, 500)).is("deleted_at", null) : Promise.resolve({ data: [] }),
  ]);
  const negocioIds = ((prospectos.data ?? []) as { negocio_cliente_id: string | null }[]).map((p) => p.negocio_cliente_id).filter(Boolean) as string[];
  const { data: negocios } = negocioIds.length ? await db.from("negocios").select("id, plan, slug").in("id", negocioIds) : { data: [] };
  const plan = new Map(((negocios ?? []) as { id: string; plan: string }[]).map((n) => [n.id, n.plan]));
  const reclamado = new Set(((reclamos.data ?? []) as { prospecto_id: string }[]).map((r) => r.prospecto_id));
  const escaneosDe = new Map<string, number>();
  for (const e of (escaneosPorProspecto.data ?? []) as { prospecto_id: string }[]) escaneosDe.set(e.prospecto_id, (escaneosDe.get(e.prospecto_id) ?? 0) + 1);
  const etapaDe = (p: { id: string; negocio_cliente_id: string | null }): Etapa => {
    const pl = p.negocio_cliente_id ? plan.get(p.negocio_cliente_id) : null;
    if (pl === "prueba") return "en_prueba";
    if (pl && pl !== "demo") return "pagando";
    return reclamado.has(p.id) || p.negocio_cliente_id ? "reclamado" : "por_reclamar";
  };
  const tabla = ((prospectos.data ?? []) as { id: string; nombre: string; ciudad: string; fuente: string; negocio_cliente_id: string | null }[])
    .map((p) => ({ ...p, etapa: etapaDe(p), ...porProspecto.get(p.id)!, escaneos: escaneosDe.get(p.id) ?? 0 }))
    .sort((a, b) => b.atenciones - a.atenciones);
  const cuenta = (e: Etapa) => tabla.filter((t) => t.etapa === e).length;
  const tarjeta = (titulo: string, valor: number | string, sub?: string) => (
    <div className="rounded-lg border border-n-200 bg-white p-4">
      <p className="text-xs font-bold uppercase tracking-wide text-n-600">{titulo}</p>
      <p className="mt-1 text-2xl font-bold text-n-900">{valor}</p>
      {sub && <p className="text-sm text-n-600">{sub}</p>}
    </div>
  );
  return (
    <div className="flex flex-col gap-6" data-metricas-app-duenos>
      <div>
        <h1 className="text-2xl font-bold text-n-900">App para dueños</h1>
        <p className="mt-1 text-n-600">El QR de la placa como entrada de negocios: cada escaneo es un negocio que tuvo enfrente a una mascota con PeluDesk.</p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {tarjeta("Escaneos", escaneos.count ?? 0, `${escaneos30.count ?? 0} en 30 días · ${sinRegistro.count ?? 0} sin registrar nada`)}
        {tarjeta("Atenciones registradas", (filas.data ?? []).length, `${atenciones30.count ?? 0} en 30 días`)}
        {tarjeta("Dueños en la app", duenos ?? 0, `${mascotas ?? 0} mascotas`)}
        {tarjeta("Negocios que registraron", tabla.length)}
      </div>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4" data-embudo-qr>
        {(["por_reclamar", "reclamado", "en_prueba", "pagando"] as Etapa[]).map((e) => (
          <div key={e} className="rounded-lg border border-n-200 bg-white p-4" data-etapa={e}>
            <p className="text-xs font-bold uppercase tracking-wide text-n-600">{ETIQUETA[e]}</p>
            <p className="mt-1 text-2xl font-bold text-n-900">{cuenta(e)}</p>
          </div>
        ))}
      </div>
      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-n-900">Escaneos por negocio</h2>
        {tabla.length === 0 ? (
          <p className="text-n-600">Todavía ningún negocio ha registrado una atención con el QR.</p>
        ) : (
          <TablaResponsiva>
            <thead>
              <tr>
                <th className="px-3 py-2 text-left">Negocio</th>
                <th className="px-3 py-2 text-left">Etapa</th>
                <th className="px-3 py-2 text-right">Escaneos</th>
                <th className="px-3 py-2 text-right">Atenciones</th>
                <th className="px-3 py-2 text-left">Giro</th>
                <th className="px-3 py-2 text-left">Última</th>
              </tr>
            </thead>
            <tbody>
              {tabla.map((t) => (
                <tr key={t.id} className="border-t border-n-200" data-negocio-qr={t.id}>
                  <td className="px-3 py-2 font-semibold text-n-900">{t.nombre}<span className="block text-xs font-normal text-n-600">{t.ciudad}{t.fuente === "qr" ? " · llegó por el QR" : ""}</span></td>
                  <td className="px-3 py-2">{ETIQUETA[t.etapa]}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.escaneos}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{t.atenciones}{t.ocultas ? ` (${t.ocultas} ocultas)` : ""}</td>
                  <td className="px-3 py-2">{[...t.giros].join(", ")}</td>
                  <td className="px-3 py-2">{formatearFecha(t.ultima, ZONA)}</td>
                </tr>
              ))}
            </tbody>
          </TablaResponsiva>
        )}
      </section>
    </div>
  );
}
