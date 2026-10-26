import { EnlaceOTexto } from "@/components/acceso-contexto";
import { redirect } from "next/navigation";
import { accesoDeSesion, puedeAbrir } from "@/lib/auth/acceso";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { negocioActual } from "@/lib/negocio/actual";
import { precioRecordatorioVigente, pesosRecordatorio } from "@/lib/recordatorios/precio";
import { RecordatoriosForm } from "./recordatorios-form";

// Configuración → Recordatorios: qué recordatorios por WhatsApp salen solos y a qué hora. El tope de gasto vive en
// Módulos y plan (es dinero: solo el admin).
export default async function RecordatoriosAjustesPage() {
  const sesion = await obtenerSesionConRol();
  if (!puedeAbrir(accesoDeSesion(sesion), "/admin/recordatorios")) redirect("/admin");
  const supabase = await createSupabaseServerClient();
  const negocio = await negocioActual();
  const [{ data: fila }, precio] = await Promise.all([
    supabase.from("recordatorios_ajustes").select("estetica, veterinaria, llegada, listo, vacuna, hora_envio").eq("negocio_id", negocio.id).is("deleted_at", null).maybeSingle(),
    precioRecordatorioVigente(),
  ]);
  const modulos = sesion?.modulos ?? [];
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-n-900">Recordatorios por WhatsApp</h1>
        <p className="mt-1 text-n-700">
          PeluDesk le manda a tu cliente el recordatorio por WhatsApp, solo, desde el número de PeluDesk y con el nombre de tu negocio
          en el mensaje. Tu cliente contesta con un botón: «Confirmo» pone la cita en confirmada y «Necesito cambiarla» te avisa en{" "}
          <EnlaceOTexto className="underline" href="/recordatorios">
            Recordatorios
          </EnlaceOTexto>{" "}
          para que le escribas.
        </p>
      </header>
      <RecordatoriosForm
        inicial={{
          estetica: Boolean(fila?.estetica),
          veterinaria: Boolean(fila?.veterinaria),
          llegada: Boolean(fila?.llegada),
          listo: Boolean(fila?.listo),
          vacuna: Boolean(fila?.vacuna),
          hora: String(fila?.hora_envio ?? "10:00").slice(0, 5),
        }}
        modulos={modulos}
      />
      <section className="rounded-xl border border-n-200 bg-white p-4 text-sm text-n-700">
        <h2 className="font-semibold text-n-900">Consentimiento y costo</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5">
          <li>
            Al dar de alta a un cliente (en mostrador, por link o en su portal) queda la casilla «Acepta recordatorios por WhatsApp», marcada por
            omisión. Tus clientes que ya existían quedan aceptados si tienen un teléfono de 10 dígitos.
          </li>
          <li>Cada mensaje dice cómo darse de baja: si tu cliente responde BAJA, deja de recibir los recordatorios de tu negocio.</li>
          <li>
            {precio
              ? `${precio.gratisMes} recordatorios entregados gratis al mes; después, ${pesosRecordatorio(precio.precio)} + IVA por mensaje entregado, en la misma factura de tu plan, con el tope que pongas en `
              : "Recordatorios gratis cada mes; después, centavos por mensaje entregado, en la misma factura de tu plan, con el tope que pongas en "}
            <EnlaceOTexto className="underline" href="/admin/modulos">
              Módulos y plan
            </EnlaceOTexto>
            . Los que no se entregan no cuentan.
          </li>
          <li>Si prefieres mandarlos tú, déjalos apagados: en la cita y en la reserva sigue el botón «Avisar por WhatsApp», que abre WhatsApp con el mensaje ya escrito.</li>
        </ul>
      </section>
    </div>
  );
}
