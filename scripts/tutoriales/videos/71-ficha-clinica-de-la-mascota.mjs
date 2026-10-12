// 71 · La ficha clínica de la mascota (médico veterinario)
const MASCOTA = { id: null };

export default {
  rol: "admin",
  async preparar({ sb, negocioId }) {
    const { data } = await sb.from("perros").select("id").eq("negocio_id", negocioId).eq("nombre", "Tigre").is("deleted_at", null).limit(1);
    MASCOTA.id = data?.[0]?.id ?? null;
    if (!MASCOTA.id) throw new Error("Falta la mascota Tigre en el demo (scripts/demo/sembrar-veterinaria.mjs).");
  },
  inicio: "/clientes",
  gancho: "Además de sus datos de siempre, cada mascota tiene una ficha clínica: especie, microchip, folio de registro, notas del médico y su peso. Así se llena.",
  escenas: [
    {
      titulo: "Abre la mascota",
      dice: "Busca al dueño en Clientes, abre su ficha y desde ahí, a la mascota.",
      pasos: [["escribir", "css:main input", "Tigre"], ["esperar", 1500], ["js", async ({ page, base }) => { await page.goto(`${base}/perros/${MASCOTA.id}`, { waitUntil: "networkidle" }); }], ["esperar", 1500]],
    },
    {
      titulo: "La ficha clínica",
      dice: "En «Ficha clínica» eliges la especie: perro, gato u otra. Si es otra, escribes cuál. Ves también el peso actual, con su historial, y las alergias.",
      pasos: [["desplazar", "Ficha clínica"], ["resaltar", "Especie", 3000]],
    },
    {
      titulo: "Microchip y folio",
      dice: "Escribe el microchip, de nueve a veinte letras o números, y el folio de registro, por ejemplo el del RUAC. Un microchip no se puede repetir en otra mascota.",
      pasos: [["escribir", "Microchip", "985112345678903"], ["escribir", "Folio de registro", "RUAC-0457"]],
    },
    {
      titulo: "Notas clínicas",
      dice: "Las notas clínicas son internas del negocio: el dueño no las ve. Anótalas, y aprieta «Guardar ficha clínica».",
      pasos: [["escribir", "Notas clínicas", "Tolera bien la manipulación. Sin antecedentes de cirugía."], ["clic", "Guardar ficha clínica"], ["esperar", 1800]],
    },
  ],
  resumen: ["La ficha clínica lleva especie, microchip y folio de registro.", "Las notas clínicas son internas: el dueño no las ve.", "El peso y las alergias se ven ahí mismo."],
};
