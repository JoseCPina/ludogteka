"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { CampoCopiable } from "@/components/ui/campo-copiable";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { BotonAccion } from "@/components/formulario-accion";
import { VideoSala } from "@/components/telemedicina/video-sala";
import { useEspera } from "@/hooks/use-espera";
import { crearLigaDePagoTeleconsulta, entrarComoMedico, enviarLigaPorWhatsApp, generarLigaTeleconsulta, prepararSalaTeleconsulta } from "../../agenda/telemedicina-actions";
import { iniciarDesdeCita } from "../../expediente/actions";

type Liga = { liga: string; urlWhatsApp?: string };

/** Lo que el médico hace con una teleconsulta: liga del dueño, cobro, sala y consulta. */
export function PanelTeleconsulta({
  citaId, hayDetalle, puedeEntrar, requierePago, pagado, monto, firmada, consultaId, puedeAtender, nombreMedico,
}: {
  citaId: string;
  hayDetalle: boolean;
  puedeEntrar: boolean;
  requierePago: boolean;
  pagado: boolean;
  monto: number | null;
  firmada: boolean;
  consultaId: string | null;
  puedeAtender: boolean;
  nombreMedico: string;
}) {
  const router = useRouter();
  const [liga, setLiga] = useState<Liga | null>(null);
  const [pago, setPago] = useState<{ url: string; urlWhatsApp?: string } | null>(null);
  const [sala, setSala] = useState<{ url: string; simulada: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const envio = useEspera();

  async function correr<T extends { error: string | null }>(f: () => Promise<T>, alExito: (r: T) => void) {
    setError(null);
    setExito(null);
    const r = await envio.ejecutar(f);
    if (r.error) return setError(r.error);
    alExito(r);
    router.refresh();
  }

  if (!hayDetalle) {
    return (
      <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-5">
        <h2 className="text-lg font-bold text-n-900">Esta cita todavía no tiene sala</h2>
        <BotonAccion texto="Preparar la sala" accion={() => prepararSalaTeleconsulta(citaId)} textoExito="Sala lista" />
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-5">
        <h2 className="text-lg font-bold text-n-900">1. Mandarle la liga al dueño</h2>
        <p className="text-n-700">La liga abre su pantalla de la teleconsulta: ahí firma el consentimiento{requierePago ? ", paga" : ""} y entra a la sala cuando abre. Una liga nueva deja sin efecto la anterior.</p>
        {liga ? (
          <div className="flex flex-col gap-2">
            <CampoCopiable valor={liga.liga} etiqueta="Liga del dueño" />
            <div className="flex flex-wrap gap-2">
              {liga.urlWhatsApp && (
                <a href={liga.urlWhatsApp} target="_blank" rel="noopener noreferrer" className="inline-flex min-h-10 items-center rounded-md border border-n-200 bg-white px-3 text-sm font-semibold text-morado hover:bg-morado-suave">
                  Abrir en WhatsApp
                </a>
              )}
              <Button type="button" variante="secundario" cargando={envio.cargando} onClick={() => correr(() => enviarLigaPorWhatsApp(citaId, liga.liga), () => setExito("Mensaje enviado por WhatsApp."))}>
                Enviar por WhatsApp
              </Button>
            </div>
          </div>
        ) : (
          <div>
            <Button type="button" cargando={envio.cargando} onClick={() => correr(() => generarLigaTeleconsulta(citaId), (r) => r.liga && setLiga({ liga: r.liga, urlWhatsApp: r.urlWhatsApp }))}>
              Generar liga para el dueño
            </Button>
          </div>
        )}
        <AccionesFormulario error={error} exito={exito}>{null}</AccionesFormulario>
      </section>

      {requierePago && (
        <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-5">
          <h2 className="text-lg font-bold text-n-900">Cobro anticipado{monto ? ` · $${Number(monto).toFixed(2)}` : ""}</h2>
          {pagado ? (
            <Alert variante="exito" titulo="Pagada">La sala puede abrirse.</Alert>
          ) : (
            <>
              <p className="text-n-700">La sala solo abre cuando la teleconsulta está pagada. También puedes cobrarla en Caja.</p>
              {pago ? (
                <div className="flex flex-col gap-2">
                  <CampoCopiable valor={pago.url} etiqueta="Liga de pago" />
                  {pago.urlWhatsApp && <a href={pago.urlWhatsApp} target="_blank" rel="noopener noreferrer" className="w-fit text-sm font-semibold text-morado hover:underline">Mandar la liga de pago por WhatsApp</a>}
                </div>
              ) : (
                <div>
                  <Button type="button" variante="secundario" cargando={envio.cargando} onClick={() => correr(() => crearLigaDePagoTeleconsulta(citaId), (r) => r.url && setPago({ url: r.url, urlWhatsApp: r.urlWhatsApp }))}>
                    Generar liga de pago
                  </Button>
                </div>
              )}
            </>
          )}
        </section>
      )}

      <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-5">
        <h2 className="text-lg font-bold text-n-900">2. La sala</h2>
        {!firmada && <Alert variante="advertencia" titulo="Falta el consentimiento">El dueño todavía no firma el consentimiento de teleconsulta. La sala no abre hasta que lo firme.</Alert>}
        {sala ? (
          <VideoSala url={sala.url} simulada={sala.simulada} titulo="Teleconsulta" />
        ) : (
          <div>
            <Button type="button" disabled={!puedeEntrar || !puedeAtender} cargando={envio.cargando} onClick={() => correr(() => entrarComoMedico(citaId, nombreMedico), (r) => r.url && setSala({ url: r.url, simulada: !!r.simulada }))}>
              Entrar a la sala
            </Button>
            {!puedeEntrar && <p className="mt-2 text-sm text-n-600">Abre 15 minutos antes de la cita, con el consentimiento firmado{requierePago ? " y la teleconsulta pagada" : ""}.</p>}
          </div>
        )}
      </section>

      <section className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-5">
        <h2 className="text-lg font-bold text-n-900">3. La consulta</h2>
        <p className="text-n-700">Se documenta en el mismo expediente (marcada «telemedicina») y puedes dictarla. Nada se firma solo.</p>
        {consultaId ? (
          <a href={`/veterinaria/consulta/${consultaId}`} className="inline-flex min-h-10 w-fit items-center rounded-md bg-morado px-4 text-sm font-semibold text-white hover:opacity-90">Abrir la consulta</a>
        ) : puedeAtender ? (
          <BotonAccion texto="Iniciar la consulta" accion={() => iniciarDesdeCita(citaId)} />
        ) : (
          <p className="text-sm text-n-600">Iniciar la consulta es de quien atiende teleconsultas.</p>
        )}
      </section>
    </div>
  );
}
