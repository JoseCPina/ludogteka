import Image from "next/image";
import { Clock, InfinityIcon } from "@phosphor-icons/react/dist/ssr";
import { BotonWhatsApp, Cinta } from "./comunes";
import { datosLanding, pesos } from "@/lib/landing/negocio";
import fotoPelotas from "./fotos/lugar/patio-pelotas.jpg";

export async function Guarderia() {
  const { GUARDERIA, HORARIO, MENSAJES } = await datosLanding();
  if (!GUARDERIA) return null;
  return (
    <section id="guarderia" className="relative bg-[var(--lp-crema)] py-20 lg:py-28">
      <div className="mx-auto grid max-w-7xl gap-14 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
        <div className="lg:col-span-5">
          <Cinta className="lp-revela text-2xl">Guardería</Cinta>
          <h2 className="lp-revela lp-display mt-5 text-balance text-4xl font-bold leading-[1.05] text-[var(--lp-indigo)] sm:text-5xl">
            Un día entero de juego y siesta.
          </h2>
          <p className="lp-revela mt-4 max-w-[46ch] text-lg leading-relaxed text-[var(--lp-tinta)]/80">
            Lo dejas en la mañana y lo recoges cansado y feliz. Juega con perros evaluados, en pasto y
            con juguetes, con monitoreo las 24 horas.
          </p>
          <ul className="lp-revela mt-6 flex flex-col gap-2">
            {HORARIO.map((h) => (
              <li key={h.dias} className="lp-display inline-flex w-fit items-center gap-2 rounded-full bg-[var(--lp-menta)] px-4 py-2 text-lg font-bold text-[var(--lp-turquesa-hondo)]">
                <Clock size={20} weight="bold" aria-hidden />
                {h.dias}: {h.horas}
              </li>
            ))}
          </ul>

          <figure className="lp-revela lp-polaroid mx-auto mt-12 w-[78%] -rotate-3 sm:w-[60%] lg:mx-0 lg:w-[80%]">
            <Image
              src={fotoPelotas}
              alt="Gran danés negro con chaleco, sentado en el pasto del patio entre pelotas de colores"
              placeholder="blur"
              sizes="(min-width: 1024px) 360px, 70vw"
              className="aspect-[4/5] w-full object-cover"
            />
            <figcaption className="lp-display absolute inset-x-0 bottom-2 text-center text-lg font-bold text-[var(--lp-indigo)]">
              Recreo en el patio
            </figcaption>
          </figure>
        </div>

        <div className="lg:col-span-7">
          <div className="grid gap-4 sm:grid-cols-2">
            <Precio titulo="Ocasional" detalle="Solo las horas que lo necesites." monto={pesos(GUARDERIA.ocasionalHora)} unidad="por hora" i={0} />
            <Precio
              titulo="Día completo"
              detalle={`De lunes a viernes. Sábado (medio día): ${pesos(GUARDERIA.diaCompletoSabado)}.`}
              monto={pesos(GUARDERIA.diaCompleto)}
              unidad="por día"
              i={1}
            />
          </div>

          <div
            className="lp-revela relative mt-4 overflow-hidden rounded-[1.75rem] bg-[var(--lp-indigo)] p-7 text-white shadow-[0_6px_0_var(--lp-indigo-hondo)] sm:p-8"
            style={{ "--i": 2 } as React.CSSProperties}
          >
            <div className="relative flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="lp-display inline-flex items-center gap-2 text-2xl font-bold">
                  <InfinityIcon size={28} weight="bold" aria-hidden />
                  Mensualidad
                </p>
                <p className="mt-1 max-w-[30ch] text-lg text-white/85">
                  Días ilimitados de lunes a sábado. Para el que viene diario.
                </p>
              </div>
              <p className="lp-display tabular-nums">
                <span className="text-6xl font-bold text-[var(--lp-amarillo)]">{pesos(GUARDERIA.mensualidad)}</span>
                <span className="ml-1 text-lg font-semibold text-white/85">al mes</span>
              </p>
            </div>
          </div>

          <h3 className="lp-revela lp-display mt-14 text-3xl font-bold text-[var(--lp-indigo)]">Day pass</h3>
          <p className="lp-revela mt-2 max-w-[52ch] text-lg text-[var(--lp-tinta)]/80">
            Días completos para usar cuando quieras dentro de la vigencia. Cada paquete es para un perro.
          </p>
          <ul className="mt-6 grid gap-4 sm:grid-cols-3">
            {GUARDERIA.pases.map((p, i) => (
              <li
                key={p.pases}
                className="lp-revela-giro"
                style={{ "--i": i } as React.CSSProperties}
              >
                <div className="lp-boleto bg-[var(--lp-amarillo)] px-8 py-6 text-center">
                  <p className="lp-display text-5xl font-bold leading-none text-[var(--lp-indigo)] tabular-nums">{p.pases}</p>
                  <p className="lp-display text-lg font-bold uppercase tracking-wide text-[var(--lp-indigo)]">pases</p>
                  <div className="mx-auto my-3 w-full border-t-[3px] border-dashed border-[var(--lp-indigo)]/35" aria-hidden />
                  <p className="lp-display text-3xl font-bold text-[var(--lp-tinta)] tabular-nums">{pesos(p.precio)}</p>
                  <p className="text-base font-semibold text-[var(--lp-tinta)]/75">Vigencia de {p.vigenciaDias} días</p>
                </div>
              </li>
            ))}
          </ul>

          <div className="lp-revela mt-10 flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-6">
            <BotonWhatsApp mensaje={MENSAJES.guarderia}>Reservar guardería</BotonWhatsApp>
            <a href="#requisitos" className="lp-display text-lg font-bold text-[var(--lp-indigo)] underline decoration-[3px] underline-offset-4">
              Requisitos para entrar
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

function Precio({ titulo, detalle, monto, unidad, i }: { titulo: string; detalle: string; monto: string; unidad: string; i: number }) {
  return (
    <div
      className="lp-revela rounded-[1.75rem] border-[3px] border-[var(--lp-turquesa)] bg-white p-6 shadow-[0_6px_0_var(--lp-turquesa)]"
      style={{ "--i": i } as React.CSSProperties}
    >
      <p className="lp-display text-2xl font-bold text-[var(--lp-indigo)]">{titulo}</p>
      <p className="lp-display mt-3 tabular-nums">
        <span className="text-5xl font-bold text-[var(--lp-tinta)]">{monto}</span>
        <span className="ml-1.5 text-base font-semibold text-[var(--lp-tinta)]/70">{unidad}</span>
      </p>
      <p className="mt-2 text-base font-semibold text-[var(--lp-tinta)]/75">{detalle}</p>
    </div>
  );
}
