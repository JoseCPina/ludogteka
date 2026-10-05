// 54 · Recolección a domicilio (recepción)
export default {
  inicio: "/clientes",
  gancho: "Si pasas por los perros a su casa, el cobro depende de los kilómetros. La app calcula la distancia y cotiza por ti.",
  escenas: [
    {
      titulo: "La dirección del cliente",
      dice: "En la ficha del cliente, en «Dirección y distancia de recolección», capturas su domicilio y aprietas «Guardar y calcular». La app mide la distancia desde la base de tu negocio.",
      pasos: [["clic", "Ana Sofía Treviño", { nav: true }], ["desplazar", "Dirección y distancia de recolección"], ["resaltar", "Dirección y distancia de recolección", 3200]],
    },
    {
      titulo: "Ajustar a mano",
      dice: "Si el cálculo no es exacto, o el mapa no responde, usas «Ajustar distancia a mano» y escribes los kilómetros tú. Tu negocio tiene un tope de consultas al mes; al llegar a él, la pantalla te pide los kilómetros.",
      pasos: [["resaltar", "Ajustar distancia a mano", 3200]],
    },
    {
      titulo: "Se cobra con el servicio",
      dice: "El cargo de recolección se suma a la cuenta, por kilómetro. Lo aplicas desde el check-out, con «Aplicar cargo», y se cobra junto con lo demás.",
      pasos: [["ir", "/caja/cargo"], ["esperar", 3000]],
    },
  ],
  resumen: ["La app mide la distancia desde la base de tu negocio.", "Si hace falta, ajustas los kilómetros a mano.", "El cargo se cobra junto con el servicio."],
};
