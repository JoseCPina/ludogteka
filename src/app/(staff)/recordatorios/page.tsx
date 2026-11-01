import { redirect } from "next/navigation";
import { EnlaceOTexto } from "@/components/acceso-contexto";
import { Chip, type TonoChip } from "@/components/ui/chip";
import { accesoDeSesion, puedeAbrir } from "@/lib/auth/acceso";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { negocioActual } from "@/lib/negocio/actual";
import { formatearFecha, horaLocalDeInstante } from "@/lib/formato";
import { ETIQUETA_RESPUESTA, type AccionRecordatorio, type TipoRecordatorio } from "@/lib/recordatorios/plantillas";
import { estadoDeRecordatorio, hrefDeRecordatorio } from "@/lib/recordatorios/estado";
import { MarcarAtendido } from "./marcar-atendido";
import { Enlace } from "@/components/ui/enlace";

// Recordatorios por WhatsApp del negocio: lo que contestaron sus clientes y hay que atender (cambio de cita,
// solicitud para agendar, un mensaje, una baja) y los últimos recordatorios con su estado de entrega.
type Mensaje = {
  id: string;
  tipo: "pide_cambio" | "solicitud_cita" | "mensaje" | "baja";
  texto: string | null;
  created_at: string;
  cliente_id: string | null;
  perro_id: string | null;
  recordatorio_id: string | null;
  clientes: { nombre: string; telefono: string | null } | null;
  perros: { nombre: string } | null;
  recordatorios_wa: { tipo: TipoRecordatorio; ref_id: string; para_at: string } | null;
};

type Enviado = {
  id: string;
  tipo: TipoRecordatorio;
  ref_id: string;
  para_at: string;
  estado: string;
  motivo: string | null;
  respuesta: AccionRecordatorio | null;
  enviado_at: string | null;
  programado_at: string;
  clientes: { nombre: string } | null;
  perros: { nombre: string } | null;
};

const TITULO_MENSAJE: Record<Mensaje["tipo"], string> = {
  pide_cambio: "Necesita cambiar su cita",
  solicitud_cita: "Quiere agendar",
  mensaje: "Te escribió",
  baja: "Ya no quiere recordatorios",
};
const TONO_MENSAJE: Record<Mensaje["tipo"], TonoChip> = { pide_cambio: "proceso", solicitud_cita: "info", mensaje: "neutro", baja: "neutro" };

export default async function RecordatoriosPage() {
  const sesion = await obtenerSesionConRol();
  const acceso = accesoDeSesion(sesion);
  if (!puedeAbrir(acceso, "/recordatorios")) redirect("/");
  const supabase = await createSupabaseServerClient();
  const negocio = await negocioActual();
  const zona = negocio.zona_horaria;
  const [{ data: mensajes }, { data: enviados }, { data: ajustes }, { count: pausados }] = await Promise.all([
    supabase
      .from("recordatorios_mensajes")
      .select("id, tipo, texto, created_at, cliente_id, perro_id, recordatorio_id, clientes(nombre, telefono), perros(nombre), recordatorios_wa(tipo, ref_id, para_at)")
      .eq("negocio_id", negocio.id)
      .is("deleted_at", null)
      .is("atendido_at", null)
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("recordatorios_wa")
      .select("id, tipo, ref_id, para_at, estado, motivo, respuesta, enviado_at, programado_at, clientes(nombre), perros(nombre)")
      .eq("negocio_id", negocio.id)
      .is("deleted_at", null)
      .order("programado_at", { ascending: false })
      .limit(60),
    supabase.from("recordatorios_ajustes").select("estetica, veterinaria, llegada, listo, vacuna").eq("negocio_id", negocio.id).is("deleted_at", null).maybeSingle(),
    supabase.from("recordatorios_wa").select("id", { count: "exact", head: true }).eq("negocio_id", negocio.id).eq("estado", "pausado").is("deleted_at", null),
  ]);
  const pendientes = (mensajes ?? []) as unknown as Mensaje[];
  const lista = (enviados ?? []) as unknown as Enviado[];
  const prendidos = ajustes ? Object.values(ajustes).some(Boolean) : false;

  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-n-900">Recordatorios por WhatsApp</h1>
        <p className="mt-1 text-n-700">
          Lo que tus clientes contestan a los recordatorios automáticos y el estado de cada mensaje.{" "}
          {prendidos ? (
            <>
              Qué sale solo y a qué hora:{" "}
              <EnlaceOTexto className="underline" href="/admin/recordatorios">
                Recordatorios por WhatsApp
              </EnlaceOTexto>
              .
            </>
          ) : (
            <>
              Todavía no hay recordatorios automáticos prendidos: se prenden en{" "}
              <EnlaceOTexto className="underline" href="/admin/recordatorios">
                Recordatorios por WhatsApp
              </EnlaceOTexto>
              .
            </>
          )}
        </p>
      </header>

      {Number(pausados ?? 0) > 0 && (
        <div className="rounded-xl border border-ambar bg-ambar-suave p-4 text-sm text-n-900" data-recordatorios-pausados>
          {pausados === 1 ? "Un recordatorio está en pausa" : `${pausados} recordatorios están en pausa`}: ya se usaron los recordatorios gratis del mes o se llegó al tope. Revisa{" "}
          <EnlaceOTexto className="underline" href="/admin/modulos">
            Módulos y plan
          </EnlaceOTexto>
          .
        </div>
      )}

      <section className="flex flex-col gap-3" data-recordatorios-por-atender>
        <h2 className="text-lg font-semibold text-n-900">Por atender {pendientes.length > 0 && <span className="text-n-500">({pendientes.length})</span>}</h2>
        {pendientes.length === 0 && <p className="text-sm text-n-600">Nada pendiente: cuando un cliente pida cambiar su cita, quiera agendar o te escriba, aparece aquí.</p>}
        {pendientes.map((m) => {
          const tel = (m.clientes?.telefono ?? "").replace(/\D/g, "").slice(-10);
          const href = m.recordatorios_wa
            ? m.tipo === "solicitud_cita" && m.perro_id
              ? `/veterinaria/agenda/nueva?perro=${m.perro_id}${m.cliente_id ? `&cliente=${m.cliente_id}` : ""}`
              : hrefDeRecordatorio(m.recordatorios_wa.tipo, m.recordatorios_wa.ref_id, m.recordatorios_wa.para_at, zona)
            : null;
          return (
            <article key={m.id} className="flex flex-col gap-2 rounded-xl border border-n-200 bg-white p-4 sm:flex-row sm:items-start sm:justify-between" data-mensaje-recordatorio={m.tipo}>
              <div className="flex flex-col gap-1">
                <Chip tono={TONO_MENSAJE[m.tipo]}>{TITULO_MENSAJE[m.tipo]}</Chip>
                <p className="font-medium text-n-900">
                  {m.clientes?.nombre ?? "Cliente"}
                  {m.perros?.nombre ? ` · ${m.perros.nombre}` : ""}
                </p>
                {m.recordatorios_wa && m.recordatorios_wa.tipo !== "listo" && m.recordatorios_wa.tipo !== "vacuna" && (
                  <p className="text-sm text-n-700">
                    Cita del {formatearFecha(m.recordatorios_wa.para_at, zona)}
                    {m.recordatorios_wa.tipo !== "llegada" ? ` a las ${horaLocalDeInstante(m.recordatorios_wa.para_at, zona)}` : ""}
                  </p>
                )}
                {m.tipo === "mensaje" && m.texto && <p className="whitespace-pre-line rounded-lg bg-n-50 p-2 text-sm text-n-800">«{m.texto}»</p>}
                {m.tipo === "solicitud_cita" && m.texto && <p className="text-sm text-n-700">{m.texto}</p>}
                <p className="text-xs text-n-500">
                  {formatearFecha(m.created_at, zona)}, {horaLocalDeInstante(m.created_at, zona)}
                </p>
              </div>
              <div className="flex flex-wrap gap-2 sm:flex-col sm:items-end">
                {tel.length === 10 && m.tipo !== "baja" && (
                  <Enlace className="text-sm" href={`https://wa.me/52${tel}`} target="_blank" rel="noopener noreferrer">
                    Escribirle por WhatsApp
                  </Enlace>
                )}
                {href && puedeAbrir(acceso, href.split("?")[0]) && (
                  <Enlace className="text-sm" href={href}>
                    {m.tipo === "solicitud_cita" ? "Agendar" : "Ver la cita"}
                  </Enlace>
                )}
                <MarcarAtendido id={m.id} />
              </div>
            </article>
          );
        })}
      </section>

      <section className="flex flex-col gap-3" data-recordatorios-enviados>
        <h2 className="text-lg font-semibold text-n-900">Últimos recordatorios</h2>
        {lista.length === 0 && <p className="text-sm text-n-600">Todavía no sale ninguno.</p>}
        {lista.length > 0 && (
          <ul className="divide-y divide-n-100 rounded-xl border border-n-200 bg-white">
            {lista.map((r) => {
              const e = estadoDeRecordatorio(r.estado, r.respuesta);
              const href = hrefDeRecordatorio(r.tipo, r.ref_id, r.para_at, zona);
              return (
                <li key={r.id} className="flex flex-col gap-1 p-3 text-sm sm:flex-row sm:items-center sm:justify-between" data-recordatorio-estado={r.estado}>
                  <div>
                    <p className="font-medium text-n-900">
                      {r.perros?.nombre ?? "—"} · {r.clientes?.nombre ?? "—"}
                    </p>
                    <p className="text-n-600">
                      {etiquetaCorta(r.tipo)} · {r.tipo === "listo" ? formatearFecha(r.para_at, zona) : `para el ${formatearFecha(r.para_at, zona)}`}
                      {r.motivo && (r.estado === "fallido" || r.estado === "cancelado" || r.estado === "omitido" || r.estado === "pausado") ? ` · ${r.motivo}` : ""}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {r.respuesta && <Chip tono={r.respuesta === "confirmo" ? "exito" : "proceso"}>{ETIQUETA_RESPUESTA[r.respuesta]}</Chip>}
                    <Chip tono={e.tono}>{e.texto}</Chip>
                    {puedeAbrir(acceso, href.split("?")[0]) && (
                      <Enlace href={href} enTexto>
                        Ver
                      </Enlace>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function etiquetaCorta(t: TipoRecordatorio): string {
  return { estetica: "Cita de estética", veterinaria: "Cita veterinaria", llegada: "Llegada", listo: "Listo para recoger", vacuna: "Vacuna" }[t];
}
