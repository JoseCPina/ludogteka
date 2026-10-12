// 91 · Agendar y atender una teleconsulta (médico veterinario)
// La sala es REAL (Daily): las cuentas del corredor (demo.mvz) crean salas reales en el demo y el corredor las borra al terminar.
// El dueño del otro lado es un navegador en segundo plano que firma el consentimiento y entra a la llamada.
import { duenoEntra, unirseASala } from "../lib/teleconsulta.mjs";

const horaMx = (d) => new Intl.DateTimeFormat("en-GB", { timeZone: "America/Mexico_City", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);
let duenoP = null;

export default {
  rol: "mvz",
  medios: {},
  inicio: "/veterinaria/agenda",
  gancho: "El dueño no puede venir, pero tu paciente sí necesita verte. Con la teleconsulta lo atiendes por video, desde PeluDesk, y la consulta queda en el mismo expediente.",
  preparar: async ({ sb, negocioId }) => {
    // Una corrida anterior deja su cita viva y el médico no se empalma consigo mismo.
    await sb.from("vet_citas").update({ estado: "cancelada", cancelada_motivo: "Corrida anterior del video", deleted_at: new Date().toISOString() }).eq("negocio_id", negocioId).eq("tipo_clave", "teleconsulta").is("deleted_at", null); // también las ya canceladas: que no ensucien la agenda del video
  },
  escenas: [
    {
      titulo: "Elegir la mascota",
      dice: "En la agenda clínica aprietas «Agendar» y eliges a la mascota. Aquí, Canela. Se abre el formulario de la cita, con el nombre de su dueño.",
      pasos: [["esperar", 1500], ["clic", "Agendar", { nav: true }], ["esperar", 1200], ["clic", "Canela", { nav: true }], ["esperar", 1500]],
    },
    {
      titulo: "Agendar la teleconsulta",
      dice: "En «Tipo de cita» pones «Teleconsulta», eliges al médico y la hora. El motivo es opcional. Aprietas «Agendar cita» y la sala de video se crea sola.",
      pasos: [
        ["mover", 'css:select[name="tipo"]'],
        ["js", async ({ page }) => { await page.locator('select[name="tipo"]').selectOption("teleconsulta"); await page.waitForTimeout(500); }, 1000],
        ["mover", 'css:select[name="medico_id"]'],
        ["js", async ({ page }) => { await page.locator('select[name="medico_id"]').selectOption({ label: "Dr. Emilio Navarro" }); await page.waitForTimeout(500); }, 1000],
        ["mover", 'css:input[name="hora"]'],
        ["js", async ({ page }) => { await page.locator('input[name="hora"]').fill(horaMx(new Date(Date.now() + 6 * 60000))); await page.waitForTimeout(600); }],
        ["escribir", "Motivo (opcional)", "Seguimiento"],
        ["clic", "Agendar cita", { nav: true }],
        ["esperar", 1500],
      ],
    },
    {
      titulo: "La liga del dueño",
      dice: "Te lleva a la pantalla de la teleconsulta. Con «Generar liga para el dueño» sale su enlace: lo copias o lo mandas por WhatsApp. Una liga nueva deja sin efecto la anterior.",
      pasos: [
        ["clic", "Generar liga para el dueño"],
        ["esperar", 1800],
        // El dueño firma y entra en segundo plano mientras sigue la locución (no se espera aquí).
        ["js", async ({ page, base }) => { const liga = await page.locator("input[readonly]").first().inputValue(); duenoP = duenoEntra({ base, liga, entrar: true }); duenoP.catch(() => {}); }],
        ["resaltar", "Liga del dueño", 2800],
      ],
    },
    {
      titulo: "El consentimiento",
      dice: "Mientras el dueño no firme el consentimiento, la sala no abre. Él lo firma en su celular, con el dedo. Cuando firma, ya puedes entrar.",
      pasos: [
        ["resaltar", "Falta el consentimiento", 2400],
        ["js", async ({ page }) => { await duenoP; await page.reload({ waitUntil: "networkidle" }); }],
        ["esperar", 600],
      ],
    },
    {
      titulo: "Entrar a la sala",
      dice: "Aprietas «Entrar a la sala» y la videollamada se abre ahí mismo, sin instalar nada. Entras como moderador: ves al dueño, él te ve a ti, y puedes compartir tu pantalla.",
      pasos: [
        ["clic", "Entrar a la sala"],
        ["desplazar", "2. La sala"],
        ["js", async ({ page }) => { await unirseASala(page); await page.waitForTimeout(5000); }],
        ["esperar", 1500],
      ],
    },
    {
      titulo: "La consulta",
      dice: "Más abajo, «Iniciar la consulta» abre el expediente, marcado como telemedicina. Ahí documentas, dictas si quieres y firmas como cualquier consulta.",
      pasos: [["desplazar", "3. La consulta"], ["resaltar", "Iniciar la consulta", 3000]],
    },
  ],
  resumen: ["Se agenda como cualquier cita y la sala se crea sola.", "El dueño firma el consentimiento y entra con su liga.", "La consulta queda en el mismo expediente, marcada como telemedicina."],
};
