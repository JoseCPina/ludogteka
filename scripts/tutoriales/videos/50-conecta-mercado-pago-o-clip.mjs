// 50 · Conecta Mercado Pago o Clip (admin)
export default {
  rol: "admin",
  inicio: "/admin/pagos",
  gancho: "Para que el cobro con terminal se registre solo, conectas la cuenta de tu negocio una vez. Y si prefieres, cobras todo a mano.",
  escenas: [
    {
      titulo: "Con qué cobras",
      dice: "En «Cobro con terminal» escoges «¿Con qué cobras en el mostrador?». Puedes elegir Mercado Pago, con su terminal y sus links de pago, Clip con su terminal, o «Solo manual».",
      pasos: [["resaltar", "¿Con qué cobras en el mostrador?", 3000], ["resaltar", "Solo manual", 2400]],
    },
    {
      titulo: "Mercado Pago",
      dice: "Con «Conectar Mercado Pago» autorizas tu propia cuenta: el dinero entra directo a ella, nunca a la de PeluDesk. Conectas una sola cuenta por negocio, y puedes desconectarla cuando quieras.",
      pasos: [["resaltar", "Conectar Mercado Pago", 3200]],
    },
    {
      titulo: "La terminal",
      dice: "Después das de alta tu terminal. PeluDesk funciona con la Point Smart de Mercado Pago. Si tienes otro modelo, la pantalla te dice que no es compatible, y puedes seguir cobrando a mano.",
      pasos: [["esperar", 3500]],
    },
    {
      titulo: "El cobro a mano siempre existe",
      dice: "Pase lo que pase, el cobro manual siempre está disponible: efectivo, terminal o transferencia, capturados por ti. Y la comisión del cobro se registra sola como un gasto.",
      pasos: [["esperar", 3000]],
    },
  ],
  resumen: ["Escoges Mercado Pago, Clip o solo manual.", "El dinero entra directo a tu cuenta.", "El cobro a mano siempre está disponible."],
};
