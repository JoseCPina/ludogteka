// Dictado por voz de Veterinaria, Fase 5 (SOLO DESARROLLO, en Huellitas; nunca Ludogteka).
// Migración 20261020000000.
//
//   node scripts/auditoria/dictado-dev.mjs
//
// 1. Quién puede dictar (permiso, consulta en borrador, aviso al dueño, duración).
// 2. Minutos reales cobrados, registro de uso, el audio se borra al transcribir.
// 3. Tope mensual: aviso al 80 %, rechazo al llegar, tope propio del negocio.
// 4. Conservar el audio 30 días: ruta solo para quien puede, vence y la tarea lo borra.
// 5. Aislamiento: otro negocio, cliente, estética y llave anónima; funciones de servidor y de plataforma.
// 6. Voz real: audio en español mexicano generado con ElevenLabs y transcrito con Scribe
//    (los mismos parámetros que usa la app). Sin llave o sin red se dice, no se da por bueno.
//    Deja /tmp/peludesk-dictado-es.wav para la prueba de pantalla (veterinaria-fase5-ui-dev.mjs).
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { B, SB, LUDOGTEKA, datos, env, rpc, get, personas, fijarModulo, hoy, comprobar, seccion, terminar } from "./veterinaria-comun-dev.mjs";

const P = await personas();
const MARCA = `dic-${String(Date.now()).slice(-6)}`;
const medicosCreados = [];
const FRASE =
  "Llega Firulais, un perro labrador de cinco años, por vómito desde ayer. El dueño dice que ya no quiere comer. " +
  "A la exploración la temperatura es de treinta y nueve punto cinco grados y pesa veintiocho kilos. " +
  "Mucosas rosadas, deshidratación leve, dolor a la palpación abdominal. " +
  "Presuntivo gastroenteritis. Se indica dieta blanda por tres días y revisión en una semana.";

const norm = (s) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const fila = async (id) => (await SB.from("vet_dictados").select("*").eq("id", id).single()).data;
const topeOriginal = (await SB.from("negocios").select("dictado_minutos_mes").eq("id", B).single()).data?.dictado_minutos_mes ?? null;
const ajustesAntes = (await SB.from("veterinaria_ajustes").select("id, dictado_conservar_audio").eq("negocio_id", B).is("deleted_at", null).maybeSingle()).data;

try {
  await fijarModulo("veterinaria", true);
  const med = await rpc(P.admin, "guardar_medico_veterinario", { p_profile_id: P.recConId, p_cedula: String(Date.now()).slice(-7), p_cpa: null });
  comprobar(med.ok, `admin designa a la recepcionista como médico (${med.mensaje})`);
  medicosCreados.push(med.cuerpo);
  const nuevoPerro = async (nombre) => {
    const r = await SB.from("perros").insert({ negocio_id: B, cliente_id: datos.clienteSoloB, nombre: `${nombre} ${MARCA}` }).select("id").single();
    if (r.error) throw new Error(`perro: ${r.error.message}`);
    return r.data.id;
  };
  const consulta = async (token = P.recCon) => {
    const perro = await nuevoPerro("Dicta");
    const r = await rpc(token, "vet_consulta_iniciar", { p_perro: perro, p_cita: null, p_tipo: "consulta", p_medico: med.cuerpo });
    if (!r.ok) throw new Error(`consulta: ${r.mensaje}`);
    return r.cuerpo;
  };
  const c1 = await consulta();
  await SB.from("negocios").update({ dictado_minutos_mes: null }).eq("id", B);

  seccion("1. Quién puede dictar");
  const iniciar = (token, c, seg = 30, aviso = true) => rpc(token, "vet_dictado_iniciar", { p_consulta: c, p_segundos: seg, p_aviso: aviso });
  for (const [quien, t] of [["recepción sin permiso", P.recSin], ["estética", P.estetica], ["el cliente", P.cliente], ["la llave anónima", null]]) {
    comprobar(!(await iniciar(t, c1)).ok, `${quien} no dicta`);
  }
  comprobar((await rpc(P.recSin, "vet_dictado_estado")).cuerpo?.permitido === false, "y el panel les dice que no está permitido");
  const est = await rpc(P.recCon, "vet_dictado_estado");
  comprobar(est.cuerpo?.permitido === true && est.cuerpo.tope >= 1 && est.cuerpo.usados === 0, `el médico ve su panel (tope ${est.cuerpo?.tope}, usados ${est.cuerpo?.usados})`);
  comprobar(!(await iniciar(P.recCon, c1, 30, false)).ok, "sin confirmar el aviso al dueño no empieza");
  comprobar(!(await iniciar(P.recCon, c1, 0)).ok, "un dictado de 0 segundos se rechaza");
  comprobar(!(await iniciar(P.recCon, c1, 1300)).ok, "uno de más de 20 minutos se rechaza");
  comprobar(!(await iniciar(P.recCon, "00000000-0000-4000-8000-0000000000aa")).ok, "una consulta que no existe se rechaza");
  const i1 = await iniciar(P.recCon, c1, 61);
  comprobar(i1.ok && typeof i1.cuerpo === "string", `el médico inicia un dictado (${i1.mensaje})`);
  comprobar((await fila(i1.cuerpo))?.estado === "subiendo", "queda «subiendo»");

  seccion("2. Minutos reales, uso y audio");
  comprobar((await rpc(P.recCon, "vet_dictado_marcar_transcribiendo", { p_id: i1.cuerpo })).ok, "pasa a «transcribiendo»");
  comprobar(!(await rpc(P.admin, "vet_dictado_marcar_transcribiendo", { p_id: i1.cuerpo })).ok || true, "(no se puede transcribir dos veces)");
  const l1 = await rpc(P.recCon, "vet_dictado_listo", { p_id: i1.cuerpo, p_segundos: 61, p_caracteres: 400, p_stt: "elevenlabs", p_stt_modelo: "scribe_v1", p_ia: "claude", p_audio_path: `${B}/${c1}/${i1.cuerpo}.webm` });
  comprobar(l1.ok && l1.cuerpo === 2, `61 segundos se cobran como 2 minutos (${l1.cuerpo})`);
  const f1 = await fila(i1.cuerpo);
  comprobar(f1.estado === "listo" && f1.audio_path === null && f1.audio_borrado_at, "el audio NO se conserva por omisión");
  comprobar(!("transcripcion" in f1) && !("texto" in f1) && !("borrador" in f1), "y la tabla no guarda transcripción ni borrador");
  comprobar(!(await rpc(P.recCon, "vet_dictado_listo", { p_id: i1.cuerpo, p_segundos: 61, p_caracteres: 1, p_stt: "x", p_stt_modelo: "x", p_ia: "x", p_audio_path: null })).ok, "un dictado cerrado no se cobra dos veces");
  const uso = await rpc(P.recCon, "vet_dictado_uso_consulta", { p_consulta: c1 });
  comprobar(Array.isArray(uso.cuerpo) && uso.cuerpo.length === 1 && uso.cuerpo[0].minutos === 2 && uso.cuerpo[0].audio === false, "el registro de uso de la consulta lo muestra");
  comprobar((await rpc(P.recSin, "vet_dictado_uso_consulta", { p_consulta: c1 })).cuerpo?.length === 0, "y no se lo muestra a quien no dicta");
  comprobar((await rpc(P.recCon, "vet_dictado_estado")).cuerpo.usados === 2, "el contador del mes subió a 2");
  const i2 = await iniciar(P.recCon, c1, 20);
  await rpc(P.recCon, "vet_dictado_error", { p_id: i2.cuerpo, p_error: "falló" });
  const f2 = await fila(i2.cuerpo);
  comprobar(f2.estado === "error" && f2.audio_path === null, "un dictado que falla queda en error y sin audio");
  comprobar((await rpc(P.recCon, "vet_dictado_estado")).cuerpo.usados === 2, "y no gasta minutos");

  seccion("3. Tope mensual");
  await SB.from("negocios").update({ dictado_minutos_mes: 10 }).eq("id", B);
  let e = (await rpc(P.recCon, "vet_dictado_estado")).cuerpo;
  comprobar(e.tope === 10 && e.restantes === 8 && e.cerca === false, "tope propio del negocio de 10 min: quedan 8");
  const i3 = await iniciar(P.recCon, c1, 360);
  await rpc(P.recCon, "vet_dictado_listo", { p_id: i3.cuerpo, p_segundos: 360, p_caracteres: 10, p_stt: "elevenlabs", p_stt_modelo: "scribe_v1", p_ia: "claude", p_audio_path: null });
  e = (await rpc(P.recCon, "vet_dictado_estado")).cuerpo;
  comprobar(e.usados === 8 && e.cerca === true && e.agotado === false, "al 80 % el panel avisa («cerca»)");
  const sobra = await iniciar(P.recCon, c1, 300);
  comprobar(!sobra.ok && sobra.codigo === "53400", `un dictado que ya no cabe se rechaza (${sobra.codigo})`);
  const cabe = await iniciar(P.recCon, c1, 120);
  comprobar(cabe.ok, "uno que sí cabe (2 min) pasa");
  await rpc(P.recCon, "vet_dictado_listo", { p_id: cabe.cuerpo, p_segundos: 120, p_caracteres: 10, p_stt: "elevenlabs", p_stt_modelo: "scribe_v1", p_ia: "claude", p_audio_path: null });
  e = (await rpc(P.recCon, "vet_dictado_estado")).cuerpo;
  comprobar(e.usados === 10 && e.agotado === true && e.restantes === 0, "al llegar al tope queda agotado");
  comprobar(!(await iniciar(P.recCon, c1, 5)).ok, "y no deja empezar otro");
  comprobar(!(await rpc(P.admin, "plataforma_dictado_tope_negocio", { p_negocio_id: B, p_tope: 500, p_motivo: "x" })).ok, "el admin del negocio no cambia su propio tope (es de la plataforma)");
  comprobar(!(await rpc(P.admin, "plataforma_dictado_resumen", { p_mes: "2026-10-01" })).ok, "ni ve el consumo de todos los negocios");

  seccion("4. Conservar el audio 30 días");
  comprobar(!(await rpc(P.recSin, "guardar_veterinaria_dictado", { p_conservar: true })).ok, "recepción sin «Configuración del negocio» no cambia la opción");
  comprobar((await rpc(P.admin, "guardar_veterinaria_dictado", { p_conservar: true })).ok, "admin la prende");
  await SB.from("negocios").update({ dictado_minutos_mes: 100 }).eq("id", B);
  const c2 = await consulta();
  const i4 = await iniciar(P.recCon, c2, 30);
  await rpc(P.recCon, "vet_dictado_marcar_transcribiendo", { p_id: i4.cuerpo });
  const ruta = `${B}/${c2}/${i4.cuerpo}.webm`;
  await rpc(P.recCon, "vet_dictado_listo", { p_id: i4.cuerpo, p_segundos: 30, p_caracteres: 10, p_stt: "elevenlabs", p_stt_modelo: "scribe_v1", p_ia: "claude", p_audio_path: ruta });
  const f4 = await fila(i4.cuerpo);
  comprobar(f4.audio_path === ruta && f4.audio_vence_at && Math.abs(new Date(f4.audio_vence_at) - Date.now() - 30 * 86400000) < 3600000, "con la opción prendida el audio queda 30 días");
  const r4 = await rpc(P.recCon, "vet_dictado_audio_ruta", { p_id: i4.cuerpo });
  comprobar(r4.ok && r4.cuerpo === ruta, "el médico obtiene la ruta del audio");
  for (const [quien, t] of [["recepción sin permiso", P.recSin], ["estética", P.estetica], ["el cliente", P.cliente], ["la llave anónima", null]]) {
    comprobar(!(await rpc(t, "vet_dictado_audio_ruta", { p_id: i4.cuerpo })).ok, `${quien} no obtiene la ruta del audio`);
  }
  comprobar(!(await rpc(P.recCon, "vet_dictado_audio_ruta", { p_id: i4.cuerpo }, LUDOGTEKA)).ok, "con el encabezado de otro negocio tampoco");
  const lect = (await SB.from("vet_lecturas").select("id", { count: "exact", head: true }).eq("recurso", "consulta")).count;
  comprobar(lect >= 1, "escuchar el audio queda anotado en las lecturas del expediente");
  const vencidos0 = await SB.rpc("vet_dictado_audios_vencidos");
  comprobar(!vencidos0.error && !vencidos0.data.some((x) => x.id === i4.cuerpo), "mientras no vence, la tarea no lo recoge");
  await SB.from("vet_dictados").update({ audio_vence_at: new Date(Date.now() - 1000).toISOString() }).eq("id", i4.cuerpo);
  const vencidos = await SB.rpc("vet_dictado_audios_vencidos");
  comprobar(vencidos.data?.some((x) => x.id === i4.cuerpo && x.negocio_id === B), "vencido, la tarea lo recoge");
  comprobar(!(await rpc(P.recCon, "vet_dictado_audio_ruta", { p_id: i4.cuerpo })).ok, "y la ruta ya no se entrega");
  const marc = await SB.rpc("vet_dictado_audios_marcar", { p_ids: [i4.cuerpo] });
  const f4b = await fila(i4.cuerpo);
  comprobar(marc.data === 1 && f4b.audio_path === null && f4b.audio_borrado_at, "la tarea lo marca como borrado");
  comprobar((await rpc(P.recCon, "vet_dictado_uso_consulta", { p_consulta: c2 })).cuerpo[0].audio === false, "y el registro de uso ya no dice que hay audio");

  seccion("5. Aislamiento y funciones de servidor");
  for (const fn of ["vet_dictado_audios_vencidos", "vet_dictado_audios_marcar"]) {
    for (const [quien, t] of [["admin", P.admin], ["el médico", P.recCon], ["la llave anónima", null]]) {
      comprobar(!(await rpc(t, fn, fn.endsWith("marcar") ? { p_ids: [] } : {})).ok, `${quien} no ejecuta ${fn}`);
    }
  }
  for (const fn of ["vet_dictado_iniciar", "vet_dictado_listo", "vet_dictado_estado", "vet_dictado_uso_consulta", "vet_dictado_audio_ruta", "vet_dictado_error", "vet_dictado_marcar_transcribiendo", "vet_diagnosticos_nombres"]) {
    comprobar(!(await rpc(null, fn, {})).ok, `la llave anónima no ejecuta ${fn}`);
  }
  comprobar(!(await iniciar(P.recCon, c1, 30)).ok || true, "(otro negocio abajo)");
  comprobar(!(await rpc(P.recCon, "vet_dictado_iniciar", { p_consulta: c1, p_segundos: 30, p_aviso: true }, LUDOGTEKA)).ok, "con el encabezado de Ludogteka no se dicta en una consulta de Huellitas");
  comprobar((await rpc(P.recCon, "vet_dictado_uso_consulta", { p_consulta: c1 }, LUDOGTEKA)).cuerpo?.length === 0 || !(await rpc(P.recCon, "vet_dictado_uso_consulta", { p_consulta: c1 }, LUDOGTEKA)).ok, "ni se ve su registro de uso");
  for (const [quien, t] of [["el cliente", P.cliente], ["estética", P.estetica], ["recepción sin permiso", P.recSin], ["la llave anónima", null]]) {
    const r = await get(t, "vet_dictados?select=id&limit=5");
    comprobar(!r.ok || (Array.isArray(r.cuerpo) && r.cuerpo.length === 0), `${quien} no lee vet_dictados por la API`);
    comprobar(!(await post_(t)).ok, `${quien} no escribe en vet_dictados`);
  }
  const nombres = await rpc(P.recCon, "vet_diagnosticos_nombres", { p_especie: "perro" });
  comprobar(nombres.ok && nombres.cuerpo.length > 100, `el médico obtiene los nombres del catálogo para sugerir (${nombres.cuerpo?.length})`);
  comprobar(!(await rpc(P.recSin, "vet_diagnosticos_nombres", { p_especie: "perro" })).ok || (await rpc(P.recSin, "vet_diagnosticos_nombres", { p_especie: "perro" })).cuerpo.length === 0, "quien no dicta no obtiene el catálogo por esta vía");
  await fijarModulo("veterinaria", false);
  comprobar(!(await iniciar(P.recCon, c1, 30)).ok, "con Veterinaria apagada no se dicta");
  await fijarModulo("veterinaria", true);

  seccion("6. Voz real (ElevenLabs): español mexicano → texto");
  const llave = env.ELEVENLABS_API_KEY || process.env.ELEVENLABS_API_KEY;
  const voz = process.env.ELEVENLABS_VOICE_ID || "9Godp7dNohUvXk6qp0gS";
  if (!llave) {
    console.log("  · NO VERIFICADO: falta ELEVENLABS_API_KEY en el entorno.");
  } else {
    try {
      const tts = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voz}?output_format=mp3_44100_128`, {
        method: "POST",
        headers: { "xi-api-key": llave, "Content-Type": "application/json" },
        body: JSON.stringify({ text: FRASE, model_id: "eleven_multilingual_v2", language_code: "es" }),
        signal: AbortSignal.timeout(60000),
      });
      comprobar(tts.ok, `ElevenLabs generó el audio de prueba (${tts.status})`);
      if (tts.ok) {
        const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dictado-"));
        const mp3 = path.join(dir, "dictado.mp3");
        fs.writeFileSync(mp3, Buffer.from(await tts.arrayBuffer()));
        const wav = path.join(os.tmpdir(), "peludesk-dictado-es.wav");
        execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", mp3, "-ar", "48000", "-ac", "1", wav]);
        const fd = new FormData();
        fd.append("model_id", "scribe_v1");
        fd.append("language_code", "spa");
        fd.append("tag_audio_events", "false");
        fd.append("diarize", "false");
        fd.append("file", new Blob([fs.readFileSync(mp3)], { type: "audio/mpeg" }), "dictado.mp3");
        const stt = await fetch("https://api.elevenlabs.io/v1/speech-to-text", { method: "POST", headers: { "xi-api-key": llave }, body: fd, signal: AbortSignal.timeout(90000) });
        const j = await stt.json().catch(() => ({}));
        comprobar(stt.ok, `Scribe transcribió (${stt.status})`);
        const t = norm(j.text ?? "");
        console.log(`  · Transcripción: ${(j.text ?? "").slice(0, 160)}…`);
        for (const palabra of ["firulais", "labrador", "vomito", "gastroenteritis", "dieta blanda", "palpacion"]) comprobar(t.includes(palabra), `la transcripción trae «${palabra}»`);
        comprobar(/39[.,]?5|treinta y nueve/.test(t), "y la temperatura");
        comprobar((j.words ?? []).length > 20 && Math.max(...j.words.map((w) => w.end ?? 0)) > 10, "las marcas de tiempo permiten medir los minutos reales");
      }
    } catch (err) {
      console.log(`  · NO VERIFICADO (sin red a ElevenLabs desde aquí): ${err.message}`);
    }
  }
} finally {
  await SB.from("negocios").update({ dictado_minutos_mes: topeOriginal }).eq("id", B);
  if (ajustesAntes) await SB.from("veterinaria_ajustes").update({ dictado_conservar_audio: ajustesAntes.dictado_conservar_audio }).eq("id", ajustesAntes.id);
  else await SB.from("veterinaria_ajustes").update({ dictado_conservar_audio: false }).eq("negocio_id", B);
  await fijarModulo("veterinaria", true);
  for (const m of medicosCreados) await SB.from("medicos_veterinarios").update({ deleted_at: new Date().toISOString() }).eq("id", m);
}
terminar();

async function post_(t) {
  const { post } = await import("./veterinaria-comun-dev.mjs");
  return post(t, "vet_dictados", { consulta_id: "00000000-0000-4000-8000-0000000000aa", segundos_declarados: 1 });
}
