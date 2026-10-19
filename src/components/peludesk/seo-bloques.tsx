import Link from "next/link";
import { LUDOGTEKA, type CasoGiro } from "@/lib/peludesk/ludogteka";
import { PrecioPlan } from "@/components/peludesk/precio-plan";
import { EnlaceRegistro } from "@/components/peludesk/enlace-registro";
import { pesos, type PlanUnico } from "@/lib/peludesk/plan";
import { tituloDeRuta } from "@/lib/peludesk/paginas";

const BOTON =
  "pd-boton pd-boton-primario inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-full bg-morado px-6 text-base font-semibold text-white hover:bg-morado-oscuro focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave";

/** Captura del demo (datos inventados) a 800/1600 px; la del celular es una sola imagen. */
export function CapturaSeo({ nombre, alt, celular = false }: { nombre: string; alt: string; celular?: boolean }) {
  if (celular) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={`/peludesk/capturas/${nombre}-celular.webp`} width={780} height={1688} alt={alt} loading="lazy" decoding="async" className="mx-auto h-auto w-full max-w-[260px] rounded-[22px] border border-n-200 bg-white" />
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/peludesk/capturas/${nombre}-escritorio-1600.webp`}
      srcSet={`/peludesk/capturas/${nombre}-escritorio-800.webp 800w, /peludesk/capturas/${nombre}-escritorio-1600.webp 1600w`}
      sizes="(min-width: 768px) 560px, 100vw"
      width={1600}
      height={1000}
      alt={alt}
      loading="lazy"
      decoding="async"
      className="h-auto w-full rounded-[18px] border border-n-200 bg-white"
    />
  );
}

export function CasoLudogteka({ caso }: { caso: CasoGiro }) {
  return (
    <section aria-labelledby="caso" className="border-y border-n-200 bg-white">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
        <p className="text-xs font-bold uppercase tracking-[0.1em] text-n-600">El caso de {LUDOGTEKA.nombre}</p>
        <h2 id="caso" className="mt-1 text-2xl font-bold text-n-900">{caso.titulo}</h2>
        <p className="mt-3 max-w-[68ch] text-n-700">{LUDOGTEKA.intro}</p>
        <p className="mt-3 max-w-[68ch] text-n-700">{caso.texto}</p>
        <ul className="mt-5 grid gap-3 md:grid-cols-3">
          {caso.puntos.map((p) => (
            <li key={p} className="rounded-2xl border border-n-200 bg-crema p-5 text-n-800">{p}</li>
          ))}
        </ul>
        <figure className="mt-6 rounded-2xl bg-menta-suave p-5">
          <blockquote className="text-lg font-semibold text-n-900">«{LUDOGTEKA.frases.join(" ")}»</blockquote>
          <figcaption className="mt-2 text-sm text-n-700">
            Equipo Ludogteka, {LUDOGTEKA.ciudad} ·{" "}
            <a href={LUDOGTEKA.instagram} target="_blank" rel="noopener" className="font-semibold text-morado underline underline-offset-2">Su Instagram</a>
          </figcaption>
        </figure>
      </div>
    </section>
  );
}

export function BloquePrecio({ plan, titulo = "Cuánto cuesta" }: { plan: PlanUnico | null; titulo?: string }) {
  if (!plan) return null;
  return (
    <section aria-labelledby="precio" className="mx-auto max-w-6xl px-4 py-12 sm:px-6">
      <h2 id="precio" className="text-2xl font-bold text-n-900">{titulo}</h2>
      <div className="mt-5 rounded-2xl border border-n-200 bg-white p-6">
        <PrecioPlan plan={plan} tamano="mediano" desglose />
        <p className="mt-3 max-w-[60ch] text-n-700">
          Un solo plan, sin costo de alta, con Veterinaria, Hotel y guardería, Estética, inventario, empleados, gastos, reportes, portal y página web. El anual cuesta {pesos(plan.anual)} + IVA: diez mensualidades por doce meses.
        </p>
        <div className="mt-5 flex flex-col gap-3 sm:flex-row">
          <EnlaceRegistro className={BOTON}>Pruébalo gratis</EnlaceRegistro>
          <Link href="/precios" className="inline-flex min-h-12 items-center justify-center rounded-full px-4 text-base font-semibold text-morado underline underline-offset-2">Ver todo lo que incluye</Link>
        </div>
      </div>
    </section>
  );
}

/** «Te puede servir»: enlaces internos con el título real de cada página. */
export function Relacionadas({ rutas, titulo = "Te puede servir" }: { rutas: string[]; titulo?: string }) {
  const items = rutas.map((r) => ({ ruta: r, titulo: tituloDeRuta(r) })).filter((x): x is { ruta: string; titulo: string } => !!x.titulo);
  if (items.length === 0) return null;
  return (
    <nav aria-label={titulo} className="mt-8">
      <p className="text-sm font-bold uppercase tracking-[0.08em] text-n-600">{titulo}</p>
      <ul className="mt-3 flex flex-col gap-2">
        {items.map((x) => (
          <li key={x.ruta}>
            <Link href={x.ruta} className="font-semibold text-morado underline underline-offset-2">{x.titulo}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
