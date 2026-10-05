// 34 · Cobra con terminal o link de pago (recepción)
export default {
  inicio: "/caja",
  gancho: "Si cobras con terminal o por link de pago, no tienes que capturar nada a mano: el cobro se registra solo en cuanto el cliente paga.",
  escenas: [
    {
      titulo: "Entra a la cuenta",
      dice: "Abre la cuenta que vas a cobrar desde «Caja». Junto al cobro manual, hay una sección para cobrar con Mercado Pago o con Clip, según lo que conectó tu negocio.",
      pasos: [["clic", "css:a[href^='/caja/cobrar/']", { nav: true }], ["desplazar", "Cobrar con terminal"], ["resaltar", "Cobrar con terminal", 3000]],
    },
    {
      titulo: "Cobrar con terminal",
      dice: "Con «Cobrar con terminal», el monto aparece en tu terminal. El cliente pasa su tarjeta, y cuando el pago se aprueba, el cobro se registra solo con su método y su comisión. En este negocio de ejemplo se simula: no mueve dinero.",
      pasos: [["esperar", 3500]],
    },
    {
      titulo: "Mandar link de pago",
      dice: "Con «Mandar link de pago» generas un enlace y lo mandas por WhatsApp. El cliente paga desde su celular, y el cobro entra solo. Sirve para clientes que ya se fueron.",
      pasos: [["resaltar", "Mandar link de pago", 3200]],
    },
    {
      titulo: "Si la terminal no responde",
      dice: "Si la terminal no recibe el cobro, revisa que esté encendida y con internet, y vuelve a intentar. Nunca registres a mano un cobro que sí pasó por la terminal: se duplicaría.",
      pasos: [["esperar", 3500]],
    },
  ],
  resumen: ["La terminal y el link registran el cobro solos.", "No captures a mano lo que ya pasó por la terminal.", "El link sirve para clientes que ya se fueron."],
};
