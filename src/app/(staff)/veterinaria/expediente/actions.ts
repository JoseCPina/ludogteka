"use server";

import { prepararSalaTeleconsulta } from "../agenda/telemedicina-actions";
import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { negocioActual, urlDelNegocio, zonaActual } from "@/lib/negocio/actual";
import { fechaLocalDeInstante, instanteDeHoraLocal } from "@/lib/formato";
import { descartarBorradorGuardado } from "@/lib/borradores/servidor";
import { nuevoToken } from "@/lib/reporte/enlaces";
import { traducirError } from "../../reservas/traducir-error";
import type { ResultadoAccion } from "@/lib/empleados/tipos";
import { conControl, controlDeFormulario } from "@/lib/concurrencia/servidor";
import { conflictoDeError, type Conflicto, type ControlVersion } from "@/lib/concurrencia/tipos";
import type { Diagnostico, LineaEstimado } from "@/lib/veterinaria/expediente";

// Agenda clínica, consulta (SOAP), resultados, adjuntos y estimados de Veterinaria. Todo pasa por
// funciones de la base que comprueban el permiso; aquí solo se arman los argumentos.

const texto = (fd: FormData, k: string) => String(fd.get(k) ?? "").trim();
const o = (v: string) => (v === "" ? null : v);
const BUCKET = "veterinaria-archivos";

// ── Agenda ───────────────────────────────────────────────────────────

export async function agendarCita(fd: FormData): Promise<ResultadoAccion> {
  const perro = texto(fd, "perro_id");
  const fecha = texto(fd, "fecha");
  const hora = texto(fd, "hora");
  if (!perro) return { error: "Elige la mascota." };
  if (!fecha || !hora) return { error: "Elige la fecha y la hora." };
  const zona = await zonaActual();
  const duracion = texto(fd, "duracion");
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("vet_agendar_cita", {
    p_perro: perro,
    p_tipo: texto(fd, "tipo") || "consulta",
    p_medico: o(texto(fd, "medico_id")),
    p_inicia: instanteDeHoraLocal(`${fecha}T${hora}`, zona),
    p_duracion_min: duracion === "" ? null : Number(duracion),
    p_motivo: o(texto(fd, "motivo")),
  });
  if (error) return { error: traducirError(error) };
  revalidatePath("/veterinaria/agenda");
  const resultado = data as { id?: string; empalmada?: boolean } | null;
  if (texto(fd, "tipo") === "teleconsulta" && resultado?.id) {
    const sala = await prepararSalaTeleconsulta(resultado.id);
    return { error: null, ir: `/veterinaria/teleconsulta/${resultado.id}${sala.error ? "?aviso=sala" : "?nueva=1"}` };
  }
  const aviso = resultado?.empalmada ? "Urgencia agendada; se empalma con otra cita de ese médico." : null;
  // QA S19: al guardar se confirma, junto al botón y en la agenda del día.
  return { error: null, exito: "Cita agendada.", ir: `/veterinaria/agenda?fecha=${fecha}&aviso=${aviso ? "urgencia" : "agendada"}&hora=${encodeURIComponent(hora)}` };
}

export async function reprogramarCita(id: string, fd: FormData): Promise<ResultadoAccion> {
  const fecha = texto(fd, "fecha");
  const hora = texto(fd, "hora");
  if (!fecha || !hora) return { error: "Elige la nueva fecha y hora." };
  const zona = await zonaActual();
  const supabase = await createSupabaseServerClient();
  const { error } = await conControl(supabase.rpc("vet_reprogramar_cita", {
    p_id: id,
    p_inicia: instanteDeHoraLocal(`${fecha}T${hora}`, zona),
    p_medico: o(texto(fd, "medico_id")),
    p_duracion_min: null,
  }), controlDeFormulario(fd));
  if (error) return conflictoDeError(error) ? { error: null, conflicto: conflictoDeError(error) } : { error: traducirError(error) };
  revalidatePath("/veterinaria/agenda");
  return { error: null, exito: "Cita movida." };
}

export async function estadoCita(id: string, estado: string, fd?: FormData | ControlVersion): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const esForm = fd instanceof FormData;
  const control = esForm ? controlDeFormulario(fd) : fd;
  const { error } = await conControl(supabase.rpc("vet_cita_estado", { p_id: id, p_estado: estado, p_motivo: esForm ? o(texto(fd, "motivo")) : null }), control);
  if (error) return conflictoDeError(error) ? { error: null, conflicto: conflictoDeError(error) } : { error: traducirError(error) };
  revalidatePath("/veterinaria/agenda");
  return { error: null, exito: "Listo." };
}

// ── Consulta ─────────────────────────────────────────────────────────

export async function iniciarConsulta(perroId: string, fd: FormData): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("vet_consulta_iniciar", {
    p_perro: perroId,
    p_cita: null,
    p_tipo: texto(fd, "tipo") || "consulta",
    p_medico: o(texto(fd, "medico_id")),
  });
  if (error) return { error: traducirError(error) };
  return { error: null, ir: `/veterinaria/consulta/${data as string}` };
}

export async function iniciarDesdeCita(citaId: string): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("vet_consulta_iniciar", { p_perro: null, p_cita: citaId, p_tipo: null, p_medico: null });
  if (error) return { error: traducirError(error) };
  // QA S19: sin revalidatePath (repintaba la agenda antes de responder); la pantalla navega a la consulta después de la respuesta.
  return { error: null, exito: "Consulta creada. Abriendo…", ir: `/veterinaria/consulta/${data as string}` };
}

/** Lo que el editor manda al autoguardar: solo las claves que cambiaron. */
export type DatosBorrador = Partial<{
  motivo: string; anamnesis: string; examen_fisico: string; hallazgos: string; plan: string; tratamiento: string; notas_internas: string;
  mucosas: string; hidratacion: string;
  peso_kg: number | null; temperatura_c: number | null; frecuencia_cardiaca: number | null; frecuencia_respiratoria: number | null;
  condicion_corporal: number | null; tllc_seg: number | null;
  diagnosticos: Diagnostico[];
}>;

export async function guardarBorrador(id: string, datos: DatosBorrador, control?: ControlVersion): Promise<{ error: string | null; guardado_at?: string; conflicto?: Conflicto | null }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await conControl(supabase.rpc("vet_consulta_guardar", { p_id: id, p_datos: datos }), control);
  if (error) return conflictoDeError(error) ? { error: null, conflicto: conflictoDeError(error) } : { error: traducirError(error) };
  return { error: null, guardado_at: String(data) };
}

export async function firmarConsulta(id: string): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("vet_consulta_firmar", { p_id: id });
  if (error) return { error: traducirError(error) };
  const cobro = (data as { cobro?: { cargos?: number; total?: number; error?: string; avisos?: string[] } } | null)?.cobro;
  const notaCobro = cobro?.error
    ? " Los cargos no pasaron a Caja: ábrelos en la consulta para pasarlos."
    : cobro && Number(cobro.cargos) > 0
      ? ` ${cobro.cargos} ${Number(cobro.cargos) === 1 ? "cargo pasó" : "cargos pasaron"} a Caja.${cobro.avisos?.length ? ` ${cobro.avisos.join(" ")}` : ""}`
      : "";
  // Firmada: la copia que el navegador guardaba del formulario ya no hace falta.
  await descartarBorradorGuardado(supabase, "consulta", id);
  // QA S19: sin revalidatePath (la pantalla se refresca sola; revalidar aquí la pintaba dos veces).
  return { error: null, exito: `Consulta firmada. Ya no se edita: solo admite una adenda.${notaCobro}` };
}

export async function descartarBorrador(id: string, perroId: string): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  // QA S18 (N94): de una cita se regresa a la agenda de ese día; si no, al expediente. Las dos dicen «Borrador descartado».
  // QA S19: la base descarta todo en un paso (anula lo que nació en el borrador, quita sus cargos, regresa la cita a
  // como estaba) y dice de qué cita y fecha era; la pantalla navega DESPUÉS de esta respuesta, sin revalidar aquí.
  const [{ data, error }, zona] = await Promise.all([supabase.rpc("vet_consulta_descartar", { p_id: id }), zonaActual()]);
  if (error) return { error: traducirError(error) };
  const det = data as { cita_id: string | null; atendida_at: string | null } | null;
  // Desde R23 una consulta de cita lleva la fecha y hora de su cita.
  const citaInicio = det?.cita_id ? det.atendida_at : null;
  await descartarBorradorGuardado(supabase, "consulta", id);
  return {
    error: null,
    exito: "Borrador descartado.",
    ir: citaInicio ? `/veterinaria/agenda?fecha=${fechaLocalDeInstante(citaInicio, zona)}&aviso=descartado` : `/veterinaria/expediente/${perroId}?aviso=descartado`,
  };
}

/** QA S19: quita de la consulta en borrador una vacuna o desparasitación aplicada en ella: la anula en el carnet y quita su cargo. */
export async function quitarAplicacionConsulta(consultaId: string, tipo: "vacuna" | "desparasitacion", id: string, perroId: string): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("vet_consulta_quitar_aplicacion", { p_consulta: consultaId, p_tipo: tipo, p_id: id });
  if (error) return { error: traducirError(error) };
  revalidatePath(`/veterinaria/consulta/${consultaId}`);
  revalidatePath(`/veterinaria/carnet/${perroId}`);
  return { error: null, exito: tipo === "vacuna" ? "Vacuna quitada de la consulta y anulada en el carnet." : "Desparasitación quitada de la consulta y anulada en el carnet." };
}

export async function agregarAdenda(id: string, fd: FormData): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("vet_consulta_adenda", { p_id: id, p_texto: texto(fd, "texto") });
  if (error) return { error: traducirError(error) };
  revalidatePath(`/veterinaria/consulta/${id}`);
  return { error: null, exito: "Adenda firmada y agregada." };
}

export async function anularConsulta(id: string, fd: FormData): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("vet_consulta_anular", { p_id: id, p_motivo: texto(fd, "motivo") });
  if (error) return { error: traducirError(error) };
  revalidatePath(`/veterinaria/consulta/${id}`);
  return { error: null, exito: "Consulta anulada. Queda en el historial con su motivo." };
}

// ── Resultados de laboratorio ────────────────────────────────────────

export async function capturarResultado(perroId: string, consultaId: string | null, fd: FormData): Promise<ResultadoAccion> {
  let parametros: unknown = [];
  try {
    parametros = JSON.parse(texto(fd, "parametros") || "[]");
  } catch {
    return { error: "Los parámetros no se leyeron bien. Vuelve a capturarlos." };
  }
  if (!texto(fd, "estudio")) return { error: "Escribe el nombre del estudio." };
  if (!texto(fd, "fecha")) return { error: "Escribe la fecha del estudio." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("vet_capturar_resultado", {
    p_perro: perroId,
    p_consulta: consultaId,
    p_estudio: texto(fd, "estudio"),
    p_fecha: texto(fd, "fecha"),
    p_laboratorio: o(texto(fd, "laboratorio")),
    p_parametros: parametros,
    p_notas: o(texto(fd, "notas")),
  });
  if (error) return { error: traducirError(error) };
  revalidatePath(`/veterinaria/expediente/${perroId}`);
  if (consultaId) revalidatePath(`/veterinaria/consulta/${consultaId}`);
  return { error: null, exito: "Resultado guardado." };
}

export async function anularResultado(id: string, rutas: string[], fd: FormData): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("vet_anular_resultado", { p_id: id, p_motivo: texto(fd, "motivo") });
  if (error) return { error: traducirError(error) };
  for (const r of rutas) revalidatePath(r);
  return { error: null, exito: "Resultado anulado." };
}

// ── Adjuntos (subida directa a Storage con URL firmada) ──────────────

const MIMES = ["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"];

function limpiarNombre(n: string) {
  const base = n.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").slice(-80);
  return base || "archivo";
}

export async function prepararAdjunto(perroId: string, nombre: string, mime: string, bytes: number): Promise<{ error: string | null; ruta?: string; urlFirmada?: string }> {
  if (!MIMES.includes(mime)) return { error: "Solo fotos (JPG, PNG, WebP, HEIC) y PDF." };
  if (!(bytes > 0) || bytes > 15 * 1024 * 1024) return { error: "El archivo pasa de 15 MB." };
  const supabase = await createSupabaseServerClient();
  const { data: puede } = await supabase.rpc("vet_puede", { p_permiso: "atender_consultas" });
  if (puede !== true) return { error: "Adjuntar archivos es de un médico veterinario, de admin o de quien tenga «Atender consultas»." };
  const { data: existe } = await supabase.from("perros").select("id").eq("id", perroId).maybeSingle();
  if (!existe) return { error: "No encontramos a esa mascota." };
  const negocio = await negocioActual();
  const ruta = `${negocio.id}/${perroId}/${randomUUID()}-${limpiarNombre(nombre)}`;
  const admin = createSupabaseAdminClient(negocio.id);
  const { data, error } = await admin.storage.from(BUCKET).createSignedUploadUrl(ruta);
  if (error || !data) return { error: "No pudimos preparar la subida. Intenta de nuevo." };
  return { error: null, ruta, urlFirmada: data.signedUrl };
}

export async function confirmarAdjunto(perroId: string, consultaId: string | null, ruta: string, nombre: string, mime: string, descripcion: string): Promise<ResultadoAccion> {
  const negocio = await negocioActual();
  if (!ruta.startsWith(`${negocio.id}/${perroId}/`)) return { error: "El archivo no es de esa mascota." };
  // El tamaño real lo dice Storage, no el navegador.
  const admin = createSupabaseAdminClient(negocio.id);
  const carpeta = ruta.slice(0, ruta.lastIndexOf("/"));
  const archivo = ruta.slice(ruta.lastIndexOf("/") + 1);
  const { data: lista } = await admin.storage.from(BUCKET).list(carpeta, { search: archivo, limit: 5 });
  const objeto = (lista ?? []).find((x) => x.name === archivo);
  const bytes = Number((objeto?.metadata as { size?: number } | null)?.size ?? 0);
  if (!objeto || bytes <= 0) return { error: "El archivo no llegó completo. Vuelve a intentarlo." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("vet_registrar_adjunto", {
    p_perro: perroId, p_consulta: consultaId, p_ruta: ruta, p_nombre: nombre, p_mime: mime, p_bytes: bytes, p_descripcion: o(descripcion.trim()),
  });
  if (error) {
    await admin.storage.from(BUCKET).remove([ruta]);
    return { error: traducirError(error) };
  }
  revalidatePath(`/veterinaria/expediente/${perroId}`);
  if (consultaId) revalidatePath(`/veterinaria/consulta/${consultaId}`);
  return { error: null, exito: "Archivo adjuntado." };
}

export async function anularAdjunto(id: string, rutas: string[], fd: FormData): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("vet_anular_adjunto", { p_id: id, p_motivo: texto(fd, "motivo") });
  if (error) return { error: traducirError(error) };
  for (const r of rutas) revalidatePath(r);
  return { error: null, exito: "Archivo anulado." };
}

// ── Diagnósticos ─────────────────────────────────────────────────────

export async function agregarDiagnosticoNegocio(nombre: string, categoria: string, especie: string | null): Promise<{ error: string | null; id?: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("vet_agregar_diagnostico_negocio", {
    p_nombre: nombre,
    p_categoria: categoria || "Otros",
    p_especies: especie === "perro" || especie === "gato" ? [especie] : ["perro", "gato"],
    p_sinonimos: [],
  });
  if (error) return { error: traducirError(error) };
  return { error: null, id: String(data) };
}

export async function buscarDiagnosticos(q: string, especie: string | null) {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("vet_buscar_diagnosticos", { p_q: q, p_especie: especie === "perro" || especie === "gato" ? especie : null, p_limite: 12 });
  return (data ?? []) as { id: string; origen: "catalogo" | "negocio"; nombre: string; categoria: string; sinonimos: string[]; especies: string[] }[];
}

// ── Estimados ────────────────────────────────────────────────────────

export type DatosEstimado = {
  id: string | null;
  perro_id: string;
  consulta_id: string | null;
  tipo: "consulta" | "cirugia";
  titulo: string;
  notas: string;
  vigente_hasta: string | null;
  medico_id: string | null;
  lineas: LineaEstimado[];
};

export async function guardarEstimado(d: DatosEstimado): Promise<ResultadoAccion & { id?: string }> {
  if (d.lineas.length === 0) return { error: "Agrega al menos una línea al estimado." };
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("vet_estimado_guardar", {
    p_id: d.id,
    p_perro: d.perro_id,
    p_consulta: d.consulta_id,
    p_cita: null,
    p_tipo: d.tipo,
    p_titulo: d.titulo,
    p_notas: d.notas || null,
    p_vigente_hasta: d.vigente_hasta || null,
    p_medico: d.medico_id,
    p_lineas: d.lineas.map((l) => ({
      tipo: l.tipo, descripcion: l.descripcion, cantidad: l.cantidad, unidad: l.unidad, precio_min: l.precio_min, precio_max: l.precio_max, insumo_id: l.insumo_id,
    })),
  });
  if (error) return { error: traducirError(error) };
  const id = String(data);
  revalidatePath(`/veterinaria/estimados/${id}`);
  return { error: null, id, exito: "Estimado guardado." };
}

export async function enviarEstimado(id: string): Promise<{ error: string | null; url?: string }> {
  const supabase = await createSupabaseServerClient();
  const negocio = await negocioActual();
  const { token, hash } = nuevoToken();
  const { error } = await supabase.rpc("vet_estimado_enviar", { p_id: id, p_token_hash: hash });
  if (error) return { error: traducirError(error) };
  revalidatePath(`/veterinaria/estimados/${id}`);
  return { error: null, url: `${urlDelNegocio(negocio)}/e/${token}` };
}

export async function versionNuevaEstimado(id: string): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("vet_estimado_nueva_version", { p_id: id });
  if (error) return { error: traducirError(error) };
  return { error: null, ir: `/veterinaria/estimados/${data as string}` };
}

export async function cancelarEstimado(id: string, fd: FormData): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("vet_estimado_cancelar", { p_id: id, p_motivo: texto(fd, "motivo") });
  if (error) return { error: traducirError(error) };
  revalidatePath(`/veterinaria/estimados/${id}`);
  return { error: null, exito: "Estimado cancelado." };
}

export async function aceptarEnMostrador(id: string, firma: string | null, fd: FormData): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("vet_estimado_aceptar_mostrador", { p_id: id, p_nombre: texto(fd, "nombre"), p_firma: firma });
  if (error) return { error: traducirError(error) };
  revalidatePath(`/veterinaria/estimados/${id}`);
  const reserva = (data as { reserva_id?: string } | null)?.reserva_id;
  return { error: null, exito: reserva ? "Aceptado. Los cargos ya están en la cuenta de la mascota: se cobran en Caja." : "Aceptado." };
}

export async function opcionesDeEstimado(): Promise<{ id: string; nombre: string; unidad: string | null; precio: number | null }[]> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase
    .from("insumos")
    .select("id, nombre, precio_venta, unidad_compra:unidades_medida!unidad_compra_id(nombre)")
    .is("deleted_at", null)
    .order("nombre")
    .limit(600);
  return (data ?? []).map((i) => {
    const u = (Array.isArray(i.unidad_compra) ? i.unidad_compra[0] : i.unidad_compra) as { nombre: string } | null;
    return { id: i.id as string, nombre: i.nombre as string, unidad: u?.nombre ?? null, precio: i.precio_venta == null ? null : Number(i.precio_venta) };
  });
}

// ── Ajustes del módulo ───────────────────────────────────────────────

export async function guardarPortalExpediente(fd: FormData): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("guardar_veterinaria_portal", { p_expediente: fd.get("portal_expediente") === "si" });
  if (error) return { error: traducirError(error) };
  revalidatePath("/veterinaria/ajustes");
  return { error: null, exito: "Guardado." };
}

export async function guardarTipoCita(fd: FormData): Promise<ResultadoAccion> {
  const dur = Number(texto(fd, "duracion_min"));
  if (!Number.isInteger(dur) || dur < 5 || dur > 480) return { error: "La duración va de 5 a 480 minutos." };
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("guardar_tipo_cita", {
    p_clave: texto(fd, "clave"), p_nombre: texto(fd, "nombre"), p_duracion_min: dur, p_activo: fd.get("activo") === "si",
  });
  if (error) return { error: traducirError(error) };
  revalidatePath("/veterinaria/ajustes");
  return { error: null, exito: "Tipo de cita guardado." };
}

export async function guardarPlantillaConsulta(fd: FormData): Promise<ResultadoAccion> {
  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.rpc("guardar_plantilla_consulta", {
    p_tipo: texto(fd, "tipo"),
    p_texto: {
      anamnesis: String(fd.get("anamnesis") ?? ""), examen_fisico: String(fd.get("examen_fisico") ?? ""), hallazgos: String(fd.get("hallazgos") ?? ""),
      plan: String(fd.get("plan") ?? ""), tratamiento: String(fd.get("tratamiento") ?? ""),
    },
  });
  if (error) return { error: traducirError(error) };
  revalidatePath("/veterinaria/ajustes");
  return { error: null, exito: "Plantilla guardada. Las consultas nuevas de este tipo arrancan con ella." };
}
