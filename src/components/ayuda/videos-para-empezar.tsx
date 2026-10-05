import Link from "next/link";
import { duracionTexto, type Tutorial } from "@/lib/tutoriales";

// Los tres videos con los que se empieza (recorrido, primeros pasos y el
// tablero del día), si ya están publicados y esta persona los puede ver.
// Lo usan Bienvenida y el inicio de admin.
const EMPIEZA = ["01", "02", "04"];

export function VideosParaEmpezar({ videos }: { videos: Pick<Tutorial, "numero" | "slug" | "titulo" | "duracion_s">[] }) {
  const lista = EMPIEZA.map((n) => videos.find((v) => v.numero === n)).filter((v) => v !== undefined);
  if (lista.length === 0) return null;
  return (
    <section data-videos-para-empezar className="flex flex-col gap-3 rounded-xl border border-n-200 bg-n-50 p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-bold text-n-900">Empieza con estos videos</h2>
        <Link href="/ayuda/videos" className="text-sm font-semibold text-morado hover:underline">Ver todos</Link>
      </div>
      <ul className="flex flex-col gap-2">
        {lista.map((v) => (
          <li key={v!.slug}>
            <Link href={`/ayuda/videos/${v!.slug}`} className="flex items-center justify-between gap-2 rounded-lg border border-n-200 bg-white px-4 py-3 hover:border-morado">
              <span className="font-semibold text-n-900">▶ {v!.titulo}</span>
              <span className="text-xs text-n-500">{duracionTexto(v!.duracion_s)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
