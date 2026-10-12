// 75 · Carnet verificable con QR y recordatorios de dosis (admin)
export default {
  rol: "admin",
  inicio: "/veterinaria/recordatorios",
  gancho: "Los dueños se olvidan de la próxima vacuna. PeluDesk les recuerda por WhatsApp, y cada carnet tiene un enlace con QR que cualquiera puede verificar. Así se prende y se usa.",
  escenas: [
    {
      titulo: "Recordatorios por mandar",
      dice: "En «Recordatorios de dosis» salen las vacunas y desparasitaciones que ya les toca a las mascotas. Cada una se manda a mano con un mensaje de WhatsApp ya escrito, y después marcas que ya la mandaste.",
      pasos: [["esperar", 2200], ["zoom", "css:main", 1.1, 3200]],
    },
    {
      titulo: "El envío automático",
      dice: "Si prefieres que salgan solos, en los ajustes de Veterinaria prendes el envío automático por WhatsApp y eliges con cuántos días de anticipación. Sale en horario de atención, y solo una vez por dosis.",
      pasos: [["ir", "/veterinaria/ajustes"], ["resaltar", "Envío automático por WhatsApp", 3000], ["resaltar", "Días de anticipación", 2600]],
    },
    {
      titulo: "El enlace verificable",
      dice: "En el carnet de la mascota, «Generar enlace verificable» crea una página pública con un código QR. Muestra solo la mascota, el dueño y las vacunas vigentes. Por seguridad, el enlace se muestra una sola vez: guárdalo o genera otro.",
      pasos: [["ir", "/veterinaria/carnet"], ["escribir", "Buscar mascota o dueño", "Michi"], ["tecla", "Enter"], ["esperar", 1500], ["clic", "Michi", { nav: true }], ["desplazar", "Generar enlace verificable"], ["resaltar", "Generar enlace verificable", 3000]],
    },
    {
      titulo: "Apagarlo por mascota",
      dice: "Si un dueño no quiere recordatorios, en el carnet de su mascota eliges «Apagar recordatorios de esta mascota». Se pueden volver a prender cuando quiera.",
      pasos: [["resaltar", "Apagar recordatorios de esta mascota", 3000]],
    },
  ],
  resumen: ["Los recordatorios salen a mano o solos, una vez por dosis.", "El enlace con QR muestra solo las vacunas vigentes.", "Cada mascota puede dejar de recibirlos."],
};
