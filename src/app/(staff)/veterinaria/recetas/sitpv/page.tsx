import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { vetPuede } from "@/lib/veterinaria/permisos";
import { Button } from "@/components/ui/button";
import { formatearFechaCalendario, unidadSegunCantidad } from "@/lib/formato";
import { nombreMes, type EspejoResumen, type EstadoMedicoSitpv } from "@/lib/veterinaria/recetas";
import { NavRecetas } from "../nav";
import { AvisoErrorClinico } from "../../aviso-error";

// El espejo del SITPV: PeluDesk NO emite la receta cuantificada del Grupo I (se emite en el SITPV de
// SENASICA); aquí queda el registro de cada una, con su folio, para surtir, reportar y llevar el libro.
export default async function Sitpv({ searchParams }: { searchParams: Promise<{ estado?: string; archivadas?: string }> }) {
  const { estado, archivadas } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const [puede, { data, error }, { data: estadoCrudo }, { data: reglaMeses }, { data: reglaDia }] = await Promise.all([
    vetPuede(supabase, "registrar_recetas_sitpv"),
    supabase.rpc("vet_sitpv_lista", { p_estado: estado === "cancelada" || estado === "registrada" ? estado : null, p_archivadas: archivadas === "1", p_limite: 300 }),
    supabase.rpc("vet_sitpv_estado_medicos"),
    supabase.from("vet_reglas").select("valor").eq("clave", "sitpv_meses_sin_reporte_bloqueo").maybeSingle(),
    supabase.from("vet_reglas").select("valor").eq("clave", "sitpv_folios_alerta").maybeSingle(),
  ]);
  const filas = (data ?? []) as EspejoResumen[];
  const medicos = (estadoCrudo ?? []) as EstadoMedicoSitpv[];
  const bloqueo = Number(reglaMeses?.valor ?? 3);
  const alerta = Number(reglaDia?.valor ?? 10);
  const enlace = (e: string, a: boolean) => `/veterinaria/recetas/sitpv?${[e ? `estado=${e}` : "", a ? "archivadas=1" : ""].filter(Boolean).join("&")}`;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link href="/veterinaria" className="text-sm font-semibold text-morado hover:underline">← Veterinaria</Link>
          <h1 className="mt-1 text-2xl font-bold text-n-900">Registro SITPV (Grupo I)</h1>
          <p className="mt-1 max-w-3xl text-n-600">La receta cuantificada se emite en el SITPV de SENASICA con tu CPA. Aquí registras su espejo con el mismo folio, surtes contra él y llevas el reporte mensual. Este registro no es la receta ni vale para surtir.</p>
        </div>
        {puede && <Link href="/veterinaria/recetas/sitpv/nuevo"><Button type="button">Registrar una receta del SITPV</Button></Link>}
      </div>
      <NavRecetas activa="sitpv" />

      {medicos.length > 0 && (
        <section className="grid gap-3 sm:grid-cols-2">
          {medicos.map((m) => (
            <div key={m.medico_id} className="flex flex-col gap-2 rounded-lg border border-n-200 bg-white p-4">
              <p className="font-semibold text-n-900">{m.nombre} <span className="font-normal text-n-500">· CPA {m.cpa ?? "sin capturar"}</span></p>
              <p className={`text-sm ${m.folios_asignados > 0 && m.folios_disponibles < alerta ? "font-semibold text-coral-oscuro" : "text-n-700"}`}>
                Folios: {m.folios_disponibles} disponibles de {m.folios_asignados} asignados
                {m.folios_asignados > 0 && m.folios_disponibles < alerta ? ` — quedan pocos: pide otro bloque en el SITPV y que un admin lo capture en Médicos.` : "."}
              </p>
              {m.meses_pendientes.length === 0 ? (
                <p className="text-sm text-n-600">Reportes mensuales al corriente.</p>
              ) : (
                <div className="flex flex-col gap-1 text-sm">
                  <p className={`font-semibold ${m.meses_pendientes.length >= bloqueo ? "text-coral-oscuro" : "text-ambar-oscuro"}`}>
                    {m.meses_pendientes.length} {m.meses_pendientes.length === 1 ? "mes" : "meses"} sin marcar como reportado en el SITPV
                    {m.meses_pendientes.length >= bloqueo ? ` — con ${bloqueo} meses sin reporte el SITPV no entrega folios nuevos.` : "."}
                  </p>
                  <span className="flex flex-wrap gap-2">
                    {m.meses_pendientes.map((mes) => (
                      <Link key={mes} href={`/veterinaria/recetas/sitpv/reporte?medico=${m.medico_id}&periodo=${mes}`} className="rounded-full bg-ambar-suave px-2.5 py-1 text-xs font-semibold text-ambar-oscuro hover:underline">{nombreMes(mes)}</Link>
                    ))}
                  </span>
                </div>
              )}
              <Link href={`/veterinaria/recetas/sitpv/reporte?medico=${m.medico_id}&periodo=${new Date().toISOString().slice(0, 8)}01`} className="w-fit text-sm font-semibold text-morado hover:underline">Ver el reporte de este mes</Link>
            </div>
          ))}
        </section>
      )}

      {error ? (
        <AvisoErrorClinico error={error} titulo="No pudimos cargar los registros" />
      ) : (
        <>
          <div className="flex flex-wrap gap-2 text-sm">
            {[["", "Todos"], ["registrada", "Registrados"], ["cancelada", "Cancelados (en ceros)"]].map(([v, t]) => (
              <Link key={v} href={enlace(v, archivadas === "1")} className={`rounded-full border px-3 py-1 font-semibold ${(estado ?? "") === v ? "border-morado bg-morado-suave text-morado" : "border-n-200 bg-white text-n-700"}`}>{t}</Link>
            ))}
            <Link href={enlace(estado ?? "", archivadas !== "1")} className="rounded-full border border-n-200 bg-white px-3 py-1 font-semibold text-n-700">{archivadas === "1" ? "Ocultar archivados" : "Ver también archivados"}</Link>
          </div>
          {filas.length === 0 ? (
            <p className="rounded-lg border border-n-200 bg-white p-5 text-n-700">Todavía no hay recetas registradas del SITPV.</p>
          ) : (
            <ul className="divide-y divide-n-200 overflow-hidden rounded-lg border border-n-200 bg-white">
              {filas.map((r) => (
                <li key={r.id}>
                  <Link href={`/veterinaria/recetas/sitpv/${r.id}`} className="flex flex-col gap-1 px-4 py-3 hover:bg-n-50">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-n-900">Folio {r.folio} · {r.producto}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.estado === "cancelada" ? "bg-coral-suave text-coral-oscuro" : "bg-menta-suave text-menta-oscuro"}`}>{r.estado === "cancelada" ? "Cancelado" : "Registrado"}</span>
                      {r.uso_hospitalario && <span className="rounded-full bg-morado-suave px-2 py-0.5 text-xs font-semibold text-morado">Uso hospitalario</span>}
                      {r.archivada_at && <span className="rounded-full bg-n-100 px-2 py-0.5 text-xs font-semibold text-n-600">Archivado</span>}
                    </span>
                    <span className="text-sm text-n-700">{r.uso_hospitalario ? "USO HOSPITALARIO" : r.mascota} · {r.surtido} de {r.cantidad_total}{r.unidad ? ` ${unidadSegunCantidad(r.cantidad_total, r.unidad)}` : ""} surtidos</span>
                    <span className="text-sm text-n-500">{formatearFechaCalendario(r.fecha)} · {r.medico ?? "—"}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
