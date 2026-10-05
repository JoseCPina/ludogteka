import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { telefonoCanonico, ClienteWA, configWhatsApp, DatosSupabase, marcarNumeroContesta } from "@/lib/whatsapp/infra";
import { cuerpoRenderizado, limpiarVariable, plantillaDeEtapa, type EtapaSeguimiento } from "./plantillas";
import { diasRestantes, enVentanaDeEnvio, etapaDebida, fechaLimiteWeb, type EnviosPrevios } from "./ventana";
import { metaConfigurada, sincronizarPlantillas } from "./meta";

// La tarea que manda el seguimiento (/api/cron/seguimiento, cada hora).
//
// Nunca manda dos veces la misma etapa: el apartado es atómico en la base
// (seguimiento_reservar, único por negocio y etapa), y nada se manda con una
// plantilla que Meta no haya aprobado (se queda en espera, sin error).
// Un envío que falla se registra; un fallo transitorio se reintenta UNA vez,
// en una corrida posterior; un fallo definitivo (número sin WhatsApp, rechazo
// de Meta) no se reintenta.

export type Candidato = {
  negocio_id: string;
  slug: string;
  nombre: string;
  zona: string;
  creado_at: string;
  prueba_termina_at: string;
  telefono: string;
  persona: string | null;
  perfil_completo: boolean;
  limite_web: string;
  excluida: boolean;
  detenido: boolean;
  envios: EnviosPrevios;
};

export type ResumenCorrida = {
  pausa: boolean;
  candidatos: number;
  enviados: Record<string, number>;
  fallidos: number;
  en_espera_plantilla: Record<string, number>;
  fuera_de_ventana: number;
  detenidos: number;
  excluidos: number;
  ya_apartados: number;
  plantillas: { nombre: string; estado: string }[];
};

/** Códigos de Meta que se arreglan solos (límite de velocidad, servicio caído). Todo lo demás —número sin WhatsApp, parámetros mal, plantilla inexistente— no se arregla reintentando. */
const CODIGOS_TRANSITORIOS = new Set([1, 2, 4, 17, 32, 130_429, 131_000, 131_016, 133_004, 133_016]);
const esTransitorio = (estado?: number, codigo?: number) =>
  estado === undefined || estado >= 500 || estado === 429 || (codigo !== undefined && CODIGOS_TRANSITORIOS.has(codigo));

export async function correrSeguimiento(opciones: { ahora?: Date; solo?: string[] } = {}): Promise<ResumenCorrida> {
  const ahora = opciones.ahora ?? new Date();
  const sb = createSupabaseAdminClient();
  const resumen: ResumenCorrida = {
    pausa: false, candidatos: 0, enviados: {}, fallidos: 0, en_espera_plantilla: {}, fuera_de_ventana: 0, detenidos: 0, excluidos: 0, ya_apartados: 0, plantillas: [],
  };

  const { data: pausa } = await sb.from("seguimiento_pruebas_ajustes").select("valor").eq("clave", "pausa").is("deleted_at", null).maybeSingle();
  if (pausa?.valor === "si") return { ...resumen, pausa: true };

  // El estado de las plantillas, de Meta, en cada corrida (una sola llamada).
  if (metaConfigurada()) {
    try {
      resumen.plantillas = (await sincronizarPlantillas()).map((p) => ({ nombre: p.nombre, estado: p.estado }));
    } catch (e) {
      console.error("[seguimiento] no se pudo consultar a Meta", e instanceof Error ? e.message : e);
    }
  }
  const { data: filas } = await sb.from("seguimiento_pruebas_plantillas").select("nombre, estado").is("deleted_at", null);
  const aprobada = new Set((filas ?? []).filter((f) => f.estado === "APPROVED").map((f) => f.nombre as string));

  const { data, error } = await sb.rpc("seguimiento_candidatos");
  if (error) throw new Error(`seguimiento_candidatos: ${error.message}`);
  let candidatos = (data ?? []) as Candidato[];
  if (opciones.solo?.length) candidatos = candidatos.filter((c) => opciones.solo!.includes(c.negocio_id));
  resumen.candidatos = candidatos.length;

  const cfg = configWhatsApp();
  const datos = new DatosSupabase();
  const wa = new ClienteWA(cfg.token, cfg.phoneNumberId, marcarNumeroContesta);

  for (const c of candidatos) {
    if (c.excluida) { resumen.excluidos++; continue; }
    if (c.detenido) { resumen.detenidos++; continue; }
    const creadoAt = new Date(c.creado_at);
    const pruebaTerminaAt = new Date(c.prueba_termina_at);
    const etapa = etapaDebida({ ahora, zona: c.zona, creadoAt, pruebaTerminaAt, envios: c.envios });
    if (!etapa) continue;
    if (!enVentanaDeEnvio(ahora, c.zona)) { resumen.fuera_de_ventana++; continue; }

    const plantilla = plantillaDeEtapa(etapa, c.perfil_completo);
    if (!aprobada.has(plantilla.nombre)) {
      resumen.en_espera_plantilla[plantilla.nombre] = (resumen.en_espera_plantilla[plantilla.nombre] ?? 0) + 1;
      continue;
    }
    const persona = limpiarVariable(c.persona ?? `equipo de ${c.nombre}`);
    const negocio = limpiarVariable(c.nombre);
    const parametros = parametrosDe(etapa, plantilla.variante, { persona, negocio, limite: fechaLimiteWeb(creadoAt, c.zona), dias: String(diasRestantes(pruebaTerminaAt, ahora)) });

    const { data: id, error: eRes } = await sb.rpc("seguimiento_reservar", { p_negocio_id: c.negocio_id, p_etapa: etapa, p_plantilla: plantilla.nombre, p_telefono: c.telefono, p_perfil: c.perfil_completo, p_ahora: ahora.toISOString() });
    if (eRes) { console.error("[seguimiento] reservar", eRes.message); continue; }
    if (!id) { resumen.ya_apartados++; continue; }

    const r = await wa.plantillaConParametros(telefonoCanonico(c.telefono), plantilla.nombre, parametros, plantilla.botones.map((b) => b.payload));
    const definitivo = !r.ok && !esTransitorio(r.estado, r.codigo);
    await sb.rpc("seguimiento_resultado", { p_id: id as string, p_ok: r.ok, p_wa_id: r.id ?? null, p_error: r.ok ? null : `${r.estado ?? "red"}${r.codigo ? `/${r.codigo}` : ""}: ${r.error ?? "sin detalle"}`, p_reintentable: !r.ok && !definitivo });
    if (r.ok) {
      resumen.enviados[etapa] = (resumen.enviados[etapa] ?? 0) + 1;
      // La conversación recuerda qué se le dijo: el bot lo lee cuando conteste.
      await datos.apuntarMensaje(telefonoCanonico(c.telefono), "agente", `[Seguimiento de la prueba, ${etapa}: plantilla ${plantilla.nombre}]\n${cuerpoRenderizado(plantilla, parametros)}`);
    } else {
      resumen.fallidos++;
      console.error("[seguimiento] envío fallido", { negocio: c.slug, etapa, estado: r.estado, codigo: r.codigo, definitivo });
    }
  }
  return resumen;
}

function parametrosDe(etapa: EtapaSeguimiento, variante: string | undefined, v: { persona: string; negocio: string; limite: string; dias: string }): string[] {
  if (etapa === "dia5") return variante === "perfil" ? [v.persona, v.negocio] : [v.persona, v.negocio, v.limite];
  if (etapa === "dia10") return [v.persona, v.dias, v.negocio];
  return [v.persona];
}
