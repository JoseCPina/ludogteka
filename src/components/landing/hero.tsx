import Image from "next/image";
import { Eye, PawPrint } from "@phosphor-icons/react/dist/ssr";
import { BotonWhatsApp, Hueso, Ola, Rotulo } from "./comunes";
import { MENSAJES } from "@/lib/landing/negocio";
import { PERROS } from "./perros";

// La franja turquesa de la lona, con la banda asomándose por encima de la
// ola amarilla. Los tres perros son clientes reales (los mismos de la
// camioneta).
export function Hero() {
  return (
    <section id="inicio" className="lp-franja-turquesa relative overflow-hidden">
      <div className="mx-auto grid max-w-7xl items-end gap-6 px-4 pt-10 sm:px-6 md:pt-14 lg:grid-cols-12 lg:gap-4 lg:px-8 lg:pt-16">
        <div className="relative z-[2] pb-4 lg:col-span-6 lg:pb-28">
          <p
            className="lp-entra lp-display inline-flex items-center gap-2 rounded-full bg-white px-4 py-2 text-base font-semibold text-[var(--lp-indigo)] shadow-[0_4px_0_rgb(27_33_64/0.18)]"
            style={{ "--d": 0 } as React.CSSProperties}
          >
            <Eye size={20} weight="bold" aria-hidden />
            Monitoreo 24 horas · San Luis Potosí
          </p>
          <Rotulo como="h1" className="mt-6 text-[2.75rem] sm:text-6xl lg:text-[4.4rem]">
            Aquí tu perro juega, duerme y sale guapo.
          </Rotulo>
          <ul
            className="lp-entra lp-display mt-6 flex flex-wrap gap-x-5 gap-y-2 text-xl font-bold text-[var(--lp-tinta)]"
            style={{ "--d": 2 } as React.CSSProperties}
          >
            {["Guardería", "Hotel", "Estética", "Recolección"].map((s) => (
              <li key={s} className="flex items-center gap-1.5">
                <PawPrint size={20} weight="fill" aria-hidden />
                {s}
              </li>
            ))}
          </ul>
          <div
            className="lp-entra mt-8 flex flex-col gap-4 sm:flex-row sm:items-center"
            style={{ "--d": 3 } as React.CSSProperties}
          >
            <BotonWhatsApp mensaje={MENSAJES.general} tamano="grande">
              Agenda por WhatsApp
            </BotonWhatsApp>
            <a
              href="#servicios"
              className="lp-boton lp-boton-blanco lp-display inline-flex min-h-14 items-center justify-center rounded-full px-7 text-lg font-bold focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-[var(--lp-indigo)] focus-visible:ring-offset-2"
            >
              Ver precios
            </a>
          </div>
        </div>

        {/* La banda. Se asoman desde atrás de la ola al cargar. */}
        <div className="relative -mb-8 h-[17rem] sm:-mb-10 sm:h-[25rem] lg:col-span-6 lg:h-[34rem]">
          <figure className="lp-asoma absolute bottom-0 left-0 z-[1] w-[42%]" style={{ "--d": 0 } as React.CSSProperties}>
            <Image
              src={PERROS.rusher.foto}
              alt="Rusher, husky de ojos azules, echado y atento"
              sizes="(min-width: 1024px) 270px, 42vw"
              preload
              className="h-auto w-full drop-shadow-[0_10px_18px_rgb(27_33_64/0.35)]"
            />
            <figcaption className="absolute left-2 top-4 sm:top-8">
              <Hueso>Rusher</Hueso>
            </figcaption>
          </figure>
          <figure className="lp-asoma absolute bottom-0 left-[29%] z-[3] w-[40%]" style={{ "--d": 1 } as React.CSSProperties}>
            <Image
              src={PERROS.galleta.foto}
              alt="Galleta, pitbull blanco con café y chaleco de mezclilla, sonriendo"
              sizes="(min-width: 1024px) 260px, 40vw"
              preload
              className="h-auto w-full drop-shadow-[0_12px_20px_rgb(27_33_64/0.4)]"
            />
            <figcaption className="absolute -right-3 top-[16%]">
              <Hueso>Galleta</Hueso>
            </figcaption>
          </figure>
          <figure className="lp-asoma absolute bottom-0 right-0 z-[2] w-[40%]" style={{ "--d": 2 } as React.CSSProperties}>
            <Image
              src={PERROS.zuki.foto}
              alt="Zuki, perrito negro con café y suéter, con la boca abierta de felicidad"
              sizes="(min-width: 1024px) 260px, 40vw"
              preload
              className="h-auto w-full drop-shadow-[0_10px_18px_rgb(27_33_64/0.35)]"
            />
            <figcaption className="absolute right-1 top-1">
              <Hueso>Zuki</Hueso>
            </figcaption>
          </figure>
        </div>
      </div>

      {/* La ola amarilla tapa las patas: los perros quedan detrás. */}
      <div className="relative z-[4] -mt-12 sm:-mt-16">
        <Ola color="var(--lp-amarillo)" />
        <div className="lp-franja-amarilla h-5 sm:h-8" />
      </div>
    </section>
  );
}
