import { sesionApp } from "@/lib/app/sesion";
import { supabaseAppEnNegocio } from "@/lib/app/en-negocio";
import { misMascotas, miMascota, misNegocios, misAvisos, edadTexto, nombreEspecie } from "@/lib/app/datos";
import { cartillaDe, proximas, hoyMx, diasEntre } from "@/lib/app/cartilla";
import { aAtencionDelDueno } from "@/lib/app/atenciones";
import {
  vinculosApp, vinculoDe, contratosPorFirmarApp, pagosPendientesApp, abonosDeCuentaApp, visitasApp, solicitudesApp, pasesApp, datosDeNegociosApp,
  misResenasApp, saldosAFavorApp, fotosDelDiaApp, reportesDelDiaApp, carnetApp, expedienteApp, recetasApp, serviciosApp, resenasDeNegocioApp,
} from "@/lib/app/negocios";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { urlApp } from "@/lib/negocio/host";
import { contarDispositivos } from "@/lib/movil/push";
import { hoyNegocio } from "@/lib/formato";

/**
 * Lo que lee cada pantalla de la app nativa (apps/duenos-movil). Son las mismas funciones que usan las páginas de la
 * web (src/app/app), juntas por pantalla para que el celular haga UNA petición por pantalla. Nunca dinero que no sea
 * del dueño (lo mismo que la web: saldo de sus cuentas y precio de lo que él reserva).
 */
const sinSesion = async () => (await sesionApp()) === null;

/** ¿Este negocio ofrece recolección a domicilio? (módulo prendido) */
async function ofreceRecoleccion(negocioId: string): Promise<boolean> {
  const supabase = await supabaseAppEnNegocio(negocioId);
  const { data } = await supabase.rpc("modulo_activo", { p_modulo: "recoleccion" });
  return data === true;
}

export async function pantallaInicio() {
  const s = await sesionApp();
  if (!s) return null;
  const [mascotas, vinculos] = await Promise.all([misMascotas(), vinculosApp()]);
  const [contratos, pagos, visitas] = vinculos.length ? await Promise.all([contratosPorFirmarApp(), pagosPendientesApp(), visitasApp()]) : [[], [], []];
  const datos = vinculos.length ? await datosDeNegociosApp() : new Map<string, { zona: string; whatsapp: string | null }>();
  // Lo próximo de cada mascota: su siguiente vacuna o desparasitación (para la tarjeta de inicio).
  const proximos = await Promise.all(
    mascotas
      .filter((m) => !m.fallecido)
      .map(async (m) => {
        const p = proximas(await cartillaDe(m.id))[0];
        return p?.proximaDosis ? { mascotaId: m.id, tipo: p.tipo, nombre: p.nombre, fecha: p.proximaDosis, dias: diasEntre(hoyMx(), p.proximaDosis) } : null;
      })
  );
  const siguientes = visitas.filter((v) => ["reservada", "confirmada", "en_curso"].includes(v.estado)).reverse().slice(0, 3);
  return {
    nombre: s.dueno.nombre?.split(" ")[0] ?? null,
    mascotas: mascotas.map((m) => ({ ...m, edad: edadTexto(m.fechaNacimiento), especieTexto: nombreEspecie(m) })),
    proximos: proximos.filter(Boolean),
    pendientes: {
      contratos: contratos.length,
      porConfirmar: visitas.filter((v) => v.puedeConfirmar).length,
      porPagar: pagos.reduce((t, p) => t + p.saldo, 0),
      cuentas: pagos.length,
    },
    siguientes: siguientes.map((v) => ({ ...v, zona: datos.get(v.negocioId)?.zona ?? "America/Mexico_City" })),
  };
}

export async function pantallaMascota(id: string) {
  const m = await miMascota(id);
  if (!m) return null;
  const supabase = await createSupabaseServerClient("portal");
  const [registros, { data: pesoFila }, { count: medsActivos }, { data: atencionesCrudas }] = await Promise.all([
    cartillaDe(m.id),
    supabase.from("mascotas_pesos").select("peso_kg, fecha").eq("mascota_id", m.id).is("deleted_at", null).order("fecha", { ascending: false }).limit(1).maybeSingle(),
    supabase.from("mascotas_medicamentos").select("id", { count: "exact", head: true }).eq("mascota_id", m.id).is("deleted_at", null).eq("activo", true),
    supabase.rpc("app_mis_atenciones", { p_mascota: m.id }),
  ]);
  return {
    mascota: { ...m, edad: edadTexto(m.fechaNacimiento), especieTexto: nombreEspecie(m) },
    proximas: proximas(registros)
      .slice(0, 3)
      .map((r) => ({ ...r, dias: r.proximaDosis ? diasEntre(hoyMx(), r.proximaDosis) : null })),
    totalCartilla: registros.length,
    peso: pesoFila ? { kg: Number(pesoFila.peso_kg), fecha: pesoFila.fecha as string } : null,
    medicamentosActivos: medsActivos ?? 0,
    atenciones: ((atencionesCrudas ?? []) as Record<string, unknown>[]).map(aAtencionDelDueno),
    perfilUrl: `${urlApp()}/m/${m.tokenPublico}`,
  };
}

export async function pantallaCartilla(id: string) {
  const m = await miMascota(id);
  if (!m) return null;
  const supabase = await createSupabaseServerClient("portal");
  const [registros, { count: fotosRevisadas }, { data: atenciones }] = await Promise.all([
    cartillaDe(m.id),
    supabase.from("mascotas_cartilla_fotos").select("id", { count: "exact", head: true }).eq("mascota_id", m.id).is("deleted_at", null).or("confirmada_at.not.is.null,estado.in.(sin_datos,error)"),
    supabase.rpc("app_mis_atenciones", { p_mascota: m.id }),
  ]);
  const negociosQR = Object.fromEntries(((atenciones ?? []) as { id: string; negocio_nombre: string }[]).map((a) => [a.id, a.negocio_nombre]));
  return {
    mascota: { id: m.id, nombre: m.nombre, especie: m.especie, recordatoriosApagados: m.recordatoriosApagados },
    registros: registros.map((r) => ({ ...r, negocioQR: r.atencionId ? (negociosQR[r.atencionId] ?? null) : null })),
    fotosRevisadas: fotosRevisadas ?? 0,
  };
}

export async function pantallaSeguimiento(id: string) {
  const m = await miMascota(id);
  if (!m) return null;
  const supabase = await createSupabaseServerClient("portal");
  const ahora = new Date();
  const [anio, mes] = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit" }).format(ahora).split("-").map(Number);
  const inicioMes = `${anio}-${String(mes).padStart(2, "0")}-01`;
  const [{ data: pesos }, { data: meds }, { data: gastos }, { data: total }] = await Promise.all([
    supabase.from("mascotas_pesos").select("id, peso_kg, fecha, notas").eq("mascota_id", m.id).is("deleted_at", null).order("fecha", { ascending: false }).order("id").limit(30),
    supabase.from("mascotas_medicamentos").select("id, nombre, dosis, horas, fecha_inicio, fecha_fin").eq("mascota_id", m.id).is("deleted_at", null).eq("activo", true).order("created_at").order("id"),
    supabase.from("mascotas_gastos").select("id, concepto, monto, categoria, fecha").eq("mascota_id", m.id).is("deleted_at", null).gte("fecha", inicioMes).order("fecha", { ascending: false }).order("id").limit(200),
    supabase.rpc("app_gastos_mes", { p_mascota: m.id, p_anio: anio, p_mes: mes }),
  ]);
  const fila = (Array.isArray(total) ? total[0] : total) as { total?: number } | null;
  return {
    mascota: { id: m.id, nombre: m.nombre, especie: m.especie },
    pesos: pesos ?? [],
    medicamentos: meds ?? [],
    gastos: gastos ?? [],
    totalMes: Number(fila?.total ?? 0),
    mes: new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", month: "long" }).format(ahora),
  };
}

export async function pantallaPerdida(id: string) {
  const m = await miMascota(id);
  if (!m) return null;
  const supabase = await createSupabaseServerClient("portal");
  const { data } = await supabase.rpc("app_mensajes_de", { p_mascota: m.id });
  return {
    mascota: { id: m.id, nombre: m.nombre, especie: m.especie, sexo: m.sexo, fotoUrl: m.fotoUrl, perdidaAt: m.perdidaAt, perdidaNota: m.perdidaNota, encontradaAt: m.encontradaAt },
    perdida: Boolean(m.perdidaAt && !m.encontradaAt),
    cartelUrl: `${urlApp()}/m/${m.tokenPublico}/cartel`,
    perfilUrl: `${urlApp()}/m/${m.tokenPublico}`,
    mensajes: ((data ?? []) as Record<string, unknown>[]).map((x) => ({
      id: x.id as string,
      de: x.de as "hallador" | "dueno",
      texto: x.texto as string,
      halladorNombre: (x.hallador_nombre as string | null) ?? null,
      entregadoAt: (x.entregado_at as string | null) ?? null,
      creado: x.created_at as string,
    })),
  };
}

export async function pantallaQR(id: string) {
  const m = await miMascota(id);
  if (!m) return null;
  return { mascota: { id: m.id, nombre: m.nombre, especie: m.especie, fotoUrl: m.fotoUrl }, perfilUrl: `${urlApp()}/m/${m.tokenPublico}`, codigo: m.tokenPublico };
}

export async function pantallaAvisos() {
  const s = await sesionApp();
  if (!s) return null;
  const [avisos, dispositivos] = await Promise.all([misAvisos(), contarDispositivos(s.user.id)]);
  return { avisos, dispositivos };
}

export async function pantallaYo() {
  const s = await sesionApp();
  if (!s) return null;
  const negocios = await misNegocios();
  return { dueno: s.dueno, negocios: negocios.map((n) => ({ id: n.id, nombre: n.nombre, ciudad: n.ciudad, url: n.url })) };
}

export async function pantallaNegocioDeMascota(id: string, negocio: string) {
  const m = await miMascota(id);
  if (!m) return null;
  const v = await vinculoDe(m.id, negocio);
  if (!v) return null;
  const [fotos, reportes, carnet, expediente, recetas, servicios, resenas, datos] = await Promise.all([
    fotosDelDiaApp(m.id, negocio, 24),
    reportesDelDiaApp(m.id, negocio),
    carnetApp(m.id, negocio),
    expedienteApp(m.id, negocio),
    recetasApp(m.id, negocio),
    serviciosApp(negocio),
    resenasDeNegocioApp(negocio),
    datosDeNegociosApp(),
  ]);
  return {
    mascota: { id: m.id, nombre: m.nombre, especie: m.especie },
    negocio: { id: negocio, nombre: v.negocioNombre, url: v.negocioUrl, whatsapp: datos.get(negocio)?.whatsapp ?? null, zona: datos.get(negocio)?.zona ?? "America/Mexico_City" },
    fotos: fotos.filter((f) => f.fotoUrl),
    reportes,
    carnet,
    expediente,
    recetas,
    resenas,
    conEstetica: servicios.some((s) => s.categoria === "estetica"),
    conEstancias: servicios.some((s) => s.categoria === "guarderia" || s.categoria === "hotel"),
  };
}

/** Pedir cita: los negocios de la mascota con servicios de estética (sin precio) y los que se piden por WhatsApp. */
export async function pantallaCita(id: string) {
  const m = await miMascota(id);
  if (!m) return null;
  const [registros, datos] = await Promise.all([cartillaDe(m.id), datosDeNegociosApp()]);
  const enLinea = (
    await Promise.all(
      m.vinculos.map(async (v) => {
        const servicios = (await serviciosApp(v.negocioId)).filter((s) => s.categoria === "estetica");
        if (!servicios.length) return null;
        const zona = datos.get(v.negocioId)?.zona ?? "America/Mexico_City";
        return { id: v.negocioId, nombre: v.negocioNombre, zona, hoy: hoyNegocio(zona), servicios, recoleccion: await ofreceRecoleccion(v.negocioId) };
      })
    )
  ).filter(Boolean);
  const { data: ats } = await createSupabaseAdminClient()
    .from("app_atenciones")
    .select("negocio_nombre, negocio_whatsapp")
    .eq("mascota_id", m.id)
    .is("deleted_at", null)
    .is("oculto_at", null)
    .order("created_at", { ascending: false })
    .limit(20);
  const porWhatsApp: { nombre: string; wa: string | null }[] = [];
  const vistos = new Set<string>();
  for (const a of (ats ?? []) as { negocio_nombre: string; negocio_whatsapp: string }[]) {
    if (vistos.has(a.negocio_whatsapp)) continue;
    vistos.add(a.negocio_whatsapp);
    porWhatsApp.push({ nombre: a.negocio_nombre, wa: a.negocio_whatsapp.length === 10 ? `52${a.negocio_whatsapp}` : a.negocio_whatsapp });
  }
  for (const v of m.vinculos) porWhatsApp.push({ nombre: v.negocioNombre, wa: datos.get(v.negocioId)?.whatsapp ?? null });
  const toca = proximas(registros)
    .filter((r) => r.proximaDosis)
    .slice(0, 2);
  return { mascota: { id: m.id, nombre: m.nombre, especie: m.especie, sexo: m.sexo }, enLinea, porWhatsApp, toca };
}

export async function pantallaReservar(id: string) {
  const m = await miMascota(id);
  if (!m) return null;
  const datos = await datosDeNegociosApp();
  const negocios = (
    await Promise.all(
      m.vinculos.map(async (v) => {
        const servicios = (await serviciosApp(v.negocioId)).filter((s) => s.categoria === "guarderia" || s.categoria === "hotel");
        if (!servicios.length) return null;
        return { id: v.negocioId, nombre: v.negocioNombre, hoy: hoyNegocio(datos.get(v.negocioId)?.zona ?? "America/Mexico_City"), servicios, recoleccion: await ofreceRecoleccion(v.negocioId) };
      })
    )
  ).filter(Boolean);
  return { mascota: { id: m.id, nombre: m.nombre, especie: m.especie }, negocios };
}

export async function pantallaVisitas() {
  if (await sinSesion()) return null;
  const [visitas, datos, calificadas, solicitudes] = await Promise.all([visitasApp(), datosDeNegociosApp(), misResenasApp(), solicitudesApp()]);
  return {
    solicitudes: solicitudes.map((s) => ({ ...s, zona: datos.get(s.negocioId)?.zona ?? "America/Mexico_City" })),
    visitas: visitas.map((v) => ({ ...v, zona: datos.get(v.negocioId)?.zona ?? "America/Mexico_City", calificada: calificadas.has(v.id), puedeResenar: v.puedeResenar && !calificadas.has(v.id) })),
  };
}

export async function pantallaPagos() {
  if (await sinSesion()) return null;
  const [pagos, aFavor] = await Promise.all([pagosPendientesApp(), saldosAFavorApp()]);
  const abonos = await Promise.all(pagos.map((p) => abonosDeCuentaApp(p.negocioId, p.reservaId)));
  return { pagos: pagos.map((p, i) => ({ ...p, abonos: abonos[i] })), aFavor };
}

export async function pantallaPases() {
  if (await sinSesion()) return null;
  return { pases: await pasesApp() };
}

export async function pantallaContratos() {
  if (await sinSesion()) return null;
  return { contratos: await contratosPorFirmarApp() };
}

/** Hacerse cliente de un negocio: quien pide no es miembro, así que lo del negocio se lee con el servidor (sin precios). */
export async function pantallaClienteNuevo(negocioId: string) {
  const s = await sesionApp();
  if (!s || !/^[0-9a-f-]{36}$/i.test(negocioId)) return null;
  const db = createSupabaseAdminClient(negocioId);
  const { data: n } = await db.from("negocios").select("id, nombre, zona_horaria, acepta_clientes_app, landing").eq("id", negocioId).is("deleted_at", null).maybeSingle();
  if (!n) return null;
  const [{ data: servicios }, { data: recoleccion }, mascotas] = await Promise.all([
    db.from("servicios").select("id, nombre, categoria, unidad, duracion_minutos").eq("negocio_id", negocioId).in("categoria", ["guarderia", "hotel", "estetica"]).is("deleted_at", null).order("nombre").order("id"),
    db.rpc("modulo_activo", { p_modulo: "recoleccion" }),
    misMascotas(),
  ]);
  const libres = mascotas.filter((m) => !m.vinculos.some((v) => v.negocioId === negocioId));
  const conteos = await Promise.all(libres.map(async (m) => (await cartillaDe(m.id)).length));
  const wa = ((n.landing as { telefono_wa?: string | null } | null)?.telefono_wa ?? "").replace(/\D/g, "");
  return {
    negocio: { id: n.id, nombre: n.nombre, hoy: hoyNegocio(n.zona_horaria ?? "America/Mexico_City"), recoleccion: recoleccion === true, acepta: n.acepta_clientes_app === true, whatsapp: wa ? (wa.length === 10 ? `52${wa}` : wa) : null },
    servicios: (servicios ?? []).map((v) => ({ id: v.id, nombre: v.nombre, categoria: v.categoria, unidad: v.unidad, duracionMinutos: v.duracion_minutos })),
    mascotas: libres.map((m, i) => ({ id: m.id, nombre: m.nombre, especie: nombreEspecie(m), raza: m.razaTexto ?? null, fechaNacimiento: m.fechaNacimiento ?? null, fotoUrl: m.fotoUrl, vacunas: conteos[i] })),
    yo: { nombre: s.dueno.nombre, telefono: s.dueno.telefono },
  };
}
