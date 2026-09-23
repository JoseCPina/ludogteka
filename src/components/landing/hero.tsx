import Image from "next/image";
import {
  Car,
  Clock,
  Eye,
  ShieldCheck,
} from "@phosphor-icons/react/dist/ssr";
import { BotonWhatsApp } from "./comunes";
import { MENSAJES } from "@/lib/landing/negocio";
import fotoGrupo from "./fotos/guarderia-grupo.jpg";

export function Hero() {
  return (
    <section id="inicio" className="relative overflow-hidden">
      <div className="mx-auto grid max-w-7xl items-center gap-12 px-4 pb-16 pt-10 sm:px-6 md:pt-14 lg:grid-cols-12 lg:gap-10 lg:px-8 lg:pb-20 lg:pt-16">
        <div className="lg:col-span-6">
          <h1
            className="lp-entra-titular text-balance text-[2.5rem] font-extrabold leading-[1.05] tracking-[-0.03em] text-n-900 sm:text-5xl lg:text-[4rem]"
          >
            Aquí tu perro juega, descansa y sale{" "}
            <span className="relative whitespace-nowrap text-azul">
              guapo.
              <span
                className="lp-cinta absolute -bottom-3 left-0 h-[6px] w-full rounded-full"
                aria-hidden
              />
            </span>
          </h1>
          <p
            className="lp-entra mt-6 max-w-[34ch] text-lg leading-relaxed text-n-700 sm:text-xl"
            style={{ "--d": 1 } as React.CSSProperties}
          >
            Guardería, hotel y estética canina en San Luis Potosí, con
            monitoreo las 24 horas.
          </p>
          <div
            className="lp-entra mt-8 flex flex-col gap-3 sm:flex-row sm:items-center"
            style={{ "--d": 2 } as React.CSSProperties}
          >
            <BotonWhatsApp mensaje={MENSAJES.general} tamano="grande">
              Escríbenos por WhatsApp
            </BotonWhatsApp>
            <a
              href="#guarderia"
              className="lp-boton inline-flex min-h-14 items-center justify-center rounded-full border-2 border-n-300 bg-white px-7 text-lg font-bold text-n-900 hover:border-n-500 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-azul focus-visible:ring-offset-2"
            >
              Ver servicios y precios
            </a>
          </div>
        </div>

        <div className="relative lg:col-span-6">
          {/* Figuras de marca detrás de la foto. */}
          <div
            className="lp-flota absolute -right-6 -top-8 size-40 rounded-full bg-turquesa/80 sm:size-52"
            aria-hidden
          />
          <div
            className="lp-flota-2 absolute -bottom-6 -left-6 size-28 rounded-[40%] bg-amarillo sm:size-36"
            aria-hidden
          />
          <div
            className="lp-flota absolute -right-3 bottom-16 size-10 rounded-full bg-naranja sm:size-12"
            aria-hidden
          />

          <div className="lp-entra-foto relative overflow-hidden rounded-[2rem] shadow-[0_30px_60px_-30px_rgb(38_55_158/0.45)]">
            <Image
              src={fotoGrupo}
              alt="Grupo de perros felices en el patio de juego de la guardería, mirando a la cámara"
              placeholder="blur"
              preload
              quality={60}
              sizes="(min-width: 1280px) 616px, (min-width: 1024px) 50vw, calc(100vw - 32px)"
              className="aspect-[4/3] w-full object-cover"
            />
          </div>

          <div className="lp-entra-aviso absolute -bottom-7 left-4 flex max-w-[calc(100%-6rem)] sm:left-auto sm:right-8 sm:max-w-[20rem] items-center gap-3 rounded-3xl border border-n-200 bg-white/95 p-3.5 pr-5 shadow-[0_16px_40px_-18px_rgb(20_22_31/0.35)] backdrop-blur">
            <span className="grid size-11 shrink-0 place-items-center rounded-full bg-azul-suave text-azul">
              <Eye size={24} weight="duotone" aria-hidden />
            </span>
            <span className="text-[0.9375rem] leading-snug">
              <span className="block font-bold text-n-900">Monitoreo 24 horas</span>
              <span className="text-n-600">De día y de noche</span>
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}

const CONFIANZA = [
  {
    icono: Eye,
    titulo: "Siempre a la vista",
    texto: "Monitoreo 24 horas, de día y de noche.",
    color: "bg-azul-suave text-azul",
  },
  {
    icono: ShieldCheck,
    titulo: "Grupo seguro",
    texto: "Cada perro pasa una evaluación de comportamiento antes de entrar.",
    color: "bg-verde-suave text-verde-oscuro",
  },
  {
    icono: Clock,
    titulo: "Lunes a sábado",
    texto: "Guardería entre semana de 9:00 a 19:00 y sábado de 10:00 a 14:00.",
    color: "bg-turquesa-suave text-turquesa-oscuro",
  },
  {
    icono: Car,
    titulo: "Vamos por él",
    texto: "Recolección a domicilio de lunes a viernes: lo recogemos y lo regresamos.",
    color: "bg-amarillo-suave text-amarillo-oscuro",
  },
];

export function FranjaConfianza() {
  return (
    <section aria-label="Por qué Ludogteka" className="border-y border-n-200 bg-white">
      <ul className="mx-auto grid max-w-7xl grid-cols-1 gap-x-8 gap-y-7 px-4 py-10 sm:grid-cols-2 sm:px-6 lg:grid-cols-4 lg:px-8">
        {CONFIANZA.map(({ icono: Icono, titulo, texto, color }, i) => (
          <li
            key={titulo}
            className="lp-revela flex items-start gap-4"
            style={{ "--i": i } as React.CSSProperties}
          >
            <span className={`grid size-12 shrink-0 place-items-center rounded-2xl ${color}`}>
              <Icono size={26} weight="duotone" aria-hidden />
            </span>
            <span>
              <span className="block text-lg font-bold text-n-900">{titulo}</span>
              <span className="mt-0.5 block text-base leading-snug text-n-600">{texto}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
