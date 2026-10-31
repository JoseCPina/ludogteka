import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { normalizarTelefono } from "@/lib/telefono";
import { enviarConversion } from "@/lib/peludesk/capi";
import { esHerramienta } from "./lista";
import { entregarPorWhatsApp } from "./entregar";
import { registrarEventoHerramienta, type Origen } from "./telemetria";

/**
 * Lo que pasa cuando alguien deja su WhatsApp en una herramienta («Recíbelo por WhatsApp»), en este orden:
 *  1. el prospecto se crea o se completa por su teléfono con fuente «herramienta» (prospecto_registrar_herramienta:
 *     entra a las audiencias de Meta en la siguiente sincronización, como cualquier prospecto vivo);
 *  2. lo que capturó queda en herramientas_capturas ligado a su teléfono: al abrir su prueba gratis con ese mismo
 *     número se precarga en su negocio (src/lib/herramientas/precarga.ts);
 *  3. se anota el evento «telefono» con su fuente;
 *  4. el bot le manda el resultado con la plantilla aprobada; si Meta no la acepta, el resultado ya está en pantalla.
 * Nunca pide correo. Nunca lanza: lo que falle se anota y el resto sigue.
 */
export type EntradaCaptura = {
  herramienta: string;
  telefono: string;
  nombre?: string | null;
  negocio?: string | null;
  giro?: string | null;
  ciudad?: string | null;
  /** Lo que la herramienta le va a mandar: una frase corta y el link a su resultado. */
  resumen: string;
  url: string;
  /** Lo que se precarga en su cuenta (lo entiende precarga.ts por herramienta). */
  datos?: Record<string, unknown>;
  origen?: Origen | null;
  /** Para la API de conversiones de Meta (solo con marketing aceptado): el navegador manda Lead con el mismo eventId. */
  conversion?: { marketing: boolean; ip: string | null; userAgent: string | null; fbp: string | null; fbc: string | null } | null;
};

export type SalidaCaptura = { error: string | null; enviado?: boolean; motivo?: string; prospectoSlug?: string; nuevo?: boolean; eventId?: string };

export async function capturarTelefono(e: EntradaCaptura): Promise<SalidaCaptura> {
  if (!esHerramienta(e.herramienta)) return { error: "Herramienta desconocida." };
  const telefono = normalizarTelefono(e.telefono);
  if (!telefono) return { error: "Escribe tu WhatsApp a diez dígitos." };
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.rpc("prospecto_registrar_herramienta", {
    p_telefono: telefono,
    p_nombre: e.negocio?.trim().slice(0, 120) || null,
    p_giro: e.giro ?? null,
    p_ciudad: e.ciudad?.trim().slice(0, 80) || null,
    p_herramienta: e.herramienta,
  });
  if (error) {
    console.error("[herramientas] prospecto_registrar_herramienta", error.message);
    return { error: "No pudimos guardar tu teléfono. Intenta de nuevo." };
  }
  const p = data as { id: string; slug: string; nuevo: boolean; baja: boolean } | null;
  // El diagnóstico se queda en el prospecto, en una línea, para que el bot venda con eso.
  if (p?.id && e.herramienta === "diagnostico" && typeof e.datos?.resumen_bot === "string") {
    // La columna admite 300 caracteres.
    const { error: eCal } = await admin.from("prospectos").update({ calificacion_texto: String(e.datos.resumen_bot).slice(0, 300) }).eq("id", p.id);
    if (eCal) console.error("[herramientas] calificacion_texto", eCal.message);
  }

  // 2. La captura (una viva por teléfono y herramienta: la última gana; el índice único es parcial, así que no sirve
  //    un upsert con on conflict: se busca y se actualiza o se inserta).
  const fila = { telefono_norm: telefono, herramienta: e.herramienta, datos: { ...(e.datos ?? {}), nombre: e.nombre ?? null, negocio: e.negocio ?? null, giro: e.giro ?? null, ciudad: e.ciudad ?? null, resumen: e.resumen, url: e.url }, prospecto_id: p?.id ?? null, aplicado_negocio_id: null, aplicado_at: null, aplicado_detalle: null };
  const { data: viva } = await admin.from("herramientas_capturas").select("id").eq("telefono_norm", telefono).eq("herramienta", e.herramienta).is("deleted_at", null).maybeSingle();
  const { error: eCap } = viva ? await admin.from("herramientas_capturas").update(fila).eq("id", viva.id) : await admin.from("herramientas_capturas").insert(fila);
  if (eCap) console.error("[herramientas] captura", eCap.message);

  // 3. El evento, y Lead a la API de conversiones de Meta (deduplicado con el píxel por el mismo event_id; solo con
  //    marketing aceptado; el teléfono va en hash).
  await registrarEventoHerramienta({ herramienta: e.herramienta, evento: "telefono", origen: e.origen, giro: e.giro, ciudad: e.ciudad, prospectoId: p?.id ?? null, sinFiltroNavegador: true });
  const eventId = crypto.randomUUID();
  if (e.conversion?.marketing) {
    await enviarConversion({ nombre: "Lead", eventId, url: e.url, ip: e.conversion.ip, userAgent: e.conversion.userAgent, fbp: e.conversion.fbp, fbc: e.conversion.fbc, telefono, contenido: e.herramienta });
  }

  // 4. La entrega. Quien pidió BAJA de los mensajes de PeluDesk no recibe nada.
  if (p?.baja) return { error: null, enviado: false, motivo: "baja", prospectoSlug: p.slug, nuevo: p.nuevo, eventId };
  const { data: excluido } = await admin.from("seguimiento_pruebas_exclusiones").select("id").eq("telefono", telefono).is("deleted_at", null).maybeSingle();
  if (excluido) return { error: null, enviado: false, motivo: "baja", prospectoSlug: p?.slug, nuevo: p?.nuevo, eventId };
  const r = await entregarPorWhatsApp({ telefono, nombre: e.nombre, resumen: e.resumen, url: e.url, herramienta: e.herramienta, prospectoId: p?.id ?? null });
  if (!r.enviado) console.error("[herramientas] entrega", e.herramienta, r.motivo);
  return { error: null, enviado: r.enviado, motivo: r.motivo, prospectoSlug: p?.slug, nuevo: p?.nuevo, eventId };
}
