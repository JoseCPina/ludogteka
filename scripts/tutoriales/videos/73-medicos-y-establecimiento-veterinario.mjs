// 73 · Médicos veterinarios, folios y permisos del establecimiento (admin)
export default {
  rol: "admin",
  inicio: "/veterinaria/medicos",
  gancho: "Las recetas y los certificados van a nombre de un médico veterinario con su cédula. Y tu clínica tiene permisos con vencimiento. Aquí se registra todo eso.",
  escenas: [
    {
      titulo: "Tus médicos",
      dice: "Un médico veterinario es una persona de tu equipo con su cédula profesional. En «Médicos» ves a quienes ya están designados, con su cédula y su clave del SITPV.",
      pasos: [["esperar", 1800], ["zoom", "css:main", 1.1, 3200]],
    },
    {
      titulo: "Designar a un médico",
      dice: "Para designar a alguien, elige a la persona de tu equipo, escribe su cédula y, si la tiene, su clave del SITPV, y aprieta «Designar médico». Quién no está en tu equipo se invita antes desde Administración.",
      pasos: [["resaltar", "Designar a un médico", 3000], ["resaltar", "Cédula profesional", 2600]],
    },
    {
      titulo: "Sus folios",
      dice: "Los folios de receta se asignan por bloques: «Asignar folios», con el primer y el último folio. Cada vez que el médico usa uno, el contador baja, y un folio usado nunca se repite.",
      pasos: [["resaltar", "Asignar folios", 3000], ["resaltar", "Folios de receta", 2600]],
    },
    {
      titulo: "El establecimiento",
      dice: "Y en el perfil del negocio capturas el aviso de funcionamiento ante SENASICA, quién es tu médico responsable autorizado, y cada permiso con su fecha de vencimiento.",
      pasos: [["ir", "/admin/perfil"], ["desplazar", "Aviso de Inicio de Funcionamiento"], ["resaltar", "Aviso de Inicio de Funcionamiento", 3200]],
    },
    {
      titulo: "Los avisos",
      dice: "Cuando un permiso está por vencer, o ya venció, te sale un aviso en «Necesita atención», con los días que lleva esperando. Así no se te pasa renovarlo.",
      pasos: [["ir", "/recepcion"], ["esperar", 3000]],
    },
  ],
  resumen: ["Un médico es una persona del equipo con su cédula.", "Los folios se asignan por bloque y nunca se repiten.", "Los permisos del establecimiento avisan antes de vencer."],
};
