import Image from "next/image";
import { CalendarCheck, Clock, InfinityIcon, Ticket } from "@phosphor-icons/react/dist/ssr";
import { BotonWhatsApp, Precio } from "./comunes";
import { GUARDERIA, HORARIO_GUARDERIA, MENSAJES, pesos } from "@/lib/landing/negocio";
import fotoJuego from "./fotos/guarderia-juego.jpg";

export function Guarderia() {
  return (
    <section id="guarderia" className="bg-n-50 py-20 lg:py-28">
      <div className="mx-auto grid max-w-7xl gap-12 px-4 sm:px-6 lg:grid-cols-12 lg:gap-14 lg:px-8">
        <div className="lp-revela lg:col-span-5">
          <div className="lp-zoom overflow-hidden rounded-[2rem] lg:sticky lg:top-24">
            <Image
              src={fotoJuego}
              alt="Dos perros jugando a jalar un juguete azul en el pasto"
              placeholder="blur"
              sizes="(min-width: 1280px) 500px, (min-width: 1024px) 40vw, 100vw"
              className="aspect-[4/3] w-full object-cover lg:aspect-[4/5]"
            />
          </div>
        </div>

        <div className="lg:col-span-7">
          <h2 className="lp-revela text-balance text-4xl font-extrabold leading-[1.1] tracking-[-0.025em] text-n-900 sm:text-5xl">
            Guardería: un día entero de juego.
          </h2>
          <p className="lp-revela mt-5 max-w-[52ch] text-lg leading-relaxed text-n-700">
            Lo dejas en la mañana y lo recoges cansado y feliz. Socializa con
            perros evaluados, juega y descansa bajo la mirada del equipo y de
            las cámaras.
          </p>
          <p className="lp-revela mt-5 inline-flex items-center gap-2 rounded-full bg-turquesa-suave px-4 py-2 text-base font-bold text-turquesa-oscuro">
            <Clock size={20} weight="bold" aria-hidden />
            {HORARIO_GUARDERIA.dias}, {HORARIO_GUARDERIA.horas}
          </p>

          <div className="mt-10 grid grid-cols-2 gap-3 sm:gap-4">
            <div className="lp-revela rounded-3xl border border-n-200 bg-white p-5 sm:p-6" style={{ "--i": 0 } as React.CSSProperties}>
              <p className="text-lg font-bold text-n-900">Ocasional</p>
              <p className="mt-1 text-base text-n-600">Solo las horas que lo necesites.</p>
              <Precio monto={pesos(GUARDERIA.ocasionalHora)} unidad="por hora" className="mt-4 block text-[2rem] sm:text-4xl" />
            </div>
            <div className="lp-revela rounded-3xl border border-n-200 bg-white p-5 sm:p-6" style={{ "--i": 1 } as React.CSSProperties}>
              <p className="text-lg font-bold text-n-900">Día completo</p>
              <p className="mt-1 text-base text-n-600">De 9:00 a 19:00, todo el día.</p>
              <Precio monto={pesos(GUARDERIA.diaCompleto)} unidad="por día" className="mt-4 block text-[2rem] sm:text-4xl" />
            </div>

            <div
              className="lp-revela relative overflow-hidden col-span-2 rounded-3xl bg-azul p-6 text-white sm:p-8"
              style={{ "--i": 2 } as React.CSSProperties}
            >
              <div className="absolute -right-10 -top-10 size-44 rounded-full bg-turquesa/30" aria-hidden />
              <div className="absolute -bottom-16 right-24 size-32 rounded-full bg-white/10" aria-hidden />
              <div className="relative flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
                <div>
                  <p className="inline-flex items-center gap-2 text-lg font-bold">
                    <InfinityIcon size={24} weight="bold" aria-hidden />
                    Mensualidad
                  </p>
                  <p className="mt-1 max-w-[30ch] text-base text-white/85">
                    Días ilimitados de lunes a viernes. Para el perro que viene diario.
                  </p>
                </div>
                <p className="tabular-nums">
                  <span className="text-5xl font-extrabold tracking-[-0.03em]">{pesos(GUARDERIA.mensualidad)}</span>
                  <span className="ml-1 text-base font-semibold text-white/85">al mes</span>
                </p>
              </div>
            </div>
          </div>

          <h3 className="lp-revela mt-12 flex items-center gap-2 text-2xl font-bold text-n-900">
            <Ticket size={28} weight="duotone" className="text-azul" aria-hidden />
            Day pass
          </h3>
          <p className="lp-revela mt-2 max-w-[52ch] text-base leading-relaxed text-n-600">
            Paquetes de días completos para usar cuando quieras dentro de la vigencia.
            Sirven para cualquiera de tus perros.
          </p>
          <ul className="mt-6 grid gap-3 sm:grid-cols-3">
            {GUARDERIA.pases.map((p, i) => (
              <li
                key={p.pases}
                className="lp-revela rounded-3xl border border-n-200 bg-white p-5"
                style={{ "--i": i } as React.CSSProperties}
              >
                <p className="text-lg font-bold text-n-900">
                  <span className="tabular-nums">{p.pases}</span> pases
                </p>
                <Precio monto={pesos(p.precio)} className="mt-3 block text-3xl" />
                <p className="mt-3 text-[0.9375rem] font-semibold text-verde-oscuro tabular-nums">
                  {pesos(p.precio / p.pases)} por día
                </p>
                <p className="mt-1 inline-flex items-center gap-1.5 text-[0.9375rem] text-n-600 tabular-nums">
                  <CalendarCheck size={18} aria-hidden />
                  Vigencia de {p.vigenciaDias} días
                </p>
              </li>
            ))}
          </ul>

          <div className="lp-revela mt-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-5">
            <BotonWhatsApp mensaje={MENSAJES.guarderia}>Reservar guardería</BotonWhatsApp>
            <a
              href="#requisitos"
              className="text-base font-bold text-azul underline decoration-2 underline-offset-4 hover:text-azul-oscuro"
            >
              Ver requisitos para entrar
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
