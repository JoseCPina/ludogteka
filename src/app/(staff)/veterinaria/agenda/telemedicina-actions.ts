"use server";

import { revalidatePath } from "next/cache";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { negocioActual, urlDelNegocio, zonaActual } from "@/lib/negocio/actual";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { nuevoToken } from "@/lib/reporte/enlaces";
import { ClienteWA, configWhatsApp, marcarNumeroContesta } from "@/lib/whatsapp/infra";
import { ErrorVideo, proveedorDeSala, proveedorDeVideo } from "@/lib/telemedicina/proveedor";
import { esCuentaDelCorredor } from "@/lib/telemedicina/corredor";
import {
  mensajeManual,
  NOMBRE_PLANTILLA_TELECONSULTA,
  parametrosPlantilla,
  plantillaTeleconsultaAprobada,
  textoCuando,
  type DatosLiga,
} from "@/lib/telemedicina/whatsapp";
import type { DetalleTeleconsulta } from "@/lib/telemedicina/tipos";
import { traducirError } from "../../reservas/traducir-error";
import { crearLinkPago } from "../../caja/cobro-integrado-actions";

const mensajeDe = (error: { code?: string; message: string } | null, base = "No pudimos hacerlo. Intenta de nuevo.") => (error ? traducirError(error) : base);

/** Una sala dura lo que la cita puede moverse: los tokens (no la sala) hacen cumplir la ventana. */
const VIGENCIA_SALA_DIAS = 180;

/**
 * Crea la sala de una cita de teleconsulta y todo lo que lleva: consentimiento y, si el negocio cobra por
 * adelantado, la cuenta. El primer enlace se descarta a propósito (el token en claro nunca se guarda):
 * el enlace del dueño se genera después, desde la pantalla de la teleconsulta.
 */
export async function prepararSalaTeleconsulta(citaId: string): Promise<{ error: string | null }> {
  const supabase = await createSupabaseServerClient();
  const { data: ya } = await supabase.rpc("vet_telemedicina_detalle", { p_cita: citaId });
  if (ya) return { error: null };
  const demo = (await cargarNegocioLanding()).plan === "demo";
  // En el demo la sala es simulada, salvo la que crea una cuenta del corredor de tutoriales (nunca el visitante).
  const corredor = demo && esCuentaDelCorredor((await supabase.auth.getUser()).data.user?.email);
  let sala;
  try {
    const proveedor = proveedorDeVideo({ demo, corredor });
    sala = await proveedor.crearSala({ vencimiento: new Date(Date.now() + VIGENCIA_SALA_DIAS * 86_400_000) });
  } catch (e) {
    return { error: e instanceof ErrorVideo ? e.message : "No pudimos crear la sala de videollamada." };
  }
  const descartado = nuevoToken();
  const { error } = await supabase.rpc("vet_telemedicina_crear", {
    p_cita: citaId,
    p_proveedor: sala.proveedor,
    p_sala_nombre: sala.nombre,
    p_sala_url: sala.url,
    p_token_hash: descartado.hash,
  });
  if (error) {
    await proveedorDeVideo({ demo, corredor }).borrarSala(sala.nombre).catch(() => undefined);
    return { error: mensajeDe(error) };
  }
  revalidatePath("/veterinaria/agenda");
  revalidatePath(`/veterinaria/teleconsulta/${citaId}`);
  return { error: null };
}

/** El enlace que se le manda al dueño. Uno nuevo deja sin efecto el anterior. */
export async function generarLigaTeleconsulta(citaId: string): Promise<{ error: string | null; liga?: string; urlWhatsApp?: string; mensaje?: string }> {
  const supabase = await createSupabaseServerClient();
  const t = nuevoToken();
  const { error } = await supabase.rpc("vet_telemedicina_liga_nueva", { p_cita: citaId, p_token_hash: t.hash });
  if (error) return { error: mensajeDe(error) };
  const negocio = await negocioActual();
  const liga = `${urlDelNegocio(negocio)}/t/${t.token}`;
  const datos = await datosParaLiga(citaId, liga);
  revalidatePath(`/veterinaria/teleconsulta/${citaId}`);
  if (!datos) return { error: null, liga };
  const mensaje = mensajeManual(datos.datos);
  const digitos = datos.telefono.replace(/\D/g, "").slice(-10);
  return { error: null, liga, mensaje, urlWhatsApp: digitos.length === 10 ? `https://wa.me/52${digitos}?text=${encodeURIComponent(mensaje)}` : undefined };
}

async function datosParaLiga(citaId: string, liga: string): Promise<{ datos: DatosLiga; telefono: string } | null> {
  const negocio = await negocioActual();
  const admin = createSupabaseAdminClient(negocio.id);
  const { data: t } = await admin
    .from("vet_telemedicina")
    .select("cita_id, perro_id, cliente_id, medico_id")
    .eq("negocio_id", negocio.id)
    .eq("cita_id", citaId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!t) return null;
  const [{ data: perro }, { data: cliente }, { data: medico }, { data: cita }] = await Promise.all([
    admin.from("perros").select("nombre").eq("negocio_id", negocio.id).eq("id", t.perro_id).maybeSingle(),
    admin.from("clientes").select("nombre, telefono").eq("negocio_id", negocio.id).eq("id", t.cliente_id).maybeSingle(),
    admin.from("medicos_veterinarios").select("profile_id").eq("negocio_id", negocio.id).eq("id", t.medico_id).maybeSingle(),
    admin.from("vet_citas").select("inicia_at").eq("negocio_id", negocio.id).eq("id", citaId).maybeSingle(),
  ]);
  const { data: perfil } = medico?.profile_id ? await admin.from("profiles").select("nombre_completo").eq("id", medico.profile_id).maybeSingle() : { data: null };
  const supabase = await createSupabaseServerClient();
  const { data: tel } = await supabase.rpc("telefono_recepcion_publico");
  if (!perro || !cliente || !cita) return null;
  return {
    telefono: (cliente.telefono as string | null) ?? "",
    datos: {
      dueno: cliente.nombre as string,
      mascota: perro.nombre as string,
      medico: (perfil?.nombre_completo as string | undefined) ?? "el médico veterinario",
      negocio: negocio.nombre,
      cuando: textoCuando(cita.inicia_at as string, await zonaActual()),
      liga,
      telefonoNegocio: typeof tel === "string" ? tel : "",
    },
  };
}

/** Manda la liga con la plantilla UTILITY de Meta (si ya está aprobada). Si no, queda el wa.me manual. */
export async function enviarLigaPorWhatsApp(citaId: string, liga: string): Promise<{ error: string | null; enviado?: boolean }> {
  const negocio = await negocioActual();
  // La demostración no manda nada a nadie: ni WhatsApp, ni correo, ni facturas.
  if ((await cargarNegocioLanding()).plan === "demo") return { error: "Es una demostración: aquí no se manda ningún mensaje de verdad. Con tu negocio, este botón lo manda por WhatsApp." };
  if (!liga.startsWith(`${urlDelNegocio(negocio)}/t/`)) return { error: "Esa liga no es de este negocio." };
  const supabase = await createSupabaseServerClient();
  const { data: puede } = await supabase.rpc("vet_telemedicina_detalle", { p_cita: citaId });
  if (!puede) return { error: "No encontramos esa teleconsulta." };
  const d = await datosParaLiga(citaId, liga);
  if (!d) return { error: "No encontramos los datos de la teleconsulta." };
  const digitos = d.telefono.replace(/\D/g, "");
  if (digitos.length !== 10) return { error: "El dueño no tiene un teléfono de 10 dígitos. Corrígelo en su ficha." };
  const cfg = configWhatsApp();
  if (!cfg.token || !cfg.phoneNumberId) return { error: "WhatsApp todavía no está configurado en PeluDesk. Usa «Abrir en WhatsApp»." };
  if (!(await plantillaTeleconsultaAprobada())) {
    return { error: "La plantilla de WhatsApp todavía está en revisión con Meta. Usa «Abrir en WhatsApp» para mandarla tú." };
  }
  const wa = new ClienteWA(cfg.token, cfg.phoneNumberId, marcarNumeroContesta);
  const r = await wa.plantillaConParametros(`52${digitos}`, NOMBRE_PLANTILLA_TELECONSULTA, parametrosPlantilla(d.datos), [], {
    origen: "teleconsulta",
    negocioId: negocio.id,
    refId: citaId,
    etiqueta: "Liga de la teleconsulta por WhatsApp",
    href: `/veterinaria/teleconsulta/${citaId}`,
  });
  if (!r.ok) {
    console.error("[telemedicina] envío fallido", { estado: r.estado, codigo: r.codigo });
    return { error: "WhatsApp no aceptó el mensaje. Usa «Abrir en WhatsApp» para mandarla tú." };
  }
  return { error: null, enviado: true };
}

/** Link de pago de Mercado Pago (o del proveedor elegido) para la teleconsulta con cobro anticipado. */
export async function crearLigaDePagoTeleconsulta(citaId: string): Promise<{ error: string | null; url?: string; urlWhatsApp?: string }> {
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.rpc("vet_telemedicina_detalle", { p_cita: citaId });
  const d = data as DetalleTeleconsulta | null;
  if (!d) return { error: "No encontramos esa teleconsulta." };
  if (!d.pago_requerido || !d.reserva_id || !d.monto) return { error: "Esta teleconsulta no lleva cobro anticipado." };
  if (d.pagado) return { error: "La teleconsulta ya está pagada." };
  const r = await crearLinkPago(d.reserva_id, Number(d.monto), "Teleconsulta veterinaria");
  if (r.error) return { error: r.error };
  revalidatePath(`/veterinaria/teleconsulta/${citaId}`);
  return { error: null, url: r.url, urlWhatsApp: r.urlWhatsApp };
}

/** El médico entra a la sala: la base comprueba el permiso y la ventana; el proveedor firma su token (moderador). */
export async function entrarComoMedico(citaId: string, nombre: string): Promise<{ error: string | null; url?: string; simulada?: boolean; hasta?: string }> {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.rpc("vet_telemedicina_sala_medico", { p_cita: citaId });
  if (error || !data) return { error: mensajeDe(error, "No pudimos abrir la sala.") };
  const sala = data as { proveedor: "daily" | "simulado"; sala_nombre: string; sala_url: string; hasta: string };
  try {
    const proveedor = proveedorDeSala(sala.proveedor);
    const ahora = new Date();
    const url = await proveedor.urlDeEntrada({
      sala: { proveedor: sala.proveedor, nombre: sala.sala_nombre, url: sala.sala_url },
      nombre,
      esMedico: true,
      desde: new Date(ahora.getTime() - 60_000),
      hasta: new Date(sala.hasta),
    });
    revalidatePath(`/veterinaria/teleconsulta/${citaId}`);
    return { error: null, url, simulada: sala.proveedor === "simulado", hasta: sala.hasta };
  } catch (e) {
    return { error: e instanceof ErrorVideo ? e.message : "No pudimos abrir la sala." };
  }
}
