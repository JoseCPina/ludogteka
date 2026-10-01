import type { EstadoReporte } from "@/lib/reporte/tipos";

/** Lo que la pantalla necesita saber del reporte de hoy de un perro. */
export type MetaReporte = {
  id: string | null;
  estado: EstadoReporte | null;
  version: number;
  llenadoPor: string | null;
  enviadoAt: string | null;
  enviadoPor: string | null;
  envios: number;
  // Hay imagen, no ha vencido y es del contenido actual.
  tarjetaVigente: boolean;
  // Hubo imagen pero ya venció o quedó vieja: se puede regenerar.
  tarjetaVencida: boolean;
  tarjetaUrl: string | null;
  descargaUrl: string | null;
  tarjetaExpiraAt: string | null;
};

export type ResultadoGuardar = { error: string | null; meta?: MetaReporte };
