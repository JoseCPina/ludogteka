// 90 · Dictar la consulta por voz (médico veterinario)
// El dictado es REAL: el micrófono es un dispositivo falso de Chromium que reproduce un dictado en español (generado una vez con la voz
// de ElevenLabs), ElevenLabs Scribe lo transcribe y Claude arma el borrador. Nada se firma: la consulta se queda en borrador.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { execFileSync } from "node:child_process";

const FRASE =
  "Llega Tigre, un gato de cuatro años, por vómito desde ayer. La dueña dice que ya casi no quiere comer. " +
  "A la exploración la temperatura es de treinta y nueve punto cinco grados y pesa cuatro kilos. " +
  "Mucosas rosadas, deshidratación leve, dolor a la palpación abdominal. " +
  "Mi impresión diagnóstica es gastroenteritis. Plan: dieta blanda, suero subcutáneo y revisión en tres días.";
const WAV = path.join(os.tmpdir(), "peludesk-dictado-tigre.wav");

async function audioDelDictado() {
  if (fs.existsSync(WAV)) return;
  const llave = process.env.ELEVENLABS_API_KEY || fs.readFileSync(".env.local", "utf8").match(/^ELEVENLABS_API_KEY=(.+)$/m)?.[1].trim();
  const voz = process.env.ELEVENLABS_VOICE_ID || fs.readFileSync(".env.local", "utf8").match(/^ELEVENLABS_VOICE_ID=(.+)$/m)?.[1].trim() || "9Godp7dNohUvXk6qp0gS";
  if (!llave) throw new Error("Falta ELEVENLABS_API_KEY para generar el audio del dictado de ejemplo.");
  const r = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voz}?output_format=mp3_44100_128`, {
    method: "POST", headers: { "xi-api-key": llave, "Content-Type": "application/json" },
    body: JSON.stringify({ text: FRASE, model_id: "eleven_multilingual_v2", language_code: "es" }),
  });
  if (!r.ok) throw new Error(`ElevenLabs ${r.status} al generar el dictado de ejemplo`);
  const mp3 = WAV.replace(/\.wav$/, ".mp3");
  fs.writeFileSync(mp3, Buffer.from(await r.arrayBuffer()));
  execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", mp3, "-ar", "48000", "-ac", "1", WAV]);
}

const esperarBorrador = async ({ page }) => {
  await page.getByText("Borrador hecho con IA").waitFor({ timeout: 180000 });
  await page.waitForTimeout(1200);
};

const guion = {
  rol: "mvz",
  medios: { audio: WAV },
  inicio: "/veterinaria/expediente", // se cambia al expediente de Tigre en `preparar`
  gancho: "Escribir la consulta toma tiempo, y a veces tienes las manos ocupadas. Con el dictado por voz hablas, la IA arma un borrador, y tú lo revisas y lo firmas.",
  preparar: async ({ sb, negocioId }) => {
    await audioDelDictado();
    const { data: perros } = await sb.from("perros").select("id").eq("negocio_id", negocioId).eq("nombre", "Tigre").is("deleted_at", null).order("created_at").limit(1);
    if (!perros?.length) throw new Error("No hay una mascota «Tigre» en el demo.");
    guion.inicio = `/veterinaria/expediente/${perros[0].id}`;
  },
  escenas: [
    {
      titulo: "Abrir la consulta",
      dice: "Abres el expediente de la mascota y aprietas «Nueva consulta» y luego «Abrir la consulta». Arriba del formulario está el panel de dictado por voz.",
      pasos: [["esperar", 1800], ["clic", "Nueva consulta"], ["esperar", 900], ["clic", "Abrir la consulta", { nav: true }], ["esperar", 2500], ["resaltar", "Dictado por voz", 2600]],
    },
    {
      titulo: "Antes de grabar",
      dice: "Aprietas «Dictar». Antes de grabar te avisa que tu voz se manda a ElevenLabs y a Anthropic, y que el audio se borra al terminar la transcripción. Marcas que ya le avisaste al dueño y aprietas «Empezar a grabar».",
      pasos: [
        ["clic", "Dictar"],
        ["esperar", 1500],
        ["resaltar", "Antes de grabar", 3200],
        ["marcar", "Ya le avisé al dueño que voy a grabar mi dictado de esta consulta."],
        ["clic", "Empezar a grabar"],
        ["esperar", 1500],
      ],
    },
    {
      titulo: "Hablas con naturalidad",
      dice: "Hablas como en cualquier consulta: el motivo, lo que encuentras en la exploración, los signos vitales, tu impresión y el plan. Cuando terminas, «Detener y transcribir».",
      pasos: [["esperar", 24000], ["clic", "Detener y transcribir"], ["esperar", 1500]],
    },
    {
      titulo: "El borrador",
      dice: "Unos segundos después aparece el borrador que armó la IA, separado en las partes de la consulta. Revisas cada una y marcas lo que quieres pasar al expediente. Los diagnósticos salen solo del catálogo de tu clínica.",
      pasos: [["js", esperarBorrador], ["resaltar", "Borrador hecho con IA", 3200], ["desplazar", "Pasar al expediente"], ["esperar", 1200]],
    },
    {
      titulo: "Pasarlo y firmar",
      dice: "Con «Pasar al expediente» el borrador entra a los campos de la consulta. Lo corriges como quieras y la firmas tú, con tu cédula. Nada se firma solo, y el audio ya no existe.",
      pasos: [["clic", "Pasar al expediente"], ["esperar", 2200], ["resaltar", "Pasado al expediente", 2600]],
    },
  ],
  resumen: ["Hablas y la IA arma un borrador por partes.", "Tú revisas, corriges y firmas con tu cédula.", "El audio se borra al terminar la transcripción."],
};

export default guion;
