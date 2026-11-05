import { zonaActual } from "@/lib/negocio/actual";
import { hoyNegocio } from "@/lib/formato";
import { RevisarAlertasHasta } from "./revisar-alertas-hasta";

/** La sección del panel de admin con «Dar por revisadas todas las anteriores a…» (la página ya decide quién la ve). */
export async function RevisarAlertasSeccion() {
  const zona = await zonaActual();
  return (
    <section className="flex flex-col gap-3 rounded-lg border border-border bg-card shadow-tarjeta p-5" data-seccion-revisar-alertas>
      <div>
        <h2 className="text-lg font-semibold text-foreground">Alertas atrasadas</h2>
        <p className="mt-1 text-sm text-n-600">
          Lo que «Necesita atención» arrastra de días pasados (tarjetas manuales, contratos sin firmar, llegadas atrasadas, links de pago,
          conciliación) se cierra de un paso con una nota. Nada se borra: cada una queda con tu nota y tu nombre.
        </p>
      </div>
      <RevisarAlertasHasta hoy={hoyNegocio(zona)} />
    </section>
  );
}
