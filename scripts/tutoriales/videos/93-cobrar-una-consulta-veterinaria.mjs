// 93 · Cómo se cobra una consulta veterinaria (admin designado médico)
// Se graba de punta a punta en el demo con la cuenta gemela del corredor: pone el precio que falta (y lo guarda como
// precio de catálogo), aplica una vacuna, firma y cobra en Caja. El admin se designa médico para poder firmar.
export default {
  rol: "admin",
  inicio: "/veterinaria/expediente",
  async preparar({ sb, negocioId }) {
    // 1. El admin del corredor firma como médico veterinario (solo en el demo).
    const { data: lista } = await sb.auth.admin.listUsers({ perPage: 1000 });
    const admin = lista?.users?.find((u) => u.email === "tutoriales.admin@peludesk.mx");
    if (!admin) throw new Error("No encuentro la cuenta tutoriales.admin del demo.");
    const { data: ya } = await sb.from("medicos_veterinarios").select("id").eq("negocio_id", negocioId).eq("profile_id", admin.id).is("deleted_at", null).maybeSingle();
    if (!ya) {
      const r = await sb.from("medicos_veterinarios").insert({ negocio_id: negocioId, profile_id: admin.id, cedula_profesional: "DEMO-9300001", cpa_sitpv: "CPA-003-DEMO", updated_at: new Date().toISOString() });
      if (r.error) throw new Error(`médico de la demo: ${r.error.message}`);
    }
    // 2. La consulta general sin precio, para enseñar «Precio de esta consulta» (se vuelve a crear desde el video).
    const { data: sv } = await sb.from("servicios").select("id").eq("negocio_id", negocioId).eq("clave", "vet_consulta_general").is("deleted_at", null).maybeSingle();
    if (sv) await sb.from("tarifas").update({ deleted_at: new Date().toISOString() }).eq("negocio_id", negocioId).eq("servicio_id", sv.id).is("deleted_at", null);
    // 3. Las vacunas del inventario del demo quedan marcadas como vacuna, para que «Aplicar vacuna» las ofrezca.
    const v = await sb.from("insumos").update({ tipo_clinico: "vacuna" }).eq("negocio_id", negocioId).ilike("nombre", "Vacuna %").is("deleted_at", null);
    if (v.error) throw new Error(`vacunas de la demo: ${v.error.message}`);
  },
  gancho: "Lo que haces en la consulta se cobra solo. Antes de firmar ves exactamente qué va a la cuenta, y lo que no tiene precio lo resuelves ahí mismo.",
  escenas: [
    {
      titulo: "Abre la consulta",
      dice: "Abre la consulta de la mascota, como siempre. Debajo del examen está el recuadro «Cargos de esta consulta»: todo lo que se va a cobrar.",
      pasos: [
        ["escribir", "Buscar mascota o dueño", "Kira"],
        ["esperar", 1200],
        ["clic", "Kira", { nav: true }],
        ["clic", "Nueva consulta"],
        ["clic", "Abrir la consulta", { nav: true }],
        ["esperar", 2200],
        ["escribir", "Motivo de la consulta", "Revisión por vómito"],
        ["escribir", "Buscar diagnóstico", "gastritis"],
        ["esperar", 1500],
        ["clic", "css:ul button:has-text('astritis') >> nth=0"],
        ["esperar", 1200],
        ["desplazar", "Cargos de esta consulta"],
        ["resaltar", "Cargos de esta consulta", 2600],
      ],
    },
    {
      titulo: "Precio de esta consulta",
      dice: "Si algo no tiene precio, lo ves marcado y no se puede firmar. Aprieta «Poner el precio», escribe el «Precio de esta consulta» y, si quieres que las próximas ya lo traigan, deja marcado «Guardar como precio de catálogo».",
      pasos: [
        ["resaltar", "Sin precio no se puede firmar", 2600],
        ["clic", "Poner el precio"],
        ["esperar", 1000],
        ["escribir", "Precio de esta consulta ($)", "450"],
        ["resaltar", "Guardar como precio de catálogo", 2800],
        ["clic", "Guardar el precio"],
        ["esperar", 2200],
      ],
    },
    {
      titulo: "Aplicar vacuna",
      dice: "Una vacuna no se agrega como procedimiento: abre «Aplicar vacuna». Escoges el producto del inventario y su lote, aprietas «Registrar vacuna», y queda en el carnet con su fecha y se cobra con esta consulta.",
      pasos: [
        ["clic", "Aplicar vacuna"],
        ["esperar", 1200],
        ["js", async ({ page }) => { await page.locator('select[name="insumo_id"]').first().selectOption({ label: "Vacuna séxtuple canina" }); await page.waitForTimeout(500); await page.locator('select[name="lote_id"]').first().selectOption({ index: 1 }); }, 3500],
        ["clic", "Registrar vacuna"],
        ["esperar", 2800],
      ],
    },
    {
      titulo: "Quitar o ajustar",
      dice: "Si hace falta, aprieta «Ajustar» para cambiar la cantidad o el precio, y cero si es una cortesía. «Quitar» saca el cargo. Los dos piden un motivo y todo queda registrado.",
      pasos: [["esperar", 2200], ["resaltar", "Cargos de esta consulta", 1500], ["resaltar", "Ajustar", 2800], ["clic", "Ajustar"], ["esperar", 1400], ["resaltar", "Guardar el ajuste", 2800]],
    },
    {
      titulo: "Firmar",
      dice: "Cuando termines, aprieta «Firmar». Todo lo que tiene precio pasa a la cuenta de la mascota en Caja, y si está hospitalizada o tiene un estimado aceptado, va a esa cuenta y no se cobra dos veces.",
      pasos: [["resaltar", "Firmar la consulta", 2400], ["clic", "Firmar la consulta"], ["esperar", 4500]],
    },
    {
      titulo: "Cobrar en recepción",
      dice: "En «Caja» aparece la cuenta de la mascota con su saldo. Se cobra como cualquier otra: escoges el método, el monto, y al registrar el cobro se ve de inmediato como «Cuenta pagada».",
      pasos: [
        ["ir", "/caja"],
        ["esperar", 2000],
        ["clic", "css:a[href^='/caja/cobrar/']:has-text('Kira')", { nav: true }],
        ["esperar", 1800],
        ["zoom", "Total cuenta", 1.3, 3000],
        ["elegir", "Método", "Efectivo"],
        ["clic", "css:button:has-text('Registrar cobro') >> nth=-1"],
        ["esperar", 1500],
        ["resaltar", "Cuenta pagada", 3200],
      ],
    },
  ],
  resumen: ["Antes de firmar ves qué se va a cobrar.", "Lo que no tiene precio se resuelve ahí mismo, con la opción de guardarlo en el catálogo.", "Al firmar, la cuenta aparece en Caja lista para cobrar."],
};
