import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { Rocket, WhatsappLogo, Sparkle, PlayCircle, ArrowRight, X, Check } from "@phosphor-icons/react/dist/ssr";
import { LogoPeluDesk } from "@/components/marca/peludesk";
import { PaginaWeb } from "@/components/web-negocio/pagina-web";
import { metaPagina } from "@/lib/peludesk/seo";
import { planUnico, pesos } from "@/lib/peludesk/plan";
import { prospectoPorSlug, registrarVisita } from "@/lib/prospectos/pagina";
import { lugarDeGoogle } from "@/lib/web-negocio/google";
import { colorDeFoto, fotoChica } from "@/lib/web-negocio/color";
import { datosDeProspecto } from "@/lib/web-negocio/desde-prospecto";
import { portalEjemplo } from "@/lib/web-negocio/catalogo";
import { subdominioSugerido, DEMO_POR_GIRO } from "@/lib/web-negocio/demo";
import type { GiroWeb } from "@/lib/web-negocio/tema";

// La página web de un prospecto, armada con sus datos de Google y lista para usarse en modo demostración: sus
// clientes piden cita o reserva, ven el portal y los avisos de WhatsApp, y nada se guarda en ningún negocio.
// Solo se llega por el link (noindex, fuera del sitemap y de robots). Lo de Google se pide al mostrarla, con su
// atribución, y no se guarda. Cada visita queda en el CRM (prospectos_visitas) y lo sube a «caliente».
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { slug } = await params;
  const p = await prospectoPorSlug(slug);
  return metaPagina({
    titulo: p ? `${p.nombre} · Vista previa de su página` : "PeluDesk",
    descripcion: p ? `La página web de ${p.nombre}, lista para que sus clientes pidan cita, vean su portal y reciban sus avisos. Hecha por PeluDesk como muestra.` : "PeluDesk",
    ruta: `/para/${slug}`,
    indexar: false,
  });
}

const ANTES_DESPUES: Record<GiroWeb, [string, string][]> = {
  veterinaria: [
    ["Te escriben a todas horas para preguntar horario, precio y si hay lugar.", "Tu página contesta sola: horario, servicios y pedir consulta en línea."],
    ["Vacunas que se pasan y pacientes que no regresan.", "El recordatorio de la próxima dosis puede salir solo por WhatsApp."],
    ["Expedientes en papel y recetas a mano.", "Consulta, carnet y receta en el mismo lugar, y el dueño ve su carnet en su celular."],
    ["Cobros en libreta y un corte que no cuadra.", "Cada cobro queda en caja: efectivo, transferencia, terminal o link de pago."],
  ],
  estetica: [
    ["Te escriben a todas horas para preguntar horario, precio y si hay lugar.", "Tu página contesta sola: menú de servicios y pedir cita en línea."],
    ["Citas que se olvidan y huecos en la agenda.", "Mandas el recordatorio por WhatsApp con un toque, con el mensaje ya escrito."],
    ["«¿Ya está listo mi perro?» por teléfono.", "El aviso de que ya puede pasar sale con un toque desde su cita, con el mensaje ya escrito."],
    ["Cobros en libreta y un corte que no cuadra.", "Cada cobro queda en caja: efectivo, transferencia, terminal o link de pago."],
  ],
  guarderia: [
    ["Te escriben a todas horas para preguntar horario, precio y si hay lugar.", "Tu página contesta sola: horario, servicios y reservar en línea."],
    ["Llega un perro sin vacunas y te enteras en la puerta.", "PeluDesk no deja reservar a un perro con vacunas vencidas, salvo que tú lo autorices."],
    ["Paquetes de días en una libreta.", "Cada día se descuenta solo del paquete del perro."],
    ["Cobros en libreta y un corte que no cuadra.", "Cada cobro queda en caja: efectivo, transferencia, terminal o link de pago."],
  ],
  hotel: [
    ["Te escriben a todas horas para preguntar si hay lugar esas fechas.", "Tu página contesta sola: horario, servicios y reservar en línea."],
    ["Un calendario en la pared que nadie actualiza.", "Llegadas, salidas y cupo de cada noche en un calendario."],
    ["Llega un perro sin vacunas y te enteras en la puerta.", "PeluDesk no deja reservar a un perro con vacunas vencidas, salvo que tú lo autorices."],
    ["Cobros en libreta y un corte que no cuadra.", "Cada cobro queda en caja: efectivo, transferencia, terminal o link de pago."],
  ],
};

function NotaPeluDesk({ children }: { children: React.ReactNode }) {
  return (
    <p data-nota-peludesk className="flex items-start gap-2.5 rounded-[14px] border border-morado/15 bg-white/80 p-3.5 text-[15px] leading-snug text-n-800" style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}>
      <Sparkle size={18} weight="fill" className="mt-0.5 shrink-0 text-morado" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

export default async function PaginaProspecto({ params, searchParams }: Params) {
  const { slug } = await params;
  const sp = await searchParams;
  const p = await prospectoPorSlug(slug);
  if (!p) notFound();
  const h = await headers();
  const esInterno = sp.interno === "1";
  const [, g, plan] = await Promise.all([
    registrarVisita({ slug, tipo: "visita", ip: h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null, navegador: h.get("user-agent"), interno: esInterno }),
    lugarDeGoogle(p.google_place_id, { fotos: 5, anchoFoto: 1000 }),
    planUnico(),
  ]);
  const color = await colorDeFoto(fotoChica(g?.fotos[0]?.uri));
  const datos = datosDeProspecto(p, g, color);
  const interno = esInterno ? "?interno=1" : "";
  const sub = `${subdominioSugerido(p.nombre)}.peludesk.mx`;
  const demo = DEMO_POR_GIRO[datos.giro];
  const esReserva = datos.giro === "hotel" || datos.giro === "guarderia";

  return (
    <div className="pb-[84px]">
      {g?.fotos[0] && <link rel="preconnect" href={new URL(g.fotos[0].uri).origin} />}
      <p role="note" data-aviso-vista-previa className="bg-[#16141c] px-4 py-1.5 text-center text-[12px] leading-snug text-white/75">
        Vista previa hecha por PeluDesk para {p.nombre}. No es su página oficial. · <span className="text-white/90">Modo demostración</span>
      </p>

      <PaginaWeb
        datos={datos}
        modo="demo"
        portal={portalEjemplo(datos.giro)}
        notas={{
          pedir: (
            <NotaPeluDesk>
              <b>Con PeluDesk</b>, tu cliente {esReserva ? "reserva" : "pide su cita"} aquí a cualquier hora, según tu horario. Tú la ves en tu agenda y la confirmas con un toque. Pruébalo: este formulario funciona.
            </NotaPeluDesk>
          ),
          resultado: (
            <NotaPeluDesk>
              Estos avisos los mandas desde PeluDesk con un toque, con el mensaje ya escrito.
              {datos.servicios.includes("veterinaria") ? " El recordatorio de la próxima vacuna puede salir solo." : ""} Nadie tiene que preguntar «¿a qué hora paso?».
            </NotaPeluDesk>
          ),
          portal: (
            <NotaPeluDesk>
              <b>Con PeluDesk</b>, el portal se llena solo con lo que registras en el mostrador: vacunas, {esReserva ? "reservas" : "citas"} y fotos. Tus clientes dejan de pedirte el carnet por WhatsApp.
            </NotaPeluDesk>
          ),
        }}
      />

      <section data-peludesk aria-labelledby="t-peludesk" className="bg-[#1d1830] text-white" style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}>
        <div className="mx-auto flex max-w-5xl flex-col gap-10 px-5 py-14 sm:px-8 md:py-20">
          <div className="flex flex-col gap-4">
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1 text-sm font-semibold text-white/85">
              <LogoPeluDesk tamano={18} claro /> Para {p.nombre}
            </span>
            <h2 id="t-peludesk" className="max-w-[24ch] text-[clamp(1.9rem,7vw,3rem)] font-bold leading-[1.08] tracking-tight">
              Tus clientes {esReserva ? "reservan" : "piden su cita"}, ven a su mascota y reciben sus avisos solos desde esta página.
            </h2>
            <p className="max-w-[56ch] text-lg text-white/80">Tú solo confirmas y ves la agenda llena en PeluDesk.</p>
          </div>

          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.1em] text-white/60">Tu día, antes y después</h3>
            <ul className="mt-4 grid gap-3 md:grid-cols-2" data-antes-despues>
              {ANTES_DESPUES[datos.giro].map(([antes, despues]) => (
                <li key={antes} className="flex flex-col gap-2.5 rounded-[18px] bg-white/[0.06] p-4 ring-1 ring-white/10">
                  <p className="flex items-start gap-2 text-[15px] text-white/65">
                    <X size={18} weight="bold" className="mt-0.5 shrink-0 text-[#ff8a7a]" aria-hidden />
                    <span className="line-through decoration-white/25">{antes}</span>
                  </p>
                  <p className="flex items-start gap-2 text-[16px] font-semibold">
                    <Check size={18} weight="bold" className="mt-0.5 shrink-0 text-[#7fe0b8]" aria-hidden />
                    {despues}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div className="grid items-center gap-5 rounded-[22px] bg-white p-5 text-n-900 sm:p-7 md:grid-cols-[1fr_auto]" data-ver-demo>
            <div>
              <p className="text-sm font-semibold text-morado">Del otro lado del mostrador</p>
              <h3 className="mt-1 text-2xl font-bold tracking-tight">Ver cómo lo manejarías tú</h3>
              <p className="mt-2 text-n-700">{demo.texto} Es un negocio de ejemplo y de solo lectura: puedes recorrerlo todo.</p>
            </div>
            <a href={`/para/${slug}/ir/demo${interno}`} data-boton-demo className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-morado px-6 font-semibold text-white">
              <PlayCircle size={22} weight="fill" aria-hidden /> Ver cómo lo manejarías tú
            </a>
          </div>

          <div className="flex flex-col gap-4">
            <h3 className="max-w-[26ch] text-[clamp(1.6rem,6vw,2.3rem)] font-bold leading-tight tracking-tight">Activa tu página y empieza a recibir {esReserva ? "reservas" : "citas"}</h3>
            <p className="max-w-[60ch] text-white/80">
              15 días gratis, sin tarjeta. Al terminar tu registro esta página queda publicada en <b className="text-white">{sub}</b> con tu nombre, tu horario, tu dirección, tus fotos y tus reseñas; tú pones tus precios.
              {plan ? ` Después, ${pesos(plan.mensual)} al mes + IVA con todo incluido.` : ""}
            </p>
            <div className="flex flex-col gap-3 min-[460px]:flex-row">
              <a href={`/para/${slug}/ir/prueba${interno}`} data-boton-prueba className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-[#7fe0b8] px-6 text-base font-bold text-[#1d1830]">
                <Rocket size={20} weight="bold" aria-hidden /> Activar mi página gratis
              </a>
              <a href={`/para/${slug}/ir/whatsapp${interno}`} data-boton-whatsapp className="inline-flex min-h-12 items-center justify-center gap-2 rounded-md border border-white/30 px-6 text-base font-semibold text-white">
                <WhatsappLogo size={20} weight="fill" aria-hidden /> Hablar por WhatsApp
              </a>
            </div>
          </div>

          <p className="text-xs leading-relaxed text-white/50">
            Esta página la hizo PeluDesk como muestra para {p.nombre}; no la hizo ni la publicó el negocio y no usa su logo. Fotos, horario, dirección y reseñas son de Google Maps
            {g?.mapsUri ? (
              <>
                {" "}(<a href={g.mapsUri} target="_blank" rel="noopener noreferrer" className="underline">ver en Google Maps</a>)
              </>
            ) : null}
            ; los precios y los datos del portal son de ejemplo. Si no quieres que exista, escríbenos y la quitamos.
          </p>
        </div>
      </section>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-black/10 bg-white/95 px-4 py-3 shadow-[0_-8px_24px_-16px_rgba(0,0,0,.4)] backdrop-blur" data-barra-activar style={{ fontFamily: "var(--font-outfit), system-ui, sans-serif" }}>
        <div className="mx-auto flex max-w-5xl items-center gap-3">
          <p className="hidden flex-1 text-sm text-n-700 sm:block">
            <b className="text-n-900">Así se vería tu página en PeluDesk.</b> Tus clientes {esReserva ? "reservan" : "agendan"} solos; tú ves la agenda llena.
          </p>
          <a href={`/para/${slug}/ir/prueba${interno}`} className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-md bg-morado px-5 font-semibold text-white sm:flex-none">
            Activar mi página gratis <ArrowRight size={18} weight="bold" aria-hidden />
          </a>
          <a href={`/para/${slug}/ir/whatsapp${interno}`} aria-label="Hablar por WhatsApp" className="inline-flex min-h-12 min-w-12 items-center justify-center rounded-md text-white" style={{ background: "#117a43" }}>
            <WhatsappLogo size={22} weight="fill" aria-hidden />
          </a>
        </div>
      </div>
    </div>
  );
}
