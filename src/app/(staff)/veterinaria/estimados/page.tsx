import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { formatearFechaCalendario } from "@/lib/formato";
import { ESTADOS_ESTIMADO, dinero, type EstimadoResumen } from "@/lib/veterinaria/expediente";
import { Enlace } from "@/components/ui/enlace";
import { EnlacePestana } from "@/components/ui/enlace-pestana";

const FILTROS: { clave: string; etiqueta: string }[] = [
  { clave: "", etiqueta: "Todos" },
  { clave: "borrador", etiqueta: "Borradores" },
  { clave: "enviado", etiqueta: "Enviados" },
  { clave: "aceptado", etiqueta: "Aceptados" },
  { clave: "rechazado", etiqueta: "Rechazados" },
];

export default async function Estimados({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const { estado } = await searchParams;
  const filtro = FILTROS.some((f) => f.clave === (estado ?? "")) ? (estado ?? "") : "";
  const supabase = await createSupabaseServerClient();
  const [{ data: puede }, { data }] = await Promise.all([supabase.rpc("vet_puede", { p_permiso: "crear_estimados" }), supabase.rpc("vet_estimados_lista", { p_estado: filtro || null })]);
  const filas = (data ?? []) as EstimadoResumen[];

  return (
    <div className="flex flex-col gap-5">
      <div>
        <Enlace href="/veterinaria" className="text-sm">← Veterinaria</Enlace>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Estimados</h1>
        <p className="mt-1 max-w-3xl text-n-600">Lo que se calcula que costará una consulta o una cirugía, con mínimo y máximo. El dueño lo acepta por una liga o en el mostrador y entonces pasa a la cuenta de su mascota.</p>
      </div>
      {puede !== true && <Alert variante="advertencia" titulo="No tienes acceso">Los estimados son de un médico veterinario, de admin o de quien tenga «Crear estimados».</Alert>}
      <nav className="flex flex-wrap gap-2 text-sm" aria-label="Filtrar por estado">
        {FILTROS.map((f) => (
          <EnlacePestana key={f.clave} href={f.clave ? `/veterinaria/estimados?estado=${f.clave}` : "/veterinaria/estimados"} activo={filtro === f.clave}>{f.etiqueta}</EnlacePestana>
        ))}
      </nav>
      {puede === true && (
        filas.length === 0 ? (
          <p className="rounded-lg border border-n-200 bg-white p-4 text-n-700">Todavía no hay estimados{filtro ? " con ese estado" : ""}. Se crean desde el <Enlace href="/veterinaria/expediente" enTexto>expediente</Enlace> de la mascota.</p>
        ) : (
          <ul className="divide-y divide-n-200 overflow-hidden rounded-lg border border-n-200 bg-white">
            {filas.map((e) => {
              const est = ESTADOS_ESTIMADO[e.estado] ?? { etiqueta: e.estado, estilo: "bg-n-100" };
              return (
                <li key={e.id}>
                  <Enlace href={`/veterinaria/estimados/${e.id}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 hover:bg-n-50" forma="bloque">
                    <span>
                      <span className="font-semibold text-n-900">{e.titulo}</span> <span className="text-n-500">· v{e.version} · {e.mascota} ({e.dueno})</span>
                    </span>
                    <span className="flex items-center gap-2 text-sm text-n-700">
                      {dinero(e.total_min)} – {dinero(e.total_max)} · vigente hasta {formatearFechaCalendario(e.vigente_hasta)}
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${e.vencido ? "bg-coral-suave text-coral-oscuro" : est.estilo}`}>{e.vencido ? "Vencido" : est.etiqueta}</span>
                    </span>
                  </Enlace>
                </li>
              );
            })}
          </ul>
        )
      )}
    </div>
  );
}
