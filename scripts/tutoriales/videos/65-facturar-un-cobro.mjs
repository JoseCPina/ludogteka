// 65 · Facturar un cobro: datos fiscales, timbrado, PDF y envío (admin)
// El negocio demo no tiene facturación activa ni llave del servicio de timbrado (y la app no timbra en un demo):
// el video recorre cada pantalla del camino y se detiene antes de timbrar.
const CUENTA = { id: null };

export default {
  rol: "admin",
  inicio: "/admin/facturacion",
  async preparar({ sb, negocioId }) {
    const { data } = await sb.from("cobros").select("reserva_id").eq("negocio_id", negocioId).is("deleted_at", null).order("created_at", { ascending: false }).limit(1);
    CUENTA.id = data?.[0]?.reserva_id ?? null;
    if (!CUENTA.id) throw new Error("El demo no tiene cobros para enseñar la cuenta.");
  },
  gancho: "Un cliente te pide su factura. Con los datos fiscales de tu negocio, los de tu cliente y un botón, la sacas en segundos y se la mandas. Veamos todo el camino.",
  escenas: [
    {
      titulo: "Tus datos fiscales",
      dice: "Primero, la configuración, en Administración, Facturación. Captura los datos fiscales de tu negocio tal como vienen en tu constancia: RFC, razón social, régimen y el código postal del lugar de expedición.",
      pasos: [["resaltar", "Datos fiscales del negocio", 3200], ["resaltar", "Código postal del lugar de expedición", 2600]],
    },
    {
      titulo: "La llave y el interruptor",
      dice: "Pega la llave de tu servicio de timbrado: se prueba antes de guardarse y nadie puede leerla de vuelta. Después, marca que la facturación está activa, y los cobros empiezan a ofrecer su botón de facturar.",
      pasos: [["resaltar", "Llave del servicio de timbrado", 3000], ["resaltar", "Facturación activa", 3000]],
    },
    {
      titulo: "Los datos de tu cliente",
      dice: "Los datos fiscales de cada cliente se capturan una vez, en su ficha: RFC, código postal fiscal, régimen y el correo para mandarle la factura. Quedan guardados para las próximas.",
      pasos: [["ir", "/clientes"], ["escribir", "css:main input", "Emilio"], ["esperar", 1200], ["clic", "Emilio Navarro", { nav: true }], ["desplazar", "Datos fiscales"], ["resaltar", "Datos fiscales", 3200]],
    },
    {
      titulo: "En la cuenta",
      dice: "Con la facturación activa, en la cuenta de cada cobro aparece el botón de facturar, y en un cobro junto sale en el recibo. Se factura lo que cobraste, sin la propina. Mientras no esté activa, la cuenta te lo avisa, como aquí.",
      pasos: [["js", async ({ page, base }) => { await page.goto(`${base}/caja/cobrar/${CUENTA.id}`, { waitUntil: "networkidle" }); }], ["desplazar", "Facturación sin activar"], ["resaltar", "Facturación sin activar", 3400]],
    },
    {
      titulo: "Tus facturas",
      dice: "Todas quedan en Facturas, cada una con su estado. Ahí bajas el PDF y el XML, la mandas por WhatsApp o por correo, o la cancelas con su motivo. Nada se timbra dos veces.",
      pasos: [["ir", "/caja/facturas"], ["esperar", 3200]],
    },
  ],
  resumen: ["Se activa en Administración, con tus datos fiscales y tu llave.", "Los datos fiscales de cada cliente se capturan una vez, en su ficha.", "Las facturas quedan en Facturas: PDF, XML, envío y cancelación."],
};
