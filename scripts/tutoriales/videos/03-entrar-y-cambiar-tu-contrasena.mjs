// 03 · Entrar a PeluDesk y la contraseña (sin sesión)
export default {
  sinSesion: true,
  permitirRutas: ["/login", "/auth/"],
  inicio: "/login",
  gancho: "Para entrar a PeluDesk solo necesitas tu teléfono o tu correo y tu contraseña. Y si la olvidas, no pasa nada: te mostramos qué hacer.",
  escenas: [
    {
      titulo: "La pantalla de entrada",
      dice: "Esta es la pantalla de entrada de tu negocio, con su nombre arriba. Hay un solo campo para el «Teléfono o correo»: los dueños de perros entran con su teléfono a diez dígitos y el equipo con su correo.",
      pasos: [["resaltar", "Teléfono o correo", 2800]],
    },
    {
      titulo: "Escribe tus datos",
      dice: "Escribes tu teléfono o tu correo, y luego tu contraseña. Si lo prefieres, puedes mostrar la contraseña para revisar lo que escribiste. Después aprietas «Entrar».",
      pasos: [["escribir", "Teléfono o correo", "442 000 0000"], ["escribir", "Contraseña", "mi-contrasena"], ["resaltar", "Entrar", 2200]],
    },
    {
      titulo: "Si olvidaste tu contraseña",
      dice: "Si la olvidaste, aprieta «¿Olvidaste tu contraseña?» y sigue las instrucciones. En un negocio, quien administra puede restablecerla desde la ficha de cada persona, y te llega un enlace para escoger una nueva.",
      pasos: [["clic", "¿Olvidaste tu contraseña?"], ["esperar", 3200]],
    },
  ],
  resumen: ["Entras con tu teléfono o tu correo y tu contraseña.", "Puedes mostrar la contraseña para revisar lo que escribiste.", "Si la olvidas, «¿Olvidaste tu contraseña?» te dice cómo recuperarla."],
};
