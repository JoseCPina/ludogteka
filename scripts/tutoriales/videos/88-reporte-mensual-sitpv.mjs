// 88 · El reporte mensual del SITPV (médico veterinario)
export default {
  rol: "mvz",
  inicio: "/veterinaria/recetas/sitpv",
  gancho: "Cada mes, el médico reporta en el SITPV los folios que usó. PeluDesk te arma el reporte, con todo lo que necesitas capturar, y te avisa si se te pasa.",
  escenas: [
    {
      titulo: "El mes pendiente",
      dice: "En «Registro SITPV» te sale el mes que tienes pendiente. Si se acerca el día, aparece un aviso en el tablero, que sube de tono si ya pasó.",
      pasos: [["esperar", 2200], ["clic", "Ver el reporte de este mes", { nav: true }], ["esperar", 1500]],
    },
    {
      titulo: "Lo que hay que reportar",
      dice: "El reporte junta los folios usados, los folios cancelados en ceros con su observación, las parcialidades con el paciente o el uso hospitalario y la fecha, y los pacientes.",
      pasos: [["resaltar", "Folios usados", 2600], ["resaltar", "Folios cancelados, en ceros", 3200], ["resaltar", "Parcialidades", 2600]],
    },
    {
      titulo: "Capturarlo en el SITPV",
      dice: "Con el reporte a la mano, lo capturas en el SITPV. Si quieres, «Imprimir o guardar PDF» para tenerlo.",
      pasos: [["resaltar", "Imprimir o guardar PDF", 2800]],
    },
    {
      titulo: "Marcarlo como reportado",
      dice: "Y al terminar el mes, ahí mismo aparece el botón para marcarlo como reportado. Queda guardado quién lo marcó y cuándo, y el aviso se va. Solo se marcan los meses ya terminados.",
      pasos: [["resaltar", "Pacientes", 3000]],
    },
  ],
  resumen: ["PeluDesk arma el reporte mensual del SITPV.", "Los folios cancelados salen en ceros, con su observación.", "Al reportarlo, queda quién lo marcó y cuándo."],
};
