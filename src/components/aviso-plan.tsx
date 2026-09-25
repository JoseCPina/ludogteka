import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { zonaActual } from "@/lib/negocio/actual";
import { formatearFecha } from "@/lib/formato";

// El aviso del plan del negocio, arriba de todo en el staff y el portal:
//   demo (cuenta de solo lectura) → qué es y cómo probar PeluDesk;
//   prueba vigente               → cuándo termina (solo el personal);
//   prueba vencida / solo lectura → que la información está a salvo y a
//                                   quién escribir.
// La base ya impide escribir (negocio_escribible()); esto solo lo explica.
const URL_REGISTRO = "https://peludesk.mx/registro";

function whatsappPeluDesk(mensaje: string): string | null {
  const tel = (process.env.PELUDESK_WHATSAPP ?? "").replace(/\D/g, "");
  if (tel.length < 10) return null;
  return `https://wa.me/${tel.length === 10 ? `52${tel}` : tel}?text=${encodeURIComponent(mensaje)}`;
}

// Días que le quedan a la prueba (negativo: ya venció). Fuera del render:
// en un componente de servidor se calcula una vez por petición.
function estadoPrueba(fin: Date): { vencida: boolean; dias: number } {
  const ms = fin.getTime() - Date.now();
  return { vencida: ms < 0, dias: Math.max(0, Math.ceil(ms / 86_400_000)) };
}

export async function AvisoPlan({ esPersonal }: { esPersonal: boolean }) {
  const negocio = await cargarNegocioLanding();
  const supabase = await createSupabaseServerClient();
  const { data: escribible } = await supabase.rpc("negocio_escribible");
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
  if (negocio.plan === "prueba" && fin && prueba?.vencida) {
    const wa = whatsappPeluDesk(`Hola, soy de ${negocio.nombre} (${negocio.slug}.peludesk.mx). Terminó mi prueba de PeluDesk y quiero seguir usándolo.`);
    return (
      <div role="alert" className="flex flex-wrap items-center justify-between gap-2 border-b border-ambar bg-ambar-suave px-4 py-2 text-sm text-n-800 md:px-6">
        <p>
          <strong className="font-semibold text-ambar-oscuro">
            {esPersonal ? `Tu prueba de PeluDesk terminó el ${formatearFecha(fin.toISOString(), zona)}.` : "Por ahora no se pueden hacer cambios en línea."}
          </strong>{" "}
          {esPersonal
            ? wa
              ? "Tu información está a salvo y puedes consultarla, pero ya no se pueden guardar cambios. Escríbenos para seguir usándolo."
              : "Tu información está a salvo y puedes consultarla, pero ya no se pueden guardar cambios. Te vamos a buscar al teléfono con el que te registraste para que sigas usándolo."
            : `Si necesitas algo, comunícate con ${negocio.nombre}.`}
        </p>
        {esPersonal && wa && (
          <a href={wa} target="_blank" rel="noopener noreferrer" className="rounded-md bg-menta-oscuro px-3 py-1 font-semibold text-white hover:bg-morado">
            Escríbenos por WhatsApp
          </a>
        )}
      </div>
    );
  }

  if (negocio.plan === "prueba" && fin && prueba && esPersonal) {
    const dias = prueba.dias;
    return (
      <div role="status" className="bg-morado-suave px-4 py-1.5 text-center text-sm text-morado md:px-6">
        Prueba gratis de PeluDesk: {dias === 0 ? "termina hoy" : `te quedan ${dias} ${dias === 1 ? "día" : "días"}`} (hasta el{" "}
        {formatearFecha(fin.toISOString(), zona)}).{" "}
        <a href="/bienvenida" className="font-semibold underline underline-offset-2">
          Primeros pasos
        </a>
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
