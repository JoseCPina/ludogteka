// 15 · El portal del dueño (recepción → cliente)
export default {
  inicio: "/vinculacion",
  async preparar({ sb, negocioId, tel }) {
    // Un cliente capturado en el mostrador, todavía sin cuenta (ficticio).
    await sb.from("clientes").insert({ negocio_id: negocioId, nombre: "Lucía Mendoza Ibarra", telefono: tel });
  },
  gancho: "Tus clientes tienen su propio portal: ahí ven a sus perros, sus visitas y sus contratos. Veamos qué ven, cómo los invitas y qué hacer si olvidan su contraseña.",
  escenas: [
    {
      titulo: "Vinculación de cuentas",
      dice: "En «Vinculación de cuentas» ves las cuentas que ya están ligadas a un expediente, y las que están «Pendientes de vincular». Cada vinculación da acceso al historial de esa persona, así que se confirma con cuidado.",
      pasos: [["resaltar", "Pendientes de vincular", 2800], ["resaltar", "Cuentas vinculadas", 2800]],
    },
    {
      titulo: "Invitar al portal",
      dice: "Si capturaste al cliente tú mismo, aún no tiene cuenta. En su ficha, en «Invitar al portal», generas un enlace de un solo uso para que escoja su contraseña, y se lo mandas por WhatsApp.",
      pasos: [["ir", "/clientes"], ["escribir", "Buscar por perro, dueño o teléfono", "Lucía Mendoza"], ["esperar", 1500], ["clic", "Lucía Mendoza Ibarra", { nav: true }], ["desplazar", "Invitar al portal"], ["resaltar", "Invitar al portal", 3000]],
    },
    {
      titulo: "Si olvidó su contraseña",
      dice: "Si un dueño olvidó su contraseña, en su ficha, en «Contraseña del portal», aprietas «Restablecer contraseña». Le das la temporal por WhatsApp y él la cambia al entrar.",
      pasos: [["ir", "/clientes"], ["clic", "Ana Sofía Treviño", { nav: true }], ["desplazar", "Contraseña del portal"], ["resaltar", "Restablecer contraseña", 3000]],
    },
  ],
  resumen: ["«Vinculación de cuentas» liga cuentas con expedientes.", "«Invitar al portal» da un enlace de un solo uso al cliente que no tiene cuenta.", "«Restablecer contraseña» le da una temporal por WhatsApp."],
};
