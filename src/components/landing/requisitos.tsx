import { PawPrint, Prohibit } from "@phosphor-icons/react/dist/ssr";
import Image from "next/image";
import { BotonWhatsApp, Cinta } from "./comunes";
import { PERROS } from "./perros";
import { MENSAJES, REQUISITOS } from "@/lib/landing/negocio";

// Requisitos de guardería y hotel, en dos "etiquetas de collar": lo que
// necesitamos y lo que no podemos recibir.
export function Requisitos() {
  const si = REQUISITOS.filter((r) => r.tipo === "si");
  const no = REQUISITOS.filter((r) => r.tipo === "no");
  return (
    <section id="requisitos" className="relative overflow-hidden bg-[var(--lp-crema)] py-20 lg:py-28">
      {/* Se asoma por la orilla, como quien revisa que todo esté en orden. */}
      <Image
        src={PERROS.tricolor.foto}
        alt=""
        aria-hidden
        sizes="220px"
        className="lp-revela pointer-events-none absolute -right-10 bottom-0 hidden w-56 rotate-[-6deg] lg:block"
      />
      <div className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="text-center">
          <Cinta className="lp-revela text-2xl">Antes de su primera visita</Cinta>
          <h2 className="lp-revela lp-display mx-auto mt-5 max-w-[22ch] text-balance text-4xl font-bold leading-[1.05] text-[var(--lp-indigo)] sm:text-5xl">
            Requisitos para guardería y hotel
          </h2>
          <p className="lp-revela mt-4 text-lg font-semibold text-[var(--lp-tinta)]/75">
            Cuidan a tu perro y a toda la banda. Estética no los pide.
          </p>
        </div>

        <div className="mt-12 grid gap-5 md:grid-cols-5">
          <ul className="lp-revela flex flex-col gap-4 rounded-[1.75rem] bg-[var(--lp-menta)] p-7 md:col-span-3">
            {si.map((r) => (
              <li key={r.texto} className="flex items-center gap-3 text-lg font-bold">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[var(--lp-turquesa-hondo)] text-white">
                  <PawPrint size={22} weight="fill" aria-hidden />
                </span>
                {r.texto}
              </li>
            ))}
          </ul>
          <ul
            className="lp-revela flex flex-col justify-center gap-4 rounded-[1.75rem] bg-[#fde3d9] p-7 md:col-span-2"
            style={{ "--i": 1 } as React.CSSProperties}
          >
            {no.map((r) => (
              <li key={r.texto} className="flex items-center gap-3 text-lg font-bold">
                <span className="grid size-10 shrink-0 place-items-center rounded-full bg-[#a6330f] text-white">
                  <Prohibit size={22} weight="bold" aria-hidden />
                </span>
                {r.texto}
              </li>
            ))}
          </ul>
        </div>

        <div className="lp-revela mt-10 flex justify-center">
          <BotonWhatsApp mensaje={MENSAJES.requisitos}>Agendar evaluación</BotonWhatsApp>
        </div>
      </div>
    </section>
  );
}
