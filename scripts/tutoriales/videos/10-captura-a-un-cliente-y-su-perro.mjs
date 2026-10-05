// 10 · Captura a un cliente y a su perro en el mostrador (recepción)
export default {
  inicio: "/clientes",
  gancho: "El dueño está frente a ti con su perro en brazos. No le vas a pedir que llene un formulario en su celular: lo capturas tú, en menos de dos minutos.",
  escenas: [
    {
      titulo: "Capturar a mano",
      dice: "En «Clientes» aprieta «Capturar a mano». Esta lista también te sirve para buscar a cualquier cliente por el nombre del perro, del dueño o por su teléfono.",
      pasos: [["resaltar", "Buscar por perro, dueño o teléfono", 2400], ["clic", "Capturar a mano", { nav: true }]],
    },
    {
      titulo: "Los datos del dueño",
      dice: "Escribe el «Nombre del dueño» y su «Teléfono». El correo y la dirección son opcionales. El teléfono no se puede repetir: así nunca se duplica un cliente.",
      pasos: [["escribir", "Nombre del dueño", "Mariana López Prieto"], ["escribir", "Teléfono", "{tel}"], ["resaltar", "Correo (opcional)", 2200]],
    },
    {
      titulo: "Crear el cliente",
      dice: "Aprieta «Crear cliente». Se abre su ficha, donde después vas a ver sus perros, sus contratos y su historial.",
      pasos: [["clic", "Crear cliente", { nav: true }], ["esperar", 2000]],
    },
    {
      titulo: "Agregar a su perro",
      dice: "En la ficha aprieta «Agregar perro». Escribe el «Nombre del perro», y en «Raza» empieza a escribir: la app te sugiere las razas del catálogo y tú escoges una.",
      pasos: [["clic", "Agregar perro", { nav: true }], ["escribir", "Nombre del perro", "Canela"], ["escribir", "Raza", "Labrador"], ["clic", "css:[role=option] button"]],
    },
    {
      titulo: "Tamaño y pelaje",
      dice: "Escoge el «Tamaño» y el «Pelaje». Con eso, la estética ya puede cotizar el baño. Lo demás lo puedes llenar después, en su expediente.",
      pasos: [["elegir", "Tamaño", "Grande"], ["elegir", "Pelaje", "Corto"], ["resaltar", "Veterinario", 2200]],
    },
    {
      titulo: "Guardar al perro",
      dice: "Aprieta «Guardar perro» y listo: el cliente y su perro ya están registrados.",
      pasos: [["clic", "Guardar perro", { nav: true }], ["esperar", 2500]],
    },
  ],
  resumen: ["En «Clientes» → «Capturar a mano» das de alta al dueño.", "Con «Agregar perro» registras a su perro: nombre, raza, tamaño y pelaje.", "El teléfono no se repite, así que nunca hay clientes duplicados."],
};
