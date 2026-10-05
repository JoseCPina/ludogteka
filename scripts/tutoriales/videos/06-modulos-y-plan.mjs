// 06 · Módulos y plan (admin)
export default {
  inicio: "/admin",
  gancho: "No todos los negocios hacen lo mismo. En PeluDesk prendes solo los servicios que usas, y la pantalla se simplifica para tu equipo.",
  escenas: [
    {
      titulo: "Entra a Módulos y plan",
      dice: "Desde el menú entra a «Módulos y plan». Aquí ves todo lo que PeluDesk puede hacer, dividido en módulos.",
      pasos: [["clic", "Módulos y plan", { nav: true }], ["resaltar", "Módulos y plan", 2200]],
    },
    {
      titulo: "Los módulos",
      dice: "Están «Guardería», «Hotel», «Estética», los paquetes de day pass, la recolección a domicilio, los contratos, el portal de clientes, el inventario, los empleados, los gastos, los reportes y tu página web.",
      pasos: [["zoom", "Guardería", 1.5, 3500], ["desplazar", "Página web"], ["resaltar", "Página web", 2400]],
    },
    {
      titulo: "Prender y apagar",
      dice: "Cada módulo tiene su botón para apagarlo o prenderlo. Antes de apagar uno, la app te avisa qué quedaría pendiente. Apagar nunca borra nada: tus datos siguen ahí si lo vuelves a prender.",
      pasos: [["desplazar", 0], ["resaltar", "css:button:has-text('Apagar')", 3200]],
    },
    {
      titulo: "Tu plan",
      dice: "Los módulos que puedes prender dependen de tu plan. Si necesitas uno más, lo cambias aquí mismo.",
      pasos: [["esperar", 3000]],
    },
  ],
  resumen: ["Prende solo los módulos que usas.", "Antes de apagar uno, la app te avisa qué quedaría pendiente.", "Apagar no borra datos."],
};
