import { resenasPublicasDeNegocio } from "@/lib/landing/resenas";
import { formatearFecha } from "@/lib/formato";
import { zonaActual } from "@/lib/negocio/actual";

/**
 * «Lo que dicen sus clientes»: reseñas verificadas (de dueños que sí fueron) en la página pública de un negocio con
 * PeluDesk. Sin reseñas no sale nada. Referencia: bloque testimonials de shadcn/studio y Mobbin landing (Square).
 */
export async function ResenasNegocio({ negocioId }: { negocioId: string }) {
  const [r, zona] = await Promise.all([resenasPublicasDeNegocio(negocioId), zonaActual()]);
  if (!r) return null;
  const conTexto = r.ultimas.filter((u) => u.texto && u.texto.trim().length > 0).slice(0, 6);
  return (
    <section id="resenas" aria-labelledby="t-resenas-clientes" className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-6" data-resenas-negocio>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 id="t-resenas-clientes" className="text-2xl font-bold text-foreground">Lo que dicen sus clientes</h2>
        {r.promedio != null && (
          <p className="text-sm text-muted-foreground" data-calificacion>
            <span className="text-lg font-bold text-foreground">{r.promedio.toFixed(1)}</span> <span aria-hidden className="text-amber-500">★</span> · {r.total} {r.total === 1 ? "reseña" : "reseñas"}
          </p>
        )}
      </div>
      {conTexto.length > 0 && (
        <ul className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {conTexto.map((u, i) => (
            <li key={i} className="flex flex-col gap-3 rounded-lg border border-border bg-card p-5 shadow-tarjeta" data-resena>
              <p className="text-amber-500" aria-label={`${u.estrellas} de 5 estrellas`}>{"★".repeat(u.estrellas)}<span className="text-muted-foreground/40">{"★".repeat(5 - u.estrellas)}</span></p>
              <p className="text-[15px] leading-relaxed text-foreground">{u.texto}</p>
              {u.respuesta && <p className="rounded-md bg-muted p-3 text-sm text-muted-foreground"><span className="font-semibold text-foreground">Respuesta del negocio:</span> {u.respuesta}</p>}
              <p className="mt-auto text-sm text-muted-foreground">{u.quien} · {formatearFecha(u.createdAt, zona)}</p>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-3 text-xs text-muted-foreground">Reseñas de clientes que tuvieron su cita o estancia aquí, verificadas por PeluDesk.</p>
    </section>
  );
}
