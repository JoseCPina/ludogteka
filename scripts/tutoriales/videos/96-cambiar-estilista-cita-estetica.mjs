// 96 · Cambiar o corregir la estilista de una cita (admin)
// Escena 1 SÍ guarda: pasa una cita futura de Karla Méndez (la del demo, no la gemela del corredor) a Luis Ángel Paredes
// antes de empezar (reasignar_estilista_cita, sin motivo; se puede devolver igual). Escena 3 NO guarda: abre «Corregir
// estilista» en una cita ya finalizada, llena el motivo y se detiene antes de confirmar (eso movería comisión y nómina).
const CITA = { antes: null, cerrada: null };
const ZONA = "America/Mexico_City";

export default {
  rol: "admin",
  inicio: "/estetica",
  async preparar({ sb, negocioId }) {
    const id = async (email) => (await sb.rpc("usuario_por_email", { p_email: email })).data;
    const karla = await id("demo.estetica@peludesk.mx");
    const luis = await id("demo.estetica2@peludesk.mx");
    if (!karla || !luis) throw new Error("Faltan Karla Méndez o Luis Ángel Paredes en el demo: corre sembrar-demo.mjs.");
    const diaDe = (iso) => new Date(iso).toLocaleDateString("en-CA", { timeZone: ZONA });
    // Una cita por empezar de Karla, en un día sin ausencia aprobada de Luis y sin choque con sus citas (si no, la base la rechaza).
    const desde = new Date(Date.now() + 2 * 3600e3).toISOString();
    const { data: futuras } = await sb.from("citas_estetica").select("id, empleado_id, inicio, fin").eq("negocio_id", negocioId).in("estado", ["reservada", "confirmada"]).in("empleado_id", [karla, luis]).is("deleted_at", null).gte("inicio", desde).order("inicio").order("id");
    const { data: emp } = await sb.from("empleados").select("id").eq("negocio_id", negocioId).eq("profile_id", luis).is("deleted_at", null).maybeSingle();
    const { data: aus } = emp ? await sb.from("ausencias").select("desde, hasta").eq("empleado_id", emp.id).eq("estado", "aprobada").is("deleted_at", null) : { data: [] };
    const ausente = (d) => (aus ?? []).some((a) => a.desde <= d && d <= a.hasta);
    const deLuis = (futuras ?? []).filter((c) => c.empleado_id === luis);
    const libre = (c) => !deLuis.some((l) => l.inicio < c.fin && c.inicio < l.fin);
    CITA.antes = (futuras ?? []).find((c) => c.empleado_id === karla && !ausente(diaDe(c.inicio)) && libre(c))?.id ?? null;
    if (!CITA.antes) throw new Error("El demo no tiene una cita por empezar de Karla que se pueda pasar a Luis Ángel.");
    const { data: cerradas } = await sb.from("citas_estetica").select("id").eq("negocio_id", negocioId).eq("estado", "finalizada").eq("empleado_id", karla).is("deleted_at", null).order("inicio", { ascending: false }).limit(1);
    CITA.cerrada = cerradas?.[0]?.id ?? null;
    if (!CITA.cerrada) throw new Error("El demo no tiene una cita finalizada de Karla.");
  },
  gancho: "Una estilista se enfermó o se escogió a la persona equivocada. La estilista de una cita se cambia en un momento, y cada cambio queda registrado.",
  escenas: [
    {
      titulo: "Antes de empezar",
      dice: "Si la cita no ha empezado, abre la lista «Estilista» y escoge a otra persona: queda en el momento, sin motivo. El aviso verde dice con quién quedó y quién la tenía. Si aún no sabes quién la atiende, escoge «Sin asignar».",
      pasos: [["js", async ({ page, base }) => { await page.goto(`${base}/estetica/${CITA.antes}`, { waitUntil: "networkidle" }); }], ["desplazar", "Estilista"], ["elegir", "Estilista", "Luis Ángel Paredes"], ["esperar", 1500], ["resaltar", "css:[data-estilista-aviso]", 3200]],
    },
    {
      titulo: "El historial",
      dice: "Cada cambio queda al pie de la cita, en «Historial de estilista»: de quién a quién, quién lo hizo, cuándo y el motivo. Con el servicio en curso, el botón es «Cambiar estilista» y el motivo es opcional.",
      pasos: [["esperar", 1200], ["desplazar", "Historial de estilista"], ["resaltar", "css:[data-historial-estilista]", 3400]],
    },
    {
      titulo: "Un servicio ya terminado",
      dice: "Si el servicio ya terminó, aprieta «Corregir estilista», escoge a la correcta y escribe el motivo, que es obligatorio. Lo hace el admin o quien tenga el permiso. Si su nómina ya se pagó, la diferencia sale como ajuste en el siguiente pago.",
      pasos: [["js", async ({ page, base }) => { await page.goto(`${base}/estetica/${CITA.cerrada}`, { waitUntil: "networkidle" }); }], ["desplazar", "Corregir estilista"], ["clic", "Corregir estilista"], ["elegir", "Pasar a", "Luis Ángel Paredes"], ["escribir", "Motivo de la corrección (obligatorio)", "La atendió Luis Ángel, no Karla"], ["resaltar", "Corregir estilista", 2800]],
    },
  ],
  resumen: ["Antes de empezar, se cambia con la lista, sin motivo.", "En curso o terminada, con su botón; si ya terminó, con motivo.", "Todo queda en el historial y la comisión se ajusta sola."],
};
