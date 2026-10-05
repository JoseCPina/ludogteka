// 51 · Políticas y reglas (admin)
export default {
  rol: "admin",
  inicio: "/admin/politicas",
  gancho: "Tus reglas son tuyas: cancelaciones, evaluación, recolección. Las escribes una sola vez y PeluDesk las muestra a tus clientes donde toca.",
  escenas: [
    {
      titulo: "Políticas y reglas",
      dice: "En «Políticas y reglas» están los textos que se le dicen al dueño del perro en el alta por link, en su portal y en los mensajes: «Evaluación de comportamiento», «Perras en celo o gestantes», «Perros agresivos o con alertas» y más.",
      pasos: [["resaltar", "Evaluación de comportamiento", 3000], ["zoom", "css:main", 1.15, 3500]],
    },
    {
      titulo: "Escribe lo tuyo",
      dice: "Cada campo trae un texto neutro, que solo dice lo que la app hace igual para todos. Tú escribes lo propio de tu negocio: «Cancelaciones y anticipos», cómo se reserva, o cómo se agenda una cita de estética.",
      pasos: [["desplazar", "Cancelaciones y anticipos"], ["resaltar", "Cancelaciones y anticipos", 3200], ["resaltar", "Recolección a domicilio", 2600]],
    },
    {
      titulo: "Guardar",
      dice: "Con «Guardar políticas» quedan guardadas. Lo que dejes vacío no se menciona. Y si no usas hotel o recolección, esas reglas ni aparecen en el alta de tus clientes.",
      pasos: [["resaltar", "Guardar políticas", 3000]],
    },
  ],
  resumen: ["Escribes tus reglas una sola vez.", "Salen en el alta, el portal y los mensajes donde toca.", "Lo que dejas vacío no se menciona."],
};
