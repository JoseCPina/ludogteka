import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { zonaActual } from "@/lib/negocio/actual";
import { formatearFecha } from "@/lib/formato";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { whatsappPeluDesk } from "@/lib/peludesk/landing";

// El aviso del plan del negocio, arriba de todo en el staff y el portal:
//   demo (cuenta de solo lectura) → qué es y cómo probar PeluDesk;
//   prueba vigente sin contratar → cuándo termina (solo el personal) y, al
//                                  admin, que puede contratar sin perder días;
//   prueba vencida               → que la información está a salvo; al
//                                  admin, que contrate;
//   cobro fallido (gracia)       → al admin: hasta cuándo funciona todo;
//   solo lectura por cobro o suscripción cancelada → que está a salvo y
//                                  qué hacer (el admin paga; los demás le avisan).
// El estado sale de estado_cobro() (Stripe manda). La base ya impide
// escribir (negocio_escribible()); esto solo lo explica.
const URL_REGISTRO = "https://peludesk.mx/registro";


// Días que le quedan a la prueba (negativo: ya venció). Fuera del render:
// en un componente de servidor se calcula una vez por petición.
function estadoPrueba(fin: Date): { vencida: boolean; dias: number } {
  const ms = fin.getTime() - Date.now();
  return { vencida: ms < 0, dias: Math.max(0, Math.ceil(ms / 86_400_000)) };
}

export async function AvisoPlan({ esPersonal }: { esPersonal: boolean }) {
  const negocio = await cargarNegocioLanding();
  const supabase = await createSupabaseServerClient();
  const [{ data: escribible }, { data: cobroData }, sesion] = await Promise.all([
    supabase.rpc("negocio_escribible"),
    supabase.rpc("estado_cobro"),
    obtenerSesionConRol(),
  ]);
  const cobro = cobroData as { estado: string; contratado: boolean; solo_lectura_desde: string | null } | null;
  const esAdmin = sesion?.rol === "admin";
  const zona = await zonaActual();

  if (negocio.plan === "demo" && escribible === false) {
    return (
      <div role="status" data-aviso-plan="demo" className="flex flex-wrap items-center justify-between gap-2 bg-morado px-4 py-2 text-sm text-white md:px-6">
        <p>
          <strong className="font-semibold">Negocio de demostración.</strong> Explora todo con datos de ejemplo; es de solo
          lectura, así que los cambios no se guardan.
        </p>
        <a href={URL_REGISTRO} className="rounded-md bg-white px-3 py-1 font-semibold text-morado hover:bg-crema">
          Prueba PeluDesk gratis
        </a>
      </div>
    );
  }

  const fin = negocio.prueba_termina_at ? new Date(negocio.prueba_termina_at) : null;
  const prueba = fin ? estadoPrueba(fin) : null;
  const botonAdmin = (texto: string) =>
    esAdmin ? (
      <a href="/admin/modulos" className="rounded-md bg-morado px-3 py-1 font-semibold text-white hover:bg-morado-oscuro">
        {texto}
      </a>
    ) : null;

  if (cobro?.estado === "gracia" && esAdmin) {
    return (
      <div role="alert" data-aviso-plan="gracia" className="flex flex-wrap items-center justify-between gap-2 border-b border-ambar bg-ambar-suave px-4 py-2 text-sm text-n-800 md:px-6">
        <p>
          <strong className="font-semibold text-ambar-oscuro">No pudimos cobrar tu suscripción de PeluDesk.</strong> Todo sigue funcionando
          {cobro.solo_lectura_desde ? ` hasta el ${formatearFecha(cobro.solo_lectura_desde, zona)}` : ""}; después el negocio queda en solo lectura.
        </p>
        {botonAdmin("Pagar o cambiar la tarjeta")}
      </div>
    );
  }

  if (cobro?.estado === "solo_lectura" || cobro?.estado === "cancelado") {
    return (
      <div role="alert" data-aviso-plan={cobro.estado} className="flex flex-wrap items-center justify-between gap-2 border-b border-coral bg-coral-suave px-4 py-2 text-sm text-n-800 md:px-6">
        <p>
          <strong className="font-semibold text-coral-oscuro">
            {!esPersonal
              ? "Por ahora no se pueden hacer cambios en línea."
              : cobro.estado === "cancelado"
                ? "La suscripción de PeluDesk terminó: el negocio está en solo lectura."
                : "El negocio está en solo lectura: no se pudo cobrar la suscripción de PeluDesk."}
          </strong>{" "}
          {!esPersonal
            ? `Si necesitas algo, comunícate con ${negocio.nombre}.`
            : esAdmin
              ? "Tu información está a salvo. En cuanto se pague, todo vuelve a funcionar solo."
              : "Tu información está a salvo. Avísale al administrador del negocio."}
        </p>
        {botonAdmin(cobro.estado === "cancelado" ? "Contratar de nuevo" : "Pagar ahora")}
      </div>
    );
  }

  if (cobro?.estado === "prueba_vencida" && fin) {
    const wa = await whatsappPeluDesk(`Hola, soy de ${negocio.nombre} (${negocio.slug}.peludesk.mx). Terminó mi prueba de PeluDesk y quiero seguir usándolo.`);
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-b border-ambar bg-ambar-suave px-4 py-2 text-sm text-n-800 md:px-6">
        <p>
          <strong className="font-semibold text-ambar-oscuro">
            {esPersonal ? `Tu prueba de PeluDesk terminó el ${formatearFecha(fin.toISOString(), zona)}.` : "Por ahora no se pueden hacer cambios en línea."}
          </strong>{" "}
          {!esPersonal
            ? `Si necesitas algo, comunícate con ${negocio.nombre}.`
            : esAdmin
              ? "Tu información está a salvo y puedes consultarla. Contrata un plan y todo vuelve a funcionar al instante."
              : "Tu información está a salvo y puedes consultarla, pero ya no se pueden guardar cambios. Avísale al administrador del negocio."}
        </p>
        {botonAdmin("Contratar")}
        {esPersonal && !esAdmin && wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" className="rounded-md bg-menta-oscuro px-3 py-1 font-semibold text-white hover:bg-morado">
            Escríbenos por WhatsApp
          </a>
        )}
      </div>
    );
  }

  if (negocio.plan === "prueba" && fin && prueba && !prueba.vencida && esPersonal && !cobro?.contratado) {
    const dias = prueba.dias;
    return (
      <div role="status" className="bg-morado-suave px-4 py-1.5 text-center text-sm text-morado md:px-6">
        Prueba gratis de PeluDesk: {dias === 0 ? "termina hoy" : `te quedan ${dias} ${dias === 1 ? "día" : "días"}`} (hasta el{" "}
        {formatearFecha(fin.toISOString(), zona)}).{" "}
        <a href="/bienvenida" className="font-semibold underline underline-offset-2">
          Primeros pasos
        </a>
        {esAdmin && (
          <>
            {" · "}
            <a href="/admin/modulos" className="font-semibold underline underline-offset-2">
              Contratar sin perder días
            </a>
          </>
        )}
      </div>
    );
  }

  if (escribible === false) {
    return (
      <div role="status" className="bg-n-100 px-4 py-1.5 text-center text-sm text-n-700 md:px-6">
        Esta cuenta es de solo lectura: puedes consultar todo, pero no guardar cambios.
      </div>
    );
  }
  return null;
}
