import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MarcoHerramienta } from "@/components/herramientas/marco";
import { NegocioVerificado } from "@/components/herramientas/verificado";
import { coloniasDe, MINIMO_INDEXABLE, negociosDe, resolverCiudad, textoGiroDirectorio, type NegocioDirectorio } from "@/lib/directorio/consulta";
import { GIROS_MERCADO, esGiroMercado, normalizarTexto, type GiroMercado } from "@/lib/mercado/catalogo";
import { JsonLd, ORGANIZACION, SITIO, metaPagina, migas } from "@/lib/peludesk/seo";

/**
 * /directorio/<giro>/<ciudad>: los negocios del giro en esa ciudad, los mejor calificados primero, con filtros por
 * colonia y servicio (?colonia=&servicio=). Indexable con 10 negocios o más; si no, noindex. Calificación y reseñas
 * son las que el CRM guardó de Google Maps (con su atribución); lo demás de Google se pide en la ficha.
 */
export const dynamic = "force-dynamic";

type Props = { params: Promise<{ giro: string; ciudad: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };
const POR_PAGINA = 40;

async function cargar(giroParam: string, ciudadSlug: string) {
  if (!esGiroMercado(giroParam)) return null;
  const ciudad = await resolverCiudad(ciudadSlug);
  if (!ciudad) return null;
  const lista = await negociosDe(giroParam, ciudad.nombre);
  if (lista.length === 0) return null;
  return { giro: giroParam as GiroMercado, ciudad, lista };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { giro, ciudad } = await params;
  const d = await cargar(giro, ciudad);
  if (!d) return { robots: { index: false } };
  const g = textoGiroDirectorio(d.giro);
  return metaPagina({
    titulo: `${g.plural.charAt(0).toUpperCase() + g.plural.slice(1)} en ${d.ciudad.nombre}: ${d.lista.length} negocios con su calificación | PeluDesk`,
    descripcion: `Directorio de ${g.plural} en ${d.ciudad.nombre}${d.ciudad.estado ? `, ${d.ciudad.estado}` : ""}: ${d.lista.length} negocios ordenados por calificación y reseñas de Google Maps, con filtros por colonia y servicio.`.slice(0, 200),
    ruta: `/directorio/${d.giro}/${ciudad}`,
    indexar: d.lista.length >= MINIMO_INDEXABLE,
  });
}

export default async function DirectorioCiudad({ params, searchParams }: Props) {
  const { giro, ciudad: ciudadSlug } = await params;
  const sp = await searchParams;
  const d = await cargar(giro, ciudadSlug);
  if (!d) notFound();
  const g = textoGiroDirectorio(d.giro);
  const uno = (k: string) => ((Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? "").slice(0, 60);
  const colonia = uno("colonia");
  const servicio = esGiroMercado(uno("servicio")) ? (uno("servicio") as GiroMercado) : null;
  const pagina = Math.max(1, Number(uno("pagina")) || 1);
  const colonias = coloniasDe(d.lista);
  const filtrados = d.lista.filter((n) => (!colonia || normalizarTexto(n.colonia ?? "") === normalizarTexto(colonia)) && (!servicio || n.servicios.includes(servicio)));
  const paginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const visibles = filtrados.slice((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA);
  const ruta = `/directorio/${d.giro}/${ciudadSlug}`;
  const conFiltro = (cambios: Record<string, string | null>) => {
    const q = new URLSearchParams();
    const v = { colonia, servicio: servicio ?? "", ...cambios };
    for (const [k, val] of Object.entries(v)) if (val) q.set(k, val);
    const s = q.toString();
    return s ? `${ruta}?${s}` : ruta;
  };
  const otrosServicios = GIROS_MERCADO.filter((x) => x.clave !== d.giro && d.lista.some((n) => n.servicios.includes(x.clave)));

  return (
    <MarcoHerramienta
      clave="directorio"
      titulo={`${g.plural.charAt(0).toUpperCase() + g.plural.slice(1)} en ${d.ciudad.nombre}`}
      intro={`${d.lista.length} negocios, los mejor calificados primero. Calificación y reseñas: Google Maps.`}
      migas={[{ nombre: "Inicio", ruta: "/" }, { nombre: "Directorio", ruta: "/directorio" }, { nombre: `${g.plural} en ${d.ciudad.nombre}` }]}
      relacionadas={[`/precios-mercado`]}
      cierre={{ titulo: `¿Tu negocio está en esta lista?`, texto: "Ábrelo y reclámalo: la ficha queda como tu página web, verificada, con 15 días gratis de PeluDesk." }}
    >
      <JsonLd
        datos={[
          migas([{ nombre: "Inicio", ruta: "/" }, { nombre: "Directorio", ruta: "/directorio" }, { nombre: `${g.plural} en ${d.ciudad.nombre}`, ruta }]),
          { "@context": "https://schema.org", "@type": "ItemList", name: `${g.plural} en ${d.ciudad.nombre}`, url: `${SITIO}${ruta}`, inLanguage: "es-MX", numberOfItems: d.lista.length, publisher: ORGANIZACION, itemListElement: visibles.slice(0, 20).map((n, i) => ({ "@type": "ListItem", position: (pagina - 1) * POR_PAGINA + i + 1, name: n.nombre, url: `${SITIO}${ruta}/${n.slug}` })) },
        ]}
      />
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <section aria-label="Filtros" className="hta-regla flex flex-col gap-5 py-8">
          <form method="get" action={ruta} className="flex flex-wrap items-end gap-3">
            {servicio && <input type="hidden" name="servicio" value={servicio} />}
            <label className="flex flex-col gap-1">
              <span className="hta-etiqueta mb-0">Colonia</span>
              <select name="colonia" defaultValue={colonia} className="hta-campo min-w-[14rem]">
                <option value="">Todas</option>
                {colonias.map((c) => <option key={c.nombre} value={c.nombre}>{c.nombre} ({c.n})</option>)}
              </select>
            </label>
            <button type="submit" className="hta-opcion" data-sin-bloqueo>Filtrar</button>
            {(colonia || servicio) && <Link href={ruta} className="hta-enlace self-center text-sm">Quitar filtros</Link>}
          </form>
          {otrosServicios.length > 0 && (
            <div>
              <p className="hta-etiqueta">También ofrece</p>
              <div className="flex flex-wrap gap-2">
                {otrosServicios.map((x) => (
                  <Link key={x.clave} href={conFiltro({ servicio: servicio === x.clave ? null : x.clave })} className="hta-opcion" aria-pressed={servicio === x.clave}>{x.nombre}</Link>
                ))}
              </div>
            </div>
          )}
        </section>

        <ol className="hta-regla" data-lista-directorio>
          {visibles.map((n, i) => (
            <Fila key={n.id} n={n} posicion={(pagina - 1) * POR_PAGINA + i + 1} href={`${ruta}/${n.slug}`} />
          ))}
          {visibles.length === 0 && <li className="py-8 text-n-700">Ningún negocio con ese filtro.</li>}
        </ol>
        {paginas > 1 && (
          <nav aria-label="Páginas" className="flex flex-wrap gap-2 py-6">
            {Array.from({ length: paginas }, (_, i) => (
              <Link key={i} href={conFiltro({ pagina: i + 1 > 1 ? String(i + 1) : null })} aria-current={pagina === i + 1 ? "page" : undefined} className="hta-opcion" rel={i + 1 > 1 ? "nofollow" : undefined}>{i + 1}</Link>
            ))}
          </nav>
        )}
        <p className="py-6 text-xs leading-relaxed text-n-600">
          Calificación y número de reseñas de Google Maps al día de la última búsqueda; fotos, horario y reseñas se piden a Google al abrir cada ficha. PeluDesk arma estas fichas como muestra; ninguna es la página oficial del negocio. Si quieres que quitemos la tuya, escríbenos desde su ficha.
          {" "}<Link href={`/precios-mercado?${new URLSearchParams({ giro: d.giro, ciudad: ciudadSlug })}`} className="hta-enlace">Cuánto cobran {g.plural} en {d.ciudad.nombre}</Link>.
        </p>
      </div>
    </MarcoHerramienta>
  );
}

function Fila({ n, posicion, href }: { n: NegocioDirectorio; posicion: number; href: string }) {
  return (
    <li className="grid gap-x-6 gap-y-2 border-b border-n-200 py-5 sm:grid-cols-[3rem_minmax(0,1fr)_auto]">
      <span className="text-sm font-bold tabular-nums text-n-500">{posicion}</span>
      <div>
        <h2 className="text-lg font-bold leading-tight text-n-900">
          <Link href={href} className="hover:underline">{n.nombre}</Link>
          {n.verificado && <NegocioVerificado className="ml-2 align-middle" compacta />}
        </h2>
        <p className="mt-1 text-sm text-n-700">{[n.colonia, n.ciudad].filter(Boolean).join(" · ")}</p>
        <p className="mt-1 flex flex-wrap gap-1.5">
          {n.servicios.map((s) => <span key={s} className="rounded-full bg-n-100 px-2 py-0.5 text-xs font-semibold text-n-700">{GIROS_MERCADO.find((g) => g.clave === s)?.nombre}</span>)}
        </p>
      </div>
      <div className="text-sm text-n-700 sm:text-right">
        {n.calificacion != null ? (
          <><b className="text-base text-n-900">★ {n.calificacion.toFixed(1)}</b><br />{n.resenas != null ? `${n.resenas.toLocaleString("es-MX")} reseñas` : ""}</>
        ) : (
          <span className="text-n-500">Sin calificación</span>
        )}
      </div>
    </li>
  );
}
