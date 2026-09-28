import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { LogoPeluDesk } from "@/components/marca/peludesk";
import { BarraCelular } from "@/components/peludesk/barra-celular";
import { CapturasEnMovimiento } from "@/components/peludesk/capturas-en-movimiento";
import { Ilustracion, type NombreIlustracion } from "@/components/peludesk/ilustracion";
import { MenuCelular } from "@/components/peludesk/menu-celular";
import { RedesPeluDesk } from "@/components/peludesk/redes";
import { Revelar } from "@/components/peludesk/revelar";
import { CASO_REAL, CELULAR, ESCRITORIO, REDES_PELUDESK, urlDemo, whatsappPeluDesk } from "@/lib/peludesk/landing";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import "./peludesk.css";

// peludesk.mx. Reglas de esta página (pedido del dueño, 28 de septiembre de
// 2026): lenguaje de quien conoce el día a día de una guardería o una
// estética (qué le quita de encima, no qué módulos tiene); ningún párrafo de
// más de tres renglones en celular; botones con texto concreto repartidos
// en toda la página; las ilustraciones son las de la marca (Drive, "todos
// los paquetes"); las capturas, del demo con datos inventados; los planes,
// de la base. Nada de testimonios, cifras ni logos que no existan.

export const metadata: Metadata = {
  metadataBase: new URL("https://peludesk.mx"),
  title: { absolute: "PeluDesk — software para guarderías, hoteles y estéticas caninas" },
  description:
    "Reservas, citas de estética, cobros, contratos firmados desde el celular y vacunas al día, en un solo lugar. Prueba PeluDesk 15 días gratis, sin tarjeta.",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "PeluDesk — deja la libreta",
    description: "Para guarderías, hoteles y estéticas caninas. Pruébalo 15 días gratis, sin tarjeta.",
    images: [{ url: "/peludesk/capturas/tablero-escritorio-1600.webp", width: 1600, height: 1000 }],
    locale: "es_MX",
    type: "website",
  },
};

// ───────────────────────────── piezas

function Escritorio({ captura, alt, className = "" }: { captura: string; alt: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/peludesk/capturas/${captura}-escritorio-1600.webp`}
      srcSet={`/peludesk/capturas/${captura}-escritorio-800.webp 800w, /peludesk/capturas/${captura}-escritorio-1600.webp 1600w`}
      sizes="(min-width: 1024px) 680px, 100vw"
      width={ESCRITORIO.ancho}
      height={ESCRITORIO.alto}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={`pd-captura h-auto w-full rounded-[18px] border border-n-200 bg-white ${className}`}
    />
  );
}

function Celular({ captura, alt, className = "" }: { captura: string; alt: string; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/peludesk/capturas/${captura}-celular.webp`}
      width={CELULAR.ancho}
      height={CELULAR.alto}
      alt={alt}
      loading="lazy"
      decoding="async"
      className={`pd-captura h-auto rounded-[26px] border-[5px] border-grafito bg-white ${className}`}
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

function BotonPrueba({ className = "", texto = "Pruébalo 15 días gratis", claro = false }: { className?: string; texto?: string; claro?: boolean }) {
  return (
    <Link
      href="/registro"
      className={`pd-boton pd-boton-primario inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-full px-6 text-base font-semibold focus-visible:outline-none focus-visible:ring-[3px] ${
        claro
          ? "bg-menta text-morado hover:bg-menta-hover focus-visible:ring-white"
          : "bg-morado text-white hover:bg-morado-oscuro focus-visible:ring-morado-suave"
      } ${className}`}
    >
      {texto}
      <Flecha />
    </Link>
  );
}

function BotonDemo({ className = "", claro = false, texto = "Ve el demo en 1 minuto" }: { className?: string; claro?: boolean; texto?: string }) {
  return (
    <a
      href={`${urlDemo()}/demo`}
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

const ALIVIOS: { ilus: NombreIlustracion; antes: string; ahora: string }[] = [
  {
    ilus: "escena-agenda",
    antes: "Contar en la mañana quién llega",
    ahora: "Abres y ya está: llegadas, salidas, citas de estética y el cupo de día y de noche.",
  },
  {
    ilus: "escena-vacunas",
    antes: "Revisar cartillas a la carrera",
    ahora: "Si una vacuna venció, no te deja reservarle guardería ni hotel. Y te dice cuál.",
  },
  {
    ilus: "escena-bano",
    antes: "Calcular el precio de cada baño",
    ahora: "Sale solo, por raza o talla, con su precio aparte si llega con el pelo maltratado.",
  },
  {
    ilus: "escena-hotel",
    antes: "Adivinar si cabe uno más",
    ahora: "Guardería y hotel cuentan del mismo cupo. No aceptas un perro que no cabe.",
  },
];

type Momento = {
  id: string;
  cuando: string;
  titulo: string;
  texto: string;
  captura: string;
  alt: string;
  ilus: NombreIlustracion;
  segunda?: { captura: string; alt: string };
  celular?: { captura: string; alt: string };
};

const DIA: Momento[] = [
  {
    id: "manana",
    cuando: "En la mañana",
    titulo: "Abres y sabes cómo viene el día",
    texto: "Quién llega, quién se va y lo que está esperando: firmas, cartillas y saldos, con los días que lleva cada uno.",
    captura: "tablero",
    alt: "Tablero del día: llegan hoy, se van hoy, adentro ahora, ocupación de día y de noche, pendientes y citas de estética",
    ilus: "calendario",
  },
  {
    id: "llega",
    cuando: "Llega un perro",
    titulo: "Sus alertas antes de que cruce la puerta",
    texto: "Si se escapa, si es alérgico, si come aparte. Lo ves en su ficha, junto a su foto y sus vacunas.",
    captura: "expediente",
    alt: "Expediente de un perro con alerta de manejo y el estado de cada vacuna",
    ilus: "expediente",
  },
  {
    id: "estetica",
    cuando: "Durante el día",
    titulo: "Cada estilista con su agenda",
    texto: "Una columna por persona y ninguna cita encimada. Al terminar, se descuenta del inventario lo que se usó.",
    captura: "estetica",
    alt: "Agenda de estética del día con una columna por estilista",
    ilus: "bano",
    segunda: { captura: "precios", alt: "Precios del baño por grupo de raza, con precio para pelo maltratado" },
  },
  {
    id: "salida",
    cuando: "A la hora de la salida",
    titulo: "La cuenta ya está sumada",
    texto: "Noches, guardería, baño y extras en una sola cuenta. Cobras, das cambio y en la noche cuadras la caja.",
    captura: "cobro",
    alt: "Pantalla de cobro de una cuenta de hotel con el saldo y las formas de pago",
    ilus: "fluffy-feliz",
  },
  {
    id: "casa",
    cuando: "Desde su casa",
    titulo: "El dueño firma y ve lo suyo, sin llamarte",
    texto: "Firma el contrato con el dedo, ve sus citas y las fotos del día. Nunca ve tus precios ni a otros clientes.",
    captura: "contratos",
    alt: "Lista de contratos por firmar con los días que llevan esperando",
    ilus: "chihuahua-feliz",
    celular: { captura: "portal-perro", alt: "Ficha del perro en el portal del dueño: fotos del día, vacunas y contratos" },
  },
  {
    id: "cierre-dia",
    cuando: "Al cerrar",
    titulo: "Sabes cuánto ganaste, de verdad",
    texto: "Lo cobrado menos insumos, nómina y gastos del local, junto al mes anterior. Sin sumar a mano.",
    captura: "utilidad",
    alt: "Reporte de utilidad del mes con ingreso, insumos, nómina y gastos del local",
    ilus: "xolo-sentado",
  },
];

const ATRAS = [
  { captura: "inventario", titulo: "Lo que se acaba, antes de que se acabe", texto: "Champú, bolsas y croquetas con su mínimo; secadoras y jaulas con su mantenimiento.", alt: "Inventario de consumibles por área con existencia y mínimo" },
  { captura: "nomina", titulo: "La nómina sin calculadora", texto: "Asistencia, retardos, comisiones de estética, propinas y adelantos de cada quien.", alt: "Nómina del periodo por empleado con días, comisiones, propinas y total a pagar" },
];

const PREGUNTAS = [
  ["¿Necesito tarjeta para probarlo?", "No. Son 15 días con todo abierto. La tarjeta solo se pide cuando decides contratar."],
  ["¿Qué pasa cuando termina la prueba?", "No se borra nada. Consultas todo lo tuyo y vuelves a capturar en cuanto contratas."],
  ["¿Mis clientes tienen que instalar algo?", "No. Entran a su portal desde el navegador del celular con su teléfono y su contraseña."],
  ["¿Sirve en el celular?", "Sí. En la computadora del mostrador, en una tableta o en el celular de cualquiera de tu equipo."],
  ["¿Cobran por perro o por cliente?", "No. Pagas por tu negocio al mes, atiendas los perros que atiendas."],
  ["¿Cómo cancelo?", "Desde tu cuenta, cuando quieras. Lo sigues usando hasta que termina lo que ya pagaste."],
] as const;

const DEMO_ROLES = [
  ["recepcion", "Recepción", "El día, las reservas y la caja"],
  ["estetica", "Estilista", "Su agenda de hoy"],
  ["admin", "Dueña del negocio", "Ganancias, nómina y precios"],
  ["cliente", "Dueña de un perro", "Lo que ven tus clientes"],
] as const;

type Plan = { clave: string; nombre: string; descripcion: string | null; tipo: string; precio_mensual: number; precio_anual: number; modulos: string[] };
const pesos = (n: number) => `$${Number(n).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;

// Los planes salen de la base (los edita la plataforma), nunca del código.
async function cargarPlanes() {
  const supabase = await createSupabaseServerClient();
  const [{ data: planes }, { data: modulos }] = await Promise.all([
    supabase.from("planes").select("clave, nombre, descripcion, tipo, precio_mensual, precio_anual, modulos").eq("activo", true).order("orden"),
    supabase.from("modulos").select("clave, nombre").order("orden"),
  ]);
  const nombres = Object.fromEntries((modulos ?? []).map((m) => [m.clave as string, m.nombre as string]));
  return { planes: (planes ?? []) as Plan[], nombres };
}

// ───────────────────────────── página

export default async function PeluDeskLanding() {
  const demo = urlDemo();
  const whatsapp = whatsappPeluDesk("Hola, quiero saber más de PeluDesk.");
  const { planes, nombres } = await cargarPlanes();
  const planesBase = planes.filter((p) => p.tipo === "plan");
  const web = planes.find((p) => p.tipo === "complemento" && p.modulos.includes("pagina_web"));
  const destacado = planesBase.length >= 3 ? planesBase[planesBase.length - 1].clave : null;

  // Datos estructurados: quién es PeluDesk y sus redes (sameAs), y el
  // producto con el rango de precios que hay hoy en la base.
  const precios = planesBase.map((p) => Number(p.precio_mensual)).filter((n) => n > 0);
  const datos = [
    {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "PeluDesk",
      url: "https://peludesk.mx",
      logo: "https://peludesk.mx/marca/peludesk/favicon-180.png",
      sameAs: REDES_PELUDESK.map((r) => r.url),
    },
    {
      "@context": "https://schema.org",
      "@type": "SoftwareApplication",
      name: "PeluDesk",
      url: "https://peludesk.mx",
      applicationCategory: "BusinessApplication",
      operatingSystem: "Web",
      inLanguage: "es-MX",
      description: "Software para guarderías, hoteles y estéticas caninas: reservas, citas, cobros, contratos y expediente de cada perro.",
      ...(precios.length
        ? { offers: { "@type": "AggregateOffer", priceCurrency: "MXN", lowPrice: Math.min(...precios), highPrice: Math.max(...precios), offerCount: precios.length } }
        : {}),
    },
  ];

  return (
    <div className="min-h-[100dvh] overflow-x-clip bg-crema text-n-900">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(datos).replace(/</g, "\\u003c") }} />

      <header className="sticky top-0 z-20 border-b border-n-200/70 bg-crema/90 backdrop-blur supports-[backdrop-filter]:bg-crema/75">
        <div className="relative mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
          <Link href="/" aria-label="PeluDesk, inicio" className="rounded-md focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave">
            <LogoPeluDesk tamano={30} />
          </Link>
          <nav aria-label="Principal" className="hidden items-center gap-1 md:flex">
            {[
              ["#dia", "Cómo te ayuda"],
              ["#demo", "Demo"],
              ["#planes", "Planes"],
              ["#preguntas", "Preguntas"],
            ].map(([href, texto]) => (
              <a key={href} href={href} className="rounded-md px-3 py-2 text-sm font-semibold text-n-700 hover:text-morado focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave">
                {texto}
              </a>
            ))}
            <BotonDemo className="!min-h-10 !border-[1.5px] !px-4 text-sm lg:ml-2" texto="Ver demo" />
            <BotonPrueba className="!min-h-10 !px-4 text-sm" texto="Pruébalo gratis" />
          </nav>
          <div className="flex items-center gap-1 md:hidden">
            <BotonPrueba className="!min-h-10 !px-4 text-sm" texto="Pruébalo gratis" />
            <MenuCelular>
              <nav aria-label="Principal" className="flex flex-col">
                {[
                  ["#dia", "Cómo te ayuda"],
                  ["#demo", "Demo"],
                  ["#planes", "Planes"],
                  ["#preguntas", "Preguntas"],
                ].map(([href, texto]) => (
                  <a key={href} href={href} className="flex min-h-12 items-center border-b border-n-200 text-base font-semibold text-n-900">
                    {texto}
                  </a>
                ))}
              </nav>
              <div className="mt-5 grid gap-3">
                <BotonPrueba />
                <BotonDemo />
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
        {/* ── Encabezado ── */}
        <section id="inicio" className="relative">
          <Ilustracion nombre="textura-menta" className="pd-paralaje absolute -right-24 top-6 w-[420px] opacity-70 lg:right-0 lg:w-[560px]" sizes="560px" />
          <div className="relative mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-10 sm:px-6 lg:grid-cols-12 lg:gap-10 lg:pb-24 lg:pt-16">
            <div className="lg:col-span-5">
              <Etiqueta>Guarderías, hoteles y estéticas caninas</Etiqueta>
              <h1 className="mt-4 text-[2.5rem] font-bold leading-[1.05] tracking-[-0.03em] text-n-900 md:text-[3.4rem]">
                Deja la libreta. <span className="text-morado">Los perros ya te dan suficiente trabajo.</span>
              </h1>
              <p className="mt-5 max-w-[44ch] text-lg leading-relaxed text-n-700">
                Reservas, citas, cobros, contratos y vacunas en un solo lugar, para ti, tu equipo y los dueños.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                <BotonPrueba />
                <BotonDemo />
              </div>
              <p className="mt-4 text-sm text-n-600">Sin tarjeta. Tu negocio queda en tunegocio.peludesk.mx.</p>
            </div>
            <div className="relative lg:col-span-7">
              {/* Se asoma por detrás de la captura (el corte del dibujo queda tapado). */}
              <Ilustracion
                nombre="chihuahua-asomandose"
                prioridad
                className="pd-flotar absolute -right-[100px] top-[14%] z-0 hidden w-[124px] lg:block"
                sizes="124px"
              />
              <div className="relative z-10">
                <CapturasEnMovimiento
                  capturas={[
                    { captura: "tablero", etiqueta: "El día", alt: "Tablero del día: llegadas, salidas, perros adentro, ocupación y pendientes" },
                    { captura: "estetica", etiqueta: "Estética", alt: "Agenda de estética del día con una columna por estilista" },
                    { captura: "hotel", etiqueta: "Hotel", alt: "Hotel: llegadas, salidas, perros hospedados y ocupación por día" },
                    { captura: "cobro", etiqueta: "Caja", alt: "Cobro de una cuenta con el saldo y las formas de pago" },
                  ]}
                />
              </div>
              <Celular
                captura="portal"
                alt="Portal del dueño en el celular con sus próximas reservas"
                className="absolute -bottom-6 -left-4 z-20 hidden w-[20%] min-w-[112px] sm:block lg:-left-6"
              />
            </div>
          </div>
        </section>

        {/* ── Lo que te quita de encima ── */}
        <section aria-labelledby="t-alivio" className="relative border-y border-n-200 bg-white">
          <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
            <Revelar className="max-w-2xl">
              <Etiqueta>Lo que te quita de encima</Etiqueta>
              <h2 id="t-alivio" className="mt-3 text-3xl font-bold leading-tight tracking-[-0.02em] md:text-4xl">
                Lo que hoy haces de memoria, ya no.
              </h2>
            </Revelar>
            <ul className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
              {ALIVIOS.map((a, i) => (
                <li key={a.ilus}>
                  <Revelar retraso={i * 90} className="h-full">
                    <div className="pd-tarjeta flex h-full items-center gap-4 rounded-[22px] border border-n-200 bg-crema p-4 sm:flex-col sm:items-stretch sm:p-5">
                      <Ilustracion nombre={a.ilus} className="h-auto w-[104px] shrink-0 sm:mx-auto sm:w-full sm:max-w-[240px]" sizes="(min-width: 640px) 240px, 104px" />
                      <div>
                        <p className="text-sm font-semibold text-n-500 line-through decoration-coral decoration-2 sm:mt-4">{a.antes}</p>
                        <p className="mt-1.5 leading-snug text-n-800 sm:mt-2">{a.ahora}</p>
                      </div>
                    </div>
                  </Revelar>
                </li>
              ))}
            </ul>
            <Revelar className="mt-10 flex flex-col items-start gap-4 sm:flex-row sm:items-center">
              <BotonPrueba />
              <a href="#demo" className="group inline-flex min-h-12 items-center font-semibold text-morado underline decoration-morado/30 underline-offset-4 hover:decoration-morado">
                o entra al demo sin registrarte
                <Flecha />
              </a>
            </Revelar>
          </div>
        </section>

        {/* ── Un día en tu negocio ── */}
        <section id="dia" aria-labelledby="t-dia" className="scroll-mt-16">
          <div className="mx-auto max-w-6xl px-4 pt-16 sm:px-6 lg:pt-24">
            <Revelar className="relative max-w-2xl">
              <Etiqueta>Un día normal</Etiqueta>
              <h2 id="t-dia" className="mt-3 text-3xl font-bold leading-tight tracking-[-0.02em] md:text-4xl">
                De la primera llegada al corte de caja.
              </h2>
              <Ilustracion nombre="huellitas" className="pd-huellitas absolute -right-40 -top-6 hidden w-[150px] rotate-[30deg] opacity-80 md:block" sizes="150px" />
            </Revelar>
          </div>

          {DIA.map((m, i) => {
            const derecha = i % 2 === 1;
            return (
              <div key={m.id}>
                <article aria-labelledby={`t-${m.id}`} className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 lg:grid-cols-12 lg:gap-14 lg:py-20">
                  <Revelar className={`relative lg:col-span-4 ${derecha ? "lg:order-2" : ""}`}>
                    <p className="inline-flex items-center gap-2 rounded-full bg-menta-suave px-3 py-1 text-sm font-semibold text-menta-oscuro">
                      <span aria-hidden className="h-2 w-2 rounded-full bg-menta-oscuro" />
                      {m.cuando}
                    </p>
                    <h3 id={`t-${m.id}`} className="mt-4 text-2xl font-bold leading-tight tracking-[-0.02em] md:text-3xl">
                      {m.titulo}
                    </h3>
                    <p className="mt-3 max-w-[40ch] leading-relaxed text-n-700">{m.texto}</p>
                    <div className="mt-6 hidden w-[150px] overflow-hidden lg:block">
                      <Ilustracion nombre={m.ilus} className="pd-ladeo h-auto w-full" sizes="150px" />
                    </div>
                  </Revelar>
                  <Revelar retraso={80} className={`relative lg:col-span-8 ${derecha ? "lg:order-1" : ""}`}>
                    <Escritorio captura={m.captura} alt={m.alt} />
                    {m.segunda && (
                      <Escritorio captura={m.segunda.captura} alt={m.segunda.alt} className="mt-4 lg:absolute lg:-bottom-12 lg:-right-8 lg:mt-0 lg:w-[56%]" />
                    )}
                    {m.celular && (
                      <Celular
                        captura={m.celular.captura}
                        alt={m.celular.alt}
                        className={`absolute -bottom-8 hidden w-[22%] min-w-[110px] sm:block ${derecha ? "-right-6" : "-left-6"}`}
                      />
                    )}
                  </Revelar>
                </article>

                {/* Una invitación a media página, después de la agenda de estética. */}
                {m.id === "estetica" && (
                  <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
                    <Revelar>
                      <div className="relative overflow-hidden rounded-[26px] bg-morado px-6 py-10 text-crema sm:px-10">
                        <Ilustracion nombre="blob-lila" className="pd-paralaje absolute -right-20 -top-24 w-[340px] opacity-25" sizes="340px" />
                        <div className="relative flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
                          <div>
                            <p className="text-2xl font-bold leading-tight text-white md:text-3xl">¿Te imaginas tu mañana así?</p>
                            <p className="mt-2 text-crema/85">Abres tu negocio con tu nombre y tu teléfono. Te guiamos en cinco pasos.</p>
                          </div>
                          <BotonPrueba claro className="self-start md:self-auto" />
                        </div>
                      </div>
                    </Revelar>
                  </div>
                )}
                {m.id === "salida" && (
                  <div className="mx-auto flex max-w-6xl justify-center px-4 sm:px-6">
                    <Revelar className="flex flex-col items-center gap-2 text-center">
                      <p className="font-semibold text-n-700">¿Quieres ver cómo se cobra una cuenta de hotel?</p>
                      <BotonDemo texto="Ve el demo en 1 minuto" />
                    </Revelar>
                  </div>
                )}
              </div>
            );
          })}

          {/* Lo de atrás del mostrador */}
          <div className="mx-auto max-w-6xl px-4 pb-16 pt-4 sm:px-6 lg:pb-24">
            <Revelar>
              <h3 className="text-2xl font-bold tracking-[-0.02em]">Y lo de atrás del mostrador</h3>
            </Revelar>
            <ul className="mt-6 grid gap-6 md:grid-cols-2">
              {ATRAS.map((a, i) => (
                <li key={a.captura}>
                  <Revelar retraso={i * 90} className="h-full">
                    <div className="pd-tarjeta h-full overflow-hidden rounded-[22px] border border-n-200 bg-white">
                      <div className="aspect-[16/8] overflow-hidden border-b border-n-200 bg-n-50">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={`/peludesk/capturas/${a.captura}-escritorio-800.webp`}
                          width={800}
                          height={500}
                          alt={a.alt}
                          loading="lazy"
                          decoding="async"
                          className="h-full w-full object-cover object-top"
                        />
                      </div>
                      <div className="p-5">
                        <p className="text-lg font-bold text-n-900">{a.titulo}</p>
                        <p className="mt-1 text-n-700">{a.texto}</p>
                      </div>
                    </div>
                  </Revelar>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {CASO_REAL && (
          <section aria-labelledby="caso" className="bg-white">
            <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
              <Etiqueta>Caso real</Etiqueta>
              <h2 id="caso" className="mt-3 text-3xl font-bold tracking-tight">
                {CASO_REAL.negocio}, {CASO_REAL.ciudad}
              </h2>
              <blockquote className="mt-6 text-xl leading-relaxed text-n-800">“{CASO_REAL.cita}”</blockquote>
              <p className="mt-3 text-sm text-n-600">{CASO_REAL.quien}</p>
              <p className="mt-6 text-n-700">Usan: {CASO_REAL.usan.join(", ")}.</p>
            </div>
          </section>
        )}

        {/* ── La demo, sin registro ── */}
        <section id="demo" aria-labelledby="t-demo" className="relative scroll-mt-16 overflow-hidden bg-morado text-crema">
          <div className="relative mx-auto grid max-w-6xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-12 lg:items-center lg:py-24">
            <div className="lg:col-span-5">
              <Revelar desde="asomar" className="w-[150px] sm:w-[180px]">
                <Ilustracion nombre="clipboard" className="h-auto w-full" sizes="180px" />
              </Revelar>
              <Revelar>
                <p className="mt-4 text-sm font-semibold uppercase tracking-[0.1em] text-menta">Ve el demo en 1 minuto</p>
                <h2 id="t-demo" className="mt-3 text-3xl font-bold leading-tight tracking-[-0.02em] text-white md:text-4xl">
                  Pícale a todo. No se rompe nada.
                </h2>
                <p className="mt-4 max-w-[42ch] leading-relaxed text-crema/90">
                  Patitas &amp; Co. es un negocio de ejemplo con dos meses de movimiento. Todo es inventado y nada se guarda.
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

        {/* ── Planes ── */}
        {planesBase.length > 0 && (
          <section id="planes" aria-labelledby="t-planes" className="relative scroll-mt-16">
            <div className="mx-auto max-w-6xl px-4 pt-16 sm:px-6 lg:pt-24">
              <div className="flex items-end justify-between gap-6">
                <Revelar className="max-w-2xl">
                  <Etiqueta>Planes</Etiqueta>
                  <h2 id="t-planes" className="mt-3 text-3xl font-bold leading-tight tracking-[-0.02em] md:text-4xl">
                    Pagas por lo que tu negocio ofrece.
                  </h2>
                  <p className="mt-3 max-w-[56ch] leading-relaxed text-n-700">
                    Precios al mes, más IVA. Si pagas el año, pagas diez meses. Caja y clientes van en todos.
                  </p>
                </Revelar>
                <Revelar desde="asomar" className="hidden w-[130px] shrink-0 sm:block">
                  <Ilustracion nombre="xolo-sentado" className="h-auto w-full" sizes="130px" />
                </Revelar>
              </div>
              <ul className={`mt-10 grid gap-5 ${planesBase.length >= 3 ? "lg:grid-cols-3" : "md:grid-cols-2"}`}>
                {planesBase.map((p, i) => {
                  const esDestacado = p.clave === destacado;
                  return (
                    <li key={p.clave}>
                      <Revelar retraso={i * 90} className="h-full">
                        <div
                          className={`pd-tarjeta relative flex h-full flex-col rounded-[24px] border bg-white p-6 ${
                            esDestacado ? "border-morado ring-1 ring-morado" : "border-n-200"
                          }`}
                        >
                          {esDestacado && (
                            <span className="absolute -top-3 left-6 rounded-full bg-menta px-3 py-0.5 text-xs font-bold uppercase tracking-[0.08em] text-morado">
                              Todo incluido
                            </span>
                          )}
                          <h3 className="text-xl font-bold text-n-900">{p.nombre}</h3>
                          {p.descripcion && <p className="mt-1 text-sm text-n-600">{p.descripcion}</p>}
                          <p className="mt-5 text-4xl font-bold tabular-nums tracking-[-0.02em] text-n-900">
                            {pesos(p.precio_mensual)}
                            <span className="text-base font-medium text-n-600"> al mes + IVA</span>
                          </p>
                          <p className="mt-1 text-sm tabular-nums text-n-600">o {pesos(p.precio_anual)} al año + IVA</p>
                          <ul className="mt-5 flex flex-1 flex-col gap-2 border-t border-n-200 pt-5 text-sm text-n-800">
                            {p.modulos.map((m) => (
                              <li key={m} className="flex items-start gap-2">
                                <svg viewBox="0 0 20 20" width="18" height="18" aria-hidden="true" className="mt-px shrink-0 text-menta-oscuro" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M4.5 10.5l3.5 3.5 7.5-8" />
                                </svg>
                                {nombres[m] ?? m}
                              </li>
                            ))}
                          </ul>
                          <BotonPrueba className={`mt-6 w-full ${esDestacado ? "" : "!bg-white !text-morado ring-2 ring-inset ring-morado/25 hover:!bg-morado-suave"}`} />
                        </div>
                      </Revelar>
                    </li>
                  );
                })}
              </ul>
              {web && (
                <Revelar className="mt-6">
                  <div className="flex flex-col gap-5 rounded-[24px] border border-n-200 bg-menta-suave p-6 sm:flex-row sm:items-center">
                    <Ilustracion nombre="laptop" className="h-auto w-[120px] shrink-0" sizes="120px" />
                    <div className="flex-1">
                      <p className="text-lg font-bold text-n-900">
                        Tu página web, {pesos(web.precio_mensual)} al mes + IVA en cualquier plan.
                      </p>
                      <p className="mt-1 text-n-800">
                        <strong>Gratis de por vida</strong> si completas tu perfil en los primeros 7 días de tu prueba.
                      </p>
                    </div>
                  </div>
                </Revelar>
              )}
            </div>
          </section>
        )}

        {/* ── Preguntas ── */}
        <section id="preguntas" aria-labelledby="t-preguntas" className="scroll-mt-16">
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

        {/* ── Cierre ── */}
        <section id="cierre" aria-labelledby="t-cierre" className="px-4 pb-16 sm:px-6 lg:pb-24">
          <div className="relative mx-auto max-w-6xl overflow-hidden rounded-[32px] bg-morado px-6 py-12 text-center sm:px-10 lg:py-16">
            <Ilustracion nombre="huellitas" className="pd-huellitas absolute -right-6 top-8 hidden w-[130px] rotate-[20deg] opacity-25 brightness-0 invert md:block" sizes="130px" />
            <div className="relative">
              <Revelar desde="asomar" className="mx-auto w-[220px] sm:w-[260px]">
                <Ilustracion nombre="durmiendo" className="h-auto w-full" sizes="260px" />
              </Revelar>
              <h2 id="t-cierre" className="mx-auto mt-6 max-w-[22ch] text-3xl font-bold leading-tight tracking-[-0.02em] text-white md:text-4xl">
                Que el día termine con los perros dormidos y la caja cuadrada.
              </h2>
              <p className="mx-auto mt-4 max-w-[46ch] text-crema/90">15 días gratis, sin tarjeta. Si no te sirve, no pagas nada.</p>
              <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
                <BotonPrueba claro />
                <BotonDemo claro />
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-n-200 bg-white pb-24 md:pb-0">
        <div className="mx-auto grid max-w-6xl gap-8 px-4 py-10 sm:px-6 md:grid-cols-[1fr_auto_auto] md:items-center">
          <div>
            <LogoPeluDesk tamano={26} />
            <p className="mt-3 text-sm text-n-600">Para guarderías, hoteles y estéticas caninas. Hecho en México.</p>
          </div>
          <nav aria-label="Pie de página" className="flex flex-wrap gap-x-5 gap-y-2 text-sm font-semibold text-n-700">
            <a href="#demo" className="hover:text-morado">Demo</a>
            <a href="#planes" className="hover:text-morado">Planes</a>
            <a href="#preguntas" className="hover:text-morado">Preguntas</a>
            <Link href="/registro" className="hover:text-morado">Pruébalo gratis</Link>
            {whatsapp && (
              <a href={whatsapp} target="_blank" rel="noopener" className="hover:text-morado">WhatsApp</a>
            )}
          </nav>
          <RedesPeluDesk className="-ml-3 md:ml-0" />
        </div>
        <p className="mx-auto max-w-6xl px-4 pb-8 text-xs text-n-600 sm:px-6">PeluDesk es una marca de Menteo, S.A.S.</p>
      </footer>

      <BarraCelular>
        <BotonPrueba className="w-full" />
      </BarraCelular>
    </div>
  );
}
