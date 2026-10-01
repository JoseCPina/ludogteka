import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { Alert } from "@/components/ui/alert";

type Fila = { negocio_id: string; nombre: string; slug: string; archivos: number; bytes: number; vencidos: number; retencion_dias: number };

function megas(bytes: number): string {
  const mb = bytes / (1024 * 1024);
  return mb >= 1024 ? `${(mb / 1024).toFixed(2)} GB` : `${mb.toFixed(mb >= 10 ? 0 : 1)} MB`;
}

// Fotos, videos y tarjetas de los reportes (bucket reportes-archivos): lo que
// ocupa hoy cada negocio. Se borran solos a los N días (retención del negocio).
export default async function AlmacenamientoPlataforma() {
  const { supabase } = await exigirPlataforma();
  const { data, error } = await supabase.rpc("plataforma_almacenamiento_reportes");
  const filas = ((data ?? []) as Fila[]).map((f) => ({ ...f, archivos: Number(f.archivos), bytes: Number(f.bytes), vencidos: Number(f.vencidos) }));
  const totalBytes = filas.reduce((a, f) => a + f.bytes, 0);
  const totalArchivos = filas.reduce((a, f) => a + f.archivos, 0);
  const totalVencidos = filas.reduce((a, f) => a + f.vencidos, 0);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Fotos y videos: espacio usado</h1>
        <p className="mt-1 text-n-600">
          Lo que guardan hoy los negocios en fotos, videos y tarjetas de reporte. Todo se borra de Storage a los días que cada negocio
          configure (7 por omisión); la fila queda marcada como vencida.
        </p>
      </div>
      {error && <Alert variante="error" titulo="No pudimos cargar el espacio usado">{error.message}</Alert>}

      <section className="flex flex-wrap gap-3">
        <div className="rounded-lg border border-n-200 bg-white px-4 py-3">
          <p className="text-sm text-n-600">Espacio en uso</p>
          <p className="text-2xl font-bold tabular-nums text-n-900">{megas(totalBytes)}</p>
          <p className="text-xs text-n-600">{totalArchivos.toLocaleString("es-MX")} archivos vigentes</p>
        </div>
        <div className="rounded-lg border border-n-200 bg-white px-4 py-3">
          <p className="text-sm text-n-600">Ya borrados por vencimiento</p>
          <p className="text-2xl font-bold tabular-nums text-n-900">{totalVencidos.toLocaleString("es-MX")}</p>
          <p className="text-xs text-n-600">filas conservadas para auditoría</p>
        </div>
      </section>

      <section className="rounded-lg border border-n-200 bg-white p-5">
        <h2 className="text-lg font-bold text-n-900">Por negocio</h2>
        <ul className="mt-3 flex flex-col divide-y divide-n-200">
          {filas.map((f) => (
            <li key={f.negocio_id} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
              <span className="font-semibold text-n-900">
                {f.nombre} <span className="text-sm font-normal text-n-600">· {f.slug}</span>
              </span>
              <span className="text-sm tabular-nums text-n-700">
                {megas(f.bytes)} · {f.archivos} archivos · {f.vencidos} vencidos · se borran a los {f.retencion_dias} días
              </span>
            </li>
          ))}
          {filas.length === 0 && <li className="py-3 text-n-600">Todavía no hay negocios.</li>}
        </ul>
      </section>
    </div>
  );
}
