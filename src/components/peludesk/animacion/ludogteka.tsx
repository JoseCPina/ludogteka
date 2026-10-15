"use client";

import { useEffect, useRef, useState } from "react";
import { Mascota } from "./mascotas";
import { ImgDiferida } from "../img-diferida";

// Frases cortas del equipo de Ludogteka. Sin cifras ni superlativos. Las tres
// primeras las dio el negocio; las otras tres se redactaron en el mismo tono
// sobre lo que de verdad usan (agenda, caja, recordatorios por WhatsApp):
// confirmarlas con el equipo antes de cambiarlas de lugar o de citarlas fuera
// de esta página.
const FRASES = [
  "Nos hizo la vida mucho más fácil.",
  "Es muy práctico.",
  "Tenemos mejor control.",
  "La agenda ya no se nos empalma.",
  "Con la caja sabemos cómo cerró el día.",
  "Mandar el recordatorio por WhatsApp es un solo toque.",
];

// Fotos reales del negocio (public/ludogteka, WebP a 480 y 960 px; las nuevas salen del Instagram del negocio), con su alto/ancho para no saltar.
const FOTOS = [
  { n: "patio-letrero", w: 1400, h: 1456, alt: "Un pastor belga en el patio de Ludogteka, con el letrero de la guardería al fondo" },
  { n: "patio-pelotas", w: 1400, h: 1599, alt: "Un gran danés negro sentado en el pasto sintético de la guardería, rodeado de pelotas de colores" },
  { n: "hotel-camita", w: 1200, h: 1408, alt: "Un perro acostado en su camita del hotel de Ludogteka, con una pelota de tenis" },
  { n: "recoleccion-coche", w: 1400, h: 1488, alt: "Recolección a domicilio: un perrito sube al coche de Ludogteka" },
  { n: "patio-sonrisa", w: 960, h: 1083, alt: "Un pastor con paliacate sonriendo sobre el pasto sintético de la guardería" },
  { n: "patio-huskies", w: 960, h: 1707, alt: "Varios perros jugando en el patio de la guardería de Ludogteka" },
  { n: "paseo-collie", w: 960, h: 1066, alt: "Una integrante del equipo de Ludogteka abraza a un border collie en un paseo" },
  { n: "paseo-lago", w: 960, h: 1707, alt: "Un perro con chaleco salvavidas nada en un lago durante un paseo de Ludogteka" },
  { n: "cumple-loki", w: 960, h: 1200, alt: "Loki, un dóberman, celebra sus 2 años con pastel y globos en una tarjeta de Ludogteka" },
  { n: "retrato-pastor", w: 960, h: 1199, alt: "Retrato de un pastor alemán echado en su camita" },
] as const;

const INSTAGRAM = "https://www.instagram.com/ludogteka/";
const REEL = "https://www.instagram.com/ludogteka/reel/DeSs34zBXwx/";
// El embed solo funciona con la ruta canónica /reel/<código>/: con el usuario en la ruta Instagram redirige a su portada,
// que prohíbe iframes (X-Frame-Options: deny) y el iframe queda en blanco.
const REEL_EMBED = "https://www.instagram.com/reel/DeSs34zBXwx/";
const MENSAJE = "https://ig.me/m/ludogteka";

// Portada del reel: la imagen real de Instagram (og:image del reel) en public/ludogteka/reel-portada-{480,960}.webp
// (el archivo grande mide 640 px de ancho: es lo que Instagram publica).
const PORTADA = { src: "/ludogteka/reel-portada-960.webp", srcSet: "/ludogteka/reel-portada-480.webp 480w, /ludogteka/reel-portada-960.webp 640w" };

declare global {
  interface Window {
    instgrm?: { Embeds: { process: () => void } };
  }
}

function useEntra<T extends Element>() {
  const ref = useRef<T>(null);
  const [en, setEn] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver(
      ([e]) => {
        if (!e.isIntersecting) return;
        setEn(true);
        obs.disconnect();
      },
      { threshold: 0.15 }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  return [ref, en] as const;
}

/** Encabezado, galería, reel, frases y «Pregúntales» de «Ludogteka ya lo usa». */
export function SeccionLudogteka() {
  const [refGaleria, enGaleria] = useEntra<HTMLUListElement>();
  const [refFrases, enFrases] = useEntra<HTMLUListElement>();
  return (
    <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
      <header className="flex flex-col items-start gap-5 sm:flex-row sm:items-center">
        <ImgDiferida
          src="/ludogteka/logo.webp"
          srcSet="/ludogteka/logo-240.webp 240w, /ludogteka/logo.webp 480w"
          sizes="112px"
          alt="Logotipo de Ludogteka: la cara de un perro dentro de un círculo y el nombre en letras azules y naranja"
          width={112}
          height={112}
          className="h-28 w-28 shrink-0 rounded-[24px] border border-n-200 bg-white object-contain p-1"
        />
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.1em] text-morado">Un negocio de verdad</p>
          <h2 id="t-ludogteka" className="mt-2 text-3xl font-bold leading-tight tracking-[-0.02em] md:text-4xl">
            Ludogteka ya lo usa
          </h2>
          <p className="mt-2 max-w-[52ch] leading-relaxed text-n-700">Guardería, hotel y estética canina en San Luis Potosí.</p>
        </div>
        <div className="hidden sm:ml-auto sm:block" aria-hidden="true">
          <Mascota tipo="hotel" tamano={72} />
        </div>
      </header>

      <div className="mt-10 grid gap-6 lg:grid-cols-12 lg:items-start">
        <ul ref={refGaleria} className="grid grid-cols-2 gap-3 lg:col-span-7" aria-label="Fotos de Ludogteka">
          {FOTOS.map((f, i) => (
            <li key={f.n} className="aspect-[4/5] overflow-hidden rounded-[20px] bg-n-100">
              {enGaleria && (
                <div className="pd-pop h-full w-full" style={{ animationDelay: `${i * 110}ms` }}>
                  <ImgDiferida
                    src={`/ludogteka/${f.n}-960.webp`}
                    srcSet={`/ludogteka/${f.n}-480.webp 480w, /ludogteka/${f.n}-960.webp 960w`}
                    sizes="(min-width: 1024px) 33vw, 46vw"
                    alt={f.alt}
                    width={f.w}
                    height={f.h}
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
            </li>
          ))}
        </ul>

        <div className="flex flex-col gap-5 lg:col-span-5">
          <ReelTarjeta />
          <ul ref={refFrases} className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2" aria-label="Lo que dice el equipo de Ludogteka">
            {FRASES.map((t, i) => (
              <li key={t} className="min-h-[76px]">
                {enFrases && (
                  <figure className="pd-pop h-full rounded-[16px] border border-n-200 border-l-4 border-l-menta bg-white px-4 py-3" style={{ animationDelay: `${i * 140}ms` }}>
                    <blockquote className="text-[15px] font-semibold leading-snug text-n-900">«{t}»</blockquote>
                    <figcaption className="mt-1 text-xs text-n-600">Equipo Ludogteka</figcaption>
                  </figure>
                )}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="mt-8">
        <PreguntalesModal />
      </div>
    </div>
  );
}

/** Tarjeta con la portada del reel y un botón de play; al tocarla abre el reel en un modal (embed oficial de Instagram). */
function ReelTarjeta() {
  const dialogo = useRef<HTMLDialogElement>(null);
  const contenedor = useRef<HTMLDivElement>(null);
  const [estado, setEstado] = useState<"cerrado" | "cargando" | "listo" | "falla" | "sin-consentimiento">("cerrado");
  const temporizadores = useRef<number[]>([]);
  function limpiarTemporizadores() {
    temporizadores.current.forEach((t) => window.clearTimeout(t));
    temporizadores.current = [];
  }

  function cerrado() {
    limpiarTemporizadores();
    document.documentElement.classList.remove("pd-sin-scroll");
    if (contenedor.current) contenedor.current.innerHTML = "";
    setEstado("cerrado");
  }

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    d.addEventListener("close", cerrado);
    return () => d.removeEventListener("close", cerrado);
  }, []);

  // Instagram arma el iframe del embed con alto 0 y lo ajusta cuando le llega su mensaje de medida: si eso
  // pasa con el modal cerrado o sin pintar, nunca crece. Por eso se pide el embed DESPUÉS de que el modal
  // está abierto y visible, y si en 4 s el iframe sigue sin alto se muestra el respaldo.

  function abrir() {
    limpiarTemporizadores();
    dialogo.current?.showModal();
    document.documentElement.classList.add("pd-sin-scroll");
    // El embed de Instagram carga su propio script y pone cookies de Meta: es una tecnología de
    // marketing. Sin el consentimiento de marketing no se pide NADA a Instagram; se muestra el respaldo.
    if (!window.PeluDeskConsentimiento?.obtener().marketing) {
      setEstado("sin-consentimiento");
      return;
    }
    setEstado("cargando");
    const cont = contenedor.current;
    if (!cont) return;
    // El embed se arma a mano (no con React) porque embed.js reemplaza el <blockquote> por un iframe.
    cont.innerHTML = `<blockquote class="instagram-media" data-instgrm-permalink="${REEL_EMBED}" data-instgrm-version="14" style="background:#fff;border:0;margin:0 auto;max-width:540px;min-width:260px;width:100%"></blockquote>`;
    const procesar = () => window.instgrm?.Embeds.process();
    const alto = () => cont.querySelector("iframe")?.getBoundingClientRect().height ?? 0;
    // Dos cuadros después del showModal: el diálogo ya se pintó y tiene ancho.
    window.requestAnimationFrame(() =>
      window.requestAnimationFrame(() => {
        if (window.instgrm) {
          procesar();
        } else {
          const s = document.createElement("script");
          s.src = "https://www.instagram.com/embed.js";
          s.async = true;
          s.onload = procesar;
          s.onerror = () => setEstado("falla");
          document.body.appendChild(s);
        }
      })
    );
    const inicio = Date.now();
    const vigilar = () => {
      if (alto() > 120) return setEstado("listo");
      if (Date.now() - inicio >= 4000) return setEstado("falla");
      temporizadores.current.push(window.setTimeout(vigilar, 250));
    };
    temporizadores.current.push(window.setTimeout(vigilar, 250));
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        aria-haspopup="dialog"
        className="group relative block aspect-[16/10] w-full overflow-hidden rounded-[24px] bg-n-100 text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave"
      >
        <ImgDiferida
          src={PORTADA.src}
          srcSet={PORTADA.srcSet}
          sizes="(min-width: 1024px) 40vw, 92vw"
          alt=""
          width={1400}
          height={1580}
          className="absolute inset-0 h-full w-full object-cover object-[50%_30%] transition-transform duration-500 group-hover:scale-[1.03]"
        />
        <span className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-transparent" aria-hidden="true" />
        <span className="absolute left-1/2 top-1/2 flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-morado shadow-lg transition-transform group-hover:scale-110" aria-hidden="true">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="currentColor"><path d="M8 5.5v13a1 1 0 0 0 1.5.86l10.5-6.5a1 1 0 0 0 0-1.72L9.5 4.64A1 1 0 0 0 8 5.5Z" /></svg>
        </span>
        <span className="absolute inset-x-0 bottom-0 p-4 text-white">
          <span className="block text-lg font-bold leading-tight">Mira el reel de Ludogteka</span>
          <span className="block text-sm text-white/85">Así se vive un día en su guardería</span>
        </span>
        <span className="sr-only">Reproducir el reel de Ludogteka (se abre en una ventana)</span>
      </button>

      <dialog
        ref={dialogo}
        aria-labelledby="t-reel-modal"
        onClick={(e) => {
          if (e.target === dialogo.current) dialogo.current?.close();
        }}
        className="pd-modal m-auto max-h-[92vh] w-[min(94vw,34rem)] overflow-y-auto rounded-[24px] border border-n-200 bg-white p-0 text-n-900 shadow-2xl"
      >
        <div className="p-4 sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <h3 id="t-reel-modal" className="text-xl font-bold tracking-[-0.02em]">
              Reel de Ludogteka
            </h3>
            <button
              type="button"
              onClick={() => dialogo.current?.close()}
              aria-label="Cerrar"
              className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-n-700 hover:bg-n-100 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave"
            >
              <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M5 5l10 10M15 5L5 15" />
              </svg>
            </button>
          </div>
          <div
            ref={contenedor}
            className={estado === "falla" || estado === "sin-consentimiento" ? "hidden" : "mt-3 min-h-[420px] overflow-hidden rounded-2xl bg-n-100 bg-cover bg-center sm:min-h-[520px]"}
            style={estado === "cargando" ? { backgroundImage: `linear-gradient(rgba(255,255,255,.55), rgba(255,255,255,.55)), url(${PORTADA.src})` } : undefined}
          />
          {estado === "cargando" && <p className="text-sm text-n-600" role="status">Cargando el reel…</p>}
          {(estado === "falla" || estado === "sin-consentimiento") && (
            <div className="mt-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={PORTADA.src} srcSet={PORTADA.srcSet} sizes="34rem" alt="Portada del reel de Ludogteka" width={640} height={1136} className="max-h-[50vh] w-full rounded-2xl object-cover object-[50%_30%]" />
              <p className="mt-3 text-sm text-n-700" role="status">
                {estado === "sin-consentimiento"
                  ? "Para verlo aquí hay que aceptar las cookies de marketing (el video lo sirve Instagram). Sin eso, míralo directo en Instagram."
                  : "No pudimos cargar el reel aquí."}
              </p>
              {estado === "sin-consentimiento" && (
                <button
                  type="button"
                  className="mt-2 text-sm font-semibold text-morado underline"
                  onClick={() => window.PeluDeskConsentimiento?.abrirPreferencias()}
                >
                  Cambiar mis preferencias de cookies
                </button>
              )}
              <a
                href={REEL}
                target="_blank"
                rel="noopener noreferrer"
                className="pd-boton pd-boton-primario mt-3 inline-flex min-h-12 items-center justify-center rounded-full bg-morado px-6 text-base font-semibold text-white hover:bg-morado-oscuro focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave"
              >
                Ver en Instagram
                <span className="sr-only"> (se abre en otra pestaña)</span>
              </a>
            </div>
          )}
        </div>
      </dialog>
    </>
  );
}

/** Botón «Pregúntales» + modal accesible (dialog nativo: foco atrapado, Esc y clic afuera). */
export function PreguntalesModal() {
  const dialogo = useRef<HTMLDialogElement>(null);
  const [abierto, setAbierto] = useState(false);

  useEffect(() => {
    const d = dialogo.current;
    if (!d) return;
    const alCerrar = () => {
      setAbierto(false);
      document.documentElement.classList.remove("pd-sin-scroll");
    };
    d.addEventListener("close", alCerrar);
    return () => d.removeEventListener("close", alCerrar);
  }, []);

  function abrir() {
    dialogo.current?.showModal();
    document.documentElement.classList.add("pd-sin-scroll");
    setAbierto(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={abrir}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        className="pd-boton inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-full border-2 border-morado/25 bg-white px-6 text-base font-semibold text-morado hover:border-morado/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave"
      >
        Pregúntales
      </button>
      <dialog
        ref={dialogo}
        aria-labelledby="t-ludogteka-modal"
        onClick={(e) => {
          // Un clic en el fondo (el propio <dialog>, no su contenido) cierra.
          if (e.target === dialogo.current) dialogo.current?.close();
        }}
        className="pd-modal m-auto w-[min(92vw,26rem)] rounded-[24px] border border-n-200 bg-white p-0 text-n-900 shadow-2xl"
      >
        <div className="p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 id="t-ludogteka-modal" className="text-2xl font-bold tracking-[-0.02em]">
                Ludogteka
              </h3>
              <p className="mt-0.5 font-semibold text-morado">@ludogteka</p>
            </div>
            <button
              type="button"
              onClick={() => dialogo.current?.close()}
              aria-label="Cerrar"
              className="-mr-2 -mt-2 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-n-700 hover:bg-n-100 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave"
            >
              <svg viewBox="0 0 20 20" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">
                <path d="M5 5l10 10M15 5L5 15" />
              </svg>
            </button>
          </div>
          <p className="mt-4 leading-relaxed text-n-700">Escríbeles por Instagram y pregúntales cómo les va con PeluDesk.</p>
          <div className="mt-6 grid gap-3">
            <a
              href={INSTAGRAM}
              target="_blank"
              rel="noopener noreferrer"
              className="pd-boton pd-boton-primario inline-flex min-h-12 items-center justify-center rounded-full bg-morado px-6 text-base font-semibold text-white hover:bg-morado-oscuro focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave"
            >
              Ver su Instagram
              <span className="sr-only"> (se abre en otra pestaña)</span>
            </a>
            <a
              href={MENSAJE}
              target="_blank"
              rel="noopener noreferrer"
              className="pd-boton inline-flex min-h-12 items-center justify-center rounded-full border-2 border-morado/25 bg-white px-6 text-base font-semibold text-morado hover:border-morado/50 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave"
            >
              Mandarles mensaje
              <span className="sr-only"> (se abre en otra pestaña)</span>
            </a>
          </div>
        </div>
      </dialog>
    </>
  );
}
