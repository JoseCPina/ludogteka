// 03 · Entrar a PeluDesk y la contraseña (sin sesión)
export default {
  sinSesion: true,
  permitirRutas: ["/login", "/auth/"],
  inicio: "/login",
  gancho: "Para entrar a PeluDesk solo necesitas tu teléfono o tu correo y tu contraseña. Y si la olvidas, no pasa nada: te mostramos qué hacer.",
  escenas: [
    {
      titulo: "La pantalla de entrada",
      dice: "Esta es la pantalla de entrada de tu negocio, con su nombre arriba. Arriba escoges quién eres: «Soy cliente», con tu teléfono a diez dígitos, o «Soy del equipo», con tu correo o tu teléfono.",
      pasos: [["resaltar", "Soy cliente", 2000], ["clic", "Soy del equipo"], ["resaltar", "Teléfono o correo", 2200]],
    },
    {
      titulo: "Escribe tus datos",
      dice: "Escribes tu teléfono o tu correo, y luego tu contraseña. Si lo prefieres, puedes mostrar la contraseña para revisar lo que escribiste. Después aprietas «Entrar».",
      pasos: [["escribir", "Teléfono o correo", "442 000 0000"], ["escribir", "Contraseña", "mi-contrasena"], ["resaltar", "Entrar", 2200]],
    },
    {
      titulo: "Si olvidaste tu contraseña",
      dice: "Si la olvidaste, aprieta «¿Olvidaste tu contraseña?». Si eres cliente, recepción te la restablece en el momento y te da una temporal. Si eres del equipo, un admin de tu negocio te la restablece desde Empleados.",
      pasos: [["clic", "¿Olvidaste tu contraseña?"], ["esperar", 3200]],
    },
  ],
  resumen: ["Escoges «Soy cliente» o «Soy del equipo» y entras con tu teléfono o tu correo y tu contraseña.", "Puedes mostrar la contraseña para revisar lo que escribiste.", "Si la olvidas, «¿Olvidaste tu contraseña?» te dice cómo recuperarla."],
};
