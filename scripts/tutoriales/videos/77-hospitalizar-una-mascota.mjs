// 77 · Hospitalizar a una mascota (médico veterinario)
export default {
  rol: "mvz",
  inicio: "/veterinaria/hospitalizacion",
  gancho: "Una mascota se queda internada: necesita medicación, monitoreo y una cuenta clara. Todo eso vive en la hospitalización. Así se ingresa, se medica y se da de alta.",
  escenas: [
    {
      titulo: "Ingresar",
      dice: "En «Ingresar una mascota» búscala y elígela. Escribe el motivo del ingreso, elige al médico responsable y la ubicación, por ejemplo la jaula tres. Si quieres, un depósito inicial. Aprieta «Ingresar a hospitalización».",
      pasos: [["escribir", "Buscar mascota o dueño", "Canelo"], ["tecla", "Enter"], ["esperar", 1500], ["clic", "Canelo", { nav: true }], ["escribir", "Motivo del ingreso", "Deshidratación por gastroenteritis"], ["clic", "Ingresar a hospitalización", { nav: true }], ["esperar", 1800]],
    },
    {
      titulo: "La hoja de medicación",
      dice: "En la hoja de medicación, «Indicar medicación»: el medicamento, la dosis, cada cuántas horas y hasta cuándo. Cada dosis queda programada y, al aplicarla, se descuenta de su lote y se cobra en la cuenta.",
      pasos: [["clic", "Indicar medicación"], ["resaltar", "Cada cuántas horas", 2800]],
    },
    {
      titulo: "Marcar las dosis",
      dice: "Cada dosis pendiente se marca como aplicada, con quién y a qué hora. Si una se pasa de hora, sale atrasada en la lista de internados. Las que no se aplicaron se marcan así, con su motivo.",
      pasos: [["desplazar", "Registrar monitoreo"], ["resaltar", "Registrar monitoreo", 2800]],
    },
    {
      titulo: "Monitoreo y cargos",
      dice: "El monitoreo guarda temperatura, frecuencia cardiaca y respiratoria y peso, y solo se agrega, nunca se edita. Los procedimientos y estudios se agregan a la cuenta de la hospitalización.",
      pasos: [["resaltar", "Agregar un procedimiento o cargo", 3000]],
    },
    {
      titulo: "El alta",
      dice: "Al final, «Dar de alta» cierra la hospitalización y deja la cuenta lista para cobrarse en Caja, como cualquier otra. Un saldo a favor se devuelve con la devolución de siempre.",
      pasos: [["resaltar", "Dar de alta", 3200]],
    },
  ],
  resumen: ["Se ingresa con motivo, médico y ubicación.", "Cada dosis aplicada se descuenta del lote y se cobra en la cuenta.", "El alta deja la cuenta lista para cobrar en Caja."],
};
