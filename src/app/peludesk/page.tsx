import { CAPTURAS_VET, FUNCIONES_VET, MENSAJES_CLAVE, MODULOS_TRES, PREGUNTAS_VET } from "@/lib/peludesk/veterinaria";
import { PrecioPlan } from "@/components/peludesk/precio-plan";
import { pesos, planUnico, SIN_COSTO_INICIAL } from "@/lib/peludesk/plan";
import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { LogoPeluDesk } from "@/components/marca/peludesk";
import { BarraCelular } from "@/components/peludesk/barra-celular";
import { AppFalsa } from "@/components/peludesk/animacion/app-falsa";
import { DemoDiferida, type IdDemo } from "@/components/peludesk/animacion/demo-diferida";
import { SeccionLudogteka } from "@/components/peludesk/animacion/ludogteka";
import { Mascota, type TipoMascota } from "@/components/peludesk/animacion/mascotas";
import { Ilustracion, type NombreIlustracion } from "@/components/peludesk/ilustracion";
import { ImgDiferida } from "@/components/peludesk/img-diferida";
import { MenuCelular } from "@/components/peludesk/menu-celular";
import { RedesPeluDesk } from "@/components/peludesk/redes";
import { EnlaceRegistro } from "@/components/peludesk/enlace-registro";
import { EventoPixelAlVer } from "@/components/peludesk/consentimiento/evento-pixel";
import { PieSitio } from "@/components/peludesk/sitio";
import { TarjetaArticulo } from "@/components/peludesk/blog";
import { todosLosArticulos } from "@/lib/peludesk/blog";
import { preguntasDeContratacion } from "@/lib/peludesk/preguntas-contratacion";
import { JsonLd, ORGANIZACION_RAIZ, aplicacionPeluDesk, preguntasFrecuentes, sitioWeb } from "@/lib/peludesk/seo";
import { Revelar } from "@/components/peludesk/revelar";
import { ESCRITORIO, urlDemo, whatsappPeluDesk } from "@/lib/peludesk/landing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import "./peludesk.css";
import "./animaciones.css";

// peludesk.mx. Reglas de esta página (pedido del dueño, 22 de octubre de
// 2026): Veterinaria va al frente (es el nicho principal); hotel, guardería y
// estética salen como valor extra ya incluido. Un solo plan, con el precio de
// la base (planUnico), nunca escrito aquí. Ningún párrafo de más de tres
// renglones en celular; botones con texto concreto; capturas del demo con datos
// inventados; nada de testimonios, cifras de clientes ni competidores.

const TITULO = "Software para veterinarias y negocios caninos | PeluDesk";

export async function generateMetadata(): Promise<Metadata> {
  const plan = await planUnico();
  const precio = plan ? ` ${pesos(plan.mensual)} + IVA al mes, sin costo inicial.` : "";
  const descripcion = `Software para clínicas veterinarias, guarderías, hoteles y estéticas caninas: expediente, reservas, citas, cobros y CFDI.${precio} 15 días gratis.`;
  return {
    metadataBase: new URL("https://peludesk.mx"),
    title: { absolute: TITULO },
    description: descripcion,
    alternates: { canonical: "/" },
    robots: { index: true, follow: true },
    openGraph: {
      title: "PeluDesk — el sistema de tu negocio canino o veterinario",
      description: descripcion,
      images: [{ url: "/peludesk/capturas/vet-expediente-escritorio-1600.webp", width: 1600, height: 1000 }],
      locale: "es_MX",
      type: "website",
    },
  };
}

// ───────────────────────────── piezas

function Escritorio({ captura, alt, className = "" }: { captura: string; alt: string; className?: string }) {
  return (
    <ImgDiferida
      src={`/peludesk/capturas/${captura}-escritorio-1600.webp`}
      srcSet={`/peludesk/capturas/${captura}-escritorio-800.webp 800w, /peludesk/capturas/${captura}-escritorio-1600.webp 1600w`}
      sizes="(min-width: 1024px) 680px, 100vw"
      width={ESCRITORIO.ancho}
      height={ESCRITORIO.alto}
      alt={alt}
      className={`pd-captura h-auto w-full rounded-[18px] border border-n-200 bg-white ${className}`}
    />
  );
}

function Flecha() {
  return (
    <svg className="pd-flecha ml-2 shrink-0" viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 10h11M11 5l5 5-5 5" />
    </svg>
  );
}

function BotonPrueba({ className = "", texto = "Pruébalo 15 días gratis", claro = false, brillo = false }: { className?: string; texto?: string; claro?: boolean; brillo?: boolean }) {
  return (
    <EnlaceRegistro
      className={`pd-boton pd-boton-primario ${brillo ? "pd-borde-brillo" : ""} inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-full px-6 text-base font-semibold focus-visible:outline-none focus-visible:ring-[3px] ${
        claro
          ? "bg-menta text-morado hover:bg-menta-hover focus-visible:ring-white"
          : "bg-morado text-white hover:bg-morado-oscuro focus-visible:ring-morado-suave"
      } ${className}`}
    >
      {texto}
      <Flecha />
    </EnlaceRegistro>
  );
}

function BotonDemo({ className = "", claro = false, texto = "Ve el demo en 1 minuto" }: { className?: string; claro?: boolean; texto?: string }) {
  return (
    <a
      href={`${urlDemo()}/demo`}
      data-pixel-evento="Lead"
      className={`pd-boton inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-full border-2 px-6 text-base font-semibold focus-visible:outline-none focus-visible:ring-[3px] ${
        claro
          ? "border-crema/70 text-crema hover:bg-white/10 focus-visible:ring-menta"
          : "border-morado/25 bg-white text-morado hover:border-morado/50 focus-visible:ring-morado-suave"
      } ${className}`}
    >
      {texto}
    </a>
  );
}

function Etiqueta({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-sm font-semibold uppercase tracking-[0.1em] text-menta-oscuro ${className}`}>{children}</p>;
}
// ───────────────────────────── contenido

const ENLACES_MENU = [
  ["/veterinaria", "Veterinaria"],
  ["#tambien", "Módulos"],
  ["#demo", "Demo"],
  ["#planes", "Precio"],
  ["#preguntas", "Preguntas"],
  ["/blog", "Blog"],
] as const;

const DEMO_ROLES = [
  ["recepcion", "Recepción", "El día, las reservas, las citas y la caja"],
  ["veterinaria", "Médica veterinaria", "Expediente, carnet, recetas y hospitalizados"],
  ["admin", "Dueña del negocio", "Ganancias, nómina y precios"],
  ["estetica", "Estilista", "Su agenda de hoy"],
  ["cliente", "Dueña de una mascota", "Lo que ven tus clientes"],
] as const;

const ALIVIOS = [
  { ilus: "escena-vacunas" as NombreIlustracion, antes: "Revisar cartillas a la carrera", ahora: "Si una vacuna venció, no te deja reservar guardería ni hotel. Y el carnet de la mascota trae su lote y su próxima dosis." },
  { ilus: "expediente" as NombreIlustracion, antes: "Escribir cada consulta a mano", ahora: "En la clínica dictas y PeluDesk arma el borrador. Tú lo revisas y lo firmas." },
  { ilus: "escena-hotel" as NombreIlustracion, antes: "Adivinar si cabe uno más", ahora: "Guardería y hotel cuentan del mismo cupo. No aceptas un perro que no cabe." },
  { ilus: "escena-bano" as NombreIlustracion, antes: "Calcular el precio de cada baño", ahora: "Sale solo, por raza o talla, con su precio aparte si llega con el pelo maltratado." },
];

const MASCOTA_MODULO: Record<string, TipoMascota> = { "guarderia-hotel": "hotel", estetica: "estetica", veterinaria: "veterinaria" };

const TIPOS_DE_NEGOCIO = [
  "Clínicas veterinarias",
  "Guarderías caninas",
  "Hoteles caninos",
  "Estéticas caninas",
  "Consultas y vacunas",
  "Baño y corte",
  "Hospitalización",
  "Day pass y mensualidades",
  "Recetas y carnet",
  "Cobros y corte de caja",
  "Recolección a domicilio",
  "Facturas CFDI",
];

const MINIDEMOS: { id: IdDemo; mascota: TipoMascota; titulo: string; texto: string; ancho?: boolean; reserva: string }[] = [
  { id: "vet", mascota: "veterinaria", titulo: "Veterinaria: dictas y queda la nota", texto: "Del dictado a la nota clínica, y de ahí a la receta con su folio SITPV y el carnet con QR.", ancho: true, reserva: "h-[560px] sm:h-[300px]" },
  { id: "hotel", mascota: "hotel", titulo: "Hotel y guardería: cuántos caben hoy", texto: "El cupo se ve de un vistazo y cada check-in o check-out lo actualiza.", reserva: "h-[300px]" },
  { id: "estetica", mascota: "estetica", titulo: "Estética: agenda y precio sin calcular", texto: "Las citas del día y el precio por talla y pelaje, ya puesto.", reserva: "h-[500px] sm:h-[330px]" },
  { id: "reportes", mascota: "recepcion", titulo: "Reportes: cómo va la semana", texto: "Ingresos por día y por servicio, sin armar una hoja de cálculo.", reserva: "h-[330px]" },
  { id: "cobros", mascota: "recepcion", titulo: "Cobros: la caja cuadra", texto: "Cada cobro con su palomita y el corte al cerrar el turno.", reserva: "h-[470px] sm:h-[330px]" },
  { id: "memoria", mascota: "estetica", titulo: "Memoria del negocio", texto: "Lo que el equipo aprende de cada mascota se queda en su ficha.", ancho: true, reserva: "h-[190px] sm:h-[150px]" },
];

const CAPTURA_MODULO: Record<string, string> = { "guarderia-hotel": "hotel", estetica: "estetica", veterinaria: "vet-expediente" };
const ALT_MODULO: Record<string, string> = {
  "guarderia-hotel": "Hotel: llegadas, salidas, perros hospedados y ocupación por día",
  estetica: "Agenda de estética del día con una columna por estilista",
  veterinaria: "Expediente clínico de una perrita con su línea de tiempo",
};

const PREGUNTAS_BASE = [
  ...PREGUNTAS_VET,
  ["¿Necesito tarjeta para probarlo?", "No. Son 15 días con todo abierto. La tarjeta solo se pide cuando decides contratar."],
  ["¿Qué pasa cuando termina la prueba?", "No se borra nada. Consultas todo lo tuyo y vuelves a capturar en cuanto contratas."],
  ["¿Cobran por mascota o por cliente?", "No. Pagas por tu negocio al mes, atiendas las mascotas que atiendas."],
  ["¿Cómo cancelo?", "Desde tu cuenta, cuando quieras. Lo sigues usando hasta que termina lo que ya pagaste."],
] as const satisfies readonly (readonly [string, string])[];

async function nombresDeModulos() {
  const supabase = await createSupabaseServerClient();
  const { data: modulos } = await supabase.from("modulos").select("clave, nombre").order("orden");
  return Object.fromEntries((modulos ?? []).map((m) => [m.clave as string, m.nombre as string]));
}

// ───────────────────────────── página

export default async function PeluDeskLanding() {
  const demo = urlDemo();
  const whatsapp = await whatsappPeluDesk("Hola, quiero saber más de PeluDesk.");
  const [plan, nombres, contratacion] = await Promise.all([planUnico(), nombresDeModulos(), preguntasDeContratacion()]);
  const articulosRecientes = todosLosArticulos().slice(0, 3);
  const PREGUNTAS: readonly (readonly [string, string])[] = plan
    ? [
        ["¿Cuánto cuesta?", `Un solo plan: ${pesos(plan.mensual)} + IVA al mes (${pesos(plan.total)} con IVA). ${SIN_COSTO_INICIAL}: no hay cargo de alta ni de activación, y Veterinaria, Hotel y guardería, Estética y la página web van incluidos.`],
        ...contratacion,
        ...PREGUNTAS_BASE,
      ]
    : [...contratacion, ...PREGUNTAS_BASE];

  // Datos estructurados: quién es PeluDesk (sameAs) y el producto con su oferta única.
  const datos = [
    ORGANIZACION_RAIZ,
    sitioWeb(),
    {
      ...aplicacionPeluDesk(plan),
      applicationSubCategory: "Software para clínicas veterinarias y negocios caninos",
      featureList: [...FUNCIONES_VET.map((f) => f.titulo), "Hotel y guardería", "Estética", "Página web del negocio"],
    },
  ];

  return (
    <div className="min-h-[100dvh] overflow-x-clip bg-crema text-n-900">
      <JsonLd datos={preguntasFrecuentes(PREGUNTAS)} />
      <EventoPixelAlVer nombre="ViewContent" datos={{ content_name: "landing", content_category: "landing" }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(datos).replace(/</g, "\\u003c") }} />

      <header className="sticky top-0 z-20 border-b border-n-200/70 bg-crema/90 backdrop-blur supports-[backdrop-filter]:bg-crema/75">
        <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="PeluDesk, inicio" className="rounded-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave">
            <LogoPeluDesk tamano={30} />
          </Link>
          <nav aria-label="Principal" className="hidden items-center gap-1 lg:flex">
            {ENLACES_MENU.map(([href, texto]) => (
              <a key={href} href={href} className="rounded-md px-3 py-2 text-sm font-semibold text-n-700 hover:text-morado focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave">
                {texto}
              </a>
            ))}
            <BotonDemo className="!min-h-10 !border-[1.5px] !px-4 text-sm lg:ml-2" texto="Ver demo" />
            <BotonPrueba className="!min-h-10 !px-4 text-sm" texto="Probar 15 días" />
          </nav>
          <div className="flex items-center gap-1 lg:hidden">
            <BotonPrueba className="!min-h-10 !px-4 text-sm" texto="Probar 15 días" />
            <MenuCelular>
              <nav aria-label="Principal" className="flex flex-col">
                {ENLACES_MENU.map(([href, texto]) => (
                  <a key={href} href={href} className="flex min-h-12 items-center border-b border-n-200 text-base font-semibold text-n-900">
                    {texto}
                  </a>
                ))}
              </nav>
              <div className="mt-5 grid gap-3">
                <BotonPrueba texto="Probar 15 días" />
                <BotonDemo texto="Ver demo" />
              </div>
              {whatsapp && (
                <a href={whatsapp} target="_blank" rel="noopener" className="mt-4 flex min-h-12 items-center justify-center rounded-full text-base font-semibold text-morado hover:bg-morado-suave">
                  Escríbenos por WhatsApp
                </a>
              )}
              <div className="mt-5 flex items-center justify-between">
                <span className="text-sm text-n-600">Síguenos</span>
                <RedesPeluDesk />
              </div>
            </MenuCelular>
          </div>
        </div>
      </header>

      <main>
        {/* ── Hero veterinario ── */}
        <section id="inicio" className="relative">
          {/* En celular el fondo menta es un degradado (no una imagen que compita con el texto por el primer pintado). */}
          <div aria-hidden="true" className="pointer-events-none absolute -right-24 top-6 h-[380px] w-[380px] rounded-full opacity-70 md:hidden" style={{ background: "radial-gradient(closest-side, #e3f3ed 0%, #e3f3ed 55%, rgb(227 243 237 / 0) 100%)" }} />
          <Ilustracion nombre="textura-menta" className="pd-paralaje absolute -right-24 top-6 hidden w-[420px] opacity-70 md:block lg:right-0 lg:w-[560px]" sizes="560px" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-12 lg:gap-10 lg:pb-24 lg:pt-16">
            <div className="lg:col-span-5">
              <div className="flex items-center gap-3">
                <Mascota tipo="recepcion" tamano={64} titulo="Toby, la mascota de recepción de PeluDesk" />
                <Etiqueta>Negocios caninos y veterinarios de México</Etiqueta>
              </div>
              <h1 className="mt-4 text-[2.4rem] font-bold leading-[1.05] tracking-[-0.03em] text-n-900 md:text-[3.2rem]">
                Tu negocio canino o veterinario, <span className="pd-brillo-titulo text-morado">en un solo sistema.</span>
              </h1>
              <p className="mt-5 max-w-[46ch] text-base leading-relaxed text-n-700 sm:text-lg">
                Clínica veterinaria, guardería, hotel y estética en un solo lugar: citas, expediente con dictado por IA, recetas, cobros y facturación CFDI.
              </p>
              {plan && <PrecioPlan plan={plan} className="mt-6" />}
              <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <BotonDemo texto="Ver demo" />
                <BotonPrueba brillo texto="Probar 15 días" />
              </div>
              <p className="mt-4 text-sm text-n-600">15 días gratis, sin tarjeta.</p>
            </div>
            <div className="relative lg:col-span-7">
              <AppFalsa />
            </div>
          </div>
        </section>

        {/* ── Marquee: para quién es ── */}
        <section aria-label="Para quién es PeluDesk" className="border-y border-n-200 bg-white py-4">
          <div className="pd-marquee">
            <ul className="pd-marquee-pista">
              {[0, 1].map((copia) =>
                TIPOS_DE_NEGOCIO.map((t) => (
                  <li
                    key={`${copia}-${t}`}
                    aria-hidden={copia === 1 ? true : undefined}
                    className={`flex items-center gap-3 whitespace-nowrap pr-3 text-base font-semibold text-n-700 ${copia === 1 ? "pd-marquee-copia" : ""}`}
                  >
                    {t}
                    <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-menta" />
                  </li>
                ))
              )}
            </ul>
          </div>
        </section>

        {/* ── Lo que te quita de encima ── */}
        <section aria-labelledby="t-alivio" className="relative border-y border-n-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
            <Revelar className="max-w-2xl">
              <Etiqueta>Lo que te quita de encima</Etiqueta>
              <h2 id="t-alivio" className="mt-3 text-3xl font-bold leading-tight tracking-[-0.02em] md:text-4xl">
                Lo que haces de memoria, ya no.
              </h2>
            </Revelar>
            <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {ALIVIOS.map((a, i) => (
                <li key={a.ilus}>
                  <Revelar retraso={i * 90} className="h-full">
                    <div className="pd-tarjeta flex h-full items-center gap-4 rounded-[22px] border border-n-200 bg-crema p-4 sm:flex-col sm:items-stretch sm:p-5">
                      <Ilustracion diferida nombre={a.ilus} className="h-auto w-[104px] shrink-0 sm:mx-auto sm:w-full sm:max-w-[240px]" sizes="(min-width: 640px) 240px, 104px" />
                      <div>
                        <p className="text-sm font-semibold text-n-500 line-through decoration-coral decoration-2 sm:mt-4">{a.antes}</p>
                        <p className="mt-1.5 leading-snug text-n-800 sm:mt-2">{a.ahora}</p>
                      </div>
                    </div>
                  </Revelar>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── También hotel, guardería y estética ── */}
        <section id="tambien" aria-labelledby="t-tambien" className="relative scroll-mt-16 border-b border-n-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
            <Revelar className="max-w-2xl">
              <Etiqueta>Todo lo que ofrecemos</Etiqueta>
              <h2 id="t-tambien" className="mt-3 text-3xl font-bold leading-tight tracking-[-0.02em] md:text-4xl">
                Tres módulos, un solo precio.
              </h2>
              <p className="mt-3 max-w-[52ch] leading-relaxed text-n-700">
                Todo va incluido en el mismo precio. Prendes lo que tu negocio hace y apagas lo que no desde tu panel; apagar un módulo nunca borra lo que ya tenías.
              </p>
            </Revelar>
            <ul className="mt-10 grid gap-6 md:grid-cols-3">
              {MODULOS_TRES.map((m, i) => (
                <li key={m.clave}>
                  <Revelar retraso={i * 90} className="h-full">
                    <div className="pd-tarjeta h-full overflow-hidden rounded-[22px] border border-n-200 bg-crema">
                      <div className="aspect-[16/8] overflow-hidden border-b border-n-200 bg-n-50">
                        <ImgDiferida
                          src={`/peludesk/capturas/${CAPTURA_MODULO[m.clave]}-escritorio-800.webp`}
                          width={800}
                          height={500}
                          alt={ALT_MODULO[m.clave]}
                          className="h-full w-full object-cover object-top"
                        />
                      </div>
                      <div className="p-5">
                        <div className="flex items-center gap-3">
                          <Mascota tipo={MASCOTA_MODULO[m.clave] ?? "recepcion"} tamano={52} retraso={i * 0.6} />
                          <h3 className="text-xl font-bold text-n-900">{m.nombre}</h3>
                        </div>
                        <p className="mt-3 leading-snug text-n-700">{m.texto}</p>
                      </div>
                    </div>
                  </Revelar>
                </li>
              ))}
            </ul>
            <Revelar className="mt-8">
              <p className="font-semibold text-n-900">Y en todo PeluDesk:</p>
              <ul className="mt-3 flex flex-wrap gap-2">
                {MENSAJES_CLAVE.map((m) => (
                  <li key={m} className="rounded-full bg-menta-suave px-4 py-2 text-sm font-semibold text-morado">
                    {m}
                  </li>
                ))}
              </ul>
            </Revelar>
            <Revelar className="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <BotonPrueba texto="Probar 15 días" />
              <a href="#demo" className="group inline-flex min-h-12 items-center font-semibold text-morado underline decoration-morado/30 underline-offset-4 hover:decoration-morado">
                o entra al demo sin registrarte
                <Flecha />
              </a>
            </Revelar>
          </div>
        </section>

        {/* ── Funciones veterinarias ── */}
        <section id="funciones" aria-labelledby="t-funciones" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
            <Revelar className="max-w-2xl">
              <Etiqueta>Veterinaria</Etiqueta>
              <h2 id="t-funciones" className="mt-3 text-3xl font-bold leading-tight tracking-[-0.02em] md:text-4xl">
                Si tienes clínica veterinaria, esto ya hace por ti
              </h2>
              <p className="mt-3 max-w-[52ch] leading-relaxed text-n-700">Solo lo que la app hace. Mira cada pantalla en el demo, sin registrarte.</p>
            </Revelar>
            <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {FUNCIONES_VET.map((f, i) => (
                <li key={f.titulo}>
                  <Revelar retraso={(i % 3) * 80} className="h-full">
                    <div className="pd-tarjeta h-full rounded-[22px] border border-n-200 bg-white p-5">
                      <h3 className="text-lg font-bold text-n-900">{f.titulo}</h3>
                      <p className="mt-2 leading-snug text-n-700">{f.texto}</p>
                    </div>
                  </Revelar>
                </li>
              ))}
            </ul>
            <ul className="mt-12 grid gap-8 md:grid-cols-2">
              {CAPTURAS_VET.slice(0, 2).map((c) => (
                <li key={c.captura} className="flex flex-col gap-3">
                  <Revelar>
                    <Escritorio captura={c.captura} alt={c.alt} />
                    <h3 className="mt-4 text-lg font-bold text-n-900">{c.titulo}</h3>
                    <p className="mt-1 text-n-700">{c.texto}</p>
                  </Revelar>
                </li>
              ))}
            </ul>
            <Revelar className="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <BotonPrueba texto="Probar 15 días" />
              <a href="/veterinaria" className="group inline-flex min-h-12 items-center font-semibold text-morado underline decoration-morado/30 underline-offset-4 hover:decoration-morado">
                Mira todo lo de Veterinaria
                <Flecha />
              </a>
            </Revelar>
          </div>
        </section>

        {/* ── Míralo trabajar: minidemos animados ── */}
        <section id="minidemos" aria-labelledby="t-minidemos" className="scroll-mt-16 border-y border-n-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
            <Revelar className="max-w-2xl">
              <Etiqueta>Míralo trabajar</Etiqueta>
              <h2 id="t-minidemos" className="mt-3 text-3xl font-bold leading-tight tracking-[-0.02em] md:text-4xl">
                Así se ve el día cuando todo está en su lugar.
              </h2>
              <p className="mt-3 max-w-[52ch] leading-relaxed text-n-700">Cada pantalla se arma sola al llegar a ella. Son ejemplos con datos de muestra.</p>
            </Revelar>
            <ul className="mt-10 grid gap-6 lg:grid-cols-2">
              {MINIDEMOS.map((d) => (
                <li key={d.id} className={d.ancho ? "lg:col-span-2" : ""}>
                  <div className="pd-tarjeta h-full rounded-[22px] border border-n-200 bg-crema p-4 sm:p-5">
                    <div className="flex items-center gap-3">
                      <Mascota tipo={d.mascota} tamano={52} retraso={0.3} />
                      <div>
                        <h3 className="text-lg font-bold leading-snug text-n-900">{d.titulo}</h3>
                        <p className="text-sm leading-snug text-n-700">{d.texto}</p>
                      </div>
                    </div>
                    <div className="mt-4">
                      <DemoDiferida id={d.id} reserva={d.reserva} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* ── La demo, sin registro ── */}
        <section id="demo" aria-labelledby="t-demo" className="relative scroll-mt-16 overflow-hidden bg-morado text-crema">
          <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-12 lg:items-center lg:py-24">
            <div className="lg:col-span-5">
              <Revelar desde="asomar" className="w-[150px] sm:w-[180px]">
                <Ilustracion nombre="clipboard" className="h-auto w-full" sizes="180px" />
              </Revelar>
              <Revelar>
                <p className="mt-4 text-sm font-semibold uppercase tracking-[0.1em] text-menta">Ver demo</p>
                <h2 id="t-demo" className="mt-3 text-3xl font-bold leading-tight tracking-[-0.02em] text-white md:text-4xl">
                  Prueba la demo
                </h2>
                <p className="mt-4 max-w-[42ch] leading-relaxed text-crema/90">
                  Patitas &amp; Co. ya tiene clientes, expedientes, vacunas, recetas y un hospitalizado. Pruébalo como si fuera tu negocio.
                </p>
              </Revelar>
            </div>
            <div className="lg:col-span-7">
              <p className="mb-3 font-semibold text-white">Entra como:</p>
              <ul className="grid gap-3 sm:grid-cols-2">
                {DEMO_ROLES.map(([rol, quien, que], i) => (
                  <li key={rol}>
                    <Revelar retraso={i * 70} className="h-full">
                      <a
                        href={`${demo}/demo/entrar/${rol}`}
                        data-pixel-evento="Lead"
                        className="pd-boton group flex h-full min-h-[76px] items-center justify-between gap-4 rounded-[20px] border border-white/15 bg-white/[0.07] px-5 py-4 hover:border-menta/60 hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-menta"
                      >
                        <span>
                          <span className="block text-lg font-semibold text-white">{quien}</span>
                          <span className="mt-0.5 block text-sm text-crema/80">{que}</span>
                        </span>
                        <span className="text-menta">
                          <Flecha />
                        </span>
                      </a>
                    </Revelar>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>

        {/* ── Ludogteka ya lo usa ── */}
        <section id="ludogteka" aria-labelledby="t-ludogteka" className="scroll-mt-16 bg-menta-suave">
          <SeccionLudogteka />
        </section>

        {/* ── Precio único ── */}
        {plan && (
          <section id="planes" aria-labelledby="t-planes" className="relative scroll-mt-16">
            <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
              <div className="flex items-end justify-between gap-6">
                <Revelar className="max-w-2xl">
                  <Etiqueta>Un solo plan</Etiqueta>
                  <h2 id="t-planes" className="mt-3 text-3xl font-bold leading-tight tracking-[-0.02em] md:text-4xl">
                    Un precio, todo incluido.
                  </h2>
                  <p className="mt-3 max-w-[56ch] leading-relaxed text-n-700">
                    Sin costo inicial y sin planes por servicio. Todos los módulos van incluidos, para todos.
                  </p>
                </Revelar>
                <Revelar desde="asomar" className="hidden w-[130px] shrink-0 sm:block">
                  <Ilustracion nombre="xolo-sentado" className="h-auto w-full" sizes="130px" />
                </Revelar>
              </div>
              <Revelar className="mt-10">
                <div className="pd-tarjeta mx-auto grid max-w-3xl gap-8 rounded-[28px] border border-morado bg-white p-6 ring-1 ring-morado sm:p-8 md:grid-cols-2">
                  <div>
                    <h3 className="text-xl font-bold text-n-900">{plan.nombre}</h3>
                    <PrecioPlan plan={plan} desglose className="mt-4" />
                    <p className="mt-3 text-sm tabular-nums text-n-600">
                      Si pagas el año, pagas diez meses: {pesos(plan.anual)} + IVA.
                    </p>
                    <p className="mt-2 text-sm text-n-600">15 días gratis, sin tarjeta.</p>
                    <div className="mt-6 flex flex-col gap-3">
                      <BotonPrueba texto="Probar 15 días" className="w-full" />
                      <BotonDemo texto="Ver demo" className="w-full" />
                    </div>
                  </div>
                  <ul className="flex flex-col gap-2 border-t border-n-200 pt-6 text-sm text-n-800 md:border-l md:border-t-0 md:pl-8 md:pt-0">
                    {plan.modulos.map((m) => (
                      <li key={m} className="flex items-start gap-2">
                        <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" className="mt-px shrink-0 text-menta-oscuro" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M4.5 10.5l3.5 3.5 7.5-8" />
                        </svg>
                        {nombres[m] ?? m}
                      </li>
                    ))}
                  </ul>
                </div>
              </Revelar>
            </div>
          </section>
        )}

        {/* ── Preguntas ── */}
        <section id="preguntas" aria-labelledby="t-preguntas" className="scroll-mt-16 border-t border-n-200 bg-white">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-12 lg:py-24">
            <Revelar className="lg:col-span-4">
              <Etiqueta>Sin letras chiquitas</Etiqueta>
              <h2 id="t-preguntas" className="mt-3 text-3xl font-bold leading-tight tracking-[-0.02em]">
                Lo que nos preguntan
              </h2>
              <div className="mt-6 hidden w-[140px] lg:block">
                <Ilustracion nombre="corazon" className="pd-latido h-auto w-full" sizes="140px" />
              </div>
            </Revelar>
            <div className="lg:col-span-8">
              {PREGUNTAS.map(([p, r]) => (
                <details key={p} className="pd-pregunta group border-b border-n-200">
                  <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 py-3 text-lg font-semibold text-n-900 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave">
                    {p}
                    <svg className="pd-mas shrink-0 text-morado" viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                      <path d="M10 4v12M4 10h12" />
                    </svg>
                  </summary>
                  <p className="max-w-[60ch] pb-5 leading-relaxed text-n-700">{r}</p>
                </details>
              ))}
              {whatsapp && (
                <p className="mt-6 text-n-700">
                  ¿Te quedó otra duda?{" "}
                  <a href={whatsapp} target="_blank" rel="noopener" className="font-semibold text-morado underline-offset-4 hover:underline">
                    Escríbenos por WhatsApp
                  </a>
                </p>
              )}
            </div>
          </div>
        </section>

        {/* ── Aprende: páginas por tipo de negocio y lo último del blog ── */}
        <section aria-labelledby="t-aprende" className="border-t border-n-200">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
            <Etiqueta>Para cada negocio</Etiqueta>
            <h2 id="t-aprende" className="mt-3 text-3xl font-bold leading-tight tracking-[-0.02em] md:text-4xl">
              Mira cómo te ayuda según lo que haces
            </h2>
            <ul className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ["/veterinaria", "Software para clínicas veterinarias"],
                ["/software-para-guarderias-caninas", "Software para guarderías caninas"],
                ["/software-para-esteticas-caninas", "Software para estéticas caninas"],
                ["/software-para-hoteles-caninos", "Software para hoteles caninos"],
                ["/precios", "Precios: un plan, todo incluido"],
                ["/guias/control-de-pagos-y-caja-en-una-guarderia-canina", "Control de pagos y caja"],
                ["/guias/contratos-y-vacunas-obligatorias-en-guarderias-y-hoteles-caninos", "Contratos y vacunas obligatorias"],
                ["/guias/facturacion-cfdi-para-esteticas-y-veterinarias", "Facturación CFDI 4.0"],
                ["/guias/recordatorios-por-whatsapp-y-portal-para-duenos-de-mascotas", "Recordatorios por WhatsApp y portal"],
                ["/alternativas", "PeluDesk frente a otras opciones"],
              ].map(([href, texto]) => (
                <li key={href}>
                  <Link href={href} className="flex min-h-14 items-center justify-between gap-3 rounded-2xl border border-n-200 bg-white px-5 font-semibold text-n-900 hover:border-morado focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave">
                    {texto}
                    <Flecha />
                  </Link>
                </li>
              ))}
            </ul>
            {articulosRecientes.length > 0 && (
              <>
                <h3 className="mt-12 text-xl font-bold text-n-900">Guías del blog</h3>
                <ul className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {articulosRecientes.map((a) => (
                    <li key={a.slug} className="flex">
                      <div className="flex w-full">
                        <TarjetaArticulo a={a} />
                      </div>
                    </li>
                  ))}
                </ul>
                <p className="mt-5">
                  <Link href="/blog" className="font-semibold text-morado underline underline-offset-2">Ver todas las guías</Link>
                </p>
              </>
            )}
          </div>
        </section>

        {/* ── Cierre ── */}
        <section id="cierre" aria-labelledby="t-cierre" className="px-4 pb-16 sm:px-6 lg:pb-24">
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[32px] bg-morado px-6 py-12 text-center sm:px-10 lg:py-16">
            <Ilustracion nombre="huellitas" className="pd-huellitas absolute -right-6 top-8 hidden w-[130px] rotate-[20deg] opacity-25 brightness-0 invert md:block" sizes="130px" />
            <div className="relative">
              <Revelar desde="asomar" className="mx-auto w-[220px] sm:w-[260px]">
                <Ilustracion nombre="durmiendo" className="h-auto w-full" sizes="260px" />
              </Revelar>
              <h2 id="t-cierre" className="mx-auto mt-6 max-w-[24ch] text-3xl font-bold leading-tight tracking-[-0.02em] text-white md:text-4xl">
                Que el día termine con la caja cuadrada y todo en su lugar.
              </h2>
              <p className="mx-auto mt-4 max-w-[46ch] text-crema/90">
                15 días gratis, sin tarjeta{plan ? `. Después, ${pesos(plan.mensual)} + IVA al mes, sin costo inicial` : ""}.
              </p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <BotonPrueba claro texto="Probar 15 días" />
                <BotonDemo claro texto="Ver demo" />
              </div>
            </div>
          </div>
        </section>
      </main>

      <PieSitio whatsapp={whatsapp} />

      <BarraCelular>
        <BotonPrueba className="w-full" texto="Probar 15 días" />
      </BarraCelular>
    </div>
  );
}
