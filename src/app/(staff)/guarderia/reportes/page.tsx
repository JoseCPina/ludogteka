import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { tienePermiso } from "@/lib/auth/permisos";
import { negocioActual } from "@/lib/negocio/actual";
import { Alert } from "@/components/ui/alert";
import { Chip, type TonoChip } from "@/components/ui/chip";
import { formatearFecha, horaLocalDeInstante } from "@/lib/formato";
import { ETIQUETA_ESTADO, type EstadoReporte } from "@/lib/reporte/tipos";

type Fila = { perroId: string; nombre: string; estado: EstadoReporte | "sin_reporte"; enviadoAt: string | null; llenadoPor: string | null };

const ORDEN: Record<Fila["estado"], number> = { sin_reporte: 0, borrador: 1, listo: 2, enviado: 3 };
const TONO: Record<Fila["estado"], TonoChip> = { sin_reporte: "pendiente", borrador: "proceso", listo: "info", enviado: "exito" };

export default async function ReportesDelDiaPage() {
  const sesion = await obtenerSesionConRol();
  if (!tienePermiso(sesion, "reportes_guarderia")) {
    return (
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
        <Link href="/guarderia" className="text-sm font-semibold text-morado hover:underline">
          ← Guardería
        </Link>
        <Alert variante="advertencia" titulo="No tienes el permiso «Reportes de guardería»">
          Pídele a quien administra el negocio que te lo dé en Permisos.
        </Alert>
      </div>
    );
  }

  const negocio = await negocioActual();
  const zona = negocio.zona_horaria;
  const supabase = await createSupabaseServerClient();
  const { data: diaData } = await supabase.rpc("fecha_negocio");
  const hoy = String(diaData);

  const [{ data: adentro, error }, { data: reportes }] = await Promise.all([
    supabase.from("quienes_estan_adentro").select("perro_id, perro_nombre").eq("categoria", "guarderia").order("perro_nombre"),
    supabase.from("reportes_guarderia").select("perro_id, estado, enviado_at, llenado_por_nombre").eq("fecha", hoy).is("deleted_at", null),
  ]);

  const porPerro = new Map((reportes ?? []).map((r) => [r.perro_id as string, r]));
  const vistos = new Set<string>();
  const filas: Fila[] = [];
  for (const a of adentro ?? []) {
    const id = a.perro_id as string;
    if (vistos.has(id)) continue;
    vistos.add(id);
    const r = porPerro.get(id);
    filas.push({
      perroId: id,
      nombre: a.perro_nombre as string,
      estado: (r?.estado as EstadoReporte | undefined) ?? "sin_reporte",
      enviadoAt: (r?.enviado_at as string | null) ?? null,
      llenadoPor: (r?.llenado_por_nombre as string | null) ?? null,
    });
  }
  filas.sort((a, b) => ORDEN[a.estado] - ORDEN[b.estado] || a.nombre.localeCompare(b.nombre, "es"));
  const listos = filas.filter((f) => f.estado === "listo" || f.estado === "enviado").length;
  const porcentaje = filas.length ? Math.round((listos / filas.length) * 100) : 0;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <header className="flex flex-col gap-1">
        <Link href="/guarderia" className="text-sm font-semibold text-morado hover:underline">
          ← Guardería
        </Link>
        <h1 className="text-2xl font-bold tracking-tight text-n-900">Reportes del día</h1>
        <p className="text-n-600">
          {formatearFecha(`${hoy}T12:00:00Z`, "UTC")}. Cada reporte se llena y se envía uno por uno; nada sale solo.
        </p>
      </header>

      {error ? (
        <Alert variante="error" titulo="No pudimos cargar a los perros de hoy">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : filas.length === 0 ? (
        <div className="rounded-xl border border-n-200 bg-white p-6 text-n-700">
          No hay perros de guardería adentro en este momento. Cuando alguien haga check-in aparece aquí.
        </div>
      ) : (
        <>
          <section aria-label="Avance" className="rounded-xl border border-n-200 bg-white p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-2xl font-bold text-n-900">
                {listos} de {filas.length} <span className="text-base font-semibold text-n-600">listos</span>
              </p>
              <p className="text-sm text-n-600">{filas.length - listos === 0 ? "Todos listos" : `Faltan ${filas.length - listos}`}</p>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-n-100" role="progressbar" aria-valuenow={listos} aria-valuemin={0} aria-valuemax={filas.length}>
              <div className="h-full rounded-full bg-menta-oscuro transition-[width] duration-300" style={{ width: `${porcentaje}%` }} />
            </div>
          </section>

          <ul className="flex flex-col gap-2.5">
            {filas.map((f) => (
              <li key={f.perroId}>
                <Link
                  href={`/guarderia/reportes/${f.perroId}`}
                  className="flex min-h-[4.5rem] items-center justify-between gap-3 rounded-xl border border-n-200 bg-white px-4 py-3 transition-colors hover:border-morado/40 hover:bg-n-50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-lg font-bold text-n-900">{f.nombre}</span>
                    <span className="text-sm text-n-600">
                      {f.estado === "enviado" && f.enviadoAt
                        ? `Enviado a las ${horaLocalDeInstante(f.enviadoAt, zona)}`
                        : f.estado === "sin_reporte"
                          ? "Todavía no se llena"
                          : f.llenadoPor
                            ? `Lo llenó ${f.llenadoPor}`
                            : "En curso"}
                    </span>
                  </span>
                  <span className="flex flex-none items-center gap-3">
                    <Chip tono={TONO[f.estado]}>{ETIQUETA_ESTADO[f.estado]}</Chip>
                    <span aria-hidden="true" className="text-xl text-n-400">
                      ›
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
