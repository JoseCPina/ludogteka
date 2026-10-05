// 18 · El dueño firma su contrato (portal del cliente)
export default {
  rol: "clienteAna",
  inicio: "/portal",
  gancho: "Así se ve el portal desde el lado del dueño. Mira qué fácil es para tu cliente firmar su contrato sin ir al negocio.",
  escenas: [
    {
      titulo: "El portal del dueño",
      dice: "Esto ve el dueño al entrar con su teléfono y su contraseña. Arriba, un aviso: «Tienes un contrato por firmar». Más abajo ve sus citas y reservas, sus perros y sus datos.",
      pasos: [["resaltar", "Tienes un contrato por firmar", 3200], ["zoom", "Citas y reservas", 1.3, 3500]],
    },
    {
      titulo: "El perro y su contrato",
      dice: "Toca «firmarlo» y llega a la ficha del perro. Ahí está la sección «Contrato», con el botón «Leer contrato» para que lea todo antes de firmar.",
      pasos: [["desplazar", 0], ["clic", "firmarlo", { nav: true }], ["desplazar", "Contrato"], ["resaltar", "Leer contrato", 3000]],
    },
    {
      titulo: "Firmar",
      dice: "Cuando está de acuerdo, aprieta «Firmar» y firma con el dedo en la pantalla. La app guarda el contrato en PDF con la fecha, la hora y los datos de la firma, y el negocio recibe su copia.",
      pasos: [["resaltar", "Firmar", 3200]],
    },
    {
      titulo: "Lo demás del portal",
      dice: "En esa misma ficha el dueño ve el estado de salud de su perro, puede subir el comprobante de vacunas, ver la bitácora con fotos y corregir sus datos. Nunca ve precios ni la caja del negocio.",
      pasos: [["desplazar", "Estado de salud"], ["resaltar", "Estado de salud", 2800], ["desplazar", "Bitácora"], ["resaltar", "Bitácora", 2600]],
    },
  ],
  resumen: ["El dueño firma desde su celular, con el dedo.", "Puede leer el contrato completo antes de firmar.", "Nunca ve precios ni datos de otros clientes."],
};
