// 11 · Alta de cliente con un link de WhatsApp (recepción)
export default {
  inicio: "/clientes",
  gancho: "No siempre tienes al dueño enfrente. Con un link por WhatsApp, él mismo captura sus datos y los de su perro desde su celular. Veamos cómo.",
  escenas: [
    {
      titulo: "Mandar link de alta",
      dice: "En «Clientes» aprieta «Mandar link de alta». Escribe para quién es, el «Teléfono (WhatsApp)» y escoge para qué viene: guardería y hotel, o estética.",
      pasos: [["clic", "Mandar link de alta", { nav: true }], ["escribir", "¿Para quién es?", "Mariana, la del labrador"], ["escribir", "Teléfono (WhatsApp)", "{tel}"], ["elegir", "¿Para qué viene?", "Guardería y hotel"]],
    },
    {
      titulo: "Vigencia y generar",
      dice: "Escoge cuánto vive el link con «Vigencia del link» y aprieta «Generar link». El link le sirve hasta que termine todo, y si lo deja a medias, lo vuelve a abrir y sigue.",
      pasos: [["elegir", "Vigencia del link", "7 días"], ["clic", "Generar link"], ["esperar", 2500], ["resaltar", "css:input[readonly]", 3000]],
    },
    {
      titulo: "Mandarlo por WhatsApp",
      dice: "Copias el link o lo mandas directo por WhatsApp. En «Links pendientes» ves los que siguen vivos, y puedes reenviarlos o cancelarlos.",
      pasos: [["desplazar", "Links pendientes"], ["resaltar", "Links pendientes", 2800]],
    },
    {
      titulo: "Lo que ve el dueño",
      dice: "Esto es lo que ve el dueño en su celular: un formulario con el nombre de tu negocio. Escribe su nombre y su teléfono, y sigue con los datos de su perro, sus vacunas y el contrato.",
      pasos: [["js", async ({ page, base }) => { const url = await page.locator("input[readonly]").first().inputValue(); await page.goto(base + new URL(url).pathname, { waitUntil: "networkidle" }); }], ["escribir", "Tu nombre completo", "Mariana López"], ["resaltar", "Tu teléfono", 2600]],
    },
  ],
  resumen: ["Generas un link para quien no está frente a ti.", "El dueño captura sus datos y los de su perro desde su celular.", "El link vive hasta que termine todo, y lo puedes reenviar o cancelar."],
};
