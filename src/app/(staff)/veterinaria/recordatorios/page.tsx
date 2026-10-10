import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { negocioActual } from "@/lib/negocio/actual";
import { enlaceWhatsApp } from "@/lib/reporte/enlaces";
import { formatearFechaCalendario } from "@/lib/formato";
import { cuandoEs, mensajeRecordatorio } from "@/lib/veterinaria/carnet";
import { Alert } from "@/components/ui/alert";
import { AccionesRecordatorio } from "./acciones";

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
  const [{ data, error }, { data: ajustes }] = await Promise.all([supabase.rpc("carnet_recordatorios_lista"), supabase.rpc("veterinaria_ajustes_actuales")]);
  const filas = (data ?? []) as Fila[];
  const pendientes = filas.filter((f) => f.estado === "pendiente" || f.estado === "fallido");
  const resueltos = filas.filter((f) => !(f.estado === "pendiente" || f.estado === "fallido"));
  const a = (ajustes ?? {}) as { recordatorios_activos?: boolean; dias_anticipacion?: number };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Link href="/veterinaria" className="text-sm font-semibold text-morado hover:underline">← Veterinaria</Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Recordatorios de próxima dosis</h1>
        <p className="mt-1 max-w-3xl text-n-600">
          Las vacunas y desparasitaciones cuya próxima dosis cae en los próximos {a.dias_anticipacion ?? 7} días (o venció hace poco). Mándalos tú con un toque, o deja que se manden solos si prendes el envío automático en{" "}
          <Link href="/veterinaria/ajustes" className="font-semibold text-morado hover:underline">Ajustes</Link>.
        </p>
      </div>
      {!a.recordatorios_activos && (
        <Alert variante="info" titulo="El envío automático está apagado">
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
                      <Link href={`/veterinaria/carnet/${f.perro_id}`} className="hover:underline">{f.perro_nombre}</Link>
                      <span className="font-normal text-n-600"> · {f.origen_tipo === "vacuna" ? "vacuna" : "desparasitación"}: {f.detalle}</span>
                    </p>
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${ESTADO[f.estado]?.estilo}`}>{ESTADO[f.estado]?.texto}</span>
                  </div>
                  <p className="text-sm text-n-700">
                    Le toca {formatearFechaCalendario(f.proxima_dosis)} ({cuandoEs(f.dias)}) · {f.cliente_nombre}{f.cliente_telefono ? ` · ${f.cliente_telefono}` : " · sin teléfono"}
                  </p>
                  {f.error && <p className="text-sm text-coral-oscuro">No salió por la API: {f.error}</p>}
                  <AccionesRecordatorio id={f.id} enlace={enlace} />
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
