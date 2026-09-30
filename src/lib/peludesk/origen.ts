/**
 * De dónde llegó cada registro (utm_* y fbclid), para mostrarlo en
 * /plataforma junto a «En prueba gratis».
 *
 * Sin guardar nada en el navegador: los links a /registro se llevan las
 * etiquetas de la dirección actual (EnlaceRegistro), la página de registro las
 * pone en campos ocultos y la acción las anota en registros_prueba. Las
 * etiquetas utm no identifican a nadie y se anotan siempre que vengan; el
 * fbclid (un identificador del clic en Meta) solo si la persona aceptó la
 * categoría de marketing. Se recortan a lo que cabe en la tabla.
 */
export const PARAMETROS_ORIGEN = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "fbclid"] as const;
export type ParametroOrigen = (typeof PARAMETROS_ORIGEN)[number];
export type Origen = { utm_source: string | null; utm_medium: string | null; utm_campaign: string | null; utm_content: string | null; fbclid: string | null; referente: string | null };

const TOPE: Record<ParametroOrigen | "referente", number> = { utm_source: 100, utm_medium: 100, utm_campaign: 150, utm_content: 150, fbclid: 300, referente: 200 };

/** Solo caracteres de una etiqueta normal: nada de HTML ni de saltos de línea. */
function limpio(v: FormDataEntryValue | string | string[] | null | undefined, tope: number): string | null {
  const t = (Array.isArray(v) ? v[0] : v == null ? "" : String(v)).replace(/[^\p{L}\p{N} _.:+\-|/]/gu, "").trim().slice(0, tope);
  return t || null;
}

export function origenDe(fuente: (clave: string) => FormDataEntryValue | string | string[] | null | undefined, conFbclid: boolean): Origen {
  return {
    utm_source: limpio(fuente("utm_source"), TOPE.utm_source),
    utm_medium: limpio(fuente("utm_medium"), TOPE.utm_medium),
    utm_campaign: limpio(fuente("utm_campaign"), TOPE.utm_campaign),
    utm_content: limpio(fuente("utm_content"), TOPE.utm_content),
    fbclid: conFbclid ? limpio(fuente("fbclid"), TOPE.fbclid) : null,
    referente: limpio(fuente("referente"), TOPE.referente),
  };
}

/** «Meta · campaña-otoño» para la pantalla de la plataforma. */
export function textoDeOrigen(o: Partial<Origen> | null | undefined): string {
  if (!o) return "Directo (sin etiquetas)";
  const partes = [o.utm_source, o.utm_medium, o.utm_campaign, o.utm_content].filter(Boolean);
  if (partes.length) return partes.join(" · ") + (o.fbclid ? " · clic en anuncio de Meta" : "");
  if (o.fbclid) return "Clic en anuncio de Meta";
  if (o.referente) return `Desde ${o.referente}`;
  return "Directo (sin etiquetas)";
}
