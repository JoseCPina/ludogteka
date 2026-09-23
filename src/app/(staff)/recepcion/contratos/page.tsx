import Link from "next/link";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Alert } from "@/components/ui/alert";
import { formatearFecha } from "@/lib/formato";
import { urlPublica } from "@/lib/mercadopago/config";
import { BotonRegenerar } from "./boton-regenerar";

type Fila = {
  situacion: "por_firmar" | "por_regenerar";
  contrato_id: string;
  perro_id: string;
  perro_nombre: string;
  cliente_nombre: string;
  cliente_telefono: string | null;
  tipo_nombre: string;
  paquete_nombre: string | null;
  created_at: string;
  fecha_firma: string | null;
  regenerar_motivo: string | null;
};

// El recordatorio sale con el link del portal, que es donde se firma: el
// contrato de guardería ya no se firma en el alta.
function recordatorioWhatsApp(f: Fila): string | null {
  const telefono = (f.cliente_telefono ?? "").replace(/\D/g, "");
  if (telefono.length !== 10) return null;
  const mensaje =
    `Hola ${f.cliente_nombre}, tienes pendiente de firmar el ${f.tipo_nombre.toLowerCase()} de ${f.perro_nombre}` +
    `${f.paquete_nombre ? ` (${f.paquete_nombre})` : ""}. Lo firmas desde tu portal, en la ficha de ${f.perro_nombre}: ` +
    `${urlPublica()}/portal`;
  return `https://wa.me/52${telefono}?text=${encodeURIComponent(mensaje)}`;
}

// Contratos que esperan algo: los que el dueño no ha firmado (el de
// guardería se genera al vender un paquete y se firma en el portal) y los
// firmados con defecto que hay que volver a generar.
export default async function ContratosPorAtenderPage() {
  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase
    .from("contratos_por_atender")
    .select(
      "situacion, contrato_id, perro_id, perro_nombre, cliente_nombre, cliente_telefono, tipo_nombre, paquete_nombre, created_at, fecha_firma, regenerar_motivo"
    )
    .order("created_at");

  const filas = (data ?? []) as Fila[];
  const porRegenerar = filas.filter((f) => f.situacion === "por_regenerar");
  const porFirmar = filas.filter((f) => f.situacion === "por_firmar");

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Link href="/recepcion" className="text-sm font-semibold text-azul hover:underline">
          ← Tablero del día
        </Link>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Contratos por firmar</h1>
        <p className="mt-1 text-n-600">
          El contrato de guardería se genera cuando el cliente compra un day pass o una mensualidad, y
          el dueño lo firma desde su portal. Aquí ves quién lo debe, para recordárselo.
        </p>
      </div>

      {error ? (
        <Alert variante="error" titulo="No pudimos cargar los contratos">
          Recarga la página. Si el problema sigue, avísale al equipo técnico.
        </Alert>
      ) : (
        <>
          {porRegenerar.length > 0 && (
            <section className="flex flex-col gap-3">
              <h2 className="text-lg font-bold text-n-900">Hay que volver a generarlos</h2>
              <ul className="flex flex-col gap-3">
                {porRegenerar.map((f) => (
                  <li key={f.contrato_id} className="rounded-lg border border-n-200 border-l-4 border-l-naranja bg-white p-4">
                    <p className="font-bold text-n-900">
                      {f.tipo_nombre} · {f.perro_nombre}
                    </p>
                    <p className="text-sm text-n-600">
                      {f.cliente_nombre}
                      {f.fecha_firma ? ` · firmado el ${formatearFecha(f.fecha_firma)}` : ""}
                    </p>
                    <p className="mt-2 text-sm text-naranja-oscuro">{f.regenerar_motivo}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-3">
                      <BotonRegenerar contratoId={f.contrato_id} />
                      <Link href={`/perros/${f.perro_id}`} className="text-sm font-semibold text-azul hover:underline">
                        Ver expediente
                      </Link>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="flex flex-col gap-3">
            <h2 className="text-lg font-bold text-n-900">Pendientes de firma</h2>
            {porFirmar.length === 0 ? (
              <p className="rounded-lg border border-n-200 bg-white p-4 text-n-600">
                Nadie debe firma. Cuando se venda un paquete de guardería, su contrato aparece aquí
                hasta que el dueño lo firme.
              </p>
            ) : (
              <ul className="divide-y divide-n-200 rounded-lg border border-n-200 bg-white">
                {porFirmar.map((f) => {
                  const wa = recordatorioWhatsApp(f);
                  return (
                    <li key={f.contrato_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                      <div>
                        <p className="font-semibold text-n-900">
                          {f.perro_nombre} · <span className="font-normal">{f.cliente_nombre}</span>
                        </p>
                        <p className="text-sm text-n-600">
                          {f.tipo_nombre}
                          {f.paquete_nombre ? ` · ${f.paquete_nombre}` : ""} · desde el {formatearFecha(f.created_at)}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-3">
                        {wa && (
                          <a
                            href={wa}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-10 items-center rounded-md bg-verde-oscuro px-4 text-sm font-semibold text-white hover:bg-[#155c33]"
                          >
                            Recordar por WhatsApp
                          </a>
                        )}
                        <Link href={`/perros/${f.perro_id}`} className="text-sm font-semibold text-azul hover:underline">
                          Ver expediente
                        </Link>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
