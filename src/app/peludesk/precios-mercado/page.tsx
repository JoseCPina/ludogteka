import type { Metadata } from "next";
import Link from "next/link";
import { MarcoHerramienta } from "@/components/herramientas/marco";
import { herramientaPorClave } from "@/lib/herramientas/lista";
import { GIROS_MERCADO, SERVICIO_PRINCIPAL, SERVICIOS_MERCADO, esGiroMercado, mesEnTexto, pesosMercado, slugDe, type GiroMercado } from "@/lib/mercado/catalogo";
import { ciudadesConDatos, fraseDeRango, leerConsulta, rangoDe } from "@/lib/mercado/rangos";
import { JsonLd, ORGANIZACION, SITIO, metaPagina, migas, preguntasFrecuentes } from "@/lib/peludesk/seo";
import { IndicePrecios } from "./indice";

/**
 * /precios-mercado: el Índice PeluDesk de precios. La consulta viaja en la dirección (?giro=&servicio=&ciudad=&talla=)
 * para que el link que manda el bot abra el mismo resultado. Indexable; las páginas por ciudad y giro viven en
 * /precios-mercado/<giro>/<ciudad>.
 */
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
const h = herramientaPorClave("precios-mercado")!;

const PREGUNTAS: [string, string][] = [
  ["¿De dónde salen los precios?", "De precios públicos: los sitios web de los negocios, lo que dicen las reseñas de Google, lo que capturan quienes usan esta herramienta y las tarifas de negocios de PeluDesk que lo autorizan, siempre como promedio. No se publica el precio de ningún negocio en particular."],
  ["¿Qué significa el rango?", "La mitad de los negocios de esa ciudad cobra entre el precio del 25 % y el del 75 %. La mediana es el precio de en medio: la mitad cobra menos y la mitad cobra más."],
  ["¿Por qué mi ciudad muestra el rango del estado o del país?", "Una ciudad necesita al menos 8 precios de ese servicio para tener rango propio. Mientras no los junte, se muestra el del estado y, si tampoco alcanza, el de México. El índice crece cada mes."],
  ["¿Mi precio se guarda cuando lo escribo?", "No. «¿Cuánto cobras tú?» solo ubica tu precio en la barra, en tu navegador. Solo si pides recibirlo por WhatsApp se guarda, ligado a tu teléfono, para mandártelo y precargarlo si abres tu cuenta."],
  ["¿Cada cuánto se actualiza?", "Cada mes. Si dejas tu WhatsApp, el día 1 te llega el rango actualizado de tu servicio y tu ciudad."],
];

export async function generateMetadata({ searchParams }: Props): Promise<Metadata> {
  const sp = await searchParams;
  const uno = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? null;
  const c = leerConsulta({ giro: uno("giro"), servicio: uno("servicio"), ciudad: uno("ciudad"), talla: uno("talla") });
  const giro = c ? GIROS_MERCADO.find((g) => g.clave === c.giro)! : null;
  const servicio = c ? SERVICIOS_MERCADO.find((s) => s.clave === c.servicio)! : null;
  const titulo = c && servicio ? `Cuánto cobra ${giro!.articulo} por ${servicio.nombre.toLowerCase()}${c.ciudad ? ` en ${c.ciudad.nombre}` : " en México"} | Índice PeluDesk` : "Índice PeluDesk de precios: cuánto cobran estéticas, hoteles, guarderías y veterinarias";
  return metaPagina({
    titulo: titulo.slice(0, 90),
    descripcion: "El rango de precios de cada servicio en tu ciudad, con datos públicos de negocios reales de México, y dónde queda tu precio. Gratis y sin cuenta.",
    ruta: "/precios-mercado",
    imagen: c ? { url: `/precios-mercado/imagen?${new URLSearchParams({ giro: c.giro, servicio: c.servicio, ...(c.ciudad ? { ciudad: c.ciudad.slug } : {}), ...(c.talla ? { talla: c.talla } : {}), formato: "og" })}`, width: 1200, height: 630, alt: "Rango de precios del Índice PeluDesk" } : undefined,
  });
}

export default async function PreciosMercado({ searchParams }: Props) {
  const sp = await searchParams;
  const uno = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : sp[k]) ?? null;
  const giroPedido = uno("giro");
  const giro: GiroMercado = esGiroMercado(giroPedido) ? giroPedido : "estetica";
  const c = leerConsulta({ giro, servicio: uno("servicio") ?? SERVICIO_PRINCIPAL[giro], ciudad: uno("ciudad"), talla: uno("talla") }) ?? leerConsulta({ giro, servicio: SERVICIO_PRINCIPAL[giro], ciudad: uno("ciudad"), talla: null })!;
  const [rango, ciudades] = await Promise.all([rangoDe(c), Promise.all(GIROS_MERCADO.map(async (g) => ({ giro: g.clave, lista: (await ciudadesConDatos(g.clave)).slice(0, 12) })))]);
  const frase = fraseDeRango(c, rango, pesosMercado, mesEnTexto(rango.fecha));
  const precio = Number(uno("precio")) || null;
  const conPaginas = ciudades.filter((x) => x.lista.length > 0);

  const ld: unknown[] = [
    migas([{ nombre: "Inicio", ruta: "/" }, { nombre: "Herramientas", ruta: "/herramientas" }, { nombre: h.nombre, ruta: h.ruta }]),
    {
      "@context": "https://schema.org",
      "@type": "WebApplication",
      name: h.nombre,
      url: `${SITIO}${h.ruta}`,
      description: h.que,
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      inLanguage: "es-MX",
      isAccessibleForFree: true,
      offers: { "@type": "Offer", price: 0, priceCurrency: "MXN" },
      publisher: ORGANIZACION,
    },
    {
      "@context": "https://schema.org",
      "@type": "Dataset",
      name: "Índice PeluDesk de precios de servicios para mascotas en México",
      description: h.datos,
      url: `${SITIO}${h.ruta}`,
      inLanguage: "es-MX",
      creator: ORGANIZACION,
      license: `${SITIO}/terminos`,
      spatialCoverage: "México",
      isAccessibleForFree: true,
      ...(rango.fecha ? { dateModified: rango.fecha } : {}),
    },
    preguntasFrecuentes(PREGUNTAS),
  ];

  return (
    <MarcoHerramienta clave="precios-mercado" relacionadas={["/software-para-esteticas-caninas", "/software-para-hoteles-caninos", "/veterinaria", "/guias/control-de-pagos-y-caja-en-una-guarderia-canina"]} cierre={{ titulo: "Pon tus precios en PeluDesk y cobra con ellos.", texto: "Tarifas por talla y pelaje, agenda, caja y recordatorios por WhatsApp. 15 días gratis, sin tarjeta; el precio que escribiste aquí queda cargado." }}>
      <JsonLd datos={ld} />
      <IndicePrecios inicial={{ giro: c.giro, servicio: c.servicio, ciudad: c.ciudad, talla: c.talla, rango, frase }} precioInicial={precio} />

      {conPaginas.length > 0 && (
        <section className="mx-auto max-w-6xl px-4 pb-6 sm:px-6">
          <div className="hta-regla pt-10">
            <h2 className="text-2xl font-bold tracking-tight text-n-900">Precios por ciudad</h2>
            <p className="mt-2 max-w-[60ch] text-n-700">Las ciudades que ya juntan 8 precios o más tienen su página, con todos los servicios del giro.</p>
            <div className="mt-6 grid gap-8 md:grid-cols-2 lg:grid-cols-4">
              {conPaginas.map((x) => (
                <div key={x.giro}>
                  <p className="hta-etiqueta">{GIROS_MERCADO.find((g) => g.clave === x.giro)!.plural}</p>
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {x.lista.map((ci) => (
                      <li key={ci.ciudad}>
                        <Link href={`/precios-mercado/${x.giro}/${slugDe(ci.ciudad)}`} className="hta-enlace">{ci.ciudad}</Link>
                        <span className="ml-2 text-sm text-n-600">{ci.muestras} precios</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      <section className="mx-auto max-w-6xl px-4 pb-4 sm:px-6">
        <div className="hta-regla pt-10">
          <h2 className="text-2xl font-bold tracking-tight text-n-900">Preguntas sobre el índice</h2>
          <dl className="mt-6 grid gap-x-12 gap-y-6 md:grid-cols-2">
            {PREGUNTAS.map(([q, a]) => (
              <div key={q}>
                <dt className="font-bold text-n-900">{q}</dt>
                <dd className="mt-1 text-n-700">{a}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </MarcoHerramienta>
  );
}
