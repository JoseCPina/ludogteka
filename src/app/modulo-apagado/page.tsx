import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { inicioDeSesion } from "@/lib/auth/rutas";
import { EncabezadoNegocio } from "@/components/marca/encabezado-negocio";

// A donde manda el middleware a quien abre una sección de un módulo que el
// negocio no tiene prendido (el admin va directo a /admin/modulos).
export default async function ModuloApagadoPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { m } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const sesion = await obtenerSesionConRol();
  const { data: modulo } = m ? await supabase.from("modulos").select("nombre").eq("clave", m).maybeSingle() : { data: null };
  const nombre = (modulo?.nombre as string | undefined) ?? "esta sección";
  // Quien no administra y se queda sin su módulo (p. ej. estética con Estética apagada) va a lo que sí puede usar
  // (QA S53, N156: `inicioDeSesion`, la misma regla del layout: Veterinaria si trabaja ahí, su asistencia si no).
  const inicioSesion = sesion ? inicioDeSesion({ rol: sesion.rol, modulos: sesion.modulos, accesoVeterinaria: sesion.accesoVeterinaria, esMedico: sesion.esMedico }) : "/login";
  const inicio = !sesion ? "/login" : inicioSesion === `/${m}` ? "/login" : inicioSesion;
  const esAdmin = sesion?.rol === "admin";
  const esCliente = sesion?.rol === "cliente";
  return (
    <main className="mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col justify-center gap-5 p-6">
      <EncabezadoNegocio />
      <div className="rounded-xl border border-n-200 bg-white p-6">
        <h1 className="text-xl font-bold text-n-900">
          {esCliente ? "Este negocio no usa el portal en línea" : `${nombre} no está activo en este negocio`}
        </h1>
        <p className="mt-2 text-n-700">
          {esCliente
            ? "Para tus citas, reservas y pagos, comunícate directo con el negocio."
            : esAdmin
              ? "Puedes prenderlo en «Módulos y plan», si tu plan lo incluye."
              : "Este módulo está apagado. Lo enciende quien administra el negocio, en «Módulos y plan»: avísale si lo necesitas."}
        </p>
        {!esCliente && inicio !== `/${m}` && inicio !== "/login" && (
          <Link href={inicio} className="mt-4 inline-flex font-semibold text-morado hover:underline">
            {inicio === "/mi-trabajo" ? "Ir a mi asistencia →" : "Ir al inicio →"}
          </Link>
        )}
      </div>
    </main>
  );
}
