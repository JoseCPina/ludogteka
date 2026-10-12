// 76 · Cómo emitir un certificado de salud (médico veterinario)
export default {
  rol: "mvz",
  inicio: "/veterinaria/carnet",
  gancho: "Para un viaje o un hospedaje, el dueño te pide un certificado de salud. Sale a nombre de tu médico, con las vacunas vigentes de la mascota. Así se emite.",
  escenas: [
    {
      titulo: "Desde el carnet",
      dice: "Abre el carnet de la mascota y aprieta «Emitir certificado de salud».",
      pasos: [["escribir", "Buscar mascota o dueño", "Michi"], ["tecla", "Enter"], ["esperar", 1500], ["clic", "Michi", { nav: true }], ["clic", "Emitir certificado de salud", { nav: true }], ["esperar", 1500]],
    },
    {
      titulo: "Los datos",
      dice: "Elige el médico que firma, para qué es el certificado y el destino, si lo hay. Escribe la exploración física y, si quieres, observaciones y cuántos días vale.",
      pasos: [["elegir", "Para qué es", 1], ["escribir", "Destino (opcional)", "Guadalajara, Jal."], ["escribir", "Exploración física", "Buen estado general, mucosas rosadas, sin signos de enfermedad."]],
    },
    {
      titulo: "Emitirlo",
      dice: "Aprieta «Emitir certificado». Queda con las vacunas y desparasitaciones vigentes de ese día, con tu nombre y tu cédula, y se imprime o se guarda en PDF para firmarlo.",
      pasos: [["clic", "Emitir certificado", { nav: true }], ["esperar", 2400]],
    },
    {
      titulo: "Anularlo",
      dice: "Un certificado no se edita ni se borra. Si hubo un error, se anula con motivo y se emite otro. En «Certificados de salud» ves todos, con su vigencia.",
      pasos: [["ir", "/veterinaria/certificados"], ["esperar", 2500]],
    },
  ],
  resumen: ["El certificado sale a nombre del médico con su cédula.", "Guarda las vacunas vigentes del día en que se emitió.", "Se anula con motivo; no se edita."],
};
