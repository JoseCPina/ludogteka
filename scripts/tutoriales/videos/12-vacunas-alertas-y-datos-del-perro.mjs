// 12 · Expediente del perro (recepción)
export default {
  inicio: "/clientes",
  gancho: "Todo lo que necesitas saber de un perro antes de recibirlo vive en su expediente: vacunas, alertas, alergias y medicamentos.",
  escenas: [
    {
      titulo: "Abre su expediente",
      dice: "Busca al cliente, abre su ficha y toca al perro. Ese es su expediente. Arriba están sus datos, y puedes corregirlos con «Guardar cambios».",
      pasos: [["escribir", "Buscar por perro, dueño o teléfono", "Nube"], ["esperar", 1500], ["clic", "Ana Sofía Treviño", { nav: true }], ["clic", "Nube", { nav: true }]],
    },
    {
      titulo: "Requisitos para guardería y hotel",
      dice: "En «Requisitos para guardería y hotel» ves qué le falta para poder reservar: evaluación de comportamiento, vacunas, y los datos que pide el alta. Si algo falta, la app no deja reservarle.",
      pasos: [["desplazar", "Requisitos para guardería y hotel"], ["zoom", "Requisitos para guardería y hotel", 1.35, 3800]],
    },
    {
      titulo: "Vacunas",
      dice: "En «Requisitos sanitarios» registras cada vacuna con su fecha, y si tienes la foto del carnet, la agregas con «Elegir foto». Al terminar, aprieta «Registrar aplicación». La vigencia se calcula sola.",
      pasos: [["desplazar", "Requisitos sanitarios"], ["zoom", "Requisitos sanitarios", 1.35, 3800], ["resaltar", "Registrar aplicación", 2400]],
    },
    {
      titulo: "Peso, alertas y alergias",
      dice: "Más abajo registras el «Peso», las «Alertas de manejo» —como si el perro está en celo— y sus «Alergias». Las alertas importantes salen en el check-in para que nadie las pase por alto.",
      pasos: [["desplazar", "Peso"], ["resaltar", "Registrar peso", 2200], ["desplazar", "Alertas de manejo"], ["resaltar", "Registrar alerta", 2200], ["resaltar", "Registrar alergia", 2200]],
    },
    {
      titulo: "Bitácora y medicamentos",
      dice: "Y en «Medicamentos» llevas el régimen de cada perro, con sus dosis. La «Bitácora» guarda las fotos y notas del día.",
      pasos: [["desplazar", "Medicamentos"], ["resaltar", "Agregar medicamento", 2600]],
    },
  ],
  resumen: ["El expediente junta datos, vacunas, alertas, alergias y medicamentos.", "Si le falta algo, la app te dice qué antes de reservar.", "Las alertas importantes salen en el check-in."],
};
