// 70 · Veterinaria: qué incluye y cómo prenderla (admin)
export default {
  rol: "admin",
  inicio: "/admin/modulos",
  gancho: "Si tu negocio también atiende mascotas como clínica, PeluDesk trae el módulo de Veterinaria: agenda, expediente, carnet, recetas y más. Veamos cómo se prende y qué incluye.",
  escenas: [
    {
      titulo: "Prender el módulo",
      dice: "En «Módulos y plan» está Veterinaria, junto a los demás servicios. Se prende con un botón, y necesita que Inventario esté prendido. Apagarlo nunca borra nada: si lo vuelves a prender, todo sigue ahí.",
      pasos: [["resaltar", "Veterinaria", 3200]],
    },
    {
      titulo: "El inicio de Veterinaria",
      dice: "Al prenderlo aparece «Veterinaria» en el menú. Su inicio junta todo lo clínico en tarjetas: la agenda, el expediente, los carnets, el inventario clínico, las recetas y más.",
      pasos: [["ir", "/veterinaria"], ["esperar", 1500], ["zoom", "Agenda clínica", 1.4, 3200]],
    },
    {
      titulo: "Lo que ya incluye",
      dice: "Hoy trae el expediente por consulta, el carnet de vacunas, certificados de salud, hospitalización, consentimientos informados, estimados que el dueño acepta, recetas con el candado de controlados y el reporte mensual del SITPV.",
      pasos: [["desplazar", "Recetas y controlados"], ["resaltar", "Recetas y controlados", 3000]],
    },
    {
      titulo: "Quién entra",
      dice: "Entran el admin, los médicos veterinarios designados y quien tenga alguno de los permisos del módulo. Cada pantalla vuelve a revisar su propio permiso, así que entrar a Veterinaria no da acceso a todo.",
      pasos: [["esperar", 2500]],
    },
  ],
  resumen: ["Veterinaria se prende en «Módulos y plan» y necesita Inventario.", "Su inicio junta agenda, expediente, carnet, inventario clínico y recetas.", "Cada pantalla revisa su propio permiso."],
};
