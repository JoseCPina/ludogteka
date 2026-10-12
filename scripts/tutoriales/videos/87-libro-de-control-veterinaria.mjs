// 87 · El libro de control: consultarlo y exportarlo (médico veterinario)
export default {
  rol: "mvz",
  inicio: "/veterinaria/libro-control",
  gancho: "El libro de control de los productos controlados se arma solo, con cada entrada y cada salida. No hay nada que capturar: solo consultarlo y exportarlo cuando te lo pidan.",
  escenas: [
    {
      titulo: "El rango y el producto",
      dice: "Elige la fecha desde y hasta, y si quieres, un solo producto. Después aprieta «Ver».",
      pasos: [["esperar", 1800], ["resaltar", "Desde", 2600], ["resaltar", "Hasta", 2400], ["clic", "Ver", { nav: true }], ["esperar", 2000]],
    },
    {
      titulo: "Entradas, salidas y saldo",
      dice: "Cada renglón es un movimiento: la fecha, el producto, el lote, la entrada o la salida, el folio de la receta, el paciente o el uso hospitalario, y el médico. Al final de cada renglón, el saldo corrido.",
      pasos: [["zoom", "css:main", 1.1, 3400]],
    },
    {
      titulo: "El saldo al inicio",
      dice: "Si eliges un rango que no empieza desde el principio, el libro te dice el saldo con el que empieza ese rango, para que las cuentas siempre cuadren.",
      pasos: [["resaltar", "Ver", 2600]],
    },
    {
      titulo: "PDF y Excel",
      dice: "Con «Imprimir o guardar PDF» sacas la hoja para la revisión, y con «Descargar Excel», el mismo libro para trabajarlo. Cada vez que lo abres queda anotado quién lo consultó.",
      pasos: [["resaltar", "Descargar Excel", 3000]],
    },
  ],
  resumen: ["El libro se arma solo con cada movimiento.", "Cada renglón trae saldo, folio, paciente y médico.", "Se baja en PDF o en Excel."],
};
