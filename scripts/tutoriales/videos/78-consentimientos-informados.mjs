// 78 · Consentimientos informados (médico veterinario)
export default {
  rol: "mvz",
  inicio: "/veterinaria/hospitalizacion",
  gancho: "Antes de una cirugía, una anestesia o una eutanasia, el propietario tiene que dar su consentimiento por escrito. En PeluDesk lo firma en pantalla, y queda guardado en PDF.",
  escenas: [
    {
      titulo: "Crear un consentimiento",
      dice: "Dentro de una hospitalización, aprieta «Crear un consentimiento». Elige el tipo, el procedimiento si es cirugía o anestesia, y el médico responsable. Después, «Crear y firmar».",
      pasos: [["clic", "Tigre", { nav: true }], ["clic", "Crear un consentimiento"], ["resaltar", "Médico responsable", 2800]],
    },
    {
      titulo: "La firma en pantalla",
      dice: "Lee el texto con el propietario. Él dibuja su firma en la pantalla y tú confirmas. El documento se guarda en PDF con la fecha, la IP y una huella que prueba que no cambió.",
      pasos: [["esperar", 3000]],
    },
    {
      titulo: "Lo firmado no se cambia",
      dice: "Un consentimiento firmado no se modifica ni se cancela. Si el procedimiento cambia, se crea otro. En «Consentimientos» ves los que faltan por firmar, y te avisamos si alguno sigue pendiente.",
      pasos: [["ir", "/veterinaria/consentimientos"], ["esperar", 2500]],
    },
    {
      titulo: "Los textos del negocio",
      dice: "Los textos son base, neutros. Un admin los adapta a tu clínica y se guardan como versión nueva: los consentimientos ya firmados conservan el texto con el que se firmaron.",
      pasos: [["resaltar", "Plantillas del negocio", 3200]],
    },
  ],
  resumen: ["El propietario firma en pantalla y queda un PDF.", "Lo firmado no se edita ni se cancela.", "Los textos se adaptan a tu clínica, por versiones."],
};
