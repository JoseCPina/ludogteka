// 27 · Reservas recurrentes (recepción)
export default {
  inicio: "/guarderia/series",
  gancho: "Hay perros que vienen a guardería cada martes y jueves. En vez de reservar cada día, creas una serie recurrente una sola vez.",
  escenas: [
    {
      titulo: "Series recurrentes",
      dice: "En «Series recurrentes» ves las series activas de guardería, con los días y las fechas que generan. El hotel tiene las suyas en su propio menú.",
      pasos: [["resaltar", "Series recurrentes — Guardería", 2800]],
    },
    {
      titulo: "Nueva serie",
      dice: "Aprieta «Nueva serie», escoge al cliente y a su perro, los días de la semana y hasta cuándo se repite. La app genera cada reserva y revisa el cupo de cada fecha.",
      pasos: [["clic", "Nueva serie", { nav: true }], ["esperar", 3500]],
    },
    {
      titulo: "Cambiar o cancelar",
      dice: "Desde la serie puedes cancelar todas las fechas que faltan, o solo algunas. Un día cerrado se marca solo, y si el perro tiene un pase de guardería, se aplica a cada día mientras tenga saldo.",
      pasos: [["ir", "/hotel/series"], ["esperar", 3000]],
    },
  ],
  resumen: ["Una serie genera todas las reservas de golpe.", "La app revisa el cupo de cada fecha y marca los días cerrados.", "Puedes cancelar toda la serie o solo algunas fechas."],
};
