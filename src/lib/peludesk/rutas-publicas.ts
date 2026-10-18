/**
 * Slugs de las páginas públicas de peludesk.mx que no son artículos ni
 * ayuda. Archivo SIN dependencias (lo importa el middleware): una página
 * pública nueva se agrega aquí, en `paginas.ts` (sitemap, llms.txt, enlaces)
 * y en su carpeta de src/app/peludesk.
 */
export const SLUGS_GUIA = [
  "control-de-pagos-y-caja-en-una-guarderia-canina",
  "contratos-y-vacunas-obligatorias-en-guarderias-y-hoteles-caninos",
  "facturacion-cfdi-para-esteticas-y-veterinarias",
  "recordatorios-por-whatsapp-y-portal-para-duenos-de-mascotas",
] as const;

export const SLUGS_ALTERNATIVA = ["moego", "gingr", "petexec", "sicar", "agendapro", "qvet", "okvet"] as const;
