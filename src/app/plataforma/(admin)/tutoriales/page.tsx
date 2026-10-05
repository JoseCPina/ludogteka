import Link from "next/link";
import { exigirPlataforma } from "@/lib/plataforma/sesion";
import { Field } from "@/components/ui/field";
import { CampoCopiable } from "@/components/ui/campo-copiable";
import { FormularioPlataforma } from "@/components/plataforma/formulario-plataforma";
import { AREAS_TUTORIALES, duracionTexto, urlArchivoTutorial } from "@/lib/tutoriales";
import { CANAL, DIAS_LINK, firmarPaquete } from "@/lib/tutoriales/paquete";
import { urlPlataforma } from "@/lib/pagos/urls";
import { guardarYoutube } from "./acciones";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

type Fila = {
  numero: string; slug: string; area: string; titulo: string; duracion_s: number | null; estado: string; publicado: boolean; con_voz: boolean;
  youtube_id: string | null; video_path: string | null; poster_path: string | null; master_donde: string | null; commit_app: string | null; version: number;
  por_actualizar_motivo: string | null; por_actualizar_desde: string | null;
};
type Progreso = { numero: string; estado: string; intentos: number; error: string | null; fase_error: string | null; tamano_bytes: number | null; caracteres_voz: number };

const ESTADO: Record<string, { texto: string; clase: string }> = {
  pendiente: { texto: "Pendiente", clase: "bg-n-100 text-n-600" },
  listo: { texto: "Listo", clase: "bg-menta-suave text-menta-oscuro" },
  listo_sin_voz: { texto: "Listo menos voz", clase: "bg-ambar-suave text-ambar-oscuro" },
  error: { texto: "Error", clase: "bg-coral-suave text-coral-oscuro" },
};

// La serie de videos tutoriales: estado de la producción, el paquete de
// YouTube para bajar, el id de YouTube de cada uno y los datos del canal.
export default async function TutorialesPlataforma() {
  const { supabase } = await exigirPlataforma();
  const [{ data }, { data: prog }] = await Promise.all([
    supabase.from("tutoriales").select("numero, slug, area, titulo, duracion_s, estado, publicado, con_voz, youtube_id, video_path, poster_path, master_donde, commit_app, version, por_actualizar_motivo, por_actualizar_desde").is("deleted_at", null).order("orden"),
    supabase.from("tutoriales_progreso").select("numero, estado, intentos, error, fase_error, tamano_bytes, caracteres_voz").is("deleted_at", null),
  ]);
  const filas = (data ?? []) as Fila[];
  const progreso = new Map(((prog ?? []) as Progreso[]).map((p) => [p.numero, p]));
  const listos = filas.filter((f) => f.estado === "listo" || f.estado === "listo_sin_voz");
  const firmados = await firmarPaquete(listos.filter((f) => f.master_donde === "prod"));
  const conteo = (e: string) => filas.filter((f) => f.estado === e).length;
  const porActualizar = filas.filter((f) => f.por_actualizar_desde);
  const sitio = urlPlataforma();
  const avance = filas.find((f) => f.numero === "00");
  const playlists = Object.values(AREAS_TUTORIALES);

  return (
    <div className="flex flex-col gap-8">
      <div>
        <h1 className="text-2xl font-bold text-n-900">Videos tutoriales</h1>
        <p className="mt-1 text-n-600">
          {filas.length} videos · {conteo("listo")} listos · {conteo("listo_sin_voz")} listos menos voz · {conteo("pendiente")} pendientes · {conteo("error")} con error.
          El corredor es <code>npm run tutoriales</code> (ver docs/TUTORIALES.md).
        </p>
        {porActualizar.length > 0 && (
          <p data-por-actualizar-resumen className="mt-2 rounded-md border-l-4 border-ambar bg-ambar-suave px-3 py-2 text-sm font-semibold text-ambar-oscuro">
            {porActualizar.length} {porActualizar.length === 1 ? "video está" : "videos están"} por actualizar ({porActualizar.map((f) => f.numero).join(", ")}): la app cambió después de grabarlos. Se vuelven a grabar con <code>npm run tutoriales -- --video NN --regrabar --prod</code>.
          </p>
        )}
      </div>

      <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-5">
        <h2 className="text-lg font-bold text-n-900">Paquete para YouTube</h2>
        <p className="text-sm text-n-600">
          Baja todo de una vez: <a className="font-semibold text-morado underline" href="/plataforma/tutoriales/urls.txt">urls.txt</a> (un link por archivo, valen {DIAS_LINK} días; <code>wget --content-disposition -i urls.txt</code>) y{" "}
          <a className="font-semibold text-morado underline" href="/plataforma/tutoriales/youtube.csv">youtube.csv</a> (título, descripción con capítulos, etiquetas, lista de reproducción y el nombre exacto de cada archivo). Después de subir cada video a YouTube, pega abajo su link o su id: el reproductor de la ayuda cambia solo al de YouTube.
        </p>
        {avance && <p className="text-sm text-n-700">El video 00 («{avance.titulo}») es el avance de la serie, de 30 a 45 segundos: para fijar en el canal y en las redes.</p>}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-bold text-n-900">Videos</h2>
        <ul className="flex flex-col gap-2">
          {filas.map((f) => {
            const p = progreso.get(f.numero);
            const e = ESTADO[f.estado] ?? ESTADO.pendiente;
            const p4 = firmados.get(f.numero) ?? {};
            return (
              <li key={f.numero} data-tutorial={f.numero} className="flex flex-col gap-2 rounded-lg border border-n-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold text-n-900">
                    <span className="text-n-500">{f.numero}</span> · {f.titulo}
                  </p>
                  <span className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="rounded-full bg-n-100 px-2 py-0.5 text-n-600">{AREAS_TUTORIALES[f.area] ?? f.area}</span>
                    <span className={`rounded-full px-2 py-0.5 font-semibold ${e.clase}`}>{e.texto}</span>
                    {f.por_actualizar_desde && <span data-por-actualizar className="rounded-full bg-ambar-suave px-2 py-0.5 font-semibold text-ambar-oscuro">Por actualizar</span>}
                    {f.publicado && <span className="rounded-full bg-morado-suave px-2 py-0.5 font-semibold text-morado">En la app</span>}
                    {f.youtube_id && <span className="rounded-full bg-menta-suave px-2 py-0.5 font-semibold text-menta-oscuro">En YouTube</span>}
                  </span>
                </div>
                <p className="text-sm text-n-600">
                  {f.duracion_s ? duracionTexto(f.duracion_s) : "sin render"}
                  {p?.tamano_bytes ? ` · ${(Number(p.tamano_bytes) / 1e6).toFixed(1)} MB` : ""}
                  {f.estado === "listo_sin_voz" ? " · falta la voz (se genera con ELEVENLABS_API_KEY)" : ""}
                  {f.commit_app ? ` · app ${f.commit_app.slice(0, 7)}` : ""}
                  {f.master_donde === "dev" ? " · el master vive en el entorno de desarrollo" : ""}
                </p>
                {f.por_actualizar_desde && (
                  <p className="text-sm text-ambar-oscuro">
                    Por actualizar desde {f.por_actualizar_desde.slice(0, 10)}: {f.por_actualizar_motivo}
                  </p>
                )}
                {p?.error && <p className="text-sm text-coral-oscuro">Error en {p.fase_error ?? "?"} (intento {p.intentos}): {p.error}</p>}
                {f.video_path && (
                  <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
                    <a className="font-semibold text-morado underline" href={urlArchivoTutorial(f.video_path) ?? "#"} target="_blank" rel="noreferrer">Ver 720p</a>
                    <Link className="font-semibold text-morado underline" href={`${sitio}/ayuda/videos/${f.slug}`} target="_blank">Página pública</Link>
                    {p4.master && <a className="font-semibold text-morado underline" href={p4.master}>Master 1080p</a>}
                    {p4.miniatura && <a className="font-semibold text-morado underline" href={p4.miniatura}>Miniatura</a>}
                    {p4.srt && <a className="font-semibold text-morado underline" href={p4.srt}>SRT</a>}
                    {p4.texto && <a className="font-semibold text-morado underline" href={p4.texto}>Texto de YouTube</a>}
                  </p>
                )}
                {f.video_path && (
                  <FormularioPlataforma accion={guardarYoutube} textoBoton="Guardar id de YouTube" variante="secundario" className="max-w-xl sm:flex-row sm:items-end">
                    <input type="hidden" name="numero" value={f.numero} />
                    <Field label="Link o id de YouTube" name="youtube" defaultValue={f.youtube_id ?? ""} placeholder="https://youtu.be/…" />
                  </FormularioPlataforma>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-5">
        <h2 className="text-lg font-bold text-n-900">Datos del canal de YouTube</h2>
        <CampoCopiable etiqueta="Nombre del canal" valor={CANAL.nombre} />
        <CampoCopiable etiqueta="Título para el perfil" valor={CANAL.titulo} />
        <CampoCopiable etiqueta="Descripción del canal" valor={CANAL.descripcion} />
        <CampoCopiable etiqueta="Palabras clave del canal" valor={CANAL.etiquetas.join(", ")} />
        <CampoCopiable etiqueta="Sitio web" valor={CANAL.sitio} />
        <p className="text-sm text-n-600">Idioma {CANAL.idioma} · país {CANAL.pais}. Listas de reproducción (una por área, en este orden): {playlists.join(" · ")}. La miniatura y los subtítulos de cada video vienen en el paquete.</p>
      </section>
    </div>
  );
}
