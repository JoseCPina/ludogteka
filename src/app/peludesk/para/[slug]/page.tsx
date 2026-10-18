import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Star, WhatsappLogo, Rocket } from "@phosphor-icons/react/dist/ssr";
import { LogoPeluDesk } from "@/components/marca/peludesk";
import { PlantillaPaginaNegocio } from "@/components/pagina-negocio";
import { VistaPreviaApp } from "@/components/peludesk/vista-previa-prospecto";
import { metaPagina } from "@/lib/peludesk/seo";
import { detallesParaPagina, PLACES_URL, type LugarParaPagina } from "@/lib/prospectos/places";
import { colorDe, NOMBRE_SERVICIO, prospectoPorSlug, registrarVisita, serviciosDe, serviciosDePagina } from "@/lib/prospectos/pagina";

// «Así se vería <Negocio> en PeluDesk»: la vista previa que se le manda a un prospecto. Solo se llega por el link
// (noindex, fuera del sitemap y de robots). Los datos de Google se piden aquí, al mostrarla, con su atribución, y
// no se guardan. Cada visita queda en el CRM (prospectos_visitas) y sube al prospecto a «caliente».
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const p = await prospectoPorSlug(slug);
  return metaPagina({
    titulo: p ? `Así se vería ${p.nombre} en PeluDesk` : "PeluDesk",
    descripcion: p ? `Una vista previa de la página web, la agenda y la caja de ${p.nombre} en PeluDesk. Pruébalo 15 días gratis.` : "PeluDesk",
    ruta: `/para/${slug}`,
    indexar: false,
  });
}

async function deGoogle(placeId: string | null): Promise<LugarParaPagina | null> {
  const apiKey = process.env.GOOGLE_PLACES_API_KEY?.trim();
  if (!placeId || !apiKey) return null;
  const url = process.env.VERCEL_ENV !== "production" ? process.env.PLACES_API_URL?.trim() || PLACES_URL : PLACES_URL;
  try {
    return await detallesParaPagina({ apiKey, id: placeId, url, fotos: 4 });
  } catch (e) {
    console.error("[para] google", e instanceof Error ? e.message : e);
    return null;
  }
}

export default async function PaginaProspecto({ params, searchParams }: Params) {
  const { slug } = await params;
  const sp = await searchParams;
  const p = await prospectoPorSlug(slug);
  if (!p) notFound();
  const h = await headers();
  await registrarVisita({ slug, tipo: "visita", ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, navegador: h.get("user-agent"), interno: sp.interno === "1" });
  const g = await deGoogle(p.google_place_id);
  const servicios = serviciosDe(p);
  const color = colorDe(slug);
  const listaServicios = servicios.map((s) => NOMBRE_SERVICIO[s]).join(", ").replace(/, ([^,]*)$/, " y $1");
  const interno = sp.interno === "1" ? "?interno=1" : "";
  const subdominio = (p.nombre.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "").slice(0, 24) || "tunegocio") + ".peludesk.mx";

  const creditos = (g?.fotos ?? []).map((f, i) => (
    <span key={i}>
      Foto:{" "}
      {f.autores.map((a, k) => (
        <span key={k}>
          {k > 0 && ", "}
          {a.uri ? <a href={a.uri} target="_blank" rel="noopener noreferrer" className="underline">{a.nombre}</a> : a.nombre}
        </span>
      ))}{" "}
      · Google Maps
    </span>
  ));

  const botones = (
    <div className="flex flex-col gap-3 sm:flex-row">
      <a href={`/para/${slug}/ir/prueba${interno}`} data-boton-prueba className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-morado px-6 text-base font-semibold text-white">
        <Rocket size={20} weight="bold" aria-hidden /> Activar mi prueba gratis
      </a>
      <a href={`/para/${slug}/ir/whatsapp${interno}`} data-boton-whatsapp className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md px-6 text-base font-semibold text-white" style={{ background: "#117a43" }}>
        <WhatsappLogo size={20} weight="fill" aria-hidden /> Hablar por WhatsApp
      </a>
    </div>
  );

  return (
    <div className="min-h-[100dvh] bg-crema text-n-900">
      <p role="note" data-aviso-vista-previa className="sticky top-0 z-20 bg-n-900 px-4 py-2 text-center text-sm font-semibold text-white">
        Vista previa hecha por PeluDesk para {p.nombre}. No es su página oficial.
      </p>

      <header className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
        <LogoPeluDesk tamano={30} />
      </header>

      <main className="mx-auto flex max-w-5xl flex-col gap-10 px-4 pb-16 sm:px-6">
        <section className="flex flex-col gap-4">
          <h1 className="text-3xl font-bold leading-tight tracking-tight md:text-4xl">Así se vería {p.nombre} en PeluDesk</h1>
          <p className="max-w-[60ch] text-lg text-n-700">
            Armamos esta vista previa con los datos públicos de {p.nombre} en {p.ciudad}: su página web, su agenda, su caja y el portal para sus clientes, todo
            con {listaServicios}. Se prueba 15 días gratis, sin tarjeta.
          </p>
          {g?.calificacion != null && (
            <p className="flex items-center gap-1.5 text-n-700">
              <Star size={18} weight="fill" className="text-amber-500" aria-hidden />
              <b>{g.calificacion}</b> con {g.resenas ?? 0} reseñas en Google Maps
            </p>
          )}
          {botones}
        </section>

        <section aria-labelledby="t-web" className="flex flex-col gap-3">
          <h2 id="t-web" className="text-2xl font-bold tracking-tight">Su página web</h2>
          <p className="text-n-700">Viene incluida y se arma sola con su perfil. Así se vería en {subdominio}:</p>
          <div className="overflow-hidden rounded-[16px] border border-n-300 bg-white shadow-sm">
            <div className="flex items-center gap-2 border-b border-n-200 bg-n-100 px-3 py-2 text-xs text-n-600">
              <span className="flex gap-1" aria-hidden><i className="h-2.5 w-2.5 rounded-full bg-n-300" /><i className="h-2.5 w-2.5 rounded-full bg-n-300" /><i className="h-2.5 w-2.5 rounded-full bg-n-300" /></span>
              <span className="truncate rounded bg-white px-2 py-0.5">{subdominio}</span>
            </div>
            <PlantillaPaginaNegocio
              marca={{ color }}
              fotos={(g?.fotos ?? []).map((f) => f.uri)}
              vistaPrevia={{ creditos }}
              datos={{
                nombre: p.nombre,
                ciudad: p.ciudad,
                descripcion: g?.resumen ?? `${listaServicios.charAt(0).toUpperCase()}${listaServicios.slice(1)} en ${p.ciudad}.`,
                direccion: g?.direccion ?? p.direccion,
                logo_path: null,
                fotos: [],
                whatsapp: p.telefono_norm,
                horario: g?.horario.length ? g.horario.join(" · ") : null,
                servicios: serviciosDePagina(servicios),
              }}
            />
          </div>
        </section>

        <section aria-labelledby="t-app" className="flex flex-col gap-3">
          <h2 id="t-app" className="text-2xl font-bold tracking-tight">Su día a día en PeluDesk</h2>
          <p className="text-n-700">La agenda, la caja y lo que ven sus clientes en su celular. Las mascotas y las cifras son de ejemplo.</p>
          <VistaPreviaApp nombre={p.nombre} servicios={servicios} color={color} />
        </section>

        <section className="flex flex-col gap-4 rounded-[18px] bg-white p-6">
          <h2 className="text-2xl font-bold tracking-tight">¿Lo quieren con sus datos de verdad?</h2>
          <p className="text-n-700">Al activar la prueba, {p.nombre} queda con su propia dirección y su página web, y ustedes lo llenan con sus servicios y precios.</p>
          {botones}
        </section>

        <footer className="flex flex-col gap-1 text-xs text-n-500">
          {g && <p>Fotos, dirección, horario y calificación: Google Maps{g.mapsUri ? <> · <a href={g.mapsUri} target="_blank" rel="noopener noreferrer" className="underline">Ver en Google Maps</a></> : null}.</p>}
          <p>Esta página la hizo PeluDesk como muestra para {p.nombre}; no la hizo ni la publicó el negocio, y no usa su logo. Si no quieres que exista, escríbenos y la quitamos.</p>
        </footer>
      </main>
    </div>
  );
}
