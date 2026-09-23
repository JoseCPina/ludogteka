import { Cinta, Rotulo, TarjetaPerro } from "./comunes";
import { PERROS } from "./perros";

// Las tres tarjetas de la lona (Guardería / Hotel / Estética), cada una
// con un cliente real asomándose, y cada una lleva a su sección.
const TARJETAS = [
  { href: "#guarderia", servicio: "Guardería", perro: PERROS.dasha, detalle: "Juego, socialización y siesta, de lunes a sábado." },
  { href: "#hotel", servicio: "Hotel", perro: PERROS.dante, detalle: "Noches tranquilas cuando sales de viaje." },
  { href: "#estetica", servicio: "Estética", perro: PERROS.simon, detalle: "Baño, corte y consentida de pies a cabeza." },
];

export function Servicios() {
  return (
    <section id="servicios" className="lp-franja-amarilla relative pb-24 pt-10 sm:pt-14">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <Rotulo className="lp-revela text-center text-4xl sm:text-5xl">Lo que hacemos</Rotulo>
        <ul className="mt-16 grid gap-x-6 gap-y-20 sm:mt-20 md:grid-cols-3">
          {TARJETAS.map((t, i) => (
            <li key={t.servicio} className="lp-revela-giro" style={{ "--i": i } as React.CSSProperties}>
              <a
                href={t.href}
                className="group block rounded-[1.75rem] focus-visible:outline-none focus-visible:ring-[4px] focus-visible:ring-[var(--lp-indigo)] focus-visible:ring-offset-4 focus-visible:ring-offset-[var(--lp-amarillo)]"
              >
                <TarjetaPerro
                  foto={t.perro.foto}
                  nombre={t.perro.nombre}
                  alt={t.perro.alt}
                  alto="h-60 sm:h-64"
                  altoPerro={t.perro.altoEnTarjeta}
                  sizes="(min-width: 768px) 33vw, 90vw"
                  cinta={<Cinta className="min-w-[70%] text-2xl">{t.servicio}</Cinta>}
                />
                <p className="mt-10 text-center text-lg font-semibold text-[var(--lp-tinta)]">{t.detalle}</p>
              </a>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
