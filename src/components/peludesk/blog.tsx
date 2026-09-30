import Link from "next/link";
import { Ilustracion, ILUSTRACIONES, type NombreIlustracion } from "@/components/peludesk/ilustracion";
import { EnlaceRegistro } from "@/components/peludesk/enlace-registro";
import { CATEGORIAS, fechaLarga, type Articulo } from "@/lib/peludesk/blog";
import { urlDemo } from "@/lib/peludesk/landing";

/** Piezas del blog y de las páginas de aterrizaje de peludesk.mx. */
export function IlustracionDeArticulo({ a, className = "" }: { a: Pick<Articulo, "imagen">; className?: string }) {
  const nombre = (a.imagen in ILUSTRACIONES ? a.imagen : "huellitas") as NombreIlustracion;
  return <Ilustracion nombre={nombre} className={className} sizes="(min-width: 768px) 320px, 60vw" />;
}

export function TarjetaArticulo({ a }: { a: Articulo }) {
  return (
    <article className="pd-tarjeta group flex flex-col overflow-hidden rounded-2xl border border-n-200 bg-white">
      <Link
        href={`/blog/${a.slug}`}
        className="grid aspect-[16/9] place-items-center bg-menta-suave p-4 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-inset focus-visible:ring-morado-suave"
        aria-hidden
        tabIndex={-1}
      >
        <IlustracionDeArticulo a={a} className="max-h-full w-auto object-contain" />
        <span className="sr-only">{a.titulo}</span>
      </Link>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-menta-oscuro">{CATEGORIAS[a.categoria].nombre}</p>
        <h3 className="text-lg font-bold leading-snug text-n-900">
          <Link href={`/blog/${a.slug}`} className="hover:text-morado focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave">
            {a.titulo}
          </Link>
        </h3>
        <p className="text-sm leading-relaxed text-n-700">{a.descripcion}</p>
        <p className="mt-auto pt-2 text-xs text-n-600">
          {fechaLarga(a.fecha)} · {a.minutos} min de lectura
        </p>
      </div>
    </article>
  );
}

export function RejillaArticulos({ articulos }: { articulos: Articulo[] }) {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {articulos.map((a) => (
        <li key={a.slug} className="flex">
          <div className="flex w-full">
            <TarjetaArticulo a={a} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** La invitación sobria al final de un artículo o de una página: prueba y demo. */
export function LlamadaSobria({ titulo = "¿Quieres dejar la libreta?", texto = "Pruébalo 15 días con todo abierto, sin tarjeta, o mira cómo se ve con un negocio de ejemplo." }: { titulo?: string; texto?: string }) {
  return (
    <aside aria-label="Prueba PeluDesk" className="rounded-2xl border border-n-200 bg-white p-6 sm:p-8">
      <p className="text-xl font-bold text-n-900">{titulo}</p>
      <p className="mt-2 max-w-[52ch] text-n-700">{texto}</p>
      <div className="mt-5 flex flex-col gap-3 sm:flex-row">
        <EnlaceRegistro className="pd-boton pd-boton-primario inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-full bg-morado px-6 text-base font-semibold text-white hover:bg-morado-oscuro focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave">
          Pruébalo 15 días gratis
        </EnlaceRegistro>
        <a
          href={`${urlDemo()}/demo`}
          data-pixel-evento="Lead"
          className="pd-boton inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-full border-2 border-morado/25 bg-white px-6 text-base font-semibold text-morado hover:border-morado/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave"
        >
          Ve el demo en 1 minuto
        </a>
      </div>
    </aside>
  );
}

export function Migas({ items }: { items: { nombre: string; ruta?: string }[] }) {
  return (
    <nav aria-label="Ruta de navegación" className="text-sm text-n-600">
      <ol className="flex flex-wrap items-center gap-x-2 gap-y-1">
        {items.map((it, i) => (
          <li key={it.nombre} className="flex items-center gap-2">
            {i > 0 && <span aria-hidden>›</span>}
            {it.ruta ? (
              <Link href={it.ruta} className="font-semibold text-morado hover:underline">
                {it.nombre}
              </Link>
            ) : (
              <span aria-current="page">{it.nombre}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
