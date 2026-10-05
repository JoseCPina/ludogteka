// 14 · Una raza que no aparece en el catálogo (admin)
export default {
  inicio: "/perros/razas",
  async preparar({ sb, negocioId }) {
    // Dos perros con una raza escrita a mano (ficticia), para que haya algo que normalizar.
    const { data: ya } = await sb.from("perros").select("id").eq("negocio_id", negocioId).eq("raza", "Calupoh").is("deleted_at", null).limit(1);
    if (ya?.length) return;
    const { data: c } = await sb.from("clientes").select("id").eq("negocio_id", negocioId).is("deleted_at", null).limit(1).single();
    for (const nombre of ["Tuna", "Canelo"]) await sb.from("perros").insert({ cliente_id: c.id, nombre, raza: "Calupoh", raza_id: null });
  },
  rol: "admin",
  gancho: "Un cliente llega con un perro de una raza rara y no la encuentras en la lista. No pasa nada: aquí te enseño qué hacer, sin adivinar su precio.",
  escenas: [
    {
      titulo: "Razas sin catalogar",
      dice: "En «Razas sin catalogar» aparecen los perros cuya raza se escribió a mano. La app los junta por cómo se escribe, sin importar mayúsculas ni acentos, y te dice cuántos perros tiene cada texto.",
      pasos: [["resaltar", "Textos de raza fuera del catálogo", 2800], ["zoom", "css:main", 1.15, 3500]],
    },
    {
      titulo: "Es esta raza",
      dice: "Si la raza sí existe en el catálogo, escoge «Es esta raza» y todos los perros con ese texto se corrigen de una vez. La app nunca junta nada sola: tú decides.",
      pasos: [["resaltar", "Es esta raza", 3200]],
    },
    {
      titulo: "Una raza nueva",
      dice: "Si de verdad es una raza nueva, la propones desde el formulario del perro con «No la encuentro: agregar esta raza». PeluDesk la revisa y la agrega al catálogo.",
      pasos: [["ir", "/perros/razas/grupos"], ["resaltar", "Razas sin grupo de precio", 3000]],
    },
    {
      titulo: "El grupo de precio",
      dice: "Cuando la raza ya está en el catálogo, tu negocio decide su grupo de precio en «Razas sin grupo de precio». Mientras no lo decidas, el perro de pelo medio o largo no tiene precio automático: nunca se adivina.",
      pasos: [["esperar", 3500]],
    },
  ],
  resumen: ["«Razas sin catalogar» junta los textos escritos a mano.", "«Es esta raza» corrige a todos los perros con ese texto de una vez.", "El grupo de precio lo decide tu negocio, nunca se adivina."],
};
