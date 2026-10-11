import type { Metadata } from "next";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { negocioActual, zonaActual } from "@/lib/negocio/actual";
import { formatearFecha, horaLocalDeInstante } from "@/lib/formato";
import { hashDeToken, tokenPlausible } from "@/lib/reporte/enlaces";
import { LigaNoDisponible, MarcoLiga } from "@/components/publico/marco-liga";
import { llenarConsentimiento } from "@/lib/veterinaria/carnet";
import type { TeleconsultaPublica } from "@/lib/telemedicina/tipos";
import { Paso } from "./pasos";
import { SalaDueno } from "./sala";
import { FirmarConsentimiento } from "./firmar";
import { Refrescar } from "./refrescar";

// Teleconsulta (/t/<token>): sin sesión. El dueño firma el consentimiento, (si aplica) paga, y entra a la
// videollamada desde el navegador de su celular. Nada del expediente clínico.
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const negocio = await negocioActual();
  return { title: `Teleconsulta · ${negocio.nombre}`, robots: { index: false, follow: false }, openGraph: { title: `Teleconsulta · ${negocio.nombre}`, images: [] } };
}

export default async function TeleconsultaPublica({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const negocio = await negocioActual();
  const zona = await zonaActual();
  let d: TeleconsultaPublica | null = null;
  if (tokenPlausible(token)) {
    const admin = createSupabaseAdminClient(negocio.id);
    const { data } = await admin.rpc("teleconsulta_publica", { p_token_hash: hashDeToken(token) });
    d = (data as TeleconsultaPublica | null) ?? null;
  }
  if (!d) {
    return (
      <MarcoLiga>
        <LigaNoDisponible negocio={negocio.nombre} vencida={false} />
      </MarcoLiga>
    );
  }
  const cuando = `${formatearFecha(d.inicia_at, zona)} · ${horaLocalDeInstante(d.inicia_at, zona)}`;
  const abre = `${formatearFecha(d.desde, zona)} · ${horaLocalDeInstante(d.desde, zona)}`;
  const telefono = d.telefono_negocio ? ` o llámanos al ${d.telefono_negocio}` : "";
  const consentimientoTexto = llenarConsentimiento(d.consentimiento.cuerpo, d.consentimiento.campos);

  return (
    <MarcoLiga>
      <header>
        <p className="text-xs font-bold uppercase tracking-wide text-morado">Teleconsulta en {d.negocio}</p>
        <h1 className="mt-1 text-2xl font-bold text-n-900">Consulta de {d.mascota}</h1>
        <p className="text-n-700">
          Con {d.medico} · {cuando}
        </p>
      </header>

      {d.ventana === "cancelada" && (
        <section role="status" className="rounded-xl border border-n-200 bg-white p-5">
          <h2 className="text-lg font-bold text-n-900">Esta teleconsulta se canceló</h2>
          <p className="text-n-700">{d.negocio} te avisará si se reprograma{telefono}.</p>
        </section>
      )}
      {d.ventana === "cerrada" && (
        <section role="status" className="rounded-xl border border-n-200 bg-white p-5">
          <h2 className="text-lg font-bold text-n-900">Esta teleconsulta ya terminó</h2>
          <p className="text-n-700">Si necesitas otra, pídele a {d.negocio} que agende una{telefono}.</p>
        </section>
      )}

      {(d.ventana === "antes" || d.ventana === "abierta") && (
        <>
          <ol className="flex flex-col gap-3">
            <Paso numero={1} titulo="Firma el consentimiento" hecho={d.consentimiento_firmado} detalle={d.consentimiento_firmado ? `Firmado por ${d.consentimiento_firmante ?? "ti"}.` : "Es un permiso corto para consultar a distancia. Lo firmas con el dedo."}>
              {!d.consentimiento_firmado && <FirmarConsentimiento token={token} titulo={d.consentimiento.titulo} cuerpo={consentimientoTexto} dueno={d.dueno} />}
            </Paso>
            {d.pago_requerido && (
              <Paso
                numero={2}
                titulo="Paga la teleconsulta"
                hecho={d.pagado}
                detalle={d.pagado ? "Pago registrado." : `Total: $${Number(d.monto ?? 0).toFixed(2)}. La sala abre cuando se registre tu pago.`}
              >
                {!d.pagado &&
                  (d.url_pago ? (
                    <a href={d.url_pago} className="inline-flex min-h-11 items-center justify-center rounded-md bg-morado px-4 py-2 font-semibold text-white" rel="noopener">
                      Pagar ahora
                    </a>
                  ) : (
                    <p className="text-n-700">Pídele a {d.negocio} la liga de pago{telefono}. En cuanto se registre, esta pantalla se actualiza sola.</p>
                  ))}
              </Paso>
            )}
            <Paso
              numero={d.pago_requerido ? 3 : 2}
              titulo="Entra a la videollamada"
              hecho={false}
              detalle={d.ventana === "antes" ? `La sala abre 15 minutos antes de la cita (${abre}).` : "Abre desde tu celular, sin instalar nada. Permite la cámara y el micrófono cuando te lo pida."}
            >
              {d.ventana === "abierta" && (d.puede_entrar ? <SalaDueno token={token} /> : <p className="text-n-700">Completa los pasos de arriba para poder entrar.</p>)}
            </Paso>
          </ol>
          <Refrescar activo={!d.puede_entrar || d.ventana === "antes"} />
          <p className="text-sm text-n-600">
            La videollamada no se graba. Si se corta tu conexión, vuelve a abrir esta misma liga. Si tu mascota está en una emergencia, no esperes la teleconsulta: ve a una clínica{telefono}.
          </p>
        </>
      )}
    </MarcoLiga>
  );
}
