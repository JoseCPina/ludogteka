// 98 · La factura global al público en general (admin)
// El bloque de la global solo sale con la facturación ACTIVA y con `global_desde` (cfdi_global_periodos devuelve vacío
// sin eso), y el demo no tiene configuración fiscal. `preparar` deja una configuración de pruebas (sandbox, RFC
// ficticio, global DIARIA desde hace 6 días) para que salgan periodos cerrados, unos en plazo y otros vencidos.
// No se timbra nada: «Emitir la factura global» en un negocio con plan demo responde MENSAJE_DEMO (enDemo() en
// caja/facturacion-actions.ts), así que el video solo la resalta. `despues`
// deja la configuración como estaba: el video 65 enseña «Facturación sin activar».
const ANTES = { fila: undefined, id: null };
const dia = (n) => new Date(Date.now() + n * 86400000).toLocaleDateString("en-CA", { timeZone: "America/Mexico_City" });

export default {
  rol: "admin",
  inicio: "/caja/facturas",
  async preparar({ sb, negocioId }) {
    const { data: previa } = await sb.from("cfdi_config_negocio").select("id, activa, rfc, razon_social, regimen_fiscal, cp_expedicion, tipo_persona, serie, global_periodicidad, global_automatica, global_desde, modo").eq("negocio_id", negocioId).is("deleted_at", null).maybeSingle();
    if (ANTES.fila === undefined) ANTES.fila = previa ?? null; // en un reintento no se pisa el estado original
    // Desde 5 días antes del último cobro del demo: si se sembró hace semanas, igual salen periodos con cobros (vencidos).
    const { data: ultimo } = await sb.from("cobros").select("created_at").eq("negocio_id", negocioId).is("deleted_at", null).is("anulado_at", null).order("created_at", { ascending: false }).limit(1);
    if (!ultimo?.length) throw new Error("El demo no tiene cobros para la factura global.");
    const dias = Math.round((new Date(ultimo[0].created_at).getTime() - Date.now()) / 86400000);
    const config = { activa: true, modo: "pruebas", rfc: "PAC230101AB1", razon_social: "PATITAS Y CO", regimen_fiscal: "601", cp_expedicion: "76000", tipo_persona: "moral", serie: "A", global_periodicidad: "dia", global_automatica: false, global_desde: dia(Math.min(dias, 0) - 5) };
    if (previa) {
      const { error } = await sb.from("cfdi_config_negocio").update(config).eq("id", previa.id);
      if (error) throw new Error(`No pude ajustar la configuración fiscal del demo: ${error.message}`);
      ANTES.id = previa.id;
    } else {
      const { data, error } = await sb.from("cfdi_config_negocio").insert({ negocio_id: negocioId, ...config }).select("id").single();
      if (error) throw new Error(`No pude crear la configuración fiscal del demo: ${error.message}`);
      ANTES.id = data.id;
    }
  },
  async despues({ sb }) {
    if (!ANTES.id) return;
    if (ANTES.fila) { const { id, ...resto } = ANTES.fila; await sb.from("cfdi_config_negocio").update(resto).eq("id", id); }
    else await sb.from("cfdi_config_negocio").update({ activa: false, deleted_at: new Date().toISOString() }).eq("id", ANTES.id);
  },
  gancho: "Lo que cobras a quien no pidió factura también se factura: va en una factura global a «Público en general», por periodo. Veamos dónde se emite y cuándo.",
  escenas: [
    {
      titulo: "Los periodos por facturar",
      dice: "Entra a Facturas. Arriba salen los periodos ya cerrados con cobros sin factura: cuántos cobros, cuánto suman y hasta cuándo se puede emitir. Hay que emitirla dentro de las 24 horas siguientes al cierre del periodo.",
      pasos: [["resaltar", "Factura global al público en general", 3000], ["resaltar", "css:section:has-text('Factura global al público en general') li", 3400]],
    },
    {
      titulo: "Emitirla",
      dice: "Aprieta «Emitir la factura global» en el periodo. Junta esos cobros con el IVA separado por tasa y la timbra. Queda vigente en la lista de abajo, con su PDF y su XML.",
      pasos: [["resaltar", "Emitir la factura global", 3200]],
    },
    {
      titulo: "Si se pasa el plazo",
      dice: "Un periodo que pasó de las 24 horas sale en rojo y en «Necesita atención»: emítela de todos modos. La periodicidad se escoge en Administración, Facturación: diaria, semanal o mensual, y en RESICO solo mensual. Ahí también se pide que se emita sola.",
      pasos: [["resaltar", "css:li[class*='border-coral']", 3000], ["ir", "/admin/facturacion"], ["desplazar", "Factura global al público en general"], ["resaltar", "Factura global al público en general", 2600], ["resaltar", "Emitir la factura global sola al cerrar cada periodo", 2600]],
    },
  ],
  resumen: ["Lo que nadie facturó va en la global, por periodo.", "Se emite desde Facturas, dentro de las 24 horas siguientes al cierre.", "La periodicidad y la emisión automática se ajustan en Facturación."],
};
