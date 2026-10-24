import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { zonaActual } from "@/lib/negocio/actual";
import { formatearFecha } from "@/lib/formato";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { whatsappPeluDesk } from "@/lib/peludesk/landing";
import { diasDePrueba, primerCobro } from "@/lib/cobro/prueba";
import { cookies } from "next/headers";

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


// Días que le quedan a la prueba: de calendario, en la zona del negocio (los mismos que dice Stripe Checkout).
// Fuera del render: en un componente de servidor se calcula una vez por petición.
function estadoPrueba(fin: Date, zona: string): { vencida: boolean; dias: number } {
  return { vencida: fin.getTime() - Date.now() < 0, dias: diasDePrueba(fin.toISOString(), zona) };
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

  // QA S17: una sucursal dada de baja queda en solo lectura 90 días.
  const { data: baja } = await supabase.from("negocios").select("sucursal_baja_at, sucursal_baja_hasta").eq("id", negocio.id).maybeSingle();
  if (baja?.sucursal_baja_at) {
    return (
      <div role="alert" data-aviso-plan="sucursal_baja" className="border-b border-n-300 bg-n-100 px-4 py-2 text-sm text-n-800 md:px-6">
        <strong className="font-semibold">Esta sucursal se dio de baja</strong> el {formatearFecha(baja.sucursal_baja_at as string, zona)} y queda en solo lectura
        {baja.sucursal_baja_hasta ? ` hasta el ${formatearFecha(baja.sucursal_baja_hasta as string, zona)}` : ""}: puedes consultar todo, pero ya no se captura nada.
      </div>
    );
  }

  if (negocio.plan === "demo" && escribible === false) {
    // QA S18 (N73): quien llegó desde la vista previa de un prospecto regresa a SU página (el clic se registra ahí) y la
    // revisión interna (?interno=1) se conserva: no cuenta como visita ni como registro.
    const galletas = await cookies();
    const prospecto = galletas.get("peludesk_prospecto")?.value;
    const interno = galletas.get("peludesk_interno")?.value === "1";
    const registro = prospecto && /^[a-z0-9-]{3,80}$/.test(prospecto)
      ? `https://peludesk.mx/para/${prospecto}/ir/prueba${interno ? "?interno=1" : ""}`
      : `${URL_REGISTRO}${interno ? "?interno=1" : ""}`;
    return (
      <div role="status" data-aviso-plan="demo" className="flex flex-wrap items-center justify-between gap-2 bg-morado px-4 py-2 text-sm text-white md:px-6">
        <p>
          <strong className="font-semibold">Negocio de ejemplo de PeluDesk. Así se vería el tuyo.</strong> No es un cliente real: los
          datos son de ejemplo y es de solo lectura, así que los cambios no se guardan.
        </p>
        <a href={registro} data-demo-registro className="rounded-md bg-white px-3 py-1 font-semibold text-morado hover:bg-crema">
          Prueba PeluDesk gratis
        </a>
      </div>
    );
  }

  const fin = negocio.prueba_termina_at ? new Date(negocio.prueba_termina_at) : null;
  const prueba = fin ? estadoPrueba(fin, zona) : null;
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

  // N123: ya contrató durante la prueba. Al admin se le dice cuándo es el primer cobro, con el trial_end real de Stripe
  // (el mismo día que ve en «Módulos y plan» y que dice Stripe: prueba hasta el 3 nov → primer cobro el 4 nov).
  if (negocio.plan === "prueba" && fin && prueba && !prueba.vencida && esAdmin && cobro?.contratado) {
    const { data: mio } = await supabase.rpc("mi_cobro");
    const hasta = (mio as { prueba_hasta?: string | null } | null)?.prueba_hasta ?? null;
    if (hasta) {
      return (
        <div role="status" data-aviso-plan="contratado_en_prueba" className="bg-morado-suave px-4 py-1.5 text-center text-sm text-morado md:px-6">
          Contrataste PeluDesk: tu prueba sigue hasta el {formatearFecha(hasta, zona)} y el primer cobro es el{" "}
          <strong data-primer-cobro>{formatearFecha(primerCobro(hasta), zona)}</strong>.{" "}
          <a href="/admin/modulos" className="font-semibold underline underline-offset-2">
            Ver mi plan
          </a>
        </div>
      );
    }
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
