import { EnlaceOTexto } from "@/components/acceso-contexto";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { negocioActual } from "@/lib/negocio/actual";
import { enlaceWhatsApp } from "@/lib/reporte/enlaces";
import { formatearFechaCalendario } from "@/lib/formato";
import { cuandoEs, mensajeRecordatorio } from "@/lib/veterinaria/carnet";
import { Alert } from "@/components/ui/alert";
import { AccionesRecordatorio } from "./acciones";
import { leerTodo } from "@/lib/supabase/paginar";
import { Enlace } from "@/components/ui/enlace";

type Fila = {
  id: string; perro_id: string; perro_nombre: string; cliente_nombre: string; cliente_telefono: string | null;
  origen_tipo: "vacuna" | "desparasitacion"; detalle: string; proxima_dosis: string; dias: number; estado: string; enviado_at: string | null; error: string | null;
};

const ESTADO: Record<string, { texto: string; estilo: string }> = {
  pendiente: { texto: "Por mandar", estilo: "bg-ambar-suave text-ambar-oscuro" },
  fallido: { texto: "No salió", estilo: "bg-coral-suave text-coral-oscuro" },
  enviado: { texto: "Enviado", estilo: "bg-menta-suave text-menta-oscuro" },
  manual: { texto: "Mandado a mano", estilo: "bg-menta-suave text-menta-oscuro" },
  omitido: { texto: "Omitido", estilo: "bg-n-100 text-n-600" },
};

export default async function Recordatorios() {
  const supabase = await createSupabaseServerClient();
  const negocio = await negocioActual();
  const [{ data, error }, { data: ajustes }] = await Promise.all([leerTodo<Record<string, unknown>>(() => supabase.rpc("carnet_recordatorios_lista").order("id")), supabase.from("recordatorios_ajustes").select("vacuna").eq("negocio_id", negocio.id).is("deleted_at", null).maybeSingle(), ]);
  const { data: vetAjustes } = await supabase.rpc("veterinaria_ajustes_actuales");
  const filas = (data ?? []) as Fila[];
  const pendientes = filas.filter((f) => f.estado === "pendiente" || f.estado === "fallido");
  const resueltos = filas.filter((f) => !(f.estado === "pendiente" || f.estado === "fallido"));
  const a = { recordatorios_activos: Boolean((ajustes as { vacuna?: boolean } | null)?.vacuna), dias_anticipacion: (vetAjustes as { dias_anticipacion?: number } | null)?.dias_anticipacion };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Enlace href="/veterinaria" className="text-sm">← Veterinaria</Enlace>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Recordatorios de próxima dosis</h1>
        <p className="mt-1 max-w-3xl text-n-600">
          Las vacunas y desparasitaciones cuya próxima dosis cae en los próximos {a.dias_anticipacion ?? 7} días (o venció hace poco). Salen solos por WhatsApp 7 días antes si prendes «Próxima vacuna o desparasitación» en{" "}
          <EnlaceOTexto href="/admin/recordatorios" className="font-semibold text-morado hover:underline">Recordatorios por WhatsApp</EnlaceOTexto>; lo que no salió solo lo mandas tú desde aquí.
        </p>
      </div>
      {!a.recordatorios_activos && (
        <Alert variante="info" titulo="El recordatorio automático de vacunas está apagado">
          Nada sale solo. La lista de abajo es para mandarlos a mano por WhatsApp.
        </Alert>
      )}
      {error && <Alert variante="error" titulo="No pudimos cargar los recordatorios">{error.message}</Alert>}

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-n-900">Por mandar ({pendientes.length})</h2>
        {pendientes.length === 0 ? (
          <p className="rounded-lg border border-n-200 bg-white p-4 text-n-700">No hay nada pendiente. Las dosis que se acerquen aparecerán aquí.</p>
        ) : (
          <ul className="flex flex-col gap-3">
            {pendientes.map((f) => {
              const enlace = f.cliente_telefono
                ? enlaceWhatsApp(f.cliente_telefono, mensajeRecordatorio({ dueno: f.cliente_nombre, mascota: f.perro_nombre, negocio: negocio.nombre, detalle: f.detalle, cuando: cuandoEs(f.dias) === "hoy" ? "hoy" : cuandoEs(f.dias).startsWith("desde") ? `desde ${formatearFechaCalendario(f.proxima_dosis)}` : `el ${formatearFechaCalendario(f.proxima_dosis)}`, tipo: f.origen_tipo }))
                : null;
              return (
                <li key={f.id} className="flex flex-col gap-2 rounded-lg border border-n-200 bg-white p-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-bold text-n-900">
                      <Enlace href={`/veterinaria/carnet/${f.perro_id}`}>{f.perro_nombre}</Enlace>
                      <span className="font-normal text-n-600"> · {f.origen_tipo === "vacuna" ? "vacuna" : "desparasitación"}: {f.detalle}</span>
                    </p>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTADO[f.estado]?.estilo}`}>{ESTADO[f.estado]?.texto}</span>
                  </div>
                  <p className="text-sm text-n-700">
                    Le toca {formatearFechaCalendario(f.proxima_dosis)} ({cuandoEs(f.dias)}) · {f.cliente_nombre}{f.cliente_telefono ? ` · ${f.cliente_telefono}` : " · sin teléfono"}
                  </p>
                  {f.error && <p className="text-sm text-coral-oscuro">No salió: {f.error}</p>}
                  <AccionesRecordatorio id={f.id} enlace={enlace} fallido={f.estado === "fallido"} />
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {resueltos.length > 0 && (
        <details className="rounded-lg border border-n-200 bg-white p-4">
          <summary className="cursor-pointer font-semibold text-n-800">Resueltos hace poco ({resueltos.length})</summary>
          <ul className="mt-3 flex flex-col gap-1.5 text-sm text-n-700">
            {resueltos.map((f) => (
              <li key={f.id}>
                {f.perro_nombre} — {f.detalle} ({formatearFechaCalendario(f.proxima_dosis)}) · <span className="font-semibold">{ESTADO[f.estado]?.texto}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
