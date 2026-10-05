// 08 · Invita a tu equipo (admin)
export default {
  inicio: "/admin",
  gancho: "Tu equipo no necesita compartir tu contraseña. Cada persona entra con su propia cuenta y ve solo lo que le toca. Así los invitas.",
  escenas: [
    {
      titulo: "Invitar personal",
      dice: "En el panel de admin baja a la sección «Invitar personal». Ahí escribes el «Correo» de la persona y escoges su rol: recepción o estética.",
      pasos: [["desplazar", "Invitar personal"], ["resaltar", "Invitar personal", 2400], ["resaltar", "Correo", 2200]],
    },
    {
      titulo: "Los roles",
      dice: "Recepción atiende clientes, reservas y caja. Estética ve su agenda y sus citas. Y quien administra, el admin, ve todo. El rol se escoge aquí, en el campo «Rol».",
      pasos: [["elegir", "Rol", "Recepción"], ["resaltar", "Rol", 2400]],
    },
    {
      titulo: "Mandar la invitación",
      dice: "Aprieta «Invitar». La app te da un enlace para que la persona escoja su contraseña. Cópialo y mándaselo por WhatsApp. Al entrar, solo verá lo que su rol permite.",
      pasos: [["resaltar", "css:button:has-text('Invitar')", 2800]],
    },
    {
      titulo: "La lista de personal",
      dice: "Más abajo, en «Cuentas», ves a todas las personas con acceso y su rol.",
      pasos: [["desplazar", "Cuentas"], ["resaltar", "Cuentas", 2800]],
    },
  ],
  resumen: ["Cada persona tiene su propia cuenta.", "Escoges el rol: recepción o estética.", "Le mandas el enlace por WhatsApp y ella misma escoge su contraseña."],
};
