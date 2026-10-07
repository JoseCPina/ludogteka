// 33 · Cobra una cuenta (recepción)
export default {
  inicio: "/caja",
  gancho: "Cobrar no debería tomarte más de un minuto. Escoges la cuenta, el método de pago y listo: la app suma todo y lleva el saldo por ti.",
  escenas: [
    {
      titulo: "Cuentas abiertas",
      dice: "En «Caja» aparecen las «Cuentas abiertas de hoy», con el cliente, el perro, el servicio y cuánto falta por cobrar. Si buscas a otro cliente, usa el buscador. Si una persona tiene varias cuentas, salen juntas y se cobran de una vez; eso lo ves en otro video. Toca la cuenta que vas a cobrar.",
      pasos: [["resaltar", "Cuentas abiertas de hoy", 2800], ["clic", "css:a[href^='/caja/cobrar/']", { nav: true }]],
    },
    {
      titulo: "La cuenta",
      dice: "Arriba ves todo lo que se está cobrando, con su precio, y el «Saldo». Más abajo están los descuentos y las formas de cobrar.",
      pasos: [["zoom", "Total cuenta", 1.4, 3500]],
    },
    {
      titulo: "Registrar el cobro",
      dice: "En «Registrar cobro» escoges el «Método»: efectivo, transferencia o «Tarjeta (registro manual)», y el «Monto». Puedes agregar una propina, y si el cliente paga con dos métodos, usa «+ Repartir en otro método».",
      pasos: [["elegir", "Método", "Efectivo"], ["escribir", "Monto", "500"], ["resaltar", "Propina", 2400], ["resaltar", "+ Repartir en otro método", 2400]],
    },
    {
      titulo: "Confirmar",
      dice: "Aprieta «Registrar cobro». El cobro queda en el turno abierto y la cuenta se marca como pagada. Si todavía hay saldo, la cuenta sigue abierta.",
      pasos: [["clic", "css:button:has-text('Registrar cobro') >> nth=-1"], ["esperar", 3500]],
    },
  ],
  resumen: ["«Cuentas abiertas de hoy» lista lo que falta por cobrar.", "Escoges el método, y puedes repartir el pago entre varios.", "El cobro queda en el turno abierto."],
};
