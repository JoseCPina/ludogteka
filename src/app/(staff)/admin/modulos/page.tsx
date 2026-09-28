import { redirect } from "next/navigation";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { obtenerSesionConRol } from "@/lib/auth/sesion";
import { formatearFecha } from "@/lib/formato";
import { zonaActual } from "@/lib/negocio/actual";
import { Alert } from "@/components/ui/alert";
import { ListaModulos, type FilaModulo } from "./lista-modulos";
import { Suscripcion } from "./suscripcion";
import type { MiCobro, PlanOferta } from "@/lib/cobro/tipos";

// Los módulos del negocio: los de su plan se prenden y se apagan aquí; los
// de otros planes se ven bloqueados con el plan que los incluye. Apagar
// nunca borra: lo capturado se queda y reaparece al prender.
export default async function ModulosPage({ searchParams }: { searchParams: Promise<{ apagado?: string; pago?: string }> }) {
  const sesion = await obtenerSesionConRol();
  if (sesion?.rol !== "admin") redirect("/admin");
  const { apagado, pago } = await searchParams;
  const supabase = await createSupabaseServerClient();
  const zona = await zonaActual();
  const [{ data: filas }, { data: negocio }, { data: cobro }, { data: ofertas }] = await Promise.all([
    supabase.rpc("mis_modulos"),
    supabase.from("negocios").select("plan, plan_id, prueba_termina_at, planes(nombre)").maybeSingle(),
    supabase.rpc("mi_cobro"),
    supabase
      .from("planes")
      .select("id, clave, nombre, descripcion, tipo, precio_mensual, modulos")
      .eq("activo", true)
      .is("deleted_at", null)
      .order("orden"),
  ]);
  const modulos = (filas ?? []) as FilaModulo[];
  const plan = (Array.isArray(negocio?.planes) ? negocio?.planes[0] : negocio?.planes) as { nombre: string } | null | undefined;
  const enPrueba = negocio?.plan === "prueba";
  const nombreApagado = modulos.find((m) => m.clave === apagado)?.nombre;

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <header>
        <h1 className="text-2xl font-bold tracking-tight text-n-900">Módulos y plan</h1>
        <p className="mt-1 text-n-700">
          {enPrueba ? (
            <>
              Estás en la prueba gratis
              {negocio?.prueba_termina_at ? ` (hasta el ${formatearFecha(negocio.prueba_termina_at as string, zona)})` : ""}: tienes todos
              los módulos del plan Completo para que los conozcas. El plan que te sugerimos por lo que ofreces es{" "}
              <strong>{plan?.nombre ?? "Completo"}</strong>.
            </>
          ) : (
            <>
              Tu plan: <strong>{plan?.nombre ?? "sin plan"}</strong>. Prende solo lo que usas: lo apagado se esconde del menú, del
              tablero y del portal, pero nada se borra.
            </>
          )}{" "}
          Caja y clientes siempre están.
        </p>
      </header>
      {pago === "ok" && (
        <Alert variante="exito" titulo="¡Gracias! Tu suscripción quedó registrada">
          Stripe te manda el recibo por correo. Aquí abajo ves tu plan y la fecha del próximo cobro.
        </Alert>
      )}
      {pago === "cancelado" && (
        <Alert variante="info" titulo="No se hizo ningún cobro">
          Saliste de la página de pago antes de terminar. Puedes contratar cuando quieras.
        </Alert>
      )}
      {cobro && (
        <Suscripcion
          cobro={cobro as MiCobro}
          planes={((ofertas ?? []) as PlanOferta[]).map((p) => ({ ...p, precio_mensual: Number(p.precio_mensual) }))}
          nombresModulos={Object.fromEntries(modulos.map((m) => [m.clave, m.nombre]))}
          planSugerido={(negocio?.plan_id as string | null) ?? null}
        />
      )}
      {nombreApagado && (
        <Alert variante="info" titulo={`${nombreApagado} no está activo`}>
          Por eso no se abrió esa sección. Si tu plan lo incluye, préndelo aquí.
        </Alert>
      )}
      <ListaModulos modulos={modulos} />
    </div>
  );
}
