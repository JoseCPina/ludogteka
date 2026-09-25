import type { Metadata } from "next";
import Link from "next/link";
import { LogoPeluDesk } from "@/components/marca/peludesk";
import { Revelar } from "@/components/peludesk/revelar";
import { CASO_REAL, CELULAR, ESCRITORIO, urlDemo } from "@/lib/peludesk/landing";
import "./peludesk.css";

// peludesk.mx: qué es PeluDesk y para quién, cada función con su captura
// real (del negocio de demostración, con datos inventados), la demo sin
// registro y la prueba gratis. El middleware la sirve en "/" del dominio
// de la plataforma. Nada de testimonios, cifras ni logos que no existan.

export const metadata: Metadata = {
  metadataBase: new URL("https://peludesk.mx"),
  title: { absolute: "PeluDesk — software para guarderías, hoteles y estéticas caninas" },
  description:
    "Recepción, agenda de estética, caja, contratos firmados en línea, expediente con vacunas, inventario, nómina y utilidad. Prueba PeluDesk 30 días gratis.",
  alternates: { canonical: "/" },
  robots: { index: true, follow: true },
  openGraph: {
    title: "PeluDesk — el escritorio digital para negocios caninos",
    description: "Guardería, hotel y estética canina en una sola pantalla. Prueba 30 días gratis.",
    images: [{ url: "/peludesk/capturas/tablero-escritorio-1600.webp", width: 1600, height: 1000 }],
    locale: "es_MX",
    type: "website",
  },
};

type Funcion = {
  id: string;
  etiqueta: string;
  titulo: string;
  texto: string[];
  captura: string;
  alt: string;
  celular?: { captura: string; alt: string };
  segunda?: { captura: string; alt: string };
};

const FUNCIONES: Funcion[] = [
  {
    id: "tablero",
    etiqueta: "Tablero del día",
    titulo: "Lo primero que ves en la mañana",
    texto: [
      "Quién llega, quién se va, cuántos perros hay adentro y cuánto cupo queda de día y de noche.",
      "Abajo, lo que necesita atención: contratos sin firmar, comprobantes de vacunas por revisar, saldos pendientes, y desde hace cuántos días espera cada cosa.",
    ],
    captura: "tablero",
    alt: "Tablero del día: llegan hoy, se van hoy, adentro ahora, ocupación de día y de noche, pendientes y citas de estética",
  },
  {
    id: "guarderia-hotel",
    etiqueta: "Guardería y hotel",
    titulo: "Un solo cupo para toda la casa",
    texto: [
      "Guardería por día, por hora, con paquetes de pases o mensualidad; hotel por noche según la talla del perro.",
      "La ocupación cuenta los dos juntos, porque comparten el mismo espacio: no aceptas un perro que no cabe.",
    ],
    captura: "hotel",
    alt: "Módulo de hotel: llegadas, salidas, perros hospedados y la ocupación de la casa por día",
    celular: { captura: "guarderia", alt: "Guardería en el celular: quién llega, quién se va y quién sigue" },
  },
  {
    id: "estetica",
    etiqueta: "Estética",
    titulo: "La agenda de cada estilista, con el precio correcto",
    texto: [
      "Las citas de cada estilista en su columna, sin empalmes.",
      "El precio sale del grupo de raza del perro o de su talla, con un precio aparte si llega con el pelo maltratado. Al terminar la cita se descuenta del inventario lo que marca la receta del servicio.",
    ],
    captura: "estetica",
    alt: "Agenda de estética del día con una columna por estilista",
    segunda: { captura: "precios", alt: "Precios del baño estético por grupo de raza, con precio para pelo maltratado" },
  },
  {
    id: "expediente",
    etiqueta: "Expediente del perro",
    titulo: "Vacunas y alertas antes de recibirlo",
    texto: [
      "Cada perro con su foto, sus vacunas con fecha de vencimiento y sus alertas de manejo: se escapa, alergias, come separado.",
      "Con una vacuna obligatoria vencida, la app no deja reservarle guardería ni hotel, salvo que la administración autorice la excepción con su motivo.",
    ],
    captura: "expediente",
    alt: "Expediente de un perro con alerta de manejo y el estado de cada vacuna",
  },
  {
    id: "caja",
    etiqueta: "Caja",
    titulo: "Cobra la cuenta completa, sin sumar a mano",
    texto: [
      "La cuenta junta noches de hotel, guardería, estética y cargos extra. Cobras en efectivo, tarjeta o transferencia, con propina y descuentos con tope, y cierras el turno con arqueo.",
      "Cobro con la terminal Point y links de pago de Mercado Pago: en camino para cuentas nuevas.",
    ],
    captura: "cobro",
    alt: "Pantalla de cobro de una cuenta de hotel con el saldo y las formas de pago",
  },
  {
    id: "contratos",
    etiqueta: "Contratos",
    titulo: "El dueño firma desde su celular",
    texto: [
      "Escribes tu contrato una vez y la app lo llena con los datos del cliente y de su perro.",
      "El dueño lo firma en su portal con el dedo y se guarda el PDF con fecha, hora e IP. Si prefieres papel, subes el firmado.",
    ],
    captura: "contratos",
    alt: "Lista de contratos por firmar con los días que llevan esperando",
    celular: { captura: "portal-perro", alt: "Ficha del perro en el portal del dueño con sus contratos firmados" },
  },
  {
    id: "portal",
    etiqueta: "Portal del dueño",
    titulo: "Tus clientes ven lo suyo sin tener que llamarte",
    texto: [
      "Sus próximas citas y reservas, las vacunas de su perro, las fotos y notas del día, sus pases y sus contratos.",
      "Entran con su teléfono. Nunca ven precios de la casa ni nada de otros clientes.",
    ],
    captura: "portal",
    alt: "Portal del dueño en el celular con sus próximas reservas",
  },
  {
    id: "inventario",
    etiqueta: "Inventario",
    titulo: "Sabes qué se está acabando",
    texto: [
      "Consumibles con su mínimo de existencia, y el equipo con su estado y su mantenimiento: secadoras, máquinas, jaulas.",
      "Los costos de compra solo los ve quien tú decidas.",
    ],
    captura: "inventario",
    alt: "Inventario de consumibles por área con existencia y mínimo",
  },
  {
    id: "empleados",
    etiqueta: "Empleados y nómina",
    titulo: "Asistencia, retardos y nómina con comisiones",
    texto: [
      "Entrada y salida de cada persona, retardos contra su horario, vacaciones y ausencias.",
      "La nómina suma sueldo, días trabajados, comisiones de estética y propinas, y descuenta adelantos.",
    ],
    captura: "nomina",
    alt: "Nómina del periodo por empleado con días, comisiones, propinas y total a pagar",
  },
  {
    id: "utilidad",
    etiqueta: "Gastos y utilidad",
    titulo: "Cuánto ganaste este mes, de verdad",
    texto: [
      "Cada gasto dice qué periodo cubre: la luz del bimestre se reparte entre sus dos meses.",
      "Utilidad = lo cobrado por servicios, menos insumos, nómina y gastos del local, junto al mes anterior.",
    ],
    captura: "utilidad",
    alt: "Reporte de utilidad del mes con ingreso, insumos, nómina y gastos del local",
  },
];

const TIPOS = [
  ["Guarderías", "de día, por hora o con paquetes de pases"],
  ["Hoteles caninos", "por noche, con cupo y horario de entrega"],
  ["Estéticas", "con agenda por estilista y precio por raza o talla"],
] as const;

function Escritorio({ captura, alt, prioridad = false, className = "" }: { captura: string; alt: string; prioridad?: boolean; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/peludesk/capturas/${captura}-escritorio-1600.webp`}
      srcSet={`/peludesk/capturas/${captura}-escritorio-800.webp 800w, /peludesk/capturas/${captura}-escritorio-1600.webp 1600w`}
      sizes="(min-width: 1024px) 720px, 100vw"
      width={ESCRITORIO.ancho}
      height={ESCRITORIO.alto}
      alt={alt}
      loading={prioridad ? "eager" : "lazy"}
      fetchPriority={prioridad ? "high" : undefined}
      decoding="async"
      className={`pd-captura h-auto w-full rounded-[18px] border border-n-200 bg-white ${className}`}
    />
  );
}

function Celular({ captura, alt, prioridad = false, className = "" }: { captura: string; alt: string; prioridad?: boolean; className?: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/peludesk/capturas/${captura}-celular.webp`}
      width={CELULAR.ancho}
      height={CELULAR.alto}
      alt={alt}
      loading={prioridad ? "eager" : "lazy"}
      decoding="async"
      className={`pd-captura h-auto rounded-[26px] border-[5px] border-grafito bg-white ${className}`}
    />
  );
}

function BotonPrueba({ className = "" }: { className?: string }) {
  return (
    <Link
      href="/registro"
      className={`pd-boton inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-md bg-morado px-6 text-base font-semibold text-white hover:bg-morado-oscuro focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave ${className}`}
    >
      Pruébalo gratis
    </Link>
  );
}

function BotonDemo({ className = "", claro = false }: { className?: string; claro?: boolean }) {
  return (
    <a
      href={`${urlDemo()}/demo`}
      className={`pd-boton inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-md border-[1.5px] px-6 text-base font-semibold focus-visible:outline-none focus-visible:ring-[3px] ${
        claro ? "border-crema/60 text-crema hover:bg-white/10 focus-visible:ring-menta" : "border-borde bg-white text-n-900 hover:bg-n-50 focus-visible:ring-morado-suave"
      } ${className}`}
    >
      Ver demo
    </a>
  );
}

export default function PeluDeskLanding() {
  const demo = urlDemo();
  return (
    <div className="min-h-[100dvh] bg-crema text-n-900">
      <header className="sticky top-0 z-20 border-b border-n-200/70 bg-crema/90 backdrop-blur supports-[backdrop-filter]:bg-crema/75">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" aria-label="PeluDesk, inicio">
            <LogoPeluDesk tamano={30} />
          </Link>
          <nav className="flex items-center gap-2 sm:gap-3">
            <a href="#funciones" className="hidden rounded-md px-3 py-2 text-sm font-semibold text-n-700 hover:text-morado md:inline-block">
              Funciones
            </a>
            <a href="#demo" className="hidden rounded-md px-3 py-2 text-sm font-semibold text-n-700 hover:text-morado md:inline-block">
              Demo
            </a>
            <span className="hidden sm:inline-flex">
              <BotonDemo className="!min-h-10 !px-4 text-sm" />
            </span>
            <BotonPrueba className="!min-h-10 !px-4 text-sm" />
          </nav>
        </div>
      </header>

      <main>
        {/* Qué es y para quién */}
        <section className="mx-auto grid max-w-6xl items-center gap-12 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-12 lg:gap-10 lg:pb-24 lg:pt-20">
          <div className="lg:col-span-5">
            <p className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.08em] text-morado">
              <span aria-hidden className="pd-puntos scale-75" />
              El escritorio digital para negocios caninos
            </p>
            <h1 className="mt-5 text-4xl font-bold leading-[1.08] tracking-[-0.025em] text-n-900 md:text-5xl">
              Guardería, hotel y estética canina en una sola pantalla
            </h1>
            <p className="mt-5 max-w-[52ch] text-lg leading-relaxed text-n-700">
              PeluDesk lleva la recepción de tu negocio: quién llega y quién se va hoy, la agenda de cada estilista, la caja,
              los contratos y el expediente de cada perro. Tu equipo lo usa en la computadora del mostrador o en el
              celular; tus clientes, en su portal.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <BotonPrueba />
              <BotonDemo />
            </div>
            <p className="mt-4 text-sm text-n-600">30 días gratis, sin tarjeta. Tu negocio queda en tunegocio.peludesk.mx.</p>
          </div>
          <div className="relative lg:col-span-7">
            <Escritorio captura="tablero" alt={FUNCIONES[0].alt} prioridad />
            <Celular
              captura="portal"
              alt="Portal del dueño en el celular"
              prioridad
              className="absolute -bottom-10 -left-4 hidden w-[22%] min-w-[120px] sm:block lg:-left-10"
            />
          </div>
        </section>

        <section aria-labelledby="para-quien" className="border-y border-n-200 bg-white">
          <div className="mx-auto grid max-w-6xl gap-8 px-4 py-12 sm:px-6 md:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] md:items-center">
            <h2 id="para-quien" className="text-2xl font-bold leading-tight tracking-tight">
              Para negocios que hoy llevan todo entre libretas, hojas de cálculo y WhatsApp
            </h2>
            <ul className="grid gap-6 sm:grid-cols-3">
              {TIPOS.map(([tipo, como]) => (
                <li key={tipo} className="border-l-[3px] border-menta pl-4">
                  <p className="font-semibold text-n-900">{tipo}</p>
                  <p className="mt-1 text-sm text-n-700">{como}</p>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Una sección por función, con su captura real */}
        <div id="funciones" className="scroll-mt-20">
          {FUNCIONES.map((f, i) => {
            const derecha = i % 2 === 1;
            return (
              <section key={f.id} id={f.id} aria-labelledby={`t-${f.id}`} className="scroll-mt-20">
                <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-16 sm:px-6 lg:grid-cols-12 lg:gap-14 lg:py-24">
                  <Revelar className={`lg:col-span-4 ${derecha ? "lg:order-2" : ""}`}>
                    <p className="text-sm font-semibold uppercase tracking-[0.08em] text-menta-oscuro">{f.etiqueta}</p>
                    <h2 id={`t-${f.id}`} className="mt-3 text-3xl font-bold leading-tight tracking-[-0.02em]">
                      {f.titulo}
                    </h2>
                    {f.texto.map((t, k) => (
                      <p key={k} className="mt-4 max-w-[46ch] leading-relaxed text-n-700">
                        {t}
                      </p>
                    ))}
                  </Revelar>
                  <Revelar retraso={80} className={`relative lg:col-span-8 ${derecha ? "lg:order-1" : ""}`}>
                    {f.id === "portal" ? (
                      <div className="flex justify-center gap-6 rounded-[18px] bg-menta-suave px-6 py-10 sm:gap-10">
                        <Celular captura="portal" alt={f.alt} className="w-[46%] max-w-[260px]" />
                        <Celular captura="portal-perro" alt="Ficha del perro en el portal: fotos del día, vacunas y contratos" className="mt-10 w-[46%] max-w-[260px]" />
                      </div>
                    ) : (
                      <>
                        <Escritorio captura={f.captura} alt={f.alt} />
                        {f.segunda && (
                          <Escritorio captura={f.segunda.captura} alt={f.segunda.alt} className="mt-4 lg:absolute lg:-bottom-12 lg:-right-8 lg:mt-0 lg:w-[58%]" />
                        )}
                        {f.celular && (
                          <Celular
                            captura={f.celular.captura}
                            alt={f.celular.alt}
                            className={`absolute -bottom-8 hidden w-[24%] min-w-[110px] sm:block ${derecha ? "-left-6" : "-right-6"}`}
                          />
                        )}
                      </>
                    )}
                  </Revelar>
                </div>
              </section>
            );
          })}
        </div>

        {CASO_REAL && (
          <section aria-labelledby="caso" className="bg-white">
            <div className="mx-auto max-w-3xl px-4 py-20 sm:px-6">
              <p className="text-sm font-semibold uppercase tracking-[0.08em] text-menta-oscuro">Caso real</p>
              <h2 id="caso" className="mt-3 text-3xl font-bold tracking-tight">
                {CASO_REAL.negocio}, {CASO_REAL.ciudad}
              </h2>
              <blockquote className="mt-6 text-xl leading-relaxed text-n-800">“{CASO_REAL.cita}”</blockquote>
              <p className="mt-3 text-sm text-n-600">{CASO_REAL.quien}</p>
              <p className="mt-6 text-n-700">Usan: {CASO_REAL.usan.join(", ")}.</p>
            </div>
          </section>
        )}

        {/* La demo, sin registro */}
        <section id="demo" aria-labelledby="t-demo" className="scroll-mt-16 bg-morado text-crema">
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-20 sm:px-6 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-5">
              <h2 id="t-demo" className="text-3xl font-bold leading-tight tracking-[-0.02em] text-white md:text-4xl">
                Explóralo por dentro, sin registrarte
              </h2>
              <p className="mt-4 max-w-[46ch] leading-relaxed text-crema/90">
                Patitas &amp; Co. es un negocio de ejemplo con dos meses de operación: clientes, perros, reservas, cobros y
                contratos inventados. Entra con la cuenta que quieras. Es de solo lectura: abre todo, no se guarda nada.
              </p>
            </div>
            <ul className="grid gap-3 sm:grid-cols-2 lg:col-span-7">
              {[
                ["recepcion", "Recepción", "El tablero del día, reservas y caja"],
                ["estetica", "Estética", "La agenda de las estilistas"],
                ["admin", "Dueña del negocio", "Reportes, nómina, gastos y precios"],
                ["cliente", "Dueña de un perro", "El portal de clientes"],
              ].map(([rol, quien, que]) => (
                <li key={rol}>
                  <a
                    href={`${demo}/demo/entrar/${rol}`}
                    className="pd-boton group flex h-full items-center justify-between gap-4 rounded-[18px] border border-white/15 bg-white/[0.06] px-5 py-4 hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-menta"
                  >
                    <span>
                      <span className="block font-semibold text-white">{quien}</span>
                      <span className="mt-0.5 block text-sm text-crema/80">{que}</span>
                    </span>
                    <span aria-hidden className="text-lg text-menta transition-transform duration-150 group-hover:translate-x-0.5">
                      →
                    </span>
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Prueba gratis */}
        <section aria-labelledby="t-prueba" className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="grid gap-8 rounded-[18px] border border-n-200 bg-white p-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:p-12">
            <div>
              <h2 id="t-prueba" className="text-3xl font-bold leading-tight tracking-[-0.02em]">
                Abre tu negocio en PeluDesk hoy
              </h2>
              <p className="mt-3 max-w-[56ch] leading-relaxed text-n-700">
                Con tu nombre, el de tu negocio y tu teléfono. Entras directo a tu negocio vacío y te guiamos en cinco pasos:
                datos del negocio, servicios y precios, horario y cupo, tu primer empleado y tu primer cliente. 30 días
                gratis, sin tarjeta.
              </p>
            </div>
            <BotonPrueba className="md:px-8" />
          </div>
        </section>
      </main>

      <footer className="border-t border-n-200">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-4 py-8 text-sm text-n-600 sm:px-6">
          <LogoPeluDesk tamano={22} />
          <p>El escritorio digital para negocios caninos. Hecho en México.</p>
        </div>
      </footer>
    </div>
  );
}
