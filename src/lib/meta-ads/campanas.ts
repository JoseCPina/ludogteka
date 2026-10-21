import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiMeta } from "./api";

// La campaña de clic a WhatsApp de PeluDesk, creada y revisada por la tarea diaria (después de la sincronización de
// audiencias). Idempotente: cada pieza (similar, campaña, imagen, creativo, conjunto, anuncio) tiene su fila en
// meta_campanas (o meta_audiencias) con su id de Meta; lo que ya existe no se vuelve a crear, lo que existe en Meta
// con el mismo nombre se adopta, y lo que falla queda con su error y se reintenta al día siguiente. Los CONJUNTOS no
// se crean: se hacen a mano en Ads Manager con su nombre y aquí se editan (ver edicionConjunto). TODO nace en
// PAUSADO: una persona lo activa en Ads Manager; la única excepción es el conjunto de retargeting, que la tarea activa
// UNA vez cuando su público llega a MINIMO_RETARGETING. Sin imports de valores de «@/»: base y API llegan inyectadas.

type Fila = { id: string; clave: string; meta_id: string | null; estado: string; activado_auto_at: string | null; datos: Record<string, unknown> | null };
type Audiencia = { id: string; clave: string; nombre: string; descripcion: string | null; tipo: string; origen_clave: string | null; ratio: number | null; pais: string | null; audience_id: string | null; miembros: number; coincidencias_min: number | null };

// ── Configuración de la campaña (ningún valor es secreto: ids públicos de la página, Instagram y el número del bot) ──
export const PAGINA_ID = "1297753746760177"; // Página de Facebook «PeluDesk»
export const INSTAGRAM_ID = "17841417621828061"; // @peludesk
export const WHATSAPP_NUMERO_ID = "1387083197814029"; // +52 56 4916 0742 (bot, Cloud API)
export const WHATSAPP_NUMERO = "5215649160742";

export const CAMPANA_NOMBRE = "PeluDesk · WhatsApp · Prospección";
export const PRESUPUESTO_DIARIO_CENTAVOS = 10_000; // 100 MXN por conjunto
export const EDAD_MIN = 25;
export const EDAD_MAX = 60;
/** El conjunto de retargeting se activa solo cuando su público tiene al menos esto (enviados y coincidencias). */
export const MINIMO_RETARGETING = 100;

export type GiroAnuncio = "veterinarias" | "esteticas" | "hotel_guarderia" | "retargeting";
export type Pieza = "agenda" | "cobro" | "portal";
export type Formato = "cuadrada" | "vertical";

export const GIROS: GiroAnuncio[] = ["veterinarias", "esteticas", "hotel_guarderia", "retargeting"];
export const PIEZAS: Pieza[] = ["agenda", "cobro", "portal"];
export const FORMATOS: Record<Formato, { ancho: number; alto: number }> = { cuadrada: { ancho: 1080, alto: 1080 }, vertical: { ancho: 1080, alto: 1920 } };

export const CIERRE = "Prueba gratis, sin tarjeta.";

export const CONJUNTOS: Record<GiroAnuncio, {
  nombre: string;
  etiqueta: string;
  /** Claves de meta_audiencias que se incluyen (se suman: OR). */
  audiencias: string[];
  /** Intereses (Meta los cruza con las audiencias: AND). */
  intereses?: { id: string; name: string }[];
  texto: string;
  prellenado: string;
  /** Lo arma la tarea cuando el público llega al mínimo; los demás los activa una persona en Ads Manager. */
  autoActivar?: boolean;
}> = {
  veterinarias: {
    nombre: "PeluDesk · WhatsApp · Veterinarias",
    etiqueta: "Veterinarias",
    audiencias: ["veterinarias", "similar_veterinarias"],
    texto: "Tus clientes agendan y reciben recordatorios por WhatsApp. Expediente, vacunas y caja en un solo lugar.",
    prellenado: "Hola, vi su anuncio y quiero probar PeluDesk para mi veterinaria",
  },
  esteticas: {
    nombre: "PeluDesk · WhatsApp · Estéticas",
    etiqueta: "Estéticas caninas",
    audiencias: ["esteticas", "similar_esteticas"],
    texto: "Agenda llena sin contestar mensajes todo el día. Tus clientes reservan solos y tú cobras en un clic.",
    prellenado: "Hola, vi su anuncio y quiero probar PeluDesk para mi estética",
  },
  hotel_guarderia: {
    nombre: "PeluDesk · WhatsApp · Hotel y guardería",
    etiqueta: "Hotel y guardería",
    audiencias: ["hotel_guarderia", "similar_prospectos"],
    intereses: [
      // «Dog daycare» (6003133233128) lo retiró Meta el 21 de octubre de 2026; su alternativa es «Dogs».
      { id: "6003332344237", name: "Dogs" },
      { id: "6003512623565", name: "Hotel para perros" },
      { id: "6003545396227", name: "Entrenamiento de perros (mascotas)" },
    ],
    texto: "Reservas, check-in con fotos y contrato firmado desde el celular del dueño.",
    prellenado: "Hola, vi su anuncio y quiero probar PeluDesk para mi hotel y guardería",
  },
  retargeting: {
    nombre: "PeluDesk · WhatsApp · Visitaron su página",
    etiqueta: "Tu negocio en PeluDesk",
    audiencias: ["visitaron"],
    texto: "Ya viste cómo se vería tu negocio en PeluDesk. Pruébalo gratis.",
    prellenado: "Hola, vi su anuncio y quiero probar PeluDesk para mi negocio",
    autoActivar: true,
  },
};

/** Todo conjunto excluye a quien ya paga, a quien está en prueba y a quien pidió no recibir publicidad. */
export const EXCLUSIONES = ["pagando", "en_prueba", "bajas"];

export const PIEZA_TITULO: Record<Pieza, string> = {
  agenda: "Tu agenda, en orden",
  cobro: "Cobra en un clic",
  portal: "Tus clientes lo ven todo",
};

export const archivoImagen = (giro: GiroAnuncio, pieza: Pieza, formato: Formato) => `${giro}-${pieza}-${formato}.jpg`;

export type ResultadoCampanas = { creados: string[]; errores: string[]; activados: string[]; insights: number; manuales: string[]; editados: string[] };

/**
 * Lo que la tarea pone en un conjunto que ya existe: nombre, presupuesto y segmentación. Meta rechaza crear conjuntos
 * de WhatsApp por la API (2446886, aunque la página tenga el número) y no deja cambiar la ventana de atribución de un
 * conjunto ya creado (1504040): el conjunto se crea a mano en Ads Manager (con la ventana de 1 día) y aquí solo se edita.
 */
export function edicionConjunto(giro: GiroAnuncio, incluir: string[], excluir: string[]) {
  const e = especConjunto(giro, "", incluir, excluir);
  return { name: e.name, daily_budget: e.daily_budget, targeting: e.targeting };
}

export const textoConjuntoManual = (giro: GiroAnuncio) =>
  `Crear a mano en Ads Manager: un conjunto de WhatsApp en la campaña «${CAMPANA_NOMBRE}», con la página PeluDesk, el número +52 56 4916 0742 y la ventana de atribución de 1 día después del clic, en pausa y con el nombre «${CONJUNTOS[giro].nombre}». La siguiente sincronización le pone presupuesto, públicos, exclusiones y sus 3 anuncios.`;

export const textoAnuncio = (giro: GiroAnuncio) => `${CONJUNTOS[giro].texto}\n\n${CIERRE}`;

/** Mensaje de bienvenida de WhatsApp con el texto que la persona ya tiene escrito al abrir el chat. */
export const bienvenidaWhatsApp = (prellenado: string) =>
  JSON.stringify({
    type: "VISUAL_EDITOR",
    version: 2,
    landing_screen_type: "welcome_message",
    media_type: "text",
    text_format: { customer_action_type: "autofill_message", message: { autofill_message: { content: prellenado }, text: "Hola, ¿en qué te ayudamos?" } },
  });

export function especCreativo(giro: GiroAnuncio, pieza: Pieza, hashes: Record<Formato, string>) {
  const c = CONJUNTOS[giro];
  return {
    name: `PeluDesk · ${c.etiqueta} · ${pieza}`,
    object_story_spec: JSON.stringify({ page_id: PAGINA_ID, instagram_user_id: INSTAGRAM_ID }),
    asset_feed_spec: JSON.stringify({
      images: [
        { hash: hashes.cuadrada, adlabels: [{ name: "cuadrada" }] },
        { hash: hashes.vertical, adlabels: [{ name: "vertical" }] },
      ],
      bodies: [{ text: textoAnuncio(giro) }],
      titles: [{ text: PIEZA_TITULO[pieza] }],
      link_urls: [{ website_url: "https://api.whatsapp.com/send" }],
      call_to_action_types: ["WHATSAPP_MESSAGE"],
      ad_formats: ["SINGLE_IMAGE"],
      asset_customization_rules: [
        {
          customization_spec: {
            publisher_platforms: ["facebook", "instagram"],
            facebook_positions: ["feed", "marketplace", "video_feeds", "search"],
            instagram_positions: ["stream", "explore"],
          },
          image_label: { name: "cuadrada" },
          priority: 1,
        },
        {
          customization_spec: {
            publisher_platforms: ["facebook", "instagram"],
            facebook_positions: ["story", "facebook_reels"],
            instagram_positions: ["story", "reels"],
          },
          image_label: { name: "vertical" },
          priority: 2,
        },
      ],
      additional_data: { page_welcome_message: bienvenidaWhatsApp(c.prellenado) },
    }),
  };
}

export function especConjunto(giro: GiroAnuncio, campanaId: string, incluir: string[], excluir: string[]) {
  const c = CONJUNTOS[giro];
  const targeting: Record<string, unknown> = {
    geo_locations: { countries: ["MX"] },
    age_min: EDAD_MIN,
    age_max: EDAD_MAX,
    custom_audiences: incluir.map((id) => ({ id })),
    excluded_custom_audiences: excluir.map((id) => ({ id })),
    targeting_automation: { advantage_audience: 0 },
  };
  if (c.intereses?.length) targeting.flexible_spec = [{ interests: c.intereses }];
  return {
    name: c.nombre,
    campaign_id: campanaId,
    daily_budget: String(PRESUPUESTO_DIARIO_CENTAVOS),
    billing_event: "IMPRESSIONS",
    optimization_goal: "CONVERSATIONS",
    destination_type: "WHATSAPP",
    bid_strategy: "LOWEST_COST_WITHOUT_CAP",
    promoted_object: JSON.stringify({ page_id: PAGINA_ID, whats_app_business_phone_number_id: WHATSAPP_NUMERO_ID, whatsapp_phone_number: WHATSAPP_NUMERO }),
    targeting: JSON.stringify(targeting),
    status: "PAUSED",
  };
}

const CONVERSACION = "onsite_conversion.messaging_conversation_started_7d";

/** Gasto, conversaciones y costo por conversación de los últimos 7 días, de la respuesta de /insights. */
export function leerInsights(d: Record<string, unknown>) {
  const fila = ((d.data as Record<string, unknown>[] | undefined) ?? [])[0] ?? {};
  const gasto = Number(fila.spend ?? 0) || 0;
  const accion = ((fila.actions as { action_type: string; value: string }[] | undefined) ?? []).find((a) => a.action_type === CONVERSACION);
  const conversaciones = accion ? Number(accion.value) || 0 : 0;
  const costo = ((fila.cost_per_action_type as { action_type: string; value: string }[] | undefined) ?? []).find((a) => a.action_type === CONVERSACION);
  return { gasto, conversaciones, costo: costo ? Number(costo.value) : conversaciones > 0 ? Math.round((gasto / conversaciones) * 100) / 100 : null };
}

export async function asegurarCampanas(o: {
  db: SupabaseClient;
  api: ApiMeta;
  /** URL pública donde viven las imágenes (https://peludesk.mx/peludesk/anuncios). */
  urlImagenes: string;
  fetch?: typeof fetch;
}): Promise<ResultadoCampanas> {
  const { db, api } = o;
  const f = o.fetch ?? fetch;
  const res: ResultadoCampanas = { creados: [], errores: [], activados: [], insights: 0, manuales: [], editados: [] };
  const texto = (e: unknown) => (e instanceof Error ? e.message : String(e)).slice(0, 2000);

  // limite-filas-ok: la estructura de una campaña son unas 60 filas
  const { data: filasDb, error: errFilas } = await db.from("meta_campanas").select("id, clave, meta_id, estado, activado_auto_at, datos").is("deleted_at", null);
  if (errFilas) throw new Error(errFilas.message);
  const filas = new Map((filasDb as Fila[]).map((r) => [r.clave, r]));
  // limite-filas-ok: las audiencias fijas que siembran las migraciones
  const { data: audDb, error: errAud } = await db.from("meta_audiencias").select("id, clave, nombre, descripcion, tipo, origen_clave, ratio, pais, audience_id, miembros, coincidencias_min").is("deleted_at", null);
  if (errAud) throw new Error(errAud.message);
  const audiencias = new Map((audDb as Audiencia[]).map((a) => [a.clave, a]));

  // Listas por nombre de lo que ya hay en la cuenta (para adoptar en vez de duplicar).
  const listas = new Map<string, Promise<{ id: string; name: string }[]>>();
  const enCuenta = (borde: string) => {
    if (!listas.has(borde)) {
      listas.set(borde, (async () => {
        const todas: { id: string; name: string }[] = [];
        let despues: string | null = null;
        for (let i = 0; i < 10; i++) {
          const d = await api.graph("GET", `${api.cuenta}/${borde}`, { fields: "id,name", limit: "200", ...(despues ? { after: despues } : {}) });
          todas.push(...((d.data as { id: string; name: string }[]) ?? []));
          const p = d.paging as { cursors?: { after?: string }; next?: string } | undefined;
          despues = (p?.next && p.cursors?.after) || null;
          if (!despues) break;
        }
        return todas;
      })());
    }
    return listas.get(borde)!;
  };

  async function guardar(clave: string, cambios: Record<string, unknown>, base: { tipo: string; giro?: string | null; nombre: string }) {
    const fila = filas.get(clave);
    if (fila) {
      await db.from("meta_campanas").update(cambios).eq("id", fila.id);
      filas.set(clave, { ...fila, ...(cambios as Partial<Fila>) });
    } else {
      const { data } = await db.from("meta_campanas").insert({ clave, ...base, ...cambios }).select("id, clave, meta_id, estado, activado_auto_at, datos").single();
      if (data) filas.set(clave, data as Fila);
    }
  }

  /** Devuelve el id de Meta de la pieza: el guardado, uno con el mismo nombre en la cuenta, o el que se crea. */
  async function asegurar(clave: string, base: { tipo: string; giro?: string | null; nombre: string }, borde: string | null, crear: () => Promise<string>, datos?: Record<string, unknown>): Promise<string | null> {
    const fila = filas.get(clave);
    if (fila?.meta_id) return fila.meta_id;
    try {
      const existente = borde ? (await enCuenta(borde)).find((x) => x.name === base.nombre)?.id : undefined;
      const id = existente ?? (await crear());
      await guardar(clave, { meta_id: id, estado: "creado", ultimo_error: null, ...(datos ? { datos } : {}) }, base);
      if (!existente) res.creados.push(`${base.tipo} ${base.nombre} (${id})`);
      return id;
    } catch (e) {
      const t = texto(e);
      res.errores.push(`${base.nombre}: ${t}`);
      await guardar(clave, { estado: "error", ultimo_error: t }, base);
      return null;
    }
  }

  /**
   * El conjunto de ese giro: el guardado o el de la campaña con su nombre. NUNCA se crea (ver edicionConjunto): si no
   * existe queda «pendiente» con la instrucción para crearlo a mano. Si existe, se le pone lo de la tarea, solo cuando
   * cambió (la firma va en datos) para no tocar un conjunto que ya entrega.
   */
  async function conjuntoExistente(giro: GiroAnuncio, edicion: Record<string, string>): Promise<string | null> {
    const c = CONJUNTOS[giro];
    const clave = `conjunto:${giro}`;
    const base = { tipo: "conjunto", giro, nombre: c.nombre };
    let id = filas.get(clave)?.meta_id ?? null;
    try {
      if (!id) id = (await enCuenta("adsets")).find((x) => x.name === c.nombre)?.id ?? null;
    } catch (e) {
      res.errores.push(`${c.nombre}: ${texto(e)}`);
      return null;
    }
    if (!id) {
      res.manuales.push(c.nombre);
      await guardar(clave, { estado: "pendiente", ultimo_error: null, datos: { manual: textoConjuntoManual(giro) } }, base);
      return null;
    }
    const firma = JSON.stringify(edicion);
    const fila = filas.get(clave);
    if (fila?.meta_id !== id || fila?.datos?.firma !== firma) {
      try {
        await api.graph("POST", id, edicion);
        await guardar(clave, { meta_id: id, estado: "creado", ultimo_error: null, datos: { presupuesto: PRESUPUESTO_DIARIO_CENTAVOS / 100, firma } }, base);
        res.editados.push(`${c.nombre} (${id})`);
      } catch (e) {
        const t = texto(e);
        res.errores.push(`${c.nombre} (editar): ${t}`);
        await guardar(clave, { meta_id: id, estado: "error", ultimo_error: t }, base);
      }
    }
    return id;
  }

  // 1. Públicos similares.
  for (const a of audiencias.values()) {
    if (a.tipo !== "similar") continue;
    try {
      let id = a.audience_id;
      if (!id) {
        const origen = audiencias.get(a.origen_clave ?? "")?.audience_id;
        if (!origen) throw new Error(`La lista de origen (${a.origen_clave}) todavía no existe en Meta.`);
        id = (await api.listar()).find((x) => x.name === a.nombre)?.id ?? (await api.crearSimilar(a.nombre, a.descripcion ?? "", origen, Number(a.ratio), a.pais ?? "MX"));
        await db.from("meta_audiencias").update({ audience_id: id }).eq("id", a.id);
        a.audience_id = id;
        res.creados.push(`similar ${a.nombre} (${id})`);
      }
      const est = await api.estado(id).catch(() => null);
      await db.from("meta_audiencias").update({
        coincidencias_min: est?.min ?? null,
        coincidencias_max: est?.max ?? null,
        estado_meta: est ? { operacion: est.operacion, entrega: est.entrega } : null,
        ultima_sync_at: new Date().toISOString(),
        ultimo_error: null,
      }).eq("id", a.id);
    } catch (e) {
      const t = texto(e);
      res.errores.push(`${a.nombre}: ${t}`);
      await db.from("meta_audiencias").update({ ultimo_error: t }).eq("id", a.id);
    }
  }

  // 2. Campaña.
  const campanaId = await asegurar("campana:prospeccion", { tipo: "campana", nombre: CAMPANA_NOMBRE }, "campaigns", async () =>
    String((await api.graph("POST", `${api.cuenta}/campaigns`, {
      name: CAMPANA_NOMBRE,
      objective: "OUTCOME_ENGAGEMENT",
      status: "PAUSED",
      special_ad_categories: "[]",
      buying_type: "AUCTION",
      is_adset_budget_sharing_enabled: "false",
    })).id),
  );

  // 3. Imágenes (bytes desde la URL pública → hash) y creativos.
  const base = o.urlImagenes.replace(/\/$/, "");
  const creativos = new Map<string, string>();
  for (const giro of GIROS) {
    for (const pieza of PIEZAS) {
      const hashes: Partial<Record<Formato, string>> = {};
      for (const formato of Object.keys(FORMATOS) as Formato[]) {
        const archivo = archivoImagen(giro, pieza, formato);
        const h = await asegurar(`imagen:${giro}:${pieza}:${formato}`, { tipo: "imagen", giro, nombre: archivo }, null, async () => {
          const r = await f(`${base}/${archivo}`, { signal: AbortSignal.timeout(30_000) });
          if (!r.ok) throw new Error(`No se pudo leer la imagen ${archivo} (HTTP ${r.status}).`);
          const bytes = Buffer.from(await r.arrayBuffer()).toString("base64");
          const d = await api.graph("POST", `${api.cuenta}/adimages`, { bytes, name: archivo });
          const img = Object.values((d.images as Record<string, { hash?: string }>) ?? {})[0];
          if (!img?.hash) throw new Error("Meta no devolvió el hash de la imagen.");
          return img.hash;
        });
        if (h) hashes[formato] = h;
      }
      if (!hashes.cuadrada || !hashes.vertical) continue;
      const espec = especCreativo(giro, pieza, hashes as Record<Formato, string>);
      const cr = await asegurar(`creativo:${giro}:${pieza}`, { tipo: "creativo", giro, nombre: espec.name }, "adcreatives", async () =>
        String((await api.graph("POST", `${api.cuenta}/adcreatives`, espec)).id),
      );
      if (cr) creativos.set(`${giro}:${pieza}`, cr);
    }
  }

  // 4. Conjuntos y anuncios (en PAUSADO).
  const excluir = EXCLUSIONES.map((k) => audiencias.get(k)?.audience_id).filter(Boolean) as string[];
  if (campanaId) {
    for (const giro of GIROS) {
      const c = CONJUNTOS[giro];
      const faltan = c.audiencias.filter((k) => !audiencias.get(k)?.audience_id);
      const faltanExcl = EXCLUSIONES.filter((k) => !audiencias.get(k)?.audience_id);
      let conjunto: string | null = null;
      if (faltan.length || faltanExcl.length) {
        const t = `Faltan audiencias en Meta: ${[...faltan, ...faltanExcl].join(", ")}.`;
        res.errores.push(`${c.nombre}: ${t}`);
        if (!filas.get(`conjunto:${giro}`)?.meta_id) await guardar(`conjunto:${giro}`, { estado: "error", ultimo_error: t }, { tipo: "conjunto", giro, nombre: c.nombre });
        conjunto = filas.get(`conjunto:${giro}`)?.meta_id ?? null;
      } else {
        const incluir = c.audiencias.map((k) => audiencias.get(k)!.audience_id!) as string[];
        conjunto = await conjuntoExistente(giro, edicionConjunto(giro, incluir, excluir));
      }
      if (!conjunto) continue;
      for (const pieza of PIEZAS) {
        const cr = creativos.get(`${giro}:${pieza}`);
        if (!cr) continue;
        const nombre = `PeluDesk · ${c.etiqueta} · ${pieza}`;
        await asegurar(`anuncio:${giro}:${pieza}`, { tipo: "anuncio", giro, nombre }, "ads", async () =>
          String((await api.graph("POST", `${api.cuenta}/ads`, { name: nombre, adset_id: conjunto!, creative: JSON.stringify({ creative_id: cr }), status: "PAUSED" })).id),
        );
      }

      // Retargeting: se activa UNA vez, cuando su público ya alcanza para entregar.
      const fila = filas.get(`conjunto:${giro}`);
      const aud = audiencias.get(c.audiencias[0]);
      if (c.autoActivar && fila?.meta_id && !fila.activado_auto_at && aud && aud.miembros >= MINIMO_RETARGETING && (aud.coincidencias_min ?? 0) >= MINIMO_RETARGETING) {
        try {
          await api.graph("POST", fila.meta_id, { status: "ACTIVE" });
          for (const pieza of PIEZAS) {
            const ad = filas.get(`anuncio:${giro}:${pieza}`)?.meta_id;
            if (ad) await api.graph("POST", ad, { status: "ACTIVE" });
          }
          await guardar(`conjunto:${giro}`, { activado_auto_at: new Date().toISOString() }, { tipo: "conjunto", giro, nombre: c.nombre });
          res.activados.push(c.nombre);
        } catch (e) {
          res.errores.push(`${c.nombre} (activar): ${texto(e)}`);
        }
      }
    }
  }

  // 5. Estado y últimos 7 días de la campaña y sus conjuntos.
  for (const fila of filas.values()) {
    if (!fila.meta_id || !(fila.clave.startsWith("campana:") || fila.clave.startsWith("conjunto:"))) continue;
    try {
      const [estado, ins] = await Promise.all([
        api.graph("GET", fila.meta_id, { fields: fila.clave.startsWith("conjunto:") ? "effective_status,daily_budget" : "effective_status" }),
        api.graph("GET", `${fila.meta_id}/insights`, { date_preset: "last_7d", fields: "spend,actions,cost_per_action_type" }),
      ]);
      const i = leerInsights(ins);
      await db.from("meta_campanas").update({
        estado_meta: String(estado.effective_status ?? ""),
        presupuesto_diario: estado.daily_budget != null ? Number(estado.daily_budget) / 100 : null,
        gasto_7d: i.gasto,
        conversaciones_7d: i.conversaciones,
        costo_conversacion: i.costo,
        insights_at: new Date().toISOString(),
      }).eq("id", fila.id);
      res.insights++;
    } catch (e) {
      res.errores.push(`${fila.clave} (insights): ${texto(e)}`);
    }
  }
  return res;
}
