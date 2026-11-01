import type { ReactNode } from "react";

/**
 * UX (1 de noviembre de 2026): las piezas de los `loading.tsx` de las pantallas pesadas (Recepción, Hotel, Guardería,
 * Agenda de estética, Clientes, Caja y Reportes). Cada pantalla arma su esqueleto con SU forma (título, botones,
 * columnas, tarjetas, renglones), de modo que al tocar el menú se ve al instante dónde va a quedar cada cosa en vez de
 * un giro en medio de la nada. Con movimiento reducido no pulsa.
 */
const PULSO = "animate-pulse rounded-md bg-n-200 motion-reduce:animate-none";

export function Esqueleto({ etiqueta, children }: { etiqueta: string; children: ReactNode }) {
  return (
    <div role="status" aria-busy="true" aria-label={`Cargando ${etiqueta}`} data-esqueleto={etiqueta} className="flex flex-col gap-6">
      <span className="sr-only">Cargando {etiqueta}…</span>
      {children}
    </div>
  );
}

export function Barra({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`${PULSO} ${className}`} />;
}

/** El título de la pantalla y, debajo, la línea de contexto. */
export function EsqueletoTitulo({ ancho = "w-48", conSubtitulo = true }: { ancho?: string; conSubtitulo?: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <Barra className={`h-8 ${ancho}`} />
      {conSubtitulo && <Barra className="h-4 w-72 max-w-full" />}
    </div>
  );
}

/** Los botones de arriba (Check-in, Check-out, Nueva…), del alto de un botón del sistema. */
export function EsqueletoBotones({ n = 3 }: { n?: number }) {
  return (
    <div className="flex flex-wrap gap-3">
      {Array.from({ length: n }, (_, i) => (
        <Barra key={i} className="h-12 w-36" />
      ))}
    </div>
  );
}

/** Mosaicos o tarjetas de cifras. */
export function EsqueletoTarjetas({ n = 4, columnas = "sm:grid-cols-2 lg:grid-cols-4", alto = "h-24" }: { n?: number; columnas?: string; alto?: string }) {
  return (
    <div className={`grid grid-cols-1 gap-4 ${columnas}`}>
      {Array.from({ length: n }, (_, i) => (
        <Barra key={i} className={`${alto} rounded-lg`} />
      ))}
    </div>
  );
}

/** Una sección con su encabezado chico y renglones. */
export function EsqueletoSeccion({ filas = 3, enCaja = false, alto = "h-14" }: { filas?: number; enCaja?: boolean; alto?: string }) {
  return (
    <div className={`flex flex-col gap-3 ${enCaja ? "rounded-lg border border-n-200 bg-n-50 p-4" : ""}`}>
      <Barra className="h-4 w-32" />
      {Array.from({ length: filas }, (_, i) => (
        <Barra key={i} className={`${alto} w-full rounded-lg`} />
      ))}
    </div>
  );
}

/** Columnas lado a lado (en el celular, una debajo de otra). */
export function EsqueletoColumnas({ n = 3, filas = 3 }: { n?: number; filas?: number }) {
  return (
    <div className={`grid grid-cols-1 gap-4 ${n === 2 ? "md:grid-cols-2" : "md:grid-cols-3"}`}>
      {Array.from({ length: n }, (_, i) => (
        <EsqueletoSeccion key={i} filas={filas} enCaja />
      ))}
    </div>
  );
}

/** Una tabla: encabezado y renglones (en el celular se lee como tarjetas). */
export function EsqueletoTabla({ filas = 6 }: { filas?: number }) {
  return (
    <div className="flex flex-col overflow-hidden rounded-lg border border-n-200 bg-white">
      <Barra className="h-10 w-full rounded-none" />
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className="flex items-center gap-4 border-t border-n-200 px-4 py-3">
          <Barra className="h-5 w-1/3" />
          <Barra className="h-5 w-1/4" />
          <Barra className="ml-auto h-5 w-20" />
        </div>
      ))}
    </div>
  );
}
