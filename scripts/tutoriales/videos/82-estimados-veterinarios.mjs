// 82 · Un estimado que el dueño acepta (médico veterinario)
export default {
  rol: "mvz",
  inicio: "/veterinaria/estimados/nuevo",
  gancho: "Antes de una cirugía, el dueño quiere saber cuánto va a costar. El estimado le dice un mínimo y un máximo, lo acepta con su firma y sus cargos llegan solos a la cuenta.",
  escenas: [
    {
      titulo: "Armar el estimado",
      dice: "Aprieta «Nuevo estimado», elige a la mascota y ponle un título, por ejemplo la esterilización. Elige si es de consulta o de cirugía.",
      pasos: [["escribir", "Buscar mascota o dueño", "Nube"], ["tecla", "Enter"], ["esperar", 1500], ["clic", "Nube", { nav: true }], ["escribir", "Título", "Esterilización"], ["elegir", "Tipo", "Cirugía"]],
    },
    {
      titulo: "Las líneas",
      dice: "Agrega líneas con servicio, procedimiento o insumo. Cada una lleva un precio mínimo y uno máximo. Un insumo lo puedes elegir del inventario y trae su precio de venta.",
      pasos: [["escribir", "Descripción", "Esterilización de gata"], ["escribir", "Precio mínimo", "1800"], ["escribir", "Precio máximo", "2400"], ["resaltar", "Total estimado", 2800]],
    },
    {
      titulo: "Mandarlo",
      dice: "Guárdalo como borrador y, cuando esté listo, lo envías: te da una liga para el dueño, que se muestra una sola vez. Un estimado enviado ya no se cambia; si hay que ajustarlo, haces una versión nueva.",
      pasos: [["resaltar", "Guardar borrador", 2800]],
    },
    {
      titulo: "Que lo acepte",
      dice: "El dueño abre la liga, ve el detalle y lo acepta con su nombre y su firma. O lo aceptas tú en el mostrador. Al aceptar, el mínimo de cada línea pasa a la cuenta de la mascota y se cobra en Caja.",
      pasos: [["esperar", 2600]],
    },
  ],
  resumen: ["El estimado dice un mínimo y un máximo.", "El dueño lo acepta con su firma, por liga o en el mostrador.", "Al aceptar, el mínimo pasa a la cuenta y se cobra en Caja."],
};
