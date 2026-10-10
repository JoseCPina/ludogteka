// 65 · Facturar un cobro (admin). SIN GRABAR.
// BORRADOR: los textos de botones («Facturar», «Editar datos fiscales», «PDF», «XML»,
// «Mandar por WhatsApp») vienen de los artículos de ayuda de facturación; antes del
// primer `npm run tutoriales -- --video 65` se cotejan con la pantalla final
// (`node scripts/tutoriales/explorar.mjs`) y se ajusta lo que difiera. El demo es de
// solo lectura y no timbra: se graba en desarrollo con un negocio de prueba con la
// llave sk_test del sandbox, nunca en Ludogteka.
export default {
  rol: "admin",
  inicio: "/caja",
  gancho: "Un cliente te pide su factura. Con sus datos fiscales y un botón, la sacas en segundos y se la mandas.",
  escenas: [
    {
      titulo: "Sus datos fiscales",
      dice: "Primero, los datos del cliente. En su ficha, aprieta «Editar datos fiscales» y copia de su constancia el RFC, el nombre tal cual, el código postal, el régimen y el uso del CFDI.",
      pasos: [["resaltar", "Editar datos fiscales", 3000]],
    },
    {
      titulo: "Facturar el cobro",
      dice: "Con el cobro hecho, aprieta «Facturar». La factura se timbra en unos segundos y queda con su folio. Se factura lo que cobraste, sin la propina.",
      pasos: [["resaltar", "Facturar", 3000]],
    },
    {
      titulo: "Descargar y mandar",
      dice: "En «Facturas» bajas el PDF y el XML, o se la mandas al cliente por WhatsApp o por correo.",
      pasos: [["resaltar", "PDF", 2200], ["resaltar", "XML", 2200], ["resaltar", "Mandar por WhatsApp", 2600]],
    },
  ],
  resumen: ["Los datos fiscales del cliente se capturan una vez.", "«Facturar» timbra el cobro, sin la propina.", "PDF y XML se bajan o se mandan por WhatsApp o correo."],
};
