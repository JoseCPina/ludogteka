// 72 · Inventario clínico: lotes, caducidades y clasificaciones (médico veterinario)
export default {
  rol: "admin",
  inicio: "/veterinaria/inventario",
  gancho: "Los medicamentos de tu clínica se controlan por lote y por caducidad. Se surten primero los que caducan antes, y cada producto sabe qué documento pide. Así funciona el inventario clínico.",
  escenas: [
    {
      titulo: "El inventario clínico",
      dice: "En «Inventario clínico» ves cada producto con sus lotes y su existencia. Los avisos te dicen qué está agotado, qué está por debajo del mínimo y qué ya caducó o está por caducar.",
      pasos: [["esperar", 2000], ["zoom", "css:main", 1.1, 3200]],
    },
    {
      titulo: "Un producto nuevo",
      dice: "Para dar de alta uno, aprieta «Nuevo producto clínico». Escribe el nombre, el área, la unidad en que se compra y la unidad en que se surte, el mínimo y con cuántos días de anticipación quieres el aviso de caducidad. Escoge también el tipo de producto: vacuna, desparasitante u otro, y de eso depende en qué lista del carnet aparece.",
      pasos: [["clic", "Nuevo producto clínico", { nav: true }], ["escribir", "Nombre del producto", "Dexametasona 0.2 %"], ["resaltar", "Unidad de compra", 2400], ["resaltar", "Avisar de la caducidad con (días)", 2600], ["resaltar", "Tipo de producto", 2600]],
    },
    {
      titulo: "Las dos clasificaciones",
      dice: "Si eliges un principio activo, el producto se clasifica solo: el grupo de SENASICA y la clasificación de la Ley General de Salud. Son independientes, y de ellas depende qué documento pide el producto para salir del inventario.",
      pasos: [["resaltar", "Principio activo", 3000], ["resaltar", "Grupo SENASICA", 2600], ["resaltar", "Clasificación de la Ley General de Salud", 2600]],
    },
    {
      titulo: "Lotes y surtidos",
      dice: "Abre un producto para registrar una entrada con su código de lote, su caducidad y la cantidad. Cada lote se puede surtir a un paciente, dar de baja por merma o caducidad, o ajustar con un conteo físico, siempre con su motivo.",
      pasos: [["ir", "/veterinaria/inventario"], ["clic", "Meloxicam 0.5 % (antiinflamatorio)", { nav: true }], ["resaltar", "Registrar entrada", 3000], ["resaltar", "Surtir", 2600]],
    },
  ],
  resumen: ["Cada producto se controla por lote y caducidad.", "Salen primero los lotes que caducan antes.", "Las clasificaciones del producto deciden qué documento pide para salir."],
};
