import { REDES_PELUDESK } from "@/lib/peludesk/landing";

// Los íconos de las redes, dibujados en SVG (sin emojis ni librerías).
const ICONOS: Record<(typeof REDES_PELUDESK)[number]["red"], React.ReactNode> = {
  facebook: (
    <path d="M13.5 21v-7.5h2.5l.4-3h-2.9V8.6c0-.9.3-1.5 1.5-1.5h1.6V4.4c-.3 0-1.2-.1-2.3-.1-2.3 0-3.8 1.4-3.8 3.9v2.3H8v3h2.5V21h3Z" fill="currentColor" />
  ),
  instagram: (
    <g fill="none" stroke="currentColor" strokeWidth="1.8">
      <rect x="3.5" y="3.5" width="17" height="17" rx="4.5" />
      <circle cx="12" cy="12" r="3.9" />
      <circle cx="17.2" cy="6.8" r="1" fill="currentColor" stroke="none" />
    </g>
  ),
  tiktok: (
    <path d="M16.6 3c.3 2.2 1.6 3.6 3.9 3.8v2.6c-1.4.1-2.7-.3-3.9-1v5.9c0 3.4-2.6 5.7-5.7 5.7-3.2 0-5.4-2.5-5.4-5.4 0-3.4 3-5.9 6.5-5.3v2.8c-1.6-.4-3.6.5-3.6 2.4 0 1.5 1.2 2.6 2.6 2.6 1.6 0 2.7-1 2.7-3V3h2.9Z" fill="currentColor" />
  ),
};

export function RedesPeluDesk({ className = "" }: { className?: string }) {
  return (
    <ul className={`flex items-center gap-2 ${className}`} aria-label="PeluDesk en redes sociales">
      {REDES_PELUDESK.map((r) => (
        <li key={r.red}>
          <a
            href={r.url}
            target="_blank"
            rel="me noopener noreferrer"
            aria-label={`PeluDesk en ${r.nombre}`}
            title={`PeluDesk en ${r.nombre}`}
            className="flex h-11 w-11 items-center justify-center rounded-full text-n-700 transition-colors hover:bg-morado-suave hover:text-morado focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado"
          >
            <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
              {ICONOS[r.red]}
            </svg>
          </a>
        </li>
      ))}
    </ul>
  );
}
