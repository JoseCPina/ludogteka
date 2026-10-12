// 60 · Cómo ajustar los días usados de un pase (admin)
export default {
  rol: "admin",
  inicio: "/guarderia/pases",
  gancho: "Un check-in se marcó por error, o el pase ya traía días usados de antes de PeluDesk. Corriges los días usados del pase, con motivo, sin tocar dinero ni caja.",
  escenas: [
    {
      titulo: "Busca el pase",
      dice: "En «Day pass y mensualidad», busca al dueño. Cada paquete es de un perro y muestra cuántos días lleva usados.",
      pasos: [["escribir", "css:main input", "Héctor"], ["esperar", 1200], ["clic", "Héctor Ibarra", { nav: true }], ["esperar", 1500]],
    },
    {
      titulo: "Ajustar los días usados",
      dice: "Aprieta «Ajustar días usados». Pon el total que debe llevar, o suma y resta de uno en uno. Si sabes qué días fueron, puedes poner sus fechas, pero no son obligatorias.",
      pasos: [["clic", "Ajustar días usados"], ["resaltar", "Total usado", 2600], ["clic", "Sumar un día usado"], ["esperar", 800]],
    },
    {
      titulo: "El motivo y el antes y después",
      dice: "Elige el motivo: un check-in marcado por error, un día no registrado, uso previo a PeluDesk u otro. Antes de confirmar ves el cuadro «Antes → después» con los días usados, los restantes y el vencimiento.",
      pasos: [["elegir", "Motivo", "Día no registrado"], ["resaltar", "Antes → después", 3200]],
    },
    {
      titulo: "Confirmar",
      dice: "Aprieta «Confirmar ajuste». Un ajuste solo mueve el saldo de días: no cobra nada, no cambia la caja y queda en el historial del pase.",
      pasos: [["clic", "Confirmar ajuste"], ["esperar", 2000]],
    },
    {
      titulo: "El historial",
      dice: "Con «Ver historial de ajustes» ves cada cambio: antes y después, el motivo, quién lo hizo y cuándo. No se edita ni se borra: un ajuste se corrige con otro.",
      pasos: [["clic", "Ver historial de ajustes"], ["resaltar", "Ocultar historial de ajustes", 3200]],
    },
    {
      titulo: "Deshacer un check-in",
      dice: "Y si lo que pasó es un check-in por error, ahí mismo, en el check-in del perro, puedes deshacerlo: el perro vuelve a reservada y el día regresa al pase.",
      pasos: [["esperar", 2200]],
    },
  ],
  resumen: ["«Ajustar días usados» corrige el saldo de un pase, con motivo.", "No toca dinero, caja ni cortes.", "Todo ajuste queda en el historial del pase."],
};
