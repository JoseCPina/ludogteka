// 92 · Cómo entra el dueño a una teleconsulta (lo que ve el dueño con su liga, sin cuenta)
// La sala es REAL (Daily). `preparar` agenda la teleconsulta como el médico (navegador en segundo plano) y deja la liga; el video
// empieza en la liga del dueño. El médico entra a la llamada en segundo plano cuando el dueño ya firmó. Las salas se borran al terminar.
import { agendarTeleconsulta, medicoYaEntra, unirseASala } from "../lib/teleconsulta.mjs";

const BASE = "http://patitasyco.localhost:3001";
let preparada = null;

const guion = {
  sinSesion: true,
  medios: {},
  inicio: "/t/pendiente", // se cambia a la liga real en `preparar`
  gancho: "Tu dueño no necesita una cuenta ni instalar nada para la teleconsulta. Recibe una liga, firma un consentimiento y entra a la videollamada desde su celular.",
  preparar: async ({ sb, negocioId }) => {
    await sb.from("vet_citas").update({ estado: "cancelada", cancelada_motivo: "Corrida anterior del video", deleted_at: new Date().toISOString() }).eq("negocio_id", negocioId).eq("tipo_clave", "teleconsulta").is("deleted_at", null); // también las ya canceladas: que no ensucien la agenda del video
    const { data: perros } = await sb.from("perros").select("id").eq("negocio_id", negocioId).eq("nombre", "Canela").is("deleted_at", null).order("created_at").limit(1);
    if (!perros?.length) throw new Error("No hay una mascota «Canela» en el demo.");
    preparada = await agendarTeleconsulta({ base: BASE, perroId: perros[0].id, minutos: 6, motivo: "Seguimiento" });
    guion.inicio = preparada.liga; // el corredor lee `inicio` después de `preparar`
  },
  escenas: [
    {
      titulo: "La liga",
      dice: "El dueño recibe un mensaje de WhatsApp con su liga. Al abrirla ve su teleconsulta: con qué médico es, cuándo, y de qué mascota. No necesita cuenta.",
      pasos: [["esperar", 2600], ["resaltar", "Firma el consentimiento", 2600]],
    },
    {
      titulo: "Firma el consentimiento",
      dice: "Primero lee el consentimiento y marca que está de acuerdo. Confirma su nombre y firma con el dedo en el recuadro. Después aprieta «Firmar el consentimiento».",
      pasos: [
        ["marcar", "Leí el consentimiento y estoy de acuerdo."],
        ["resaltar", "Tu nombre completo", 1800],
        ["desplazar", "Recuadro de firma"],
        ["js", async ({ page }) => {
          const caja = await page.locator('canvas[aria-label="Recuadro de firma"]').boundingBox();
          await page.mouse.move(caja.x + 30, caja.y + 50);
          await page.mouse.down();
          for (let i = 1; i <= 24; i++) await page.mouse.move(caja.x + 30 + i * 9, caja.y + 50 + Math.sin(i / 2) * 28, { steps: 2 });
          await page.mouse.up();
          await page.waitForTimeout(600);
        }],
        ["clic", "Firmar el consentimiento"],
        ["esperar", 2200],
      ],
    },
    {
      titulo: "Entrar a la videollamada",
      dice: "Cuando firma, aparece «Entrar a la videollamada». La sala se abre ahí mismo, y el navegador le pide permiso para la cámara y el micrófono. Y ya está con su médico.",
      pasos: [
        ["js", async () => { await medicoYaEntra(preparada.med, preparada.ruta, BASE); }],
        ["clic", "Entrar a la videollamada"],
        ["js", async ({ page }) => { await unirseASala(page); await page.waitForTimeout(6000); }],
        ["esperar", 2500],
      ],
    },
    {
      titulo: "Solo en su horario",
      dice: "La sala solo abre en el horario de la cita: unos minutos antes y un rato después. Y si la clínica cobra la teleconsulta por adelantado, la liga también trae el pago, y la sala abre cuando está pagada.",
      pasos: [["esperar", 3200]],
    },
  ],
  resumen: ["Basta una liga: sin cuenta y sin instalar nada.", "Firma el consentimiento con el dedo.", "Entra a la videollamada desde su celular."],
};

export default guion;
