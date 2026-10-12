// 81 · Estudios, archivos y la línea de tiempo de la mascota (médico veterinario)
export default {
  rol: "mvz",
  inicio: "/veterinaria/expediente",
  gancho: "Los estudios de laboratorio, las radiografías y todo el historial de una mascota viven en su expediente. Se capturan, se suben y se recorren en una línea de tiempo.",
  escenas: [
    {
      titulo: "La línea de tiempo",
      dice: "Abre el expediente de la mascota. La línea de tiempo junta, en orden, sus consultas, vacunas, desparasitaciones, hospitalizaciones, certificados, archivos y pesos.",
      pasos: [["escribir", "Buscar mascota o dueño", "Michi"], ["tecla", "Enter"], ["esperar", 1500], ["clic", "Michi", { nav: true }], ["esperar", 1500], ["zoom", "Línea de tiempo", 1.2, 3200]],
    },
    {
      titulo: "Un resultado de laboratorio",
      dice: "Aprieta «Capturar un resultado de laboratorio». Escribe el estudio, la fecha y el laboratorio, y agrega cada parámetro con su valor, su unidad y su rango. Si el valor y el rango son números, el sistema marca solo si está alto o bajo.",
      pasos: [["clic", "Capturar un resultado de laboratorio"], ["escribir", "Estudio", "Biometría hemática"], ["escribir", "Parámetro", "Hematocrito"], ["escribir", "Valor", "62"], ["escribir", "Unidad", "%"], ["escribir", "Rango (37 - 55)", "37 - 55"], ["resaltar", "Guardar resultado", 2600]],
    },
    {
      titulo: "Subir un archivo",
      dice: "Con «Adjuntar una foto o PDF» subes una radiografía o el resultado escaneado. El archivo se guarda privado y se abre solo con tu sesión.",
      pasos: [["resaltar", "Adjuntar una foto o PDF", 3000]],
    },
    {
      titulo: "Quién lo abrió",
      dice: "Cada vez que alguien abre el expediente, queda anotado: quién y cuándo. El admin lo ve en el mismo expediente. Nada se borra: un archivo o una consulta se anulan con motivo.",
      pasos: [["desplazar", 0], ["resaltar", "Línea de tiempo", 3200]],
    },
  ],
  resumen: ["La línea de tiempo junta todo el historial de la mascota.", "Los resultados marcan solos si están altos o bajos.", "Cada acceso al expediente queda anotado."],
};
