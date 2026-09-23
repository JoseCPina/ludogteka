import Image from "next/image";
import { Ola, Rotulo } from "./comunes";
import fotoLetrero from "./fotos/lugar/patio-letrero.jpg";
import fotoSonrisa from "./fotos/lugar/patio-sonrisa.jpg";
import fotoMurete from "./fotos/lugar/patio-murete.jpg";

// Fotos reales del lugar: el dueño que va a dejar a su perro quiere ver
// dónde se va a quedar. Polaroids pegadas con cinta, como en un tablero.
const FOTOS = [
  {
    foto: fotoLetrero,
    alt: "Pastor belga en el patio, con el letrero de ludogteka en la pared del fondo",
    pie: "Nuestro patio",
    giro: "-rotate-3",
  },
  {
    foto: fotoSonrisa,
    alt: "Pastor belga con bandana rosa sonriendo en el pasto, con pelotas de colores alrededor",
    pie: "Pasto y pelotas",
    giro: "rotate-2 lg:translate-y-10",
  },
  {
    foto: fotoMurete,
    alt: "Perrita negra con collar rosa parada sobre un murete, al sol",
    pie: "Rincón de sol",
    giro: "-rotate-2",
  },
];

export function Patio() {
  return (
    <section id="patio" className="relative">
      <Ola color="var(--lp-turquesa)" className="-mb-px" />
      <div className="lp-franja-turquesa pb-24 pt-6">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <Rotulo className="lp-revela text-center text-4xl sm:text-5xl">Así es donde se queda</Rotulo>
          <p className="lp-revela mx-auto mt-5 max-w-[46ch] text-center text-lg font-semibold text-[var(--lp-tinta)]">
            Un patio con pasto y juguetes, con monitoreo las 24 horas. Ven a conocerlo antes de su
            primera visita.
          </p>
          <ul className="mt-14 grid gap-10 sm:grid-cols-3 sm:gap-6">
            {FOTOS.map((f, i) => (
              <li key={f.pie} className="lp-revela-giro" style={{ "--i": i } as React.CSSProperties}>
                <figure className={`lp-polaroid mx-auto w-[82%] sm:w-full ${f.giro}`}>
                  <Image
                    src={f.foto}
                    alt={f.alt}
                    placeholder="blur"
                    sizes="(min-width: 640px) 33vw, 80vw"
                    className="aspect-[4/5] w-full object-cover"
                  />
                  <figcaption className="lp-display absolute inset-x-0 bottom-2 text-center text-lg font-bold text-[var(--lp-indigo)]">
                    {f.pie}
                  </figcaption>
                </figure>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <Ola color="var(--lp-turquesa)" invertida className="-mt-px" />
    </section>
  );
}
