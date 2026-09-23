import Image from "next/image";
import { Moon } from "@phosphor-icons/react/dist/ssr";
import { BotonWhatsApp } from "./comunes";
import { HOTEL, MENSAJES, pesos } from "@/lib/landing/negocio";
import fotoHotel from "./fotos/hotel.jpg";

export function Hotel() {
  return (
    <section id="hotel" className="bg-white py-20 lg:py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative">
          <div className="lp-revela relative h-[22rem] overflow-hidden rounded-[2rem] sm:h-[28rem] lg:h-[38rem]">
            <Image
              src={fotoHotel}
              alt="Perro acostado en su cama con una cobija, tranquilo y mirando a la cámara"
              placeholder="blur"
              sizes="(min-width: 1280px) 1216px, 100vw"
              className="lp-paralaje absolute inset-0 size-full object-cover object-[50%_60%]"
            />
          </div>

          {/* La tarjeta se monta sobre la foto en escritorio y queda debajo
              en celular, donde encima taparía al perro. */}
          <div className="lp-revela relative z-[1] -mt-16 mx-3 rounded-3xl border border-n-200 bg-white p-6 shadow-[0_30px_60px_-30px_rgb(20_22_31/0.35)] sm:mx-8 sm:p-8 lg:absolute lg:bottom-10 lg:right-10 lg:mx-0 lg:mt-0 lg:w-[30rem]">
            <p className="inline-flex items-center gap-2 rounded-full bg-azul-suave px-3.5 py-1.5 text-[0.9375rem] font-bold text-azul">
              <Moon size={18} weight="fill" aria-hidden />
              Hotel por noche
            </p>
            <h2 className="mt-4 text-balance text-4xl font-extrabold leading-[1.1] tracking-[-0.025em] text-n-900">
              Noches tranquilas, como en casa.
            </h2>
            <p className="mt-3 text-lg leading-relaxed text-n-700">
              Si sales de viaje, se queda con nosotros. Con cámaras de
              circuito cerrado también de noche.
            </p>

            <dl className="mt-6 grid grid-cols-2 gap-3">
              {HOTEL.map((h) => (
                <div key={h.talla} className="rounded-2xl bg-n-50 p-4">
                  <dt className="text-[0.9375rem] font-semibold leading-snug text-n-700">
                    Talla {h.talla.toLowerCase()}
                  </dt>
                  <dd className="mt-2 tabular-nums">
                    <span className="text-3xl font-extrabold tracking-[-0.02em] text-n-900">
                      {pesos(h.precio)}
                    </span>
                    <span className="block text-[0.9375rem] font-semibold text-n-600 sm:ml-1 sm:inline">por noche</span>
                  </dd>
                </div>
              ))}
            </dl>

            <p className="mt-4 text-[0.9375rem] leading-snug text-n-600">
              Aplican los mismos{" "}
              <a href="#requisitos" className="font-bold text-azul underline decoration-2 underline-offset-4 hover:text-azul-oscuro">
                requisitos
              </a>{" "}
              que en guardería.
            </p>

            <BotonWhatsApp mensaje={MENSAJES.hotel} className="mt-6 w-full sm:w-auto">
              Apartar hotel
            </BotonWhatsApp>
          </div>
        </div>
      </div>
    </section>
  );
}
