// Íconos de la app para dueños: trazo fino (1.5), sin relleno. Solo los que usan las pestañas y las pantallas.
import type { SVGProps } from "react";

const base = (p: SVGProps<SVGSVGElement>) => ({ viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.5, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true, ...p });

export const IconoHuella = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <ellipse cx="7.2" cy="9.3" rx="1.7" ry="2.3" />
    <ellipse cx="16.8" cy="9.3" rx="1.7" ry="2.3" />
    <ellipse cx="4.6" cy="13.6" rx="1.5" ry="2" />
    <ellipse cx="19.4" cy="13.6" rx="1.5" ry="2" />
    <path d="M12 12.2c-2.6 0-5.4 2.6-5.4 5.1 0 1.6 1.2 2.6 2.6 2.6 1 0 1.7-.5 2.8-.5s1.8.5 2.8.5c1.4 0 2.6-1 2.6-2.6 0-2.5-2.8-5.1-5.4-5.1Z" />
  </svg>
);
export const IconoCampana = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M6 16.5V11a6 6 0 1 1 12 0v5.5l1.5 1.5H4.5L6 16.5Z" />
    <path d="M10 20.5a2 2 0 0 0 4 0" />
  </svg>
);
export const IconoPin = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 1 1 13 0c0 5.4-6.5 11-6.5 11Z" />
    <circle cx="12" cy="10" r="2.3" />
  </svg>
);
export const IconoFlecha = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);
export const IconoFlechaArriba = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M7 17 17 7M9 7h8v8" />
  </svg>
);
export const IconoWhatsApp = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 20l1.3-3.8A8 8 0 1 1 8.2 19L4 20Z" />
    <path d="M9.3 9.2c.2-.6.5-.6.8-.6h.5c.2 0 .4.1.5.4l.6 1.4c.1.2 0 .4-.1.5l-.5.6c.4.8 1.2 1.6 2.1 2.1l.6-.5c.2-.2.4-.2.6-.1l1.4.6c.3.1.4.3.4.5v.6c0 .4-.3.9-.8 1-1 .3-2.7-.3-4.4-2S8.9 10.5 9.3 9.2Z" />
  </svg>
);
export const IconoCheck = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </svg>
);
export const IconoPersona = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <circle cx="12" cy="8.5" r="3.5" />
    <path d="M5 19.5c1.2-3.2 3.8-4.8 7-4.8s5.8 1.6 7 4.8" />
  </svg>
);
export const IconoCamara = (p: SVGProps<SVGSVGElement>) => (
  <svg {...base(p)}>
    <path d="M4 8.5h3l1.5-2.5h7L17 8.5h3v10H4v-10Z" />
    <circle cx="12" cy="13.5" r="3" />
  </svg>
);
