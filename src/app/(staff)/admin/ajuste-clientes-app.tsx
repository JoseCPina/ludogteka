import { createSupabaseServerClient } from "@/lib/supabase/server";
import { negocioActual } from "@/lib/negocio/actual";
import { BotonAccion } from "@/components/formulario-accion";
import { fijarAceptaClientesApp } from "./ajuste-clientes-app-actions";

/** «Aceptar clientes nuevos desde la app»: prendido, un dueño sin expediente pide su lugar en la app; apagado, la app lo manda a WhatsApp. */
export async function AjusteClientesApp() {
  const negocio = await negocioActual();
  const supabase = await createSupabaseServerClient();
  const { data } = await supabase.from("negocios").select("acepta_clientes_app").eq("id", negocio.id).maybeSingle();
  const acepta = data?.acepta_clientes_app !== false;
  return (
    <section className="rounded-lg border border-border bg-card shadow-tarjeta p-5" data-ajuste-clientes-app={acepta ? "prendido" : "apagado"}>
      <h2 className="mb-1 text-lg font-semibold text-foreground">Clientes nuevos desde la app</h2>
      <p className="mb-3 text-sm text-muted-foreground">
        {acepta
          ? "Prendido: quien te encuentra en la app PeluDesk puede pedir su lugar. Te llega a Solicitudes y no cobra ni ocupa cupo hasta que aceptes."
          : "Apagado: la app dice que recibes clientes nuevos por WhatsApp."}
      </p>
      <BotonAccion
        accion={fijarAceptaClientesApp.bind(null, !acepta)}
        texto={acepta ? "Dejar de aceptar clientes nuevos desde la app" : "Aceptar clientes nuevos desde la app"}
        variante="secundario"
      />
    </section>
  );
}
