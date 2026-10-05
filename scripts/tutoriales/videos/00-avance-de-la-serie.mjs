// 00 · Avance de la serie (admin): ~40 s
export default {
  rol: "admin",
  inicio: "/admin",
  gancho: "Esto es PeluDesk: el software para guarderías, hoteles y estéticas caninas. Y esta es la serie de videos para aprender a usarlo.",
  escenas: [
    { titulo: "Clientes y perros", dice: "Clientes, perros, vacunas y contratos, en un solo lugar.", pasos: [["ir", "/clientes"], ["esperar", 1500]] },
    { titulo: "Estética y guardería", dice: "Agenda de estética, guardería y hotel con cupo.", pasos: [["ir", "/estetica"], ["esperar", 1500]] },
    { titulo: "Caja y cobros", dice: "Caja, cobros con terminal y corte sin diferencias.", pasos: [["ir", "/caja"], ["esperar", 1500]] },
    { titulo: "Inventario y equipo", dice: "Inventario, empleados, gastos y reportes.", pasos: [["ir", "/reportes"], ["esperar", 1500]] },
  ],
  resumen: ["Cincuenta y cinco videos cortos, paso a paso.", "Con la app de verdad y subtítulos.", "Empieza con el primero."],
  resumenDice: "Más de cincuenta videos cortos, paso a paso, con la app de verdad. Empieza con el primero.",
};
