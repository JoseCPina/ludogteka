import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { FormularioPlataforma } from "@/components/plataforma/formulario-plataforma";
import { EnlacePestana } from "@/components/ui/enlace-pestana";
import { Field } from "@/components/ui/field";
import { formatearFecha } from "@/lib/formato";
import { BUCKET_ALERTAS, queVieron } from "@/lib/movil/alertas";
import { moderarAlerta } from "./acciones";

const ZONA = "America/Mexico_City";
const FILTROS = [
  { clave: "reportadas", texto: "Reportadas" },
  { clave: "escondidas", texto: "Escondidas" },
  { clave: "todas", texto: "Todas" },
] as const;
const MOTIVO: Record<string, string> = { falsa: "Falsa", ofensiva: "Ofensiva", repetida: "Repetida", otro: "Otro" };
const ESTADO: Record<string, string> = { sigue_ahi: "Sigue ahí", ya_no_esta: "Ya no está", rescatado: "Rescatado", reunido: "Con su familia", caducada: "Caducada" };

type Fila = { id: string; tipo: string; especie: string; descripcion: string | null; foto_path: string | null; estado: string; created_at: string; reportes: number; motivos: string[]; oculta_at: string | null; oculta_motivo: string | null };

/**
 * Moderación de las alertas de la calle (Fase 5, docs/app-duenos/FASE-5.md): las reportadas por la gente (falsa,
 * ofensiva, repetida), las escondidas (tres reportes la esconden sola) y todas. Nunca se muestra quién la subió.
 */
export default async function AlertasPlataforma({ searchParams }: { searchParams: Promise<{ filtro?: string }> }) {
  const { supabase } = await exigirPlataforma();
  const { filtro: pedido } = await searchParams;
  const filtro = FILTROS.some((f) => f.clave === pedido) ? pedido! : "reportadas";
  const { data, error } = await supabase.rpc("plataforma_alertas_calle", { p_filtro: filtro });
  const filas = (data ?? []) as Fila[];
  const paths = filas.map((f) => f.foto_path).filter((p): p is string => Boolean(p));
  const { data: firmadas } = paths.length ? await createSupabaseAdminClient().storage.from(BUCKET_ALERTAS).createSignedUrls(paths, 900) : { data: [] };
  const url = new Map((firmadas ?? []).map((f) => [f.path, f.signedUrl]));
  return (
    <div className="flex flex-col gap-6" data-moderacion-alertas>
      <div>
        <h1 className="text-2xl font-bold text-n-900">Alertas de la calle</h1>
        <p className="mt-1 text-n-600">Lo que la gente reporta como falso u ofensivo. Tres reportes de personas distintas esconden una alerta sola; aquí se confirma o se regresa.</p>
      </div>
      <nav className="flex flex-wrap gap-2" aria-label="Filtro">
        {FILTROS.map((f) => (
          <EnlacePestana key={f.clave} href={`/plataforma/alertas?filtro=${f.clave}`} activo={f.clave === filtro}>{f.texto}</EnlacePestana>
        ))}
      </nav>
      {error ? <p className="text-coral-oscuro">{error.message}</p> : null}
      {filas.length === 0 ? <p className="text-n-600">No hay alertas aquí.</p> : null}
      <div className="grid gap-4 md:grid-cols-2">
        {filas.map((a) => (
          <article key={a.id} className="flex gap-4 rounded-lg border border-n-200 bg-white p-4" data-alerta={a.id}>
            {a.foto_path && url.get(a.foto_path) ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={url.get(a.foto_path)!} alt="" className="h-28 w-28 shrink-0 rounded-md object-cover" />
            ) : null}
            <div className="flex min-w-0 flex-1 flex-col gap-2">
              <p className="font-semibold text-n-900">{queVieron(a.tipo, a.especie)}</p>
              {a.descripcion ? <p className="text-sm text-n-700">{a.descripcion}</p> : null}
              <p className="text-sm text-n-600">{formatearFecha(a.created_at, ZONA)} · {ESTADO[a.estado] ?? a.estado} · {a.reportes} {a.reportes === 1 ? "reporte" : "reportes"}{a.motivos.length ? ` (${a.motivos.map((m) => MOTIVO[m] ?? m).join(", ")})` : ""}</p>
              {a.oculta_at ? <p className="text-sm text-coral-oscuro">Escondida: {a.oculta_motivo ?? "sin motivo"}</p> : null}
              <div className="flex flex-wrap gap-2">
                {a.oculta_at ? (
                  <FormularioPlataforma accion={moderarAlerta.bind(null, a.id, "restaurar")} textoBoton="Mostrar otra vez" variante="secundario" />
                ) : (
                  <FormularioPlataforma accion={moderarAlerta.bind(null, a.id, "ocultar")} textoBoton="Esconder" variante="secundario">
                    <Field label="Motivo (opcional)" name="motivo" maxLength={200} />
                  </FormularioPlataforma>
                )}
                <FormularioPlataforma accion={moderarAlerta.bind(null, a.id, "borrar")} textoBoton="Borrar" variante="peligro" />
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
