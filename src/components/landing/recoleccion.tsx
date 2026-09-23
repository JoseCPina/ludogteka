import Image from "next/image";
import { CalendarCheck, CarProfile, HouseLine, MapPin } from "@phosphor-icons/react/dist/ssr";
import { BotonWhatsApp, Rotulo } from "./comunes";
import { MENSAJES, PRECIO_KM_RECOLECCION, RECOLECCION_REGLAS, ZONAS_COBERTURA, pesos } from "@/lib/landing/negocio";
import fotoCoche from "./fotos/lugar/recoleccion-coche.jpg";

// "Transporte y recolección de perritos", como dice la lona. El camino de
// abajo es la explicación: la camioneta sale de tu casa y llega a
// Ludogteka mientras lees (animación ligada al scroll).
export function Recoleccion() {
  return (
    <section id="recoleccion" className="lp-franja-amarilla relative py-20 lg:py-28">
      <div className="mx-auto grid max-w-7xl items-center gap-14 px-4 sm:px-6 lg:grid-cols-12 lg:px-8">
        {/* La foto en una ventana de camioneta: marco índigo grueso. */}
        <div className="lp-revela relative mx-auto w-[86%] sm:w-[62%] lg:col-span-5 lg:w-full">
          <div className="overflow-hidden rounded-[2.5rem] rounded-br-xl border-[10px] border-[var(--lp-indigo)] bg-[var(--lp-indigo)] shadow-[0_10px_0_var(--lp-indigo-hondo)]">
            <Image
              src={fotoCoche}
              alt="Perrito negro con café en el asiento del coche, sonriendo con la lengua de fuera"
              placeholder="blur"
              sizes="(min-width: 1024px) 460px, 80vw"
              className="aspect-[4/5] w-full object-cover"
            />
          </div>
          <p className="lp-display absolute -bottom-5 -right-3 rotate-[-4deg] rounded-2xl bg-white px-4 py-2 text-lg font-bold text-[var(--lp-indigo)] shadow-[0_5px_0_rgb(27_33_64/0.2)]">
            ¡Ya voy para allá!
          </p>
        </div>

        <div className="lg:col-span-7">
          <Rotulo className="lp-revela text-4xl sm:text-5xl lg:text-6xl">Transporte y recolección de perritos</Rotulo>
          <p className="lp-revela lp-display mt-6 tabular-nums">
            <span className="lp-rotulo text-7xl">{pesos(PRECIO_KM_RECOLECCION)}</span>
            <span className="ml-2 text-2xl font-bold text-[var(--lp-indigo)]">por kilómetro</span>
          </p>
          <p className="lp-revela mt-3 max-w-[48ch] text-lg font-semibold text-[var(--lp-tinta)]">
            Pasamos por tu perro y te lo regresamos a casa. Nos escribes, calculamos los kilómetros hasta tu
            casa y te decimos cuánto sale.
          </p>

          {/* El camino: de tu casa a Ludogteka. */}
          <div className="lp-revela mt-8 rounded-2xl bg-white/70 px-4 pb-4 pt-3">
            <div className="flex items-center justify-between text-base font-bold text-[var(--lp-indigo)]">
              <span className="inline-flex items-center gap-1.5">
                <HouseLine size={22} weight="fill" aria-hidden />
                Tu casa
              </span>
              <span className="inline-flex items-center gap-1.5">
                Ludogteka
                <MapPin size={22} weight="fill" aria-hidden />
              </span>
            </div>
            <div className="relative mt-2 h-12 [container-type:inline-size]">
              <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-[var(--lp-indigo)]" aria-hidden />
              <div
                className="absolute inset-x-2 top-1/2 h-0 -translate-y-1/2 border-t-[3px] border-dashed border-[var(--lp-amarillo)]"
                aria-hidden
              />
              <span className="lp-camioneta absolute left-0 top-0 grid size-12 place-items-center rounded-full bg-[var(--lp-turquesa)] text-white shadow-[0_4px_0_var(--lp-turquesa-hondo)]">
                <CarProfile size={28} weight="fill" aria-hidden />
              </span>
            </div>
          </div>

          <ul className="mt-6 grid gap-3 sm:grid-cols-3">
            {RECOLECCION_REGLAS.map((r, i) => (
              <li
                key={r}
                className="lp-revela flex items-start gap-2 rounded-2xl bg-white p-4 text-base font-bold leading-snug shadow-[0_5px_0_rgb(27_33_64/0.12)]"
                style={{ "--i": i } as React.CSSProperties}
              >
                <CalendarCheck size={22} weight="bold" className="mt-px shrink-0 text-[var(--lp-indigo)]" aria-hidden />
                {r}
              </li>
            ))}
          </ul>

          <ZonasCobertura />

          <div className="lp-revela mt-8">
            <BotonWhatsApp mensaje={MENSAJES.recoleccion}>Cotizar recolección</BotonWhatsApp>
          </div>
        </div>
      </div>
    </section>
  );
}

// Preparado para cuando el negocio defina sus zonas: con la lista vacía
// invita a preguntar; con zonas, las enseña.
function ZonasCobertura() {
  if (ZONAS_COBERTURA.length === 0) {
    return (
      <p className="lp-revela mt-4 text-lg text-[var(--lp-tinta)]">
        <strong>¿Llegamos a tu colonia?</strong> Pregúntanos por WhatsApp y te decimos si te cubrimos y cuánto
        sale.
      </p>
    );
  }
  return (
    <div className="lp-revela mt-5">
      <h3 className="lp-display text-xl font-bold text-[var(--lp-indigo)]">Zonas de cobertura</h3>
      <ul className="mt-2 flex flex-wrap gap-2">
        {ZONAS_COBERTURA.map((z) => (
          <li key={z.nombre} className="rounded-full bg-white px-4 py-2 font-semibold">
            {z.nombre}
            {z.nota && <span className="ml-1 font-normal opacity-75">({z.nota})</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
