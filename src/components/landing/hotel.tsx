import Image from "next/image";
import { Info, Moon } from "@phosphor-icons/react/dist/ssr";
import { BotonWhatsApp, Ola, Rotulo } from "./comunes";
import { HOTEL, MENSAJES, pesos } from "@/lib/landing/negocio";
import fotoCamita from "./fotos/lugar/hotel-camita.jpg";

// Hotel en la franja turquesa: los precios como llaveros de habitación.
export function Hotel() {
  return (
    <section id="hotel" className="relative">
      <Ola color="var(--lp-turquesa)" className="-mb-px" />
      <div className="lp-franja-turquesa pb-20 pt-6 lg:pb-28">
        <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
          <div className="lg:col-span-7">
            <p className="lp-revela lp-display inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-lg font-bold text-[var(--lp-indigo)]">
              <Moon size={20} weight="fill" aria-hidden />
              Hotel por noche
            </p>
            <Rotulo className="lp-revela mt-5 text-5xl sm:text-6xl">Noches tranquilas, como en casa.</Rotulo>
            <p className="lp-revela mt-5 max-w-[46ch] text-lg font-semibold leading-relaxed text-[var(--lp-tinta)]">
              Si sales de viaje, se queda con nosotros, con monitoreo las 24 horas.
            </p>

            <ul className="mt-10 flex flex-wrap gap-5">
              {HOTEL.map((h, i) => (
                <li key={h.talla} className="lp-revela-giro" style={{ "--i": i } as React.CSSProperties}>
                  {/* Llavero de habitación: pastilla blanca con su ojillo. */}
                  <div className="relative flex min-w-[15rem] items-center gap-4 rounded-[1.5rem] rounded-l-[3rem] bg-white py-5 pl-12 pr-7 shadow-[0_6px_0_var(--lp-turquesa-hondo)]">
                    <span className="absolute left-4 top-1/2 size-4 -translate-y-1/2 rounded-full border-[3px] border-[var(--lp-turquesa-hondo)] bg-[var(--lp-turquesa)]" aria-hidden />
                    <div>
                      <p className="lp-display text-lg font-bold leading-tight text-[var(--lp-indigo)]">Talla {h.talla.toLowerCase()}</p>
                      <p className="lp-display tabular-nums">
                        <span className="text-5xl font-bold text-[var(--lp-tinta)]">{pesos(h.precio)}</span>
                        <span className="ml-1 text-base font-semibold text-[var(--lp-tinta)]/70">por noche</span>
                      </p>
                    </div>
                  </div>
                </li>
              ))}
            </ul>

            <ul className="lp-revela mt-8 flex flex-col gap-2 text-lg font-bold text-[var(--lp-tinta)]">
              <li className="flex items-center gap-2">
                <Info size={22} weight="bold" className="shrink-0 text-[var(--lp-tinta)]" aria-hidden />
                No incluye servicios extra.
              </li>
              <li className="flex items-center gap-2">
                <Info size={22} weight="bold" className="shrink-0 text-[var(--lp-tinta)]" aria-hidden />
                No recibimos ni entregamos perros de hotel los domingos.
              </li>
              <li className="flex items-center gap-2">
                <Info size={22} weight="bold" className="shrink-0 text-[var(--lp-tinta)]" aria-hidden />
                Aplican los mismos requisitos que en guardería.
              </li>
            </ul>

            <div className="lp-revela mt-10">
              <BotonWhatsApp mensaje={MENSAJES.hotel} variante="blanco">
                Apartar hotel
              </BotonWhatsApp>
            </div>
          </div>

          <figure className="lp-revela lp-polaroid mx-auto w-[82%] rotate-3 sm:w-[60%] lg:col-span-5 lg:w-full">
            <Image
              src={fotoCamita}
              alt="Perrita café con naranja echada en su cobija, con una pelota de tenis entre las patas"
              placeholder="blur"
              sizes="(min-width: 1024px) 420px, 80vw"
              className="aspect-[4/5] w-full object-cover"
            />
            <figcaption className="lp-display absolute inset-x-0 bottom-2 text-center text-lg font-bold text-[var(--lp-indigo)]">
              Lista para dormir
            </figcaption>
          </figure>
        </div>
      </div>
      <Ola color="var(--lp-turquesa)" invertida className="-mt-px" />
    </section>
  );
}
