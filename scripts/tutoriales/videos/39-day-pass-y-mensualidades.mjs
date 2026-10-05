// 39 · Day pass y mensualidades (recepción)
export default {
  inicio: "/caja/pases",
  gancho: "Los paquetes de guardería fidelizan a tus clientes: pagan por adelantado y tú sabes cuántos días les quedan. Así se venden.",
  escenas: [
    {
      titulo: "Vender un paquete",
      dice: "En «Vender pase o mensualidad» buscas al cliente y escoges a su perro: los pases son de un solo perro. Si el dueño tiene dos perros, compra dos paquetes.",
      pasos: [["resaltar", "Vender pase o mensualidad", 2600], ["resaltar", "Buscar por perro, dueño o teléfono", 2600]],
    },
    {
      titulo: "El paquete",
      dice: "Escoges el paquete —de 10 o 20 pases— o la mensualidad ilimitada, con su vigencia. Al venderlo se genera su contrato de guardería, que el dueño firma desde su portal.",
      pasos: [["escribir", "Buscar por perro, dueño o teléfono", "Jorge"], ["esperar", 2500]],
    },
    {
      titulo: "Se aplican solos",
      dice: "Al reservar un día completo de guardería, la app usa el pase que vence primero, y avisa en el check-in. Si cancelas la reserva, el pase se devuelve. Y en «Guardería» ves los que vencen pronto o se acabaron.",
      pasos: [["ir", "/guarderia"], ["desplazar", "Day pass y mensualidad"], ["zoom", "Day pass y mensualidad", 1.35, 3500]],
    },
  ],
  resumen: ["Cada paquete es de un solo perro.", "El pase que vence primero se usa primero, y se devuelve si cancelas.", "En «Guardería» ves los pases que vencen pronto."],
};
