import { cache } from "react";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { supabaseAppEnNegocio } from "./en-negocio";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { BUCKET_REPORTES, TTL_URL_FIRMADA_S } from "@/lib/reporte/constantes";
import type { AbonosCuenta } from "@/lib/pagos/abonos";

/**
 * App para dueños · Fase 3 · capa de datos de «negocios que ya usan PeluDesk» (docs/app-duenos/FASE-3.md).
 *
 * Todo sale de la misma base que el portal del dueño, con la misma membresía de cliente (ver en-negocio.ts). Lo que la
 * app junta de VARIOS negocios (visitas, contratos, pagos, pases) se pide negocio por negocio, en paralelo, y se marca con
 * el negocio y la mascota de la app a la que pertenece. Nada de aquí pinta pantalla: las páginas las construye la laptop.
 */
export type VinculoNegocio = {
  mascotaId: string;
  negocioId: string;
  negocioNombre: string;
  negocioSlug: string;
  negocioUrl: string | null;
  perroId: string;
};

/** Los vínculos (mascota de la app ↔ expediente en un negocio) de la persona con sesión: una vez por petición. */
export const vinculosApp = cache(async (): Promise<VinculoNegocio[]> => {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("app_mis_vinculos");
  return ((data ?? []) as { mascota_id: string; negocio_id: string; negocio_nombre: string; negocio_slug: string; negocio_url_publica: string | null; negocio_dominio: string | null; perro_id: string }[]).map((v) => ({
    mascotaId: v.mascota_id,
    negocioId: v.negocio_id,
    negocioNombre: v.negocio_nombre,
    negocioSlug: v.negocio_slug,
    negocioUrl: v.negocio_url_publica ?? (v.negocio_dominio ? `https://${v.negocio_dominio}` : null),
    perroId: v.perro_id,
  }));
});

/**
 * La zona horaria y el WhatsApp de los negocios donde la persona tiene vínculo (las fechas y horas de cada visita se
 * dicen en la zona de SU negocio). Solo de negocios con vínculo: la lista sale de `vinculosApp()`.
 */
export const datosDeNegociosApp = cache(async (): Promise<Map<string, { zona: string; whatsapp: string | null }>> => {
  const ids = [...new Set((await vinculosApp()).map((v) => v.negocioId))];
  const salida = new Map<string, { zona: string; whatsapp: string | null }>();
  if (ids.length === 0) return salida;
  const { data } = await createSupabaseAdminClient().from("negocios").select("id, zona_horaria, landing").in("id", ids);
  for (const n of (data ?? []) as { id: string; zona_horaria: string | null; landing: { telefono_wa?: string | null } | null }[]) {
    const wa = n.landing?.telefono_wa?.replace(/\D/g, "") || null;
    salida.set(n.id, { zona: n.zona_horaria ?? "America/Mexico_City", whatsapp: wa ? (wa.length === 10 ? `52${wa}` : wa) : null });
  }
  return salida;
});

/** El vínculo de una mascota de la app en un negocio, o null si no es de quien tiene sesión. */
export async function vinculoDe(mascotaId: string, negocioId: string): Promise<VinculoNegocio | null> {
  return (await vinculosApp()).find((v) => v.mascotaId === mascotaId && v.negocioId === negocioId) ?? null;
}

function negociosDe(vinculos: VinculoNegocio[]): VinculoNegocio[] {
  const vistos = new Set<string>();
  return vinculos.filter((v) => (vistos.has(v.negocioId) ? false : (vistos.add(v.negocioId), true)));
}

// ── Visitas (citas y estancias) con «confirmar en un toque» ──────────────────────────────────────────────────────
export type VisitaApp = {
  tipo: "estetica" | "estancia";
  id: string;
  negocioId: string;
  negocioNombre: string;
  mascotaId: string | null;
  perroId: string;
  perroNombre: string;
  servicioNombre: string;
  categoria: string;
  inicio: string | null;
  fechaEntrada: string | null;
  fechaSalida: string | null;
  horas: number | null;
  estado: string;
  puedeConfirmar: boolean;
  puedeResenar: boolean;
};

type FilaVisita = { tipo: string; id: string; perro_id: string; perro_nombre: string; servicio_nombre: string; categoria: string; unidad: string; inicio: string | null; fecha_entrada: string | null; fecha_salida: string | null; horas: number | null; estado: string };

export async function visitasApp(): Promise<VisitaApp[]> {
  const vinculos = await vinculosApp();
  const hoy = new Date().toISOString().slice(0, 10);
  const ahora = Date.now();
  const porNegocio = await Promise.all(
    negociosDe(vinculos).map(async (n) => {
      const supabase = await supabaseAppEnNegocio(n.negocioId);
      const { data } = await supabase.rpc("mis_visitas");
      return ((data ?? []) as FilaVisita[]).map((f): VisitaApp => {
        const futura = f.tipo === "estetica" ? Boolean(f.inicio && new Date(f.inicio).getTime() > ahora) : Boolean(f.fecha_entrada && f.fecha_entrada >= hoy);
        return {
          tipo: f.tipo === "estetica" ? "estetica" : "estancia",
          id: f.id,
          negocioId: n.negocioId,
          negocioNombre: n.negocioNombre,
          mascotaId: vinculos.find((v) => v.negocioId === n.negocioId && v.perroId === f.perro_id)?.mascotaId ?? null,
          perroId: f.perro_id,
          perroNombre: f.perro_nombre,
          servicioNombre: f.servicio_nombre,
          categoria: f.categoria,
          inicio: f.inicio,
          fechaEntrada: f.fecha_entrada,
          fechaSalida: f.fecha_salida,
          horas: f.horas,
          estado: f.estado,
          puedeConfirmar: f.estado === "reservada" && futura,
          puedeResenar: f.estado === "finalizada",
        };
      });
    })
  );
  return porNegocio.flat().sort((a, b) => (b.inicio ?? b.fechaEntrada ?? "").localeCompare(a.inicio ?? a.fechaEntrada ?? ""));
}

// ── Fotos y reporte del día ───────────────────────────────────────────────────────────────────────────────────────
export type FotoDelDia = { id: string; fecha: string; tipo: string; nota: string | null; fotoUrl: string | null; estanciaId: string | null };
export type ReporteDelDia = { id: string; fecha: string; contenido: Record<string, unknown>; tarjetaUrl: string | null; enviadoAt: string | null; estanciaId: string | null };

export async function fotosDelDiaApp(mascotaId: string, negocioId: string, limite = 60): Promise<FotoDelDia[]> {
  const v = await vinculoDe(mascotaId, negocioId);
  if (!v) return [];
  const supabase = await supabaseAppEnNegocio(negocioId);
  const { data } = await supabase
    .from("bitacora_entradas")
    .select("id, fecha, tipo, nota, foto_path, estancia_id")
    .eq("perro_id", v.perroId)
    .is("deleted_at", null)
    .order("fecha", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(limite);
  const filas = (data ?? []) as { id: string; fecha: string; tipo: string; nota: string | null; foto_path: string | null; estancia_id: string | null }[];
  return Promise.all(
    filas.map(async (f) => ({
      id: f.id,
      fecha: f.fecha,
      tipo: f.tipo,
      nota: f.nota,
      fotoUrl: f.foto_path ? ((await supabase.storage.from("perros-archivos").createSignedUrl(f.foto_path, 60 * 60)).data?.signedUrl ?? null) : null,
      estanciaId: f.estancia_id,
    }))
  );
}

export async function reportesDelDiaApp(mascotaId: string, negocioId: string): Promise<ReporteDelDia[]> {
  const v = await vinculoDe(mascotaId, negocioId);
  if (!v) return [];
  const supabase = await supabaseAppEnNegocio(negocioId);
  const { data } = await supabase.rpc("mis_reportes_enviados", { p_perro: v.perroId });
  const filas = (data ?? []) as { id: string; fecha: string; contenido: Record<string, unknown>; tarjeta_path: string | null; enviado_at: string | null; estancia_id: string | null }[];
  // La tarjeta vive en el bucket de reportes (BUCKET_REPORTES), que solo firma el servidor: la misma regla que el link
  // público /r/<token>. La función ya devolvió SOLO los reportes de este dueño, así que firmar sus rutas es seguro.
  const admin = createSupabaseAdminClient(negocioId);
  return Promise.all(
    filas.map(async (r) => ({
      id: r.id,
      fecha: r.fecha,
      contenido: r.contenido ?? {},
      tarjetaUrl: r.tarjeta_path ? ((await admin.storage.from(BUCKET_REPORTES).createSignedUrl(r.tarjeta_path, TTL_URL_FIRMADA_S)).data?.signedUrl ?? null) : null,
      enviadoAt: r.enviado_at,
      estanciaId: r.estancia_id,
    }))
  );
}

// ── Contratos por firmar ──────────────────────────────────────────────────────────────────────────────────────────
export type ContratoPorFirmar = { id: string; negocioId: string; negocioNombre: string; mascotaId: string | null; perroId: string; tipoNombre: string; titulo: string; createdAt: string };

export async function contratosPorFirmarApp(): Promise<ContratoPorFirmar[]> {
  const vinculos = await vinculosApp();
  const porNegocio = await Promise.all(
    negociosDe(vinculos).map(async (n) => {
      const supabase = await supabaseAppEnNegocio(n.negocioId);
      const { data } = await supabase
        .from("contratos")
        .select("id, perro_id, created_at, plantillas_contrato(titulo, tipos_contrato(nombre))")
        .eq("estado", "pendiente_firma")
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
        .limit(50);
      return ((data ?? []) as unknown as { id: string; perro_id: string; created_at: string; plantillas_contrato: { titulo: string; tipos_contrato: { nombre: string } | { nombre: string }[] | null } | { titulo: string; tipos_contrato: { nombre: string } | null }[] | null }[]).map((c) => {
        const pl = Array.isArray(c.plantillas_contrato) ? c.plantillas_contrato[0] : c.plantillas_contrato;
        const tipo = pl ? (Array.isArray(pl.tipos_contrato) ? pl.tipos_contrato[0] : pl.tipos_contrato) : null;
        return {
          id: c.id,
          negocioId: n.negocioId,
          negocioNombre: n.negocioNombre,
          mascotaId: vinculos.find((v) => v.negocioId === n.negocioId && v.perroId === c.perro_id)?.mascotaId ?? null,
          perroId: c.perro_id,
          tipoNombre: tipo?.nombre ?? "Contrato",
          titulo: pl?.titulo ?? "Contrato",
          createdAt: c.created_at,
        };
      });
    })
  );
  return porNegocio.flat();
}

// ── Pagos pendientes (el saldo del dueño y el link vigente) y pases ─────────────────────────────────────────────
export type PagoPendiente = { negocioId: string; negocioNombre: string; reservaId: string; descripcion: string; perros: string; fechaActividad: string; saldo: number; link: { url: string; monto: number; expiraAt: string | null } | null };
export type PaseApp = { negocioId: string; negocioNombre: string; id: string; servicioNombre: string; servicioIncluidoNombre: string | null; perroId: string | null; perroNombre: string | null; mascotaId: string | null; cantidadTotal: number; cantidadDisponible: number; ilimitado: boolean; fechaCompra: string; fechaVencimiento: string | null; estado: string };

export async function pagosPendientesApp(): Promise<PagoPendiente[]> {
  const vinculos = await vinculosApp();
  const porNegocio = await Promise.all(
    negociosDe(vinculos).map(async (n) => {
      const supabase = await supabaseAppEnNegocio(n.negocioId);
      const { data } = await supabase.rpc("mis_pagos_pendientes");
      return ((data ?? []) as { reserva_id: string; descripcion: string; perros: string; fecha_actividad: string; saldo: number; link: { url: string; monto: number; expira_at: string | null } | null }[]).map((p) => ({
        negocioId: n.negocioId,
        negocioNombre: n.negocioNombre,
        reservaId: p.reserva_id,
        descripcion: p.descripcion,
        perros: p.perros,
        fechaActividad: p.fecha_actividad,
        saldo: Number(p.saldo),
        link: p.link?.url ? { url: p.link.url, monto: Number(p.link.monto), expiraAt: p.link.expira_at } : null,
      }));
    })
  );
  return porNegocio.flat();
}

/** Lo pagado y los abonos de una cuenta del dueño (mis_abonos: cuenta_totales_reserva + los cobros registrados). */
export async function abonosDeCuentaApp(negocioId: string, reservaId: string): Promise<AbonosCuenta | null> {
  const supabase = await supabaseAppEnNegocio(negocioId);
  const { data } = await supabase.rpc("mis_abonos", { p_reserva: reservaId });
  return (data as AbonosCuenta | null) ?? null;
}

export async function pasesApp(): Promise<PaseApp[]> {
  const vinculos = await vinculosApp();
  const porNegocio = await Promise.all(
    negociosDe(vinculos).map(async (n) => {
      const supabase = await supabaseAppEnNegocio(n.negocioId);
      const { data } = await supabase.rpc("mis_pases");
      return ((data ?? []) as { id: string; servicio_nombre: string; servicio_incluido_nombre: string | null; perro_id: string | null; perro_nombre: string | null; cantidad_total: number; cantidad_disponible: number; ilimitado: boolean; fecha_compra: string; fecha_vencimiento: string | null; estado: string }[]).map((b) => ({
        negocioId: n.negocioId,
        negocioNombre: n.negocioNombre,
        id: b.id,
        servicioNombre: b.servicio_nombre,
        servicioIncluidoNombre: b.servicio_incluido_nombre,
        perroId: b.perro_id,
        perroNombre: b.perro_nombre,
        mascotaId: b.perro_id ? (vinculos.find((v) => v.negocioId === n.negocioId && v.perroId === b.perro_id)?.mascotaId ?? null) : null,
        cantidadTotal: Number(b.cantidad_total),
        cantidadDisponible: Number(b.cantidad_disponible),
        ilimitado: Boolean(b.ilimitado),
        fechaCompra: b.fecha_compra,
        fechaVencimiento: b.fecha_vencimiento,
        estado: b.estado,
      }));
    })
  );
  return porNegocio.flat();
}

// ── Recetas, carnet y expediente clínico: las mismas funciones del portal ───────────────────────────────────────
export async function recetasApp(mascotaId: string, negocioId: string): Promise<unknown[]> {
  const v = await vinculoDe(mascotaId, negocioId);
  if (!v) return [];
  const supabase = await supabaseAppEnNegocio(negocioId);
  const { data } = await supabase.rpc("mis_recetas", { p_perro: v.perroId });
  return Array.isArray(data) ? (data as unknown[]) : [];
}

export async function expedienteApp(mascotaId: string, negocioId: string): Promise<Record<string, unknown> | null> {
  const v = await vinculoDe(mascotaId, negocioId);
  if (!v) return null;
  const supabase = await supabaseAppEnNegocio(negocioId);
  const { data } = await supabase.rpc("mi_expediente", { p_perro: v.perroId });
  return (data as Record<string, unknown> | null) ?? null;
}

export async function carnetApp(mascotaId: string, negocioId: string): Promise<Record<string, unknown> | null> {
  const v = await vinculoDe(mascotaId, negocioId);
  if (!v) return null;
  const supabase = await supabaseAppEnNegocio(negocioId);
  const { data } = await supabase.rpc("mi_carnet", { p_perro_id: v.perroId });
  return (data as Record<string, unknown> | null) ?? null;
}

// ── Pedir cita y reservar: lo que se ofrece y la disponibilidad real ────────────────────────────────────────────
export type ServicioApp = { id: string; nombre: string; categoria: string; unidad: string; duracionMinutos: number | null; incluye: string[] | string | null };

/** Los servicios de estética, guardería y hotel que el negocio ofrece (sin precio: el precio sale al reservar). */
export async function serviciosApp(negocioId: string): Promise<ServicioApp[]> {
  if (!(await vinculosApp()).some((v) => v.negocioId === negocioId)) return [];
  const supabase = await supabaseAppEnNegocio(negocioId);
  const { data } = await supabase
    .from("servicios")
    .select("id, nombre, categoria, unidad, duracion_minutos, incluye")
    .in("categoria", ["estetica", "guarderia", "hotel"])
    .is("deleted_at", null)
    .order("categoria")
    .order("orden");
  return ((data ?? []) as { id: string; nombre: string; categoria: string; unidad: string; duracion_minutos: number | null; incluye: string[] | string | null }[]).map((s) => ({
    id: s.id,
    nombre: s.nombre,
    categoria: s.categoria,
    unidad: s.unidad,
    duracionMinutos: s.duracion_minutos,
    incluye: s.incluye,
  }));
}

export type HorasDisponibles = { fecha: string; abre: boolean; duracionMinutos: number; horas: { inicio: string; hora: string }[] };
export type DisponibilidadEstancia = { categoria: string; hayCupo: boolean; dias: { fecha: string; abre: boolean; cupo: number | null; ocupado: number; disponible: number }[] };

export async function horasDisponiblesApp(negocioId: string, servicioId: string, fecha: string): Promise<HorasDisponibles | { error: string }> {
  const supabase = await supabaseAppEnNegocio(negocioId);
  const { data, error } = await supabase.rpc("portal_horas_disponibles", { p_servicio: servicioId, p_fecha: fecha });
  if (error) return { error: error.message };
  const d = data as { fecha: string; abre: boolean; duracion_minutos: number; horas: { inicio: string; hora: string }[] };
  return { fecha: d.fecha, abre: d.abre, duracionMinutos: d.duracion_minutos, horas: d.horas ?? [] };
}

export async function disponibilidadEstanciaApp(negocioId: string, servicioId: string, entrada: string, salida: string): Promise<DisponibilidadEstancia | { error: string }> {
  const supabase = await supabaseAppEnNegocio(negocioId);
  const { data, error } = await supabase.rpc("portal_disponibilidad_estancia", { p_servicio: servicioId, p_entrada: entrada, p_salida: salida });
  if (error) return { error: error.message };
  const d = data as { categoria: string; hay_cupo: boolean; dias: { fecha: string; abre: boolean; cupo: number | null; ocupado: number; disponible: number }[] };
  return { categoria: d.categoria, hayCupo: d.hay_cupo, dias: d.dias ?? [] };
}

// ── Reseñas ───────────────────────────────────────────────────────────────────────────────────────────────────────
export type ResumenResenas = { total: number; promedio: number | null; ultimas: { estrellas: number; texto: string | null; respuesta: string | null; createdAt: string; quien: string; origenTipo: string }[] };

/** Las visitas que el dueño ya calificó (para no ofrecerle «Opinar» otra vez): `origen_id` de sus reseñas. */
export async function misResenasApp(): Promise<Set<string>> {
  const vinculos = await vinculosApp();
  const porNegocio = await Promise.all(
    negociosDe(vinculos).map(async (n) => {
      const supabase = await supabaseAppEnNegocio(n.negocioId);
      const { data } = await supabase.from("resenas").select("origen_id").is("deleted_at", null).limit(500);
      return ((data ?? []) as { origen_id: string }[]).map((r) => r.origen_id);
    })
  );
  return new Set(porNegocio.flat());
}

export async function resenasDeNegocioApp(negocioId: string): Promise<ResumenResenas> {
  const supabase = await supabaseAppEnNegocio(negocioId);
  const { data } = await supabase.rpc("resenas_de_negocio", { p_negocio: negocioId });
  const d = (data ?? {}) as { total?: number; promedio?: number | null; ultimas?: { estrellas: number; texto: string | null; respuesta: string | null; created_at: string; quien: string; origen_tipo: string }[] };
  return {
    total: Number(d.total ?? 0),
    promedio: d.promedio == null ? null : Number(d.promedio),
    ultimas: (d.ultimas ?? []).map((u) => ({ estrellas: u.estrellas, texto: u.texto, respuesta: u.respuesta, createdAt: u.created_at, quien: u.quien, origenTipo: u.origen_tipo })),
  };
}
