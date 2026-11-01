import { createSupabaseServerClient } from "@/lib/supabase/server";
import { cargarNegocioLanding } from "@/lib/landing/negocio";
import { formatearFecha } from "@/lib/formato";
import { zonaActual } from "@/lib/negocio/actual";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { cargarPasosBienvenida } from "@/lib/bienvenida/pasos";
import { AvanceWeb } from "@/components/avance-web";
import { cargarTutorialesVisibles } from "@/lib/tutoriales";
import { VideosParaEmpezar } from "@/components/ayuda/videos-para-empezar";
import { Enlace } from "@/components/ui/enlace";

// Los primeros pasos de un negocio recién abierto desde peludesk.mx (QA S16). Cada paso se marca «Listo» solo
// cuando el negocio ya puede operar con él (cargarPasosBienvenida decide, con la base) y manda a la pantalla donde se
// hace. Arriba no hay «3 de 5»: o «Tu negocio ya puede operar», o la lista exacta de lo que falta.

// Un video por paso (si ya está publicado y es de tus módulos).
const VIDEO_DE_PASO: Record<string, string> = { datos: "07", precios: "20", horario: "07", equipo: "44", medico: "73", requisitos: "12", contrato: "16", cliente: "10" };

export default async function BienvenidaPage() {
  const supabase = await createSupabaseServerClient();
  const negocio = await cargarNegocioLanding();
  const zona = await zonaActual();
  const sesion = await obtenerSesionConRol();
  const mods = sesion?.modulos ?? [];
  const [videos, estado] = await Promise.all([
    cargarTutorialesVisibles(supabase, { rol: sesion?.rol ?? "", permisos: sesion?.permisos ?? [], modulos: mods }).catch(() => []),
    cargarPasosBienvenida(supabase, mods),
  ]);
  const videoDe = (clave: string) => {
    const numero = clave === "precios" && !mods.includes("estetica") ? "07" : VIDEO_DE_PASO[clave];
    return videos.find((v) => v.numero === numero)?.slug;
  };
  const { pasos, puedeOperar, faltan } = estado;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-n-900">Te damos la bienvenida a {negocio.nombre}</h1>
        {negocio.plan === "prueba" && negocio.prueba_termina_at && (
          <p className="mt-1 text-n-700">Tu prueba gratis dura hasta el {formatearFecha(negocio.prueba_termina_at, zona)}.</p>
        )}
      </header>

      {puedeOperar ? (
        <section data-bienvenida-opera className="rounded-xl border-[1.5px] border-menta bg-menta-suave p-5">
          <h2 className="text-lg font-bold text-menta-oscuro">Tu negocio ya puede operar</h2>
          <p className="mt-1 text-sm text-n-800">
            Ya tienes lo necesario para atender: datos, precios, horario{mods.includes("estetica") ? ", quién atiende" : ""}
            {mods.includes("veterinaria") ? ", médico con cédula" : ""}
            {pasos.some((p) => p.clave === "requisitos") ? ", requisitos para hospedar" : ""}
            {pasos.some((p) => p.clave === "contrato") ? " y contrato" : ""}. Lo de abajo lo puedes revisar cuando quieras.
          </p>
        </section>
      ) : (
        <section data-bienvenida-falta className="rounded-xl border-[1.5px] border-ambar bg-ambar-suave p-5">
          <h2 className="text-lg font-bold text-ambar-oscuro">Para operar te falta:</h2>
          <ul className="mt-2 flex flex-col gap-1.5">
            {faltan.map((p) => (
              <li key={p.clave} className="text-sm text-n-800">
                <Enlace href={p.href}>
                  {p.titulo}
                </Enlace>
                {p.falta ? ` — ${p.falta}` : ""}
              </li>
            ))}
          </ul>
        </section>
      )}

      <ol className="flex flex-col divide-y divide-n-200 rounded-xl border border-n-200 bg-white">
        {pasos.map((p, i) => {
          const video = videoDe(p.clave);
          return (
            <li key={p.clave} data-paso={p.clave} data-listo={p.listo ? "1" : "0"} className="flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:gap-5">
              <span
                aria-hidden
                className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-bold ${p.listo ? "bg-menta text-morado" : "border-[1.5px] border-borde text-n-700"}`}
              >
                {p.listo ? "✓" : i + 1}
              </span>
              <div className="flex-1">
                <h2 className="font-semibold text-n-900">
                  {p.titulo}
                  {p.listo ? (
                    <span className="ml-2 text-sm font-medium text-menta-oscuro">Listo</span>
                  ) : !p.requerido ? (
                    <span className="ml-2 text-sm font-medium text-n-500">Cuando quieras</span>
                  ) : null}
                </h2>
                <p className="mt-0.5 text-sm text-n-700">{p.que}</p>
                {!p.listo && p.falta && <p className="mt-1 text-sm font-semibold text-ambar-oscuro">{p.falta}</p>}
                {video && (
                  <Enlace href={`/ayuda/videos/${video}`} data-video-paso className="mt-1 text-sm">
                    ▶ Ver cómo se hace (video)
                  </Enlace>
                )}
              </div>
              <Enlace href={p.href} className="shrink-0 text-sm">
                {p.listo ? "Revisar" : p.accion}
              </Enlace>
            </li>
          );
        })}
      </ol>

      <section data-bienvenida-whatsapp className="rounded-xl border border-n-200 bg-white p-5">
        <h2 className="font-semibold text-n-900">Cómo se avisa a tus clientes por WhatsApp</h2>
        <p className="mt-1 text-sm text-n-700">
          En la cita, la reserva y la ficha del cliente vas a ver botones como <strong>Confirmación</strong>, <strong>Recordatorio</strong>,{" "}
          <strong>Listo para recoger</strong> e <strong>Invitar al portal</strong>. Cada uno te enseña el mensaje y, si te parece, abre
          WhatsApp en tu celular o computadora con ese mensaje ya escrito al número del cliente: tú lo mandas. PeluDesk no manda esos
          mensajes solo, así que salen desde el WhatsApp de tu negocio.
        </p>
      </section>

      <VideosParaEmpezar videos={videos} />
      <AvanceWeb />
      <p className="text-sm text-n-600">
        Puedes volver a esta página cuando quieras desde el aviso de arriba.{" "}
        <Enlace href="/admin" enTexto>
          Ir a Administración
        </Enlace>
      </p>
    </div>
  );
}
