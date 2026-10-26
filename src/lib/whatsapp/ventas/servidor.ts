// El guion de ventas del lado del servidor: el estado de cada prospecto (wa_ventas), la IA que SOLO clasifica, el
// envío de cada pieza (texto, botones, el Flow «Probar gratis» con su respaldo por texto) y los seguimientos.
// Lo que se dice está en guion.ts; aquí no se redacta nada.
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { urlDemo } from "@/lib/peludesk/landing";
import { respuestasFijas } from "@/lib/peludesk/respuestas-fijas";
import { precioRecordatorioVigente } from "@/lib/recordatorios/precio";
import { DEMO_POR_GIRO } from "@/lib/web-negocio/demo";
import { costoMxn, MODELO_IA, type ProspectoContexto } from "../agente";
import { RESPUESTAS_FUNCIONES } from "../conocimiento";
import { type ClienteWA, graphBase, planesPublicos, preciosDelBot, registroDeProspecto, VERSION_GRAPH } from "../infra";
import type { IA } from "../soporte";
import { clienteWA, ofrecerFlow } from "../flow/servidor";
import {
  BOTONES_GIRO,
  type Clasificacion,
  clasificarFijo,
  type ContextoGuion,
  decidir,
  type EstadoVentas,
  type Etapa,
  FUNCIONES_PALABRAS,
  type Giro,
  PLANTILLA_VENTAS,
  type Rama,
  RAMAS,
  SEGUIMIENTO_FLOW,
  seguimientoSinGiro,
  type Sistema,
} from "./guion";

const AVISO_PIE = "Así cuidamos tus datos: peludesk.mx/aviso-de-privacidad";
const AVISO_LINEA = "Así cuidamos tus datos:\nhttps://peludesk.mx/aviso-de-privacidad";

type FilaVentas = {
  id: string;
  telefono: string;
  etapa: Etapa;
  giro: Giro | null;
  fuente: string;
  prospecto_id: string | null;
  desconocidas: number;
  seguimientos: number;
  cierre_at: string | null;
  giro_preguntado_at: string | null;
};

const giroDeProspectoCrm = (g: string | null | undefined): Giro | null =>
  g === "estetica" ? "estetica" : g === "guarderia" || g === "hotel" ? "hotel_guarderia" : g === "veterinaria" ? "veterinaria" : g === "mixto" ? "varios" : null;
const fuenteDe = (p: ProspectoContexto | null | undefined) => (!p ? "directo" : p.anuncio || p.fuente === "anuncio_meta" ? "anuncio_meta" : p.fuente === "manual" ? "manual" : "google_places");

/** La demo de Patitas & Co. en la pantalla de su giro (la general si no se sabe). */
export function demoDeGiro(giro: Giro | null): string {
  const clave = giro === "estetica" ? "estetica" : giro === "veterinaria" ? "veterinaria" : giro === "hotel_guarderia" || giro === "varios" ? "guarderia" : null;
  if (!clave) return `${urlDemo()}/demo`;
  const d = DEMO_POR_GIRO[clave];
  return `${urlDemo()}/demo/entrar/${d.rol}?ir=${d.ir}`;
}

async function contextoGuion(): Promise<ContextoGuion> {
  // El precio de los recordatorios automáticos, de la base (wa_precios): la respuesta fija de «recordatorios» lo dice.
  const [planes, recordatorio] = await Promise.all([planesPublicos().catch(() => []), precioRecordatorioVigente().catch(() => null)]);
  const precios = preciosDelBot(planes);
  const fijas = respuestasFijas({ mensual: precios?.mensual ?? null, anual: precios?.anual ?? null, sucursal: precios?.sucursal ?? null, recordatorio });
  return {
    mensual: precios?.mensual ?? null,
    demo: demoDeGiro,
    funcion: (clave) => RESPUESTAS_FUNCIONES[clave] ?? fijas.find((f) => f.clave === clave && f.clave !== "sucursales")?.respuesta ?? null,
  };
}

async function estadoDe(telefono: string, prospecto: ProspectoContexto | null | undefined): Promise<FilaVentas> {
  const sb = createSupabaseAdminClient();
  const cols = "id, telefono, etapa, giro, fuente, prospecto_id, desconocidas, seguimientos, cierre_at, giro_preguntado_at";
  const { data } = await sb.from("wa_ventas").select(cols).eq("telefono", telefono).is("deleted_at", null).maybeSingle();
  const giroP = giroDeProspectoCrm(prospecto?.giro);
  if (data) {
    const f = data as FilaVentas;
    // Un prospecto que se reconoce después (por su ref o su anuncio): su giro y su fuente.
    if (prospecto?.id && !f.prospecto_id) {
      const cambio = { prospecto_id: prospecto.id, fuente: fuenteDe(prospecto), ...(f.giro ? {} : giroP ? { giro: giroP, giro_origen: "prospecto" } : {}) };
      await sb.from("wa_ventas").update(cambio).eq("id", f.id);
      return { ...f, ...cambio, giro: f.giro ?? giroP } as FilaVentas;
    }
    return f;
  }
  const nueva = { telefono, fuente: fuenteDe(prospecto), prospecto_id: prospecto?.id ?? null, giro: giroP, giro_origen: giroP ? "prospecto" : null };
  const { data: creada, error } = await sb.from("wa_ventas").insert(nueva).select(cols).single();
  if (error || !creada) {
    // Dos mensajes a la vez: el otro la creó.
    const { data: otra } = await sb.from("wa_ventas").select(cols).eq("telefono", telefono).is("deleted_at", null).maybeSingle();
    if (otra) return otra as FilaVentas;
    throw new Error(`wa_ventas: ${error?.message ?? "sin fila"}`);
  }
  return creada as FilaVentas;
}

// ───────────────────────────── la IA: solo elige la rama

const HERRAMIENTA = {
  name: "elegir_rama",
  description: "Clasifica el último mensaje de la persona en UNA rama del guion de ventas. No redactes nada.",
  input_schema: {
    type: "object",
    properties: {
      rama: { type: "string", enum: RAMAS },
      giro: { type: ["string", "null"], enum: ["estetica", "hotel_guarderia", "veterinaria", "varios", null] },
      numero: { type: ["integer", "null"], description: "La cifra que dio (citas a la semana o perros), si la dio." },
      sistema: { type: ["string", "null"], enum: ["papel", "excel", "otro_sistema", "ninguno", null] },
      funcion: { type: ["string", "null"], enum: [...FUNCIONES_PALABRAS.map(([c]) => c), null] },
    },
    required: ["rama"],
  },
};

const SISTEMA_IA = `Eres el clasificador del bot de ventas de PeluDesk (software para estéticas, hoteles, guarderías y veterinarias de mascotas). NO contestas a la persona: solo eliges la rama de su último mensaje con la herramienta elegir_rama.
Ramas:
- entrada: saluda, pide información, pregunta qué es PeluDesk o dice que le interesa.
- giro: dice de qué es su negocio (estetica, hotel_guarderia, veterinaria o varios si tiene más de uno).
- calificacion: contesta la pregunta de calificación que le hizo el bot (cuántas citas o perros, con numero; o si lleva el expediente en papel, excel u otro sistema, con sistema).
- prueba: quiere probar, registrarse o abrir su cuenta.
- precio: pregunta el precio o dice que es caro.
- otro_sistema: ya usa otro sistema, Excel, libreta o agenda.
- sin_tiempo: no tiene tiempo.
- lo_pienso: lo va a pensar, después, más tarde.
- no_interesa: no le interesa.
- funcion: pregunta si PeluDesk hace algo; funcion = la clave más cercana (agenda, recordatorios, contratos, reporte, fotos, portal, pagina, inventario, empleados, caja, expediente, carnet, recetas, migracion, factura, terminal, sms, cancelacion, soporte, anual, app). Si no cabe en ninguna, desconocido.
- ya_cuenta: ya tiene cuenta en PeluDesk o no puede entrar.
- cliente_mascota: es dueño de una mascota preguntando por SU cita o su mascota en algún negocio.
- humano: pide hablar con una persona o que le llamen.
- sucursales: tiene varias sucursales.
- cortesia: gracias, ok, sí, de acuerdo.
- desconocido: cualquier otra cosa.`;

async function clasificarConIA(texto: string, estado: EstadoVentas, ultimoDelBot: string | null, ia: IA, telefono: string): Promise<Clasificacion | null> {
  const sb = createSupabaseAdminClient();
  try {
    const contexto = `Paso del guion: ${estado.etapa}. Giro conocido: ${estado.giro ?? "no"}.${ultimoDelBot ? ` Lo último que escribió el bot: «${ultimoDelBot.slice(0, 300)}».` : ""}`;
    const r = await ia.responder(SISTEMA_IA, [{ role: "user", content: `${contexto}\n\nMensaje de la persona: «${texto.slice(0, 600)}»` }], [HERRAMIENTA], 200, { tool_choice: { type: "tool", name: "elegir_rama" } });
    await sb.from("wa_uso_ia").insert({ telefono, modelo: MODELO_IA, tokens_in: r.tokensIn, tokens_out: r.tokensOut, costo_mxn: costoMxn(r.tokensIn, r.tokensOut), resultado: "clasifico" });
    const e = r.usos.find((u) => u.nombre === "elegir_rama")?.entrada as Partial<Clasificacion> | undefined;
    if (!e || !RAMAS.includes(e.rama as Rama)) return null;
    return {
      rama: e.rama as Rama,
      giro: (["estetica", "hotel_guarderia", "veterinaria", "varios"] as const).includes(e.giro as Giro) ? (e.giro as Giro) : null,
      numero: Number.isInteger(e.numero) ? (e.numero as number) : null,
      sistema: (["papel", "excel", "otro_sistema", "ninguno"] as const).includes(e.sistema as Sistema) ? (e.sistema as Sistema) : null,
      funcion: typeof e.funcion === "string" ? e.funcion : null,
    };
  } catch (err) {
    console.error("[ventas] la IA no clasificó", err instanceof Error ? err.message : err);
    return null;
  }
}

// ───────────────────────────── atender un mensaje

export interface EntradaVentas {
  telefono: string;
  texto: string;
  prospecto: ProspectoContexto | null | undefined;
  tambienCliente: boolean;
  primeraVez: boolean;
  /** false con el tope de gasto de IA alcanzado: solo reglas. */
  usaIA: boolean;
  ia: IA;
  wa?: ClienteWA;
  apuntar(texto: string): Promise<void>;
  ultimoDelBot: string | null;
}

export type ResultadoVentas = { rama: Rama; escalar?: { acuse: string; resumen: string } };

export async function atenderVentas(e: EntradaVentas): Promise<ResultadoVentas> {
  const sb = createSupabaseAdminClient();
  const wa = e.wa ?? clienteWA();
  const fila = await estadoDe(e.telefono, e.prospecto);
  const previo: EstadoVentas = { etapa: fila.etapa, giro: fila.giro, desconocidas: fila.desconocidas };
  const ctx = await contextoGuion();

  let c = clasificarFijo(e.texto, previo, e.tambienCliente);
  if (!c && e.usaIA) c = await clasificarConIA(e.texto, previo, e.ultimoDelBot, e.ia, e.telefono);
  // En la pregunta de calificación, lo que no se entienda cuenta como su respuesta (sin cifra): no es una duda.
  if ((!c || c.rama === "desconocido") && previo.etapa === "calificacion" && previo.giro) c = { rama: "calificacion" };
  const d = decidir(c ?? { rama: "desconocido" }, previo, ctx, e.texto);

  const ahora = new Date().toISOString();
  let escalar: ResultadoVentas["escalar"];
  let preguntoGiro = false;
  let ofrecioCierre = false;
  for (let i = 0; i < d.piezas.length; i++) {
    const p = d.piezas[i];
    const ultima = i === d.piezas.length - 1;
    const pie = e.primeraVez && ultima ? AVISO_PIE : undefined;
    if (p.tipo === "humano") {
      escalar = { acuse: p.acuse, resumen: p.resumen };
      continue;
    }
    if (p.tipo === "baja") {
      if ((await wa.texto(e.telefono, p.cuerpo)).ok) await e.apuntar(p.cuerpo);
      const { error } = await sb.rpc("prospecto_baja_whatsapp", { p_telefono: e.telefono });
      if (error) console.error("[ventas] prospecto_baja_whatsapp", error.message);
      continue;
    }
    if (p.tipo === "botones") {
      const r = await wa.botones(e.telefono, p.cuerpo, p.botones, pie);
      if (r.ok) await e.apuntar(p.cuerpo);
      else if ((await wa.texto(e.telefono, `${p.cuerpo}\n\n${p.botones.map((b) => b.titulo).join(" · ")}`)).ok) await e.apuntar(p.cuerpo);
      preguntoGiro = p.botones === BOTONES_GIRO;
      continue;
    }
    if (p.tipo === "flow") {
      ofrecioCierre = true;
      if (await ofrecerFlow(e.telefono, p.punto, p.cuerpo, e.prospecto, wa, pie)) {
        await e.apuntar(p.cuerpo);
        continue;
      }
      // Sin el formulario, el mismo texto con el link de registro (el único lugar donde va el link).
      const conLink = `${p.cuerpo}\n\nAbre tu prueba aquí:\n${registroDeProspecto(e.prospecto ?? null)}${pie ? `\n\n${AVISO_LINEA}` : ""}`;
      if ((await wa.texto(e.telefono, conLink)).ok) await e.apuntar(conLink);
      continue;
    }
    const cuerpo = pie ? `${p.cuerpo}\n\n${AVISO_LINEA}` : p.cuerpo;
    if ((await wa.texto(e.telefono, cuerpo)).ok) await e.apuntar(cuerpo);
  }

  const cambio: Record<string, unknown> = {
    etapa: d.estado.etapa,
    giro: d.estado.giro,
    desconocidas: d.estado.desconocidas,
    ultima_rama: d.rama,
    ultimo_entrante_at: ahora,
    // Contestó: lo programado se cancela (retoma la rama donde iba); «lo pienso» lo vuelve a programar.
    seguimiento_programado_at: d.programarSeguimiento && fila.seguimientos < 2 ? new Date(Date.now() + 2 * 86_400_000).toISOString() : null,
  };
  if (d.giroNuevo) Object.assign(cambio, { giro_at: ahora, giro_origen: "respuesta" });
  if (preguntoGiro) cambio.giro_preguntado_at = ahora;
  if (ofrecioCierre && !fila.cierre_at) cambio.cierre_at = ahora;
  if (escalar) cambio.humano_at = ahora;
  if (d.rama === "no_interesa") cambio.baja_at = ahora;
  if (d.calificacion) Object.assign(cambio, { calificado_at: ahora, calif_numero: d.calificacion.numero, calif_sistema: d.calificacion.sistema, calif_texto: d.calificacion.texto });
  await sb.from("wa_ventas").update(cambio).eq("id", fila.id);
  if (d.calificacion && fila.prospecto_id) {
    await sb
      .from("prospectos")
      .update({ tamano_negocio: d.calificacion.numero, sistema_actual: d.calificacion.sistema, calificacion_texto: d.calificacion.texto })
      .eq("id", fila.prospecto_id);
  }
  return { rama: d.rama, escalar };
}

// ───────────────────────────── seguimientos (la tarea de cada 2 minutos)

const MAX_SEGUIMIENTOS = 2;
const HORA = 3600_000;

async function plantillaAprobada(): Promise<boolean> {
  const sb = createSupabaseAdminClient();
  const { data } = await sb.from("wa_config").select("valor, updated_at").eq("clave", "plantilla_ventas_estado").is("deleted_at", null).maybeSingle();
  // El estado se pregunta a Meta a lo más cada hora (scripts/whatsapp/flow.mjs plantilla-ventas también lo guarda).
  if (data && Date.now() - Date.parse(data.updated_at as string) < HORA) return data.valor === "APPROVED";
  const token = process.env.WHATSAPP_TOKEN ?? "";
  const waba = process.env.PELUDESK_WABA_ID?.trim() ?? "";
  if (!token || !waba) return false;
  try {
    const r = await fetch(`${graphBase()}/${VERSION_GRAPH}/${waba}/message_templates?name=${PLANTILLA_VENTAS}&fields=name,status`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(10_000) });
    const j = (await r.json().catch(() => ({}))) as { data?: { name: string; status: string }[] };
    const estado = j.data?.find((t) => t.name === PLANTILLA_VENTAS)?.status ?? "NO_EXISTE";
    await sb.from("wa_config").update({ deleted_at: new Date().toISOString() }).eq("clave", "plantilla_ventas_estado").is("deleted_at", null);
    await sb.from("wa_config").insert({ clave: "plantilla_ventas_estado", valor: estado });
    return estado === "APPROVED";
  } catch {
    return false;
  }
}

async function ventanaAbierta(telefono: string): Promise<boolean> {
  const { data } = await createSupabaseAdminClient().from("wa_hilos").select("ultimo_entrante_at").eq("telefono", telefono).is("deleted_at", null).maybeSingle();
  const t = data?.ultimo_entrante_at ? Date.parse(data.ultimo_entrante_at as string) : 0;
  return Date.now() - t < 24 * HORA - 5 * 60_000;
}

async function excluido(telefono: string): Promise<boolean> {
  const t10 = /^52[0-9]{10}$/.test(telefono) ? telefono.slice(2) : telefono;
  const { count } = await createSupabaseAdminClient().from("seguimiento_pruebas_exclusiones").select("id", { count: "exact", head: true }).eq("telefono", t10).is("deleted_at", null);
  return (count ?? 0) > 0;
}

async function escribioDespues(telefono: string, desde: string): Promise<boolean> {
  const { count } = await createSupabaseAdminClient().from("wa_mensajes").select("id", { count: "exact", head: true }).eq("telefono", telefono).eq("quien", "usuario").gt("created_at", desde).is("deleted_at", null);
  return (count ?? 0) > 0;
}

async function apuntar(telefono: string, texto: string) {
  await createSupabaseAdminClient().from("wa_mensajes").insert({ telefono, quien: "agente", texto });
}

type Seguimiento = "flow_sin_completar" | "sin_giro" | "lo_pienso";

/** Manda un seguimiento: dentro de la ventana, el mensaje del guion; fuera, la plantilla aprobada (o nada). */
async function mandarSeguimiento(fila: { id: string; telefono: string; giro: Giro | null; seguimientos: number; prospecto_id: string | null }, tipo: Seguimiento): Promise<boolean> {
  const sb = createSupabaseAdminClient();
  if (fila.seguimientos >= MAX_SEGUIMIENTOS || (await excluido(fila.telefono))) return false;
  const wa = clienteWA();
  let ok = false;
  if (await ventanaAbierta(fila.telefono)) {
    if (tipo === "sin_giro") {
      const cuerpo = seguimientoSinGiro(demoDeGiro(null));
      ok = (await wa.botones(fila.telefono, cuerpo, BOTONES_GIRO)).ok;
      if (ok) await apuntar(fila.telefono, cuerpo);
    } else {
      const cuerpo = tipo === "flow_sin_completar" ? SEGUIMIENTO_FLOW : "¿Pudiste ver la demo? Si quieres probarlo con tu negocio, aquí está:";
      ok = await ofrecerFlow(fila.telefono, "seguimiento", cuerpo, null, wa);
      if (ok) await apuntar(fila.telefono, cuerpo);
    }
  } else if (await plantillaAprobada()) {
    ok = (await wa.plantilla(fila.telefono, PLANTILLA_VENTAS)).ok;
    if (ok) await apuntar(fila.telefono, `[plantilla ${PLANTILLA_VENTAS}]`);
  } else {
    // Fuera de la ventana y sin plantilla aprobada: no sale nada (y no se gasta el seguimiento).
    return false;
  }
  if (ok) {
    await sb
      .from("wa_ventas")
      .update({ seguimientos: fila.seguimientos + 1, ultimo_seguimiento_at: new Date().toISOString(), ultimo_seguimiento_tipo: tipo, ...(tipo === "lo_pienso" ? { seguimiento_programado_at: null } : {}) })
      .eq("id", fila.id);
  }
  return ok;
}

/**
 * Los seguimientos del guion (máximo 2 por persona):
 *   - abrió el formulario y no lo completó: a las 2 horas, una línea con el botón;
 *   - no contestó la pregunta del giro: a las 24 horas (23 h 45 min, para caer dentro de la ventana), la demo y el giro;
 *   - «lo pienso»: a los 2 días (fuera de la ventana: con la plantilla aprobada).
 * Ninguno sale si la persona escribió después, se registró, se dio de baja o la pasaron a una persona.
 */
export async function correrSeguimientosVentas(): Promise<{ seguimientos: number }> {
  const sb = createSupabaseAdminClient();
  const ahora = Date.now();
  let n = 0;
  const cols = "id, telefono, giro, seguimientos, prospecto_id, etapa, humano_at, baja_at, ultimo_seguimiento_at, ultimo_seguimiento_tipo, giro_preguntado_at, seguimiento_programado_at";
  type Fila = { id: string; telefono: string; giro: Giro | null; seguimientos: number; prospecto_id: string | null; etapa: Etapa; humano_at: string | null; baja_at: string | null; ultimo_seguimiento_at: string | null; ultimo_seguimiento_tipo: string | null; giro_preguntado_at: string | null; seguimiento_programado_at: string | null };
  const vivo = (f: Fila) => f.etapa !== "cerrada" && !f.baja_at && f.seguimientos < MAX_SEGUIMIENTOS;
  const registrado = async (telefono: string) => {
    const { count } = await sb.from("wa_flow_sesiones").select("id", { count: "exact", head: true }).eq("telefono", telefono).in("estado", ["cuenta_creada", "ya_tenia", "completado", "creando"]).is("deleted_at", null);
    return (count ?? 0) > 0;
  };

  // 1. Abrió el formulario y no lo completó.
  const { data: abiertas } = await sb
    .from("wa_flow_sesiones")
    .select("telefono, abierto_at")
    .eq("estado", "abierto")
    .is("deleted_at", null)
    .lt("abierto_at", new Date(ahora - 2 * HORA).toISOString())
    .gt("abierto_at", new Date(ahora - 20 * HORA).toISOString())
    .order("abierto_at")
    .order("id")
    .limit(50);
  for (const s of abiertas ?? []) {
    const { data: f } = await sb.from("wa_ventas").select(cols).eq("telefono", s.telefono).is("deleted_at", null).maybeSingle();
    const fila = f as Fila | null;
    if (!fila || !vivo(fila) || (fila.humano_at && fila.humano_at > s.abierto_at)) continue;
    if (fila.ultimo_seguimiento_tipo === "flow_sin_completar" && fila.ultimo_seguimiento_at && fila.ultimo_seguimiento_at > s.abierto_at) continue;
    if ((await escribioDespues(s.telefono, s.abierto_at as string)) || (await registrado(s.telefono))) continue;
    if (await mandarSeguimiento(fila, "flow_sin_completar")) n++;
  }

  // 2. No contestó la pregunta del giro.
  const { data: sinGiro } = await sb
    .from("wa_ventas")
    .select(cols)
    .eq("etapa", "giro")
    .is("giro", null)
    .is("deleted_at", null)
    .lt("giro_preguntado_at", new Date(ahora - (23 * HORA + 45 * 60_000)).toISOString())
    .gt("giro_preguntado_at", new Date(ahora - 48 * HORA).toISOString())
    .order("giro_preguntado_at")
    .order("id")
    .limit(50);
  for (const f of (sinGiro ?? []) as Fila[]) {
    if (!vivo(f) || f.humano_at || f.ultimo_seguimiento_tipo === "sin_giro") continue;
    if (await escribioDespues(f.telefono, f.giro_preguntado_at as string)) continue;
    if (await mandarSeguimiento(f, "sin_giro")) n++;
  }

  // 3. «Lo pienso», a los 2 días.
  const { data: programados } = await sb
    .from("wa_ventas")
    .select(cols)
    .lte("seguimiento_programado_at", new Date(ahora).toISOString())
    .is("deleted_at", null)
    .order("seguimiento_programado_at")
    .order("id")
    .limit(50);
  for (const f of (programados ?? []) as Fila[]) {
    if (!vivo(f) || (await registrado(f.telefono))) {
      await sb.from("wa_ventas").update({ seguimiento_programado_at: null }).eq("id", f.id);
      continue;
    }
    if (await mandarSeguimiento(f, "lo_pienso")) n++;
  }
  return { seguimientos: n };
}
