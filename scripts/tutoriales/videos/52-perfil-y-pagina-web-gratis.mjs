// 52 · Perfil y página web (admin)
export default {
  rol: "admin",
  inicio: "/admin/perfil",
  gancho: "Tu negocio puede tener su propia página web sin pagar a nadie: la armas con tu perfil. Mira cómo se activa.",
  escenas: [
    {
      titulo: "El perfil del negocio",
      dice: "En «Perfil del negocio» capturas lo que la gente ve de tu negocio: una descripción, tu dirección, tu horario, tu logo y las fotos.",
      pasos: [["resaltar", "Perfil del negocio", 2400], ["resaltar", "Descripción (opcional)", 2600]],
    },
    {
      titulo: "Logo y fotos",
      dice: "Con «Subir logo» pones tu logo, y con «Agregar foto» las fotos de tu negocio. Con «Guardar datos» quedan guardados los textos.",
      pasos: [["resaltar", "Subir logo", 2600], ["resaltar", "Agregar foto", 2600], ["resaltar", "Guardar datos", 2400]],
    },
    {
      titulo: "Tu página web",
      dice: "Si completas tu perfil en los primeros días, tu página web es gratis. Se arma sola con tu logo, tus fotos, tus precios y tu horario, y el único contacto es tu WhatsApp.",
      pasos: [["resaltar", "Tu página web está incluida", 3200]],
    },
    {
      titulo: "Así se ve",
      dice: "Así se ve la página de tu negocio para tus clientes.",
      pasos: [["ir", "/"], ["esperar", 3500], ["desplazar", 900], ["esperar", 2500]],
    },
  ],
  resumen: ["Capturas tu perfil: descripción, dirección, logo y fotos.", "Tu página web se arma sola con esos datos.", "Si completas tu perfil a tiempo, es gratis."],
};
