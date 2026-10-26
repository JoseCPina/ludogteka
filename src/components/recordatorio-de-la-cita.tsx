import { Chip } from "@/components/ui/chip";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { formatearFecha, horaLocalDeInstante } from "@/lib/formato";
import { estadoDeRecordatorio } from "@/lib/recordatorios/estado";
import { ETIQUETA_TIPO, type AccionRecordatorio, type TipoRecordatorio } from "@/lib/recordatorios/plantillas";

type Fila = {
  tipo: TipoRecordatorio;
  estado: string;
  motivo: string | null;
  respuesta: AccionRecordatorio | null;
  respuesta_at: string | null;
  programado_at: string;
  enviado_at: string | null;
  texto: string | null;
};

/**
 * Los recordatorios automáticos por WhatsApp de una cita o reserva (ficha): su estado de entrega, la respuesta del
 * cliente y lo que se le dijo. Componente de servidor; sin recordatorios no pinta nada.
 */
export async function RecordatorioDeLaCita({ refId, zona }: { refId: string; zona: string }) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("recordatorios_wa")
    .select("tipo, estado, motivo, respuesta, respuesta_at, programado_at, enviado_at, texto")
    .eq("ref_id", refId)
    .is("deleted_at", null)
    .order("programado_at", { ascending: false })
    .limit(5);
  const filas = (data ?? []) as Fila[];
  if (filas.length === 0) return null;
  return (
    <div className="mt-3 flex flex-col gap-2 rounded-lg border border-n-200 bg-white p-3 text-sm" data-recordatorios-de-la-cita>
      <p className="font-semibold text-n-900">Recordatorios por WhatsApp</p>
      {filas.map((f, i) => {
        const e = estadoDeRecordatorio(f.estado, f.respuesta);
        const cuando = f.enviado_at
          ? `Enviado el ${formatearFecha(f.enviado_at, zona)} a las ${horaLocalDeInstante(f.enviado_at, zona)}`
          : f.estado === "programado" || f.estado === "pausado"
            ? `Sale el ${formatearFecha(f.programado_at, zona)} a las ${horaLocalDeInstante(f.programado_at, zona)}`
            : null;
        return (
          <div key={i} className="flex flex-col gap-1" data-recordatorio-ficha={f.respuesta ?? f.estado}>
            <div className="flex flex-wrap items-center gap-2">
              <Chip tono={e.tono}>{e.texto}</Chip>
              <span className="text-n-600">{ETIQUETA_TIPO[f.tipo]}</span>
            </div>
            {cuando && <p className="text-n-600">{cuando}{f.respuesta_at ? ` · contestó el ${formatearFecha(f.respuesta_at, zona)} a las ${horaLocalDeInstante(f.respuesta_at, zona)}` : ""}</p>}
            {f.motivo && ["fallido", "cancelado", "omitido", "pausado"].includes(f.estado) && <p className="text-n-600">{f.motivo}</p>}
            {f.texto && <p className="rounded-md bg-n-50 p-2 text-n-700">«{f.texto}»</p>}
          </div>
        );
      })}
    </div>
  );
}
