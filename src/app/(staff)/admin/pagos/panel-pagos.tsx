"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { CampoCopiable } from "@/components/ui/campo-copiable";
import { NOMBRE_PROVEEDOR, type ProveedorElegible } from "@/lib/pagos/tipos";
import {
  conectarMercadoPago,
  desconectarClip,
  desconectarMercadoPago,
  elegirProveedor,
  escogerTerminal,
  guardarClip,
  ponerEnModoIntegrado,
  probarMercadoPago,
  terminalesMercadoPago,
  type TerminalMp,
} from "./actions";

export type EstadoConexion = {
  conectada: boolean;
  error: string | null;
  cuenta: string | null;
  simulada: boolean;
  terminal: string | null;
  vence: string | null;
  avisoRenovacion: string | null;
};

const OPCIONES: { valor: ProveedorElegible; texto: string }[] = [
  { valor: "mercadopago", texto: "Terminal Point Smart y links de pago" },
  { valor: "clip", texto: "Terminal Clip" },
  { valor: "manual", texto: "Registro todo a mano" },
];

function Etiqueta({ children, tono }: { children: React.ReactNode; tono: "ok" | "sim" | "no" }) {
  const clases = tono === "ok" ? "bg-menta-suave text-menta-oscuro" : tono === "sim" ? "bg-ambar-suave text-ambar-oscuro" : "bg-n-100 text-n-600";
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${clases}`}>{children}</span>;
}

export function PanelPagos({
  elegido,
  mp,
  clip,
  urlWebhookClip,
  oauthDisponible,
  oauthSimulado,
  legado,
}: {
  elegido: ProveedorElegible;
  mp: EstadoConexion;
  clip: EstadoConexion;
  urlWebhookClip: string | null;
  oauthDisponible: boolean;
  oauthSimulado: boolean;
  legado: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [terminales, setTerminales] = useState<TerminalMp[] | null>(null);
  const [clipForm, setClipForm] = useState({ apiKey: "", secretKey: "", serie: "", usuario: "" });
  // El resultado del formulario de Clip, junto a su botón (el de arriba es general).
  const [clipResultado, setClipResultado] = useState<{ error: string | null; aviso?: string } | null>(null);
  const eligiendo = useEspera();
  const conectando = useEspera();
  const desconectando = useEspera();
  const buscando = useEspera();
  const guardandoTerminal = useEspera();
  const probando = useEspera();
  const guardandoClip = useEspera();

  function resultado(r: { error: string | null; aviso?: string }, exito?: string) {
    setError(r.error);
    setAviso(r.error ? null : r.aviso ?? exito ?? null);
    if (!r.error) router.refresh();
  }

  async function elegir(p: ProveedorElegible) {
    resultado(await eligiendo.ejecutar(() => elegirProveedor(p)), `Ahora cobras con: ${NOMBRE_PROVEEDOR[p]}.`);
  }

  async function conectar() {
    setError(null);
    const r = await conectando.ejecutar(() => conectarMercadoPago());
    if (r.error || !r.url) return setError(r.error ?? "No se pudo iniciar la conexión.");
    window.location.assign(r.url);
  }

  async function buscarTerminales() {
    setError(null);
    const r = await buscando.ejecutar(() => terminalesMercadoPago());
    if (r.error) return setError(r.error);
    setTerminales(r.terminales ?? []);
  }

  return (
    <div className="flex flex-col gap-6">
      {error && <Alert variante="error" titulo="No se pudo completar">{error}</Alert>}
      {aviso && <Alert variante="exito" titulo={aviso} />}

      <section className="rounded-lg border border-n-200 bg-white p-5">
        <h2 className="text-lg font-bold text-n-900">¿Con qué cobras en el mostrador?</h2>
        <div className="mt-4 grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label="Con qué cobras">
          {OPCIONES.map((o) => (
            <button
              key={o.valor}
              type="button"
              role="radio"
              aria-checked={elegido === o.valor}
              disabled={eligiendo.cargando}
              onClick={() => elegir(o.valor)}
              className={`flex min-h-20 flex-col items-start justify-center rounded-md border-[1.5px] px-4 py-3 text-left focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado ${
                elegido === o.valor ? "border-morado bg-morado-suave" : "border-n-200 bg-white hover:border-morado/50"
              }`}
            >
              <span className="font-semibold text-n-900">{NOMBRE_PROVEEDOR[o.valor]}</span>
              <span className="text-sm text-n-600">{o.texto}</span>
            </button>
          ))}
        </div>
      </section>

      {elegido === "mercadopago" && (
        <section className="flex flex-col gap-4 rounded-lg border border-n-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-n-900">Mercado Pago</h2>
            {mp.conectada ? (
              <Etiqueta tono={mp.simulada ? "sim" : "ok"}>{mp.simulada ? "Simulación: no mueve dinero" : "Conectado"}</Etiqueta>
            ) : legado ? (
              <Etiqueta tono="ok">Conexión anterior</Etiqueta>
            ) : (
              <Etiqueta tono="no">Sin conectar</Etiqueta>
            )}
          </div>

          <p className="text-sm text-n-600" data-solo-pagos-propios>PeluDesk solo concilia los pagos que cobra desde aquí; los demás pagos de tu cuenta se ignoran.</p>
          {mp.error && <Alert variante="error" titulo="La conexión tiene un problema">{mp.error}</Alert>}
          {mp.conectada && (
            <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[10rem_1fr]">
              <dt className="text-n-600">Cuenta</dt>
              <dd className="text-n-900">{mp.cuenta ?? "—"}</dd>
              <dt className="text-n-600">Terminal</dt>
              <dd className="text-n-900">{mp.terminal ?? "Sin escoger"}</dd>
              {mp.vence && (
                <>
                  <dt className="text-n-600">Permiso vigente hasta</dt>
                  <dd className="text-n-900">{mp.vence} · se renueva solo</dd>
                </>
              )}
            </dl>
          )}
          {mp.avisoRenovacion && !mp.error && <p className="text-sm text-ambar-oscuro">{mp.avisoRenovacion}</p>}

          {!oauthDisponible ? (
            <p className="text-sm text-n-600">La conexión con Mercado Pago todavía no está disponible. Mientras, cobra a mano.</p>
          ) : (
            <AccionesFormulario>
              <Button type="button" cargando={conectando.cargando} onClick={conectar}>
                {mp.conectada ? "Reconectar Mercado Pago" : "Conectar Mercado Pago"}
              </Button>
              {mp.conectada && (
                <>
                  <Button type="button" variante="secundario" cargando={probando.cargando} onClick={async () => resultado(await probando.ejecutar(() => probarMercadoPago()))}>
                    Probar conexión
                  </Button>
                  <Button
                    type="button"
                    variante="peligro"
                    cargando={desconectando.cargando}
                    onClick={async () => {
                      if (!window.confirm("¿Desconectar Mercado Pago? La terminal y los links dejan de funcionar hasta que vuelvas a conectar.")) return;
                      resultado(await desconectando.ejecutar(() => desconectarMercadoPago()));
                    }}
                  >
                    Desconectar
                  </Button>
                </>
              )}
            </AccionesFormulario>
          )}
          {oauthSimulado && (
            <p className="text-sm text-ambar-oscuro">Ambiente de pruebas: «Conectar» abre una autorización simulada y todo lo que se cobre es simulación.</p>
          )}

          {mp.conectada && (
            <div className="flex flex-col gap-3 border-t border-n-200 pt-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-semibold text-n-900">Tu terminal</p>
                <Button type="button" variante="secundario" cargando={buscando.cargando} onClick={buscarTerminales}>
                  Ver las terminales de mi cuenta
                </Button>
              </div>
              <p className="text-sm text-n-600">
                Solo Point Smart recibe cobros desde la app. Point Air, Mini o Blue cobran solas, con el celular: con esas registra el cobro a mano.
              </p>
              {terminales && terminales.length === 0 && (
                <Alert variante="advertencia" titulo="Tu cuenta no tiene terminales vinculadas">
                  Vincula tu Point Smart a esta misma cuenta desde la app de Mercado Pago y vuelve a apretar el botón.
                </Alert>
              )}
              {terminales && terminales.length > 0 && (
                <ul className="flex flex-col gap-2">
                  {terminales.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-n-200 px-4 py-3">
                      <span>
                        <span className="block font-semibold text-n-900">{t.nombre}</span>
                        <span className="block break-all text-xs text-n-600">{t.id}</span>
                        {!t.compatible && <span className="block text-sm text-coral-oscuro">No compatible: esta terminal no recibe cobros desde la app.</span>}
                        {t.compatible && !t.pdv && <span className="block text-sm text-ambar-oscuro">No está en modo integrado (PDV).</span>}
                      </span>
                      {t.compatible && (
                        <span className="flex flex-wrap gap-2">
                          {!t.pdv && (
                            <Button type="button" variante="secundario" onClick={async () => resultado(await guardandoTerminal.ejecutar(() => ponerEnModoIntegrado(t.id)))}>
                              Poner en modo integrado
                            </Button>
                          )}
                          <Button type="button" cargando={guardandoTerminal.cargando} onClick={async () => resultado(await guardandoTerminal.ejecutar(() => escogerTerminal(t.id)), "Terminal escogida.")}>
                            Usar esta
                          </Button>
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </section>
      )}

      {elegido === "clip" && (
        <section className="flex flex-col gap-4 rounded-lg border border-n-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-lg font-bold text-n-900">Clip</h2>
            {clip.conectada ? (
              <Etiqueta tono={clip.simulada ? "sim" : "ok"}>{clip.simulada ? "Simulación: no mueve dinero" : "Conectado"}</Etiqueta>
            ) : (
              <Etiqueta tono="no">Sin conectar</Etiqueta>
            )}
          </div>
          <p className="text-sm text-n-600" data-solo-pagos-propios>PeluDesk solo concilia los pagos que cobra desde aquí; los demás pagos de tu cuenta se ignoran.</p>
          {clip.conectada && (
            <>
              <dl className="grid gap-x-6 gap-y-1 text-sm sm:grid-cols-[10rem_1fr]">
                <dt className="text-n-600">Usuario de Clip</dt>
                <dd className="text-n-900">{clip.cuenta ?? "—"}</dd>
                <dt className="text-n-600">Terminal</dt>
                <dd className="text-n-900">{clip.terminal ?? "—"}</dd>
              </dl>
              {urlWebhookClip && (
                <div className="flex flex-col gap-1">
                  <p className="text-sm font-semibold text-n-900">URL de notificaciones (pégala en el portal de desarrolladores de Clip)</p>
                  <CampoCopiable valor={urlWebhookClip} textoBoton="Copiar URL" monoespaciado />
                </div>
              )}
            </>
          )}
          <form
            className="flex flex-col gap-3"
            onSubmit={async (e) => {
              e.preventDefault();
              const r = await guardandoClip.ejecutar(() => guardarClip(clipForm));
              setClipResultado(r);
              resultado(r);
              if (!r.error) setClipForm({ apiKey: "", secretKey: "", serie: "", usuario: "" });
            }}
          >
            <p className="text-sm text-n-600">
              {clip.conectada ? "Para cambiarlas, escribe otra vez las cuatro." : "Las generas en el portal de desarrolladores de Clip. Se guardan cifradas; nadie las vuelve a ver."}
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="API key" value={clipForm.apiKey} onChange={(e) => setClipForm({ ...clipForm, apiKey: e.target.value })} autoComplete="off" required />
              <Field label="Clave secreta" type="password" value={clipForm.secretKey} onChange={(e) => setClipForm({ ...clipForm, secretKey: e.target.value })} autoComplete="new-password" required />
              <Field label="Número de serie de la terminal" value={clipForm.serie} onChange={(e) => setClipForm({ ...clipForm, serie: e.target.value })} autoComplete="off" required />
              <Field label="Correo del usuario de Clip" type="email" value={clipForm.usuario} onChange={(e) => setClipForm({ ...clipForm, usuario: e.target.value })} autoComplete="off" required />
            </div>
            <AccionesFormulario error={clipResultado?.error} exito={clipResultado && !clipResultado.error ? clipResultado.aviso ?? true : null}>
              <Button type="submit" cargando={guardandoClip.cargando}>
                {clip.conectada ? "Guardar credenciales nuevas" : "Conectar Clip"}
              </Button>
              {clip.conectada && (
                <Button
                  type="button"
                  variante="peligro"
                  cargando={desconectando.cargando}
                  onClick={async () => {
                    if (!window.confirm("¿Desconectar Clip? Se borran las credenciales guardadas.")) return;
                    resultado(await desconectando.ejecutar(() => desconectarClip()));
                  }}
                >
                  Desconectar
                </Button>
              )}
            </AccionesFormulario>
          </form>
        </section>
      )}
    </div>
  );
}
