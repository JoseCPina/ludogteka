import type { CSSProperties, ReactNode } from "react";
import { Star, MapPin, Clock, WhatsappLogo, Phone, ArrowRight, NavigationArrow, Quotes, UserCircle } from "@phosphor-icons/react/dist/ssr";
import { dmSerif, fraunces, fredoka, jakarta } from "@/fuentes";
import { HechoConPeluDesk } from "@/components/marca/peludesk";
import { FotoNegocio } from "@/components/foto-negocio";
import { TEMAS, paletaWeb, type GiroWeb, type TemaWeb } from "@/lib/web-negocio/tema";
import { type HorarioSemana, HORARIO_POR_OMISION, diaSemana, estadoAhora, renglonesHorario } from "@/lib/web-negocio/horario";
import { type ServicioWeb, type PortalEjemplo, pesosMx } from "@/lib/web-negocio/catalogo";
import { BotonPedir } from "./boton-pedir";
import { PedirCita } from "./pedir-cita";
import { PortalDemo } from "./portal-demo";

// La página web de un negocio: la misma para la vista previa de un prospecto (peludesk.mx/para/<slug>, modo
// «demo»: nada sale de la página y lo dice) y para la publicada en su subdominio (modo «real»: pedir cita abre
// WhatsApp con la solicitud al negocio). Cambian paleta, tipografía y composición según el giro (lib/web-negocio).

export type FotoWeb = { url: string; credito?: ReactNode };
export type ResenaWeb = { autor: string; autorUri: string | null; calificacion: number; texto: string; cuando: string | null };

export type DatosWeb = {
  nombre: string;
  ciudad: string | null;
  direccion: string | null;
  /** 10 dígitos (WhatsApp y llamada). */
  telefono: string | null;
  descripcion: string | null;
  giro: GiroWeb;
  servicios: GiroWeb[];
  catalogo: ServicioWeb[];
  preciosDeEjemplo: boolean;
  horario: HorarioSemana | null;
  calificacion: number | null;
  totalResenas: number | null;
  resenas: ResenaWeb[];
  fotos: FotoWeb[];
  logoUrl: string | null;
  /** Color sacado de sus fotos (o guardado como el de su página). */
  color: string | null;
  mapsUri: string | null;
  zona: string;
  /** Hay datos de Google en la página: lleva su atribución. */
  deGoogle: boolean;
  /** Fecha (AAAA-MM-DD) y minutos del día en la zona del negocio: para «Abierto · cierra a las…». */
  hoy: { fecha: string; minutos: number };
};

type Props = {
  datos: DatosWeb;
  modo: "demo" | "real";
  /** Solo demo: el portal del cliente con datos de ejemplo. */
  portal?: PortalEjemplo;
  /** Solo demo: lo que se dice de PeluDesk junto a cada parte que lo hace posible. */
  notas?: { pedir?: ReactNode; portal?: ReactNode; resultado?: ReactNode };
};

const FUENTES = {
  jakarta: { clase: jakarta.variable, titulos: "var(--font-jakarta)", cuerpo: "var(--font-jakarta)" },
  fraunces: { clase: fraunces.variable, titulos: "var(--font-fraunces)", cuerpo: "var(--font-outfit)" },
  fredoka: { clase: fredoka.variable, titulos: "var(--font-fredoka)", cuerpo: "var(--font-outfit)" },
  dmserif: { clase: dmSerif.variable, titulos: "var(--font-dmserif)", cuerpo: "var(--font-outfit)" },
} as const;

const RADIOS: Record<GiroWeb, [string, string, string]> = {
  veterinaria: ["20px", "12px", "12px"],
  estetica: ["28px", "16px", "999px"],
  guarderia: ["32px", "18px", "999px"],
  hotel: ["4px", "4px", "2px"],
};

function Estrellas({ valor, tamano = 16 }: { valor: number; tamano?: number }) {
  return (
    <span className="inline-flex" aria-label={`${valor} de 5 estrellas`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Star key={i} size={tamano} weight={valor >= i - 0.25 ? "fill" : valor >= i - 0.75 ? "duotone" : "regular"} className="text-[#f5a623]" aria-hidden />
      ))}
    </span>
  );
}

function Calificacion({ datos, claro }: { datos: DatosWeb; claro?: boolean }) {
  if (datos.calificacion == null) return null;
  return (
    <p className={`flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] ${claro ? "text-white/90" : "text-black/75"}`} data-calificacion>
      <b className={`text-lg ${claro ? "text-white" : "text-[var(--w-tinta)]"}`}>{datos.calificacion.toFixed(1)}</b>
      <Estrellas valor={datos.calificacion} />
      {datos.totalResenas != null && <span>{datos.totalResenas.toLocaleString("es-MX")} reseñas en Google</span>}
    </p>
  );
}

function Botones({ tema, modo, centrado, claro, pedir }: { tema: TemaWeb; modo: Props["modo"]; centrado?: boolean; claro?: boolean; pedir: boolean }) {
  return (
    <div className={`flex flex-col gap-3 min-[420px]:flex-row ${centrado ? "min-[420px]:justify-center" : ""}`}>
      {pedir && <BotonPedir
        className="inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--w-radio-boton)] px-6 text-base font-semibold text-white shadow-sm transition-transform active:scale-[.98]"
        style={{ background: claro ? "#fff" : "var(--w-acento)", color: claro ? "var(--w-profundo)" : "#fff" }}
      >
        {tema.textos.pedir} <ArrowRight size={18} weight="bold" aria-hidden />
      </BotonPedir>}
      <a
        href={modo === "demo" ? "#portal" : "/login"}
        data-boton-portal
        className={`inline-flex min-h-12 items-center justify-center gap-2 rounded-[var(--w-radio-boton)] border-[1.5px] px-6 text-base font-semibold ${
          claro ? "border-white/60 text-white" : "border-[var(--w-acento)] bg-white/70 text-[var(--w-acento)]"
        }`}
      >
        <UserCircle size={20} weight="bold" aria-hidden /> {tema.textos.portal}
      </a>
    </div>
  );
}

function Hero({ datos, tema, modo, estado, pedir }: { datos: DatosWeb; tema: TemaWeb; modo: Props["modo"]; estado: { abierto: boolean; texto: string } | null; pedir: boolean }) {
  const foto = datos.fotos[0];
  const etiqueta = `${tema.textos.etiqueta}${datos.ciudad ? ` en ${datos.ciudad}` : ""}`;
  const chipEstado = estado && (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-semibold ${estado.abierto ? "bg-[#e3f5ea] text-[#17643a]" : "bg-black/5 text-black/70"}`} data-estado-horario>
      <span className={`h-2 w-2 rounded-full ${estado.abierto ? "bg-[#1f9a55]" : "bg-black/40"}`} aria-hidden />
      {estado.texto}
    </span>
  );
  const img = (clase: string) => (
    <FotoNegocio url={foto?.url ?? null} color="var(--w-acento)" className={clase} prioridad />
  );
  const credito = foto?.credito && <p className="mt-1.5 text-[11px] text-black/50">{foto.credito}</p>;

  if (tema.composicion === "editorial") {
    return (
      <section className="relative isolate flex min-h-[78svh] items-end overflow-hidden text-white">
        <div className="absolute inset-0 -z-10">{img("h-full w-full")}</div>
        <div className="absolute inset-0 -z-10 bg-gradient-to-t from-black/80 via-black/35 to-black/5" aria-hidden />
        <div className="mx-auto w-full max-w-5xl px-5 pb-10 pt-32 sm:px-8 sm:pb-14">
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-white/85">{etiqueta}</p>
          <h1 className="mt-3 text-[clamp(2.6rem,11vw,5.2rem)] font-semibold italic leading-[0.98] tracking-tight" style={{ fontFamily: "var(--w-titulos)" }}>
            {datos.nombre}
          </h1>
          {datos.descripcion && <p className="mt-4 max-w-[46ch] text-lg text-white/90">{datos.descripcion}</p>}
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <Calificacion datos={datos} claro />
          </div>
          <div className="mt-7">
            <Botones tema={tema} modo={modo} pedir={pedir} claro />
          </div>
          {foto?.credito && <p className="mt-6 text-[11px] text-white/60">{foto.credito}</p>}
        </div>
      </section>
    );
  }

  if (tema.composicion === "juguetona") {
    return (
      <section className="relative overflow-hidden bg-[var(--w-suave)]">
        <div className="mx-auto grid max-w-5xl items-center gap-8 px-5 pb-16 pt-8 sm:px-8 md:grid-cols-[1.1fr_1fr] md:pt-14">
          <div>
            <p className="inline-flex rounded-full bg-white px-3.5 py-1 text-sm font-semibold text-[var(--w-acento)] shadow-sm">{etiqueta}</p>
            <h1 className="mt-4 text-[clamp(2.4rem,10vw,4.4rem)] font-bold leading-[1.02]" style={{ fontFamily: "var(--w-titulos)" }}>
              {datos.nombre}
            </h1>
            {datos.descripcion && <p className="mt-4 max-w-[44ch] text-lg text-black/75">{datos.descripcion}</p>}
            <div className="mt-4 flex flex-col gap-2">
              <Calificacion datos={datos} />
              {chipEstado}
            </div>
            <div className="mt-6">
              <Botones tema={tema} modo={modo} pedir={pedir} />
            </div>
          </div>
          <figure className="relative mx-auto w-full max-w-[460px]">
            <div className="rotate-[-2.5deg] overflow-hidden rounded-[42%_58%_55%_45%/48%_42%_58%_52%] border-[7px] border-white shadow-[0_24px_50px_-24px_rgba(0,0,0,.45)]">
              {img("aspect-square w-full")}
            </div>
            {datos.calificacion != null && (
              <span className="absolute -left-1 top-6 rotate-[-8deg] rounded-full bg-white px-3 py-1.5 text-sm font-bold shadow-md" aria-hidden>
                ★ {datos.calificacion.toFixed(1)}
              </span>
            )}
            <span className="absolute -right-1 bottom-8 rotate-[6deg] rounded-full px-3 py-1.5 text-sm font-bold text-white shadow-md" style={{ background: "var(--w-acento)" }} aria-hidden>
              🐾 ¡A jugar!
            </span>
            {credito}
          </figure>
        </div>
        <svg className="absolute inset-x-0 bottom-0 h-8 w-full text-[var(--w-fondo)]" viewBox="0 0 1200 40" preserveAspectRatio="none" aria-hidden>
          <path d="M0 20 C 150 0, 300 40, 450 20 S 750 0, 900 20 S 1100 40, 1200 20 L1200 40 L0 40 Z" fill="currentColor" />
        </svg>
      </section>
    );
  }

  if (tema.composicion === "boutique") {
    return (
      <section className="bg-[var(--w-profundo)] text-white">
        <div className="mx-auto grid max-w-5xl items-end gap-8 px-5 pb-12 pt-10 sm:px-8 md:grid-cols-[1fr_0.9fr] md:pb-16 md:pt-16">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-white/70">{etiqueta}</p>
            <h1 className="mt-4 text-[clamp(2.5rem,10vw,4.6rem)] leading-[1.02]" style={{ fontFamily: "var(--w-titulos)" }}>
              {datos.nombre}
            </h1>
            <div className="my-5 h-px w-16 bg-white/40" aria-hidden />
            {datos.descripcion && <p className="max-w-[44ch] text-lg text-white/85">{datos.descripcion}</p>}
            <div className="mt-4">
              <Calificacion datos={datos} claro />
            </div>
            <div className="mt-7">
              <Botones tema={tema} modo={modo} pedir={pedir} claro />
            </div>
          </div>
          <figure>
            <div className="overflow-hidden rounded-t-[999px] border border-white/20">{img("aspect-[4/5] w-full")}</div>
            {foto?.credito && <p className="mt-1.5 text-[11px] text-white/55">{foto.credito}</p>}
          </figure>
        </div>
      </section>
    );
  }

  // clínica
  return (
    <section>
      <div className="mx-auto max-w-5xl sm:px-8 sm:pt-6">
        <div className="relative">
          {img("aspect-[16/11] w-full sm:aspect-[21/9] sm:rounded-[var(--w-radio-tarjeta)]")}
        </div>
        <div className="relative z-10 mx-4 -mt-14 rounded-[var(--w-radio-tarjeta)] bg-white p-5 shadow-[0_18px_40px_-24px_rgba(0,0,0,.35)] ring-1 ring-black/5 sm:mx-10 sm:-mt-20 sm:p-8">
          <p className="text-sm font-semibold text-[var(--w-acento)]">{etiqueta}</p>
          <h1 className="mt-1.5 text-[clamp(2rem,8vw,3.4rem)] font-extrabold leading-[1.05] tracking-tight" style={{ fontFamily: "var(--w-titulos)" }}>
            {datos.nombre}
          </h1>
          {datos.descripcion && <p className="mt-3 max-w-[56ch] text-[17px] text-black/70">{datos.descripcion}</p>}
          <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center sm:gap-4">
            <Calificacion datos={datos} />
            {chipEstado}
          </div>
          <div className="mt-5">
            <Botones tema={tema} modo={modo} pedir={pedir} />
          </div>
        </div>
        {foto?.credito && <p className="mx-4 mt-2 text-[11px] text-black/50 sm:mx-10">{foto.credito}</p>}
      </div>
    </section>
  );
}

const Titulo = ({ id, children, claro }: { id?: string; children: ReactNode; claro?: boolean }) => (
  <h2 id={id} className={`text-[clamp(1.7rem,6vw,2.5rem)] font-bold leading-tight tracking-tight ${claro ? "text-white" : ""}`} style={{ fontFamily: "var(--w-titulos)" }}>
    {children}
  </h2>
);

export function PaginaWeb({ datos, modo, portal, notas }: Props) {
  const tema = TEMAS[datos.giro];
  const pal = paletaWeb(tema, datos.color);
  const fuente = FUENTES[tema.fuente];
  const [rTarjeta, rChico, rBoton] = RADIOS[datos.giro];
  const horario = datos.horario ?? HORARIO_POR_OMISION;
  const estado = datos.horario ? estadoAhora(datos.horario, datos.hoy.fecha, datos.hoy.minutos) : null;
  const hoyIndice = diaSemana(datos.hoy.fecha);
  const galeria = datos.fotos.slice(1);
  const mapa = datos.direccion ? `https://maps.google.com/maps?q=${encodeURIComponent(`${datos.nombre}, ${datos.direccion}`)}&z=16&output=embed` : null;
  const comoLlegar = datos.mapsUri ?? (datos.direccion ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${datos.nombre}, ${datos.direccion}`)}` : null);
  const whatsapp = modo === "real" && datos.telefono ? `https://wa.me/52${datos.telefono}?text=${encodeURIComponent(`Hola, ${datos.nombre}. Quiero información.`)}` : null;
  const hayServicios = datos.catalogo.length > 0;
  const puedePedir = hayServicios && (modo === "demo" || Boolean(datos.telefono));

  const vars = {
    "--w-acento": pal.acento,
    "--w-suave": pal.suave,
    "--w-fondo": pal.fondo,
    "--w-tinta": pal.tinta,
    "--w-profundo": pal.profundo,
    "--w-titulos": fuente.titulos,
    "--w-radio-tarjeta": rTarjeta,
    "--w-radio-chico": rChico,
    "--w-radio-boton": rBoton,
    fontFamily: `${fuente.cuerpo}, system-ui, sans-serif`,
    background: pal.fondo,
    color: pal.tinta,
  } as CSSProperties;

  const tarjeta = "rounded-[var(--w-radio-tarjeta)] bg-white ring-1 ring-black/5";

  return (
    <div className={`${fuente.clase} flex min-h-[100dvh] flex-col`} style={vars} data-pagina-web data-tema={tema.giro} data-fuente={tema.fuente} data-acento={pal.acento} data-color-origen={pal.origen}>
      <header className={`sticky top-0 z-30 border-b backdrop-blur ${tema.composicion === "boutique" ? "border-white/10 bg-[var(--w-profundo)]/95 text-white" : "border-black/5 bg-white/90"}`}>
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-5 sm:px-8">
          <a href="#inicio" className="flex min-w-0 items-center gap-2.5">
            {datos.logoUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={datos.logoUrl} alt="" className="h-9 w-9 rounded-full object-cover" />
            ) : (
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-base font-bold text-white" style={{ background: "var(--w-acento)", fontFamily: "var(--w-titulos)" }} aria-hidden>
                {datos.nombre.trim().charAt(0).toUpperCase()}
              </span>
            )}
            <span className="truncate text-[17px] font-bold" style={{ fontFamily: "var(--w-titulos)" }}>
              {datos.nombre}
            </span>
          </a>
          <nav className="flex items-center gap-1">
            {hayServicios && <a href="#servicios" className="hidden min-h-10 items-center rounded-md px-3 text-sm font-semibold opacity-80 hover:opacity-100 md:inline-flex">Servicios</a>}
            {datos.resenas.length > 0 && <a href="#resenas" className="hidden min-h-10 items-center rounded-md px-3 text-sm font-semibold opacity-80 hover:opacity-100 md:inline-flex">Reseñas</a>}
            <a href="#ubicacion" className="hidden min-h-10 items-center rounded-md px-3 text-sm font-semibold opacity-80 hover:opacity-100 md:inline-flex">Ubicación</a>
            {puedePedir && (
              <BotonPedir className="inline-flex min-h-10 shrink-0 items-center rounded-[var(--w-radio-boton)] px-4 text-sm font-semibold text-white" style={{ background: tema.composicion === "boutique" ? "#fff" : "var(--w-acento)", color: tema.composicion === "boutique" ? "var(--w-profundo)" : "#fff" }}>
                {tema.giro === "hotel" || tema.giro === "guarderia" ? "Reservar" : "Agendar"}
              </BotonPedir>
            )}
          </nav>
        </div>
      </header>

      <main id="inicio" className="flex-1">
        <Hero datos={datos} tema={tema} modo={modo} estado={estado} pedir={puedePedir} />

        {datos.resenas.length > 0 && (
          <section id="resenas" aria-labelledby="t-resenas" className="mx-auto max-w-5xl scroll-mt-20 px-5 pt-14 sm:px-8">
            <div className="flex flex-wrap items-end justify-between gap-3">
              <Titulo id="t-resenas">{tema.textos.resenasTitulo}</Titulo>
              <Calificacion datos={datos} />
            </div>
            <ul className="-mx-5 mt-6 flex snap-x gap-4 overflow-x-auto px-5 pb-2 sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0">
              {datos.resenas.map((r, i) => (
                <li key={i} className={`${tarjeta} flex w-[82%] shrink-0 snap-start flex-col gap-3 p-5 sm:w-auto`} data-resena>
                  <Quotes size={26} weight="fill" className="text-[var(--w-acento)] opacity-80" aria-hidden />
                  <p className="line-clamp-6 text-[15px] leading-relaxed text-black/80">{r.texto}</p>
                  <div className="mt-auto flex items-center justify-between gap-2 pt-1 text-sm">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">
                        {r.autorUri ? <a href={r.autorUri} target="_blank" rel="noopener noreferrer" className="hover:underline">{r.autor}</a> : r.autor}
                      </span>
                      {r.cuando && <span className="text-black/50">{r.cuando}</span>}
                    </span>
                    <Estrellas valor={r.calificacion} tamano={14} />
                  </div>
                </li>
              ))}
            </ul>
            {datos.deGoogle && <p className="mt-2 text-xs text-black/50">Reseñas de Google Maps.</p>}
          </section>
        )}

        {hayServicios && (
        <section id="servicios" aria-labelledby="t-servicios" className="mx-auto max-w-5xl scroll-mt-20 px-5 pt-14 sm:px-8">
          <Titulo id="t-servicios">{tema.textos.serviciosTitulo}</Titulo>
          {tema.composicion === "editorial" || tema.composicion === "boutique" ? (
            <ul className="mt-6 flex flex-col divide-y divide-black/10 border-y border-black/10">
              {datos.catalogo.map((s) => (
                <li key={s.clave} className="flex flex-col gap-2 py-5 sm:flex-row sm:items-center sm:gap-6" data-servicio-web={s.clave}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-3">
                      <h3 className="text-xl font-semibold" style={{ fontFamily: "var(--w-titulos)" }}>{s.nombre}</h3>
                      <span className="hidden flex-1 border-b border-dotted border-black/25 sm:block" aria-hidden />
                      {s.precio != null && (
                        <span className="ml-auto shrink-0 font-semibold tabular-nums sm:ml-0">
                          {s.unidad === "desde" ? "desde " : ""}{pesosMx(s.precio)}{s.unidad && s.unidad !== "desde" ? <span className="text-sm font-normal text-black/55"> {s.unidad}</span> : null}
                        </span>
                      )}
                    </div>
                    {s.descripcion && <p className="mt-1 text-black/65">{s.descripcion}</p>}
                  </div>
                  {puedePedir && (
                    <BotonPedir clave={s.clave} className="inline-flex min-h-11 w-fit items-center gap-1.5 text-sm font-semibold text-[var(--w-acento)] underline-offset-4 hover:underline">
                      {s.modo === "cita" ? "Agendar" : "Reservar"} <ArrowRight size={16} weight="bold" aria-hidden />
                    </BotonPedir>
                  )}
                </li>
              ))}
            </ul>
          ) : (
            <ul className="mt-6 grid gap-4 sm:grid-cols-2">
              {datos.catalogo.map((s) => (
                <li key={s.clave} className={`${tarjeta} flex flex-col gap-3 p-5 ${tema.composicion === "juguetona" ? "ring-2 ring-[var(--w-suave)]" : ""}`} data-servicio-web={s.clave}>
                  <div className="flex items-start justify-between gap-3">
                    <h3 className="text-lg font-bold" style={{ fontFamily: "var(--w-titulos)" }}>{s.nombre}</h3>
                    {s.precio != null && (
                      <span className="shrink-0 rounded-full bg-[var(--w-suave)] px-2.5 py-0.5 text-sm font-bold tabular-nums text-[var(--w-acento)]">
                        {s.unidad === "desde" ? "desde " : ""}{pesosMx(s.precio)}
                      </span>
                    )}
                  </div>
                  {s.descripcion && <p className="text-black/65">{s.descripcion}</p>}
                  {puedePedir && (
                    <BotonPedir clave={s.clave} className="mt-auto inline-flex min-h-11 w-fit items-center gap-1.5 rounded-[var(--w-radio-boton)] bg-[var(--w-suave)] px-4 text-sm font-semibold text-[var(--w-acento)]">
                      {s.modo === "cita" ? "Agendar" : "Reservar"} <ArrowRight size={16} weight="bold" aria-hidden />
                    </BotonPedir>
                  )}
                </li>
              ))}
            </ul>
          )}
          {datos.preciosDeEjemplo && <p className="mt-3 text-xs text-black/50">Precios de ejemplo: el negocio pone los suyos.</p>}
        </section>
        )}

        {puedePedir && (
          <section id="pedir" aria-labelledby="t-pedir" className="mt-14 scroll-mt-16 bg-[var(--w-suave)] py-14">
            <div className="mx-auto grid max-w-5xl grid-cols-1 gap-8 px-5 sm:px-8 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] lg:items-start">
              <div className="flex flex-col gap-3">
                <Titulo id="t-pedir">{tema.giro === "hotel" || tema.giro === "guarderia" ? "Reserva en línea" : "Pide tu cita en línea"}</Titulo>
                <p className="text-lg text-black/70">
                  Escoge el servicio, el día{tema.giro === "hotel" ? " de llegada y de salida" : tema.giro === "guarderia" ? "" : " y la hora"} según nuestro horario, y te confirmamos por WhatsApp.
                </p>
                {notas?.pedir}
              </div>
              <PedirCita
                catalogo={datos.catalogo}
                horario={horario}
                zona={datos.zona}
                negocio={datos.nombre}
                modo={modo}
                telefono={datos.telefono}
                preciosDeEjemplo={datos.preciosDeEjemplo}
                notaDemo={notas?.resultado}
              />
            </div>
          </section>
        )}

        <section id="portal" aria-labelledby="t-portal" className="mx-auto max-w-5xl scroll-mt-20 px-5 pt-14 sm:px-8">
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-2 lg:items-center [&>*]:min-w-0">
            <div className="flex flex-col gap-3">
              <Titulo id="t-portal">{tema.giro === "veterinaria" ? "El carnet de tu mascota, en tu celular" : "Tu mascota, en tu celular"}</Titulo>
              <p className="text-lg text-black/70">
                En tu portal ves a tus mascotas, sus vacunas y cuándo les toca la siguiente, y tus próximas {tema.giro === "hotel" || tema.giro === "guarderia" ? "reservas" : "citas"}.
              </p>
              {modo === "real" && (
                <a href="/login" className="inline-flex min-h-12 w-fit items-center gap-2 rounded-[var(--w-radio-boton)] px-6 font-semibold text-white" style={{ background: "var(--w-acento)" }}>
                  <UserCircle size={20} weight="bold" aria-hidden /> Entrar a mi portal
                </a>
              )}
              {notas?.portal}
            </div>
            {modo === "demo" && portal && <PortalDemo negocio={datos.nombre} datos={portal} />}
          </div>
        </section>

        {galeria.length > 0 && (
          <section aria-label="Fotos" className="mx-auto max-w-5xl px-5 pt-14 sm:px-8">
            <ul className={`grid gap-3 ${galeria.length >= 3 ? "grid-cols-2 sm:grid-cols-3" : "grid-cols-2"}`}>
              {galeria.map((f, i) => (
                <li key={f.url} className={tema.composicion === "editorial" && i === 0 && galeria.length >= 3 ? "col-span-2 sm:col-span-1" : ""}>
                  <FotoNegocio url={f.url} color="var(--w-acento)" className={`w-full rounded-[var(--w-radio-chico)] ${tema.composicion === "editorial" && i === 0 && galeria.length >= 3 ? "aspect-[2/1] sm:aspect-square" : "aspect-square"}`} />
                  {f.credito && <p className="mt-1 text-[11px] text-black/50">{f.credito}</p>}
                </li>
              ))}
            </ul>
          </section>
        )}

        <section id="ubicacion" aria-labelledby="t-ubicacion" className="mx-auto max-w-5xl scroll-mt-20 px-5 py-14 sm:px-8">
          <Titulo id="t-ubicacion">Horario y ubicación</Titulo>
          <div className="mt-6 grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
            <div className={`${tarjeta} flex flex-col gap-4 p-5`}>
              {datos.horario ? (
                <div>
                  <h3 className="flex items-center gap-2 font-bold">
                    <Clock size={20} className="text-[var(--w-acento)]" aria-hidden /> Horario
                  </h3>
                  <ul className="mt-2 flex flex-col text-[15px]" data-horario>
                    {renglonesHorario(datos.horario).map((r) => (
                      <li key={r.dia} className={`flex justify-between gap-3 border-b border-black/5 py-1.5 last:border-0 ${r.indice === hoyIndice ? "font-bold text-[var(--w-acento)]" : ""}`}>
                        <span>{r.dia}</span>
                        <span className="text-right">{r.texto}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
              {datos.direccion && (
                <div>
                  <h3 className="flex items-center gap-2 font-bold">
                    <MapPin size={20} className="text-[var(--w-acento)]" aria-hidden /> Dirección
                  </h3>
                  <p className="mt-1.5 text-[15px] text-black/75">{datos.direccion}</p>
                </div>
              )}
              <div className="flex flex-wrap gap-2.5">
                {comoLlegar && (
                  <a href={comoLlegar} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--w-radio-boton)] border-[1.5px] border-[var(--w-acento)] px-4 text-sm font-semibold text-[var(--w-acento)]">
                    <NavigationArrow size={16} weight="bold" aria-hidden /> Cómo llegar
                  </a>
                )}
                {whatsapp && (
                  <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--w-radio-boton)] px-4 text-sm font-semibold text-white" style={{ background: "#117a43" }}>
                    <WhatsappLogo size={18} weight="fill" aria-hidden /> WhatsApp
                  </a>
                )}
                {modo === "real" && datos.telefono && (
                  <a href={`tel:+52${datos.telefono}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-[var(--w-radio-boton)] border-[1.5px] border-black/15 px-4 text-sm font-semibold">
                    <Phone size={16} weight="bold" aria-hidden /> Llamar
                  </a>
                )}
              </div>
            </div>
            {mapa && (
              <iframe
                title={`Mapa de ${datos.nombre}`}
                src={mapa}
                loading="lazy"
                referrerPolicy="no-referrer-when-downgrade"
                className="h-[300px] w-full rounded-[var(--w-radio-tarjeta)] border-0 ring-1 ring-black/5 lg:h-full lg:min-h-[340px]"
                data-mapa
              />
            )}
          </div>
        </section>
      </main>

      <footer className={tema.composicion === "boutique" ? "bg-[var(--w-profundo)] text-white/85" : "border-t border-black/5 bg-white"}>
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-5 py-8 text-sm sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div>
            <p className="font-bold" style={{ fontFamily: "var(--w-titulos)" }}>{datos.nombre}</p>
            {datos.direccion && <p className="mt-0.5 opacity-70">{datos.direccion}</p>}
            {datos.deGoogle && <p className="mt-2 text-xs opacity-60">Fotos, horario, dirección y reseñas: Google Maps.</p>}
          </div>
          <HechoConPeluDesk className={tema.composicion === "boutique" ? "!text-white/80" : ""} />
        </div>
      </footer>
    </div>
  );
}
