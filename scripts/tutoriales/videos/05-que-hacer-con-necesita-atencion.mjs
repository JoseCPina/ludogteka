// 05 · Qué hacer con «Necesita atención» (recepción)
export default {
  inicio: "/recepcion",
  gancho: "En el tablero hay una sección que no debes ignorar: «Necesita atención». Te dice qué se está quedando sin resolver y desde hace cuántos días.",
  escenas: [
    {
      titulo: "La lista de pendientes",
      dice: "Aquí aparecen los pendientes del negocio, del más urgente al menos urgente. Cada renglón dice qué pasa y, abajo, cuánto tiempo lleva esperando. Si pasa de una semana, se resalta en naranja.",
      pasos: [["resaltar", "Necesita atención", 3000], ["zoom", "Necesita atención", 1.5, 3500]],
    },
    {
      titulo: "Un contrato por firmar",
      dice: "Por ejemplo, un contrato que el dueño aún no firma. Al tocar el aviso entras directo a «Contratos» para dar seguimiento, sin buscar nada.",
      pasos: [["clic", "contratos esperan la firma", { nav: true }], ["esperar", 2400]],
    },
    {
      titulo: "Saldos por cobrar",
      dice: "Otro aviso frecuente son los saldos de perros que ya se fueron. Esa lista va del más viejo al más nuevo, para que cobres primero lo más antiguo.",
      pasos: [["ir", "/recepcion/saldos"], ["resaltar", "Saldos de perros que ya se fueron", 3200]],
    },
    {
      titulo: "Qué más puede aparecer",
      dice: "También te avisa de comprobantes de vacunas por revisar, cuentas por vincular, reembolsos, razas sin grupo de precio, un turno de caja sin abrir y gastos por vencer. Todo con su antigüedad y su enlace directo.",
      pasos: [["ir", "/recepcion"], ["resaltar", "Necesita atención", 3000]],
    },
  ],
  resumen: ["«Necesita atención» junta todo lo que se está quedando sin resolver.", "Cada aviso dice cuántos días lleva esperando y te lleva a donde se resuelve.", "Empieza por lo más viejo."],
};
