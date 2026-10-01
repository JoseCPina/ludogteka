// Uso: node scripts/auditoria/reportes-datos-dev.mjs   (SOLO DESARROLLO, SOLO HUELLITAS)
//
// Deja a Huellitas listo para probar el reporte de comportamiento y las
// fotos y videos (1 de octubre de 2026):
//   · recepción con el permiso «Reportes de guardería» (recepcion@huellitas.prueba)
//     y otra recepción SIN el permiso (sinpermiso@huellitas.prueba);
//   · perros adentro hoy: Firulais en guardería, Canela en hotel y Pelusa en
//     las dos cosas; Bolita no está adentro;
//   · todos con el dueño y su teléfono.
// Idempotente. Escribe los ids en la carpeta temporal (reportes-datos.json)
// para las pruebas. NUNCA toca Ludogteka.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";
import { A, URL, env, tokenDe } from "./sesiones-dev.mjs";
import { comoPersona } from "./reportes-sesion-dev.mjs";

if (!URL.includes("sgfolltpvktbsiisfuzq")) throw new Error("Esto solo corre contra DESARROLLO.");

export const SALIDA = path.join(os.tmpdir(), "reportes-datos.json");
const MARCA = "ZZSECRETOB";

const servicioEn = (negocio) =>
  createClient(URL, env.SUPABASE_SECRET_KEY, { auth: { persistSession: false }, global: { headers: { "x-negocio-id": negocio } } });
const exigir = (r, que) => {
  if (r.error) throw new Error(`${que}: ${r.error.message}`);
  return r.data;
};

export async function prepararHuellitas() {
  const { data: negocio } = await A.from("negocios").select("id").eq("slug", "huellitas").maybeSingle();
  if (!negocio) throw new Error("Falta Huellitas: corre antes scripts/auditoria/negocio-prueba-dev.mjs");
  const H = negocio.id;
  const SH = servicioEn(H);
  const hoyData = exigir(await SH.rpc("fecha_negocio"), "fecha_negocio");
  const hoy = typeof hoyData === "string" ? hoyData : String(hoyData);
  const ayer = new Date(new Date(`${hoy}T12:00:00Z`).getTime() - 86400000).toISOString().slice(0, 10);
  const manana = new Date(new Date(`${hoy}T12:00:00Z`).getTime() + 86400000).toISOString().slice(0, 10);

  const quien = async (email) => exigir(await A.rpc("usuario_por_email", { p_email: email }), `usuario ${email}`);
  const adminB = await quien("admin@huellitas.prueba");
  const recepcionB = await quien("recepcion@huellitas.prueba");
  const esteticaB = await quien("estetica@huellitas.prueba");

  // Otra recepción, sin el permiso.
  let sinPermiso = (await A.rpc("usuario_por_email", { p_email: "sinpermiso@huellitas.prueba" })).data;
  if (!sinPermiso) {
    const creado = exigir(
      await A.auth.admin.createUser({ email: "sinpermiso@huellitas.prueba", password: `Prueba-${crypto.randomUUID()}`, email_confirm: true, user_metadata: { nombre_completo: `Recepción sin permiso ${MARCA}` } }),
      "crear sinpermiso"
    );
    sinPermiso = creado.user.id;
  }
  const { data: mem } = await A.from("membresias").select("rol").eq("profile_id", sinPermiso).eq("negocio_id", H).is("deleted_at", null).maybeSingle();
  if (!mem) exigir(await SH.rpc("asignar_rol_staff", { p_user_id: sinPermiso, p_rol: "recepcion", p_nombre_completo: `Recepción sin permiso ${MARCA}` }), "rol sinpermiso");

  // El permiso (lo da el admin de Huellitas, con su JWT).
  const comoAdmin = createClient(URL, env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${await tokenDe(adminB)}`, "x-negocio-id": H } },
  });
  exigir(await comoAdmin.rpc("otorgar_permiso", { p_profile_id: recepcionB, p_permiso: "reportes_guarderia" }), "otorgar permiso");

  const { data: perros } = await SH.from("perros").select("id, nombre, cliente_id").eq("negocio_id", H).is("deleted_at", null);
  const por = (inicio) => perros.find((p) => p.nombre.startsWith(inicio));
  const firulais = por("Firulais");
  const canela = por("Canela");
  const pelusa = por("Pelusa");
  const bolita = por("Bolita");

  const { data: servicios } = await SH.from("servicios").select("id, categoria, unidad").eq("negocio_id", H).is("deleted_at", null).in("categoria", ["guarderia", "hotel"]);
  const guarderia = servicios.find((s) => s.categoria === "guarderia" && s.unidad === "dia");
  const hotel = servicios.find((s) => s.categoria === "hotel");

  // Una estancia en curso HOY por (perro, categoría). Se crean con la secret
  // key: lo que se prueba es el reporte, no las reglas de reserva.
  async function enCurso(perro, servicio, desde = hoy, hasta = manana) {
    const { data: ya } = await SH.from("estancias").select("id").eq("negocio_id", H).eq("perro_id", perro.id).eq("servicio_id", servicio.id).eq("estado", "en_curso").is("deleted_at", null).maybeSingle();
    if (ya) return ya.id;
    const reserva = exigir(await comoAdmin.from("reservas").insert({ cliente_id: perro.cliente_id }).select("id").single(), "reserva");
    const e = await comoAdmin.from("estancias")
      .insert({
        reserva_id: reserva.id,
        perro_id: perro.id,
        servicio_id: servicio.id,
        fecha_entrada: desde,
        fecha_salida: hasta,
        estado: "en_curso",
        hora_entrada_real: new Date().toISOString(),
        entregado_por_nombre: "Dueño (prueba)",
        bloqueo_sanitario_superado: true,
        motivo_excepcion_sanitaria: `Prueba ${MARCA}`,
      })
      .select("id")
      .single();
    return exigir(e, `estancia de ${perro.nombre}`).id;
  }
  const { data: tam } = await SH.from("tamanos_categoria").select("id").limit(1).single();
  for (const p of [firulais, canela, pelusa]) {
    exigir(await SH.from("perros").update({ evaluacion_comportamiento_fecha: hoy, tamano_id: tam.id }).eq("id", p.id), `evaluación de ${p.nombre}`);
  }
  const estancias = {
    firulaisGuarderia: await enCurso(firulais, guarderia),
    canelaHotel: await enCurso(canela, hotel),
    pelusaGuarderia: await enCurso(pelusa, guarderia),
    // Hotel que todavía no hizo check-out (sale hoy) + guardería de hoy: un perro, dos servicios.
    pelusaHotel: await enCurso(pelusa, hotel, ayer, hoy),
  };

  const datos = { H, hoy, adminB, recepcionB, esteticaB, sinPermiso, firulais: firulais.id, canela: canela.id, pelusa: pelusa.id, bolita: bolita.id, estancias };
  fs.writeFileSync(SALIDA, JSON.stringify(datos, null, 1));
  return datos;
}

/**
 * Un reporte, una foto, una galería y sus ligas de Huellitas con la marca
 * ZZSECRETOB en el texto: la auditoría entre negocios comprueba que nadie de
 * otro negocio los alcance (negocio-prueba-dev.mjs lo llama). Idempotente por día.
 */
export async function sembrarReportesConMarca(D) {
  const SH = servicioEn(D.H);
  const REC = await comoPersona(D.recepcionB, D.H);
  const { data: previo } = await SH.from("reportes_guarderia").select("id").eq("negocio_id", D.H).eq("perro_id", D.firulais).eq("fecha", D.hoy).maybeSingle();
  if (previo) return previo.id;
  const g = exigir(
    await REC.rpc("reporte_guardar", {
      p_perro_id: D.firulais,
      p_respuestas: { estado_general: { opciones: ["activo"] }, recomendaciones: { texto: `Recomendación ${MARCA}` }, resumen: { opciones: ["buen_dia"] } },
      p_estado: "listo",
    }),
    "reporte con marca"
  );
  const jpg = Buffer.from(MARCA);
  const tarjeta = `${D.H}/tarjetas/${g.id}/1-marca.jpg`;
  await SH.storage.from("reportes-archivos").upload(tarjeta, new Blob([jpg], { type: "image/jpeg" }), { upsert: true });
  exigir(await REC.rpc("reporte_registrar_tarjeta", { p_reporte_id: g.id, p_path: tarjeta, p_bytes: jpg.length }), "tarjeta con marca");
  exigir(await REC.rpc("reporte_crear_enlace", { p_reporte_id: g.id, p_hash: crypto.createHash("sha256").update(crypto.randomBytes(32)).digest("hex") }), "liga con marca");
  const m = exigir(await REC.rpc("media_preparar", { p_perro_id: D.firulais, p_tipo: "foto", p_mime: "image/jpeg" }), "media con marca");
  await SH.storage.from("reportes-archivos").upload(m.path, new Blob([jpg], { type: "image/jpeg" }), { upsert: true });
  exigir(await REC.rpc("media_confirmar", { p_id: m.id, p_bytes: jpg.length, p_duracion: null }), "confirmar media con marca");
  exigir(await REC.rpc("galeria_crear", { p_perro_id: D.firulais, p_media_ids: [m.id], p_hash: crypto.createHash("sha256").update(crypto.randomBytes(32)).digest("hex") }), "galería con marca");
  return g.id;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, "/")}`) {
  const d = await prepararHuellitas();
  console.log(JSON.stringify(d, null, 1));
  console.log(`→ ${SALIDA}`);
}
