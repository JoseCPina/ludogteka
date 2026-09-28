// Ilustraciones de la marca (paquetes 1 a 5 de marca-peludesk/, en Drive:
// "todos los paquetes"). Se recortan y pasan a WebP en 1x y 2x con
// scripts/diseno/ilustraciones-peludesk.py → public/peludesk/ilustraciones.
// Son decoración: alt vacío salvo que la imagen diga algo que el texto no.

export const ILUSTRACIONES = {
  "escena-agenda": [560, 422],
  "escena-bano": [560, 435],
  "escena-hotel": [560, 427],
  "escena-vacunas": [560, 424],
  "chihuahua-asomandose": [320, 382],
  "xolo-sentado": [360, 436],
  laptop: [560, 535],
  calendario: [420, 420],
  clipboard: [420, 461],
  bano: [420, 412],
  expediente: [420, 429],
  durmiendo: [520, 498],
  "fluffy-feliz": [360, 331],
  "chihuahua-feliz": [320, 347],
  huellitas: [360, 363],
  corazon: [200, 206],
  "blob-lila": [600, 520],
  "textura-menta": [600, 561],
} as const;

export type NombreIlustracion = keyof typeof ILUSTRACIONES;

export function Ilustracion({
  nombre,
  alt = "",
  className = "",
  prioridad = false,
  sizes,
}: {
  nombre: NombreIlustracion;
  alt?: string;
  className?: string;
  prioridad?: boolean;
  sizes?: string;
}) {
  const [ancho, alto] = ILUSTRACIONES[nombre];
  const base = `/peludesk/ilustraciones/${nombre}`;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${base}.webp`}
      srcSet={`${base}.webp ${ancho}w, ${base}@2x.webp ${ancho * 2}w`}
      sizes={sizes ?? `${ancho}px`}
      width={ancho}
      height={alto}
      alt={alt}
      aria-hidden={alt ? undefined : true}
      loading={prioridad ? "eager" : "lazy"}
      decoding="async"
      draggable={false}
      className={`pointer-events-none select-none ${className}`}
    />
  );
}
