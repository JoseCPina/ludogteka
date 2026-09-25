"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { Spinner } from "@/components/ui/spinner";
import { CampoCopiable } from "@/components/ui/campo-copiable";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { formatearFecha } from "@/lib/formato";
import {
  iniciarCobroTerminal,
  consultarCobroTerminal,
  cancelarCobroTerminal,
  crearLinkPago,
  type EstadoMpDisponible,
} from "@/app/(staff)/caja/mercadopago-actions";
import { useZonaNegocio } from "@/components/zona-negocio";

export type OrdenMpFila = {
  id: string;
  tipo: "point" | "link";
  monto: number;
  descripcion: string | null;
  estado: string;
  url_pago: string | null;
  installments: number | null;
  simulado: boolean;
  pendiente_de_registrar: boolean;
  detalle_error: string | null;
  created_at: string;
  expira_at: string | null;
};

function dinero(v: number): string {
  return `$${v.toFixed(2)}`;
}

const ETIQUETA_ESTADO: Record<string, string> = {
  creada: "Mandando a la terminal…",
  en_terminal: "En la terminal",
  pagada: "Pagado",
  cancelada: "Cancelado",
  expirada: "Venció",
  fallida: "Falló",
  reembolsada: "Reembolsado",
};

/**
 * Cobrar con Mercado Pago desde la cuenta: la terminal Point (recepción
 * manda el monto, el cliente paga ahí) y el link de pago por WhatsApp.
 * Cuando Mercado Pago confirma, el cobro se registra solo con su método
 * y aparece en el historial de abajo; recepción no captura nada a mano.
 */
export function CobroMercadoPago({
  reservaId,
  saldo,
  turnoAbierto,
  disponible,
  ordenes,
  clienteTelefono,
}: {
  reservaId: string;
  saldo: number;
  turnoAbierto: boolean;
  disponible: EstadoMpDisponible;
  ordenes: OrdenMpFila[];
  clienteTelefono: string | null;
}) {
  const zona = useZonaNegocio();
  const router = useRouter();
  const [modo, setModo] = useState<"ninguno" | "terminal" | "link">("ninguno");
  const [monto, setMonto] = useState(saldo > 0 ? saldo.toFixed(2) : "");
  const [plazos, setPlazos] = useState("1");
  const [concepto, setConcepto] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const iniciando = useEspera();
  const cancelando = useEspera();
  const generando = useEspera();

  // Orden en curso en la terminal (la recién mandada o una que ya estaba).
  const enCurso = ordenes.find((o) => o.tipo === "point" && ["creada", "en_terminal"].includes(o.estado)) ?? null;
  const [ordenActiva, setOrdenActiva] = useState<string | null>(enCurso?.id ?? null);
  const [estadoTerminal, setEstadoTerminal] = useState<string>(enCurso?.estado ?? "creada");
  const [segundos, setSegundos] = useState(0);
  const [agotado, setAgotado] = useState(false);
  const [link, setLink] = useState<{ url: string; urlWhatsApp?: string; simulado: boolean } | null>(null);
  const temporizador = useRef<ReturnType<typeof setInterval> | null>(null);

  // Mientras hay una orden en la terminal, se consulta cada 3 s. Si el
  // webhook llegó antes, la consulta solo lee; si no, registra. Pasado el
  // tope, se deja de preguntar y se ofrece la salida manual.
  useEffect(() => {
    if (!ordenActiva) return;
    let vivo = true;
    let ticks = 0;
    const paso = async () => {
      ticks += 1;
      setSegundos(ticks * 3);
      const r = await consultarCobroTerminal(ordenActiva);
      if (!vivo) return;
      if (r.error) {
        setError(r.error);
      } else if (r.estado) {
        setEstadoTerminal(r.estado);
        if (r.pagada) {
          setAviso(r.registrado ? `Pago confirmado${r.installments && r.installments > 1 ? ` a ${r.installments} meses` : ""}. El cobro ya quedó registrado.` : "Pago confirmado. Se registrará en cuanto haya turno abierto.");
          setOrdenActiva(null);
          router.refresh();
          return;
        }
        if (["cancelada", "expirada", "fallida"].includes(r.estado)) {
          setError(r.detalle ?? ETIQUETA_ESTADO[r.estado]);
          setOrdenActiva(null);
          router.refresh();
          return;
        }
      }
      if (ticks * 3 >= disponible.esperaSegundos) {
        setAgotado(true);
        if (temporizador.current) clearInterval(temporizador.current);
      }
    };
    temporizador.current = setInterval(paso, 3000);
    void paso();
    return () => {
      vivo = false;
      if (temporizador.current) clearInterval(temporizador.current);
    };
  }, [ordenActiva, disponible.esperaSegundos, router]);

  async function mandarATerminal() {
    setError(null);
    setAviso(null);
    const m = Number(monto);
    if (!Number.isFinite(m) || m <= 0) return setError("Escribe el monto a cobrar.");
    const res = await iniciando.ejecutar(() =>
      iniciarCobroTerminal(reservaId, m, Number(plazos) > 1 ? Number(plazos) : null, concepto || "Ludogteka")
    );
    if (res.error) {
      setError(res.error);
      if (res.ordenId && !res.error.startsWith("No pudimos")) setOrdenActiva(res.ordenId);
      return;
    }
    setAgotado(false);
    setSegundos(0);
    setEstadoTerminal("creada");
    setOrdenActiva(res.ordenId ?? null);
    setModo("ninguno");
  }

  async function cancelar() {
    if (!ordenActiva) return;
    const res = await cancelando.ejecutar(() => cancelarCobroTerminal(ordenActiva, agotado ? "La terminal no respondió a tiempo" : "Cancelado por recepción"));
    if (res.error) return setError(res.error);
    if (res.aviso) setAviso(res.aviso);
    setOrdenActiva(null);
    setAgotado(false);
    router.refresh();
  }

  async function generarLink() {
    setError(null);
    const m = Number(monto);
    if (!Number.isFinite(m) || m <= 0) return setError("Escribe el monto del link.");
    const res = await generando.ejecutar(() => crearLinkPago(reservaId, m, concepto));
    if (res.error || !res.url) return setError(res.error ?? "No pudimos generar el link.");
    setLink({ url: res.url, urlWhatsApp: res.urlWhatsApp, simulado: Boolean(res.simulado) });
    setModo("ninguno");
    router.refresh();
  }

  const historial = ordenes.filter((o) => o.id !== ordenActiva);

  // PeluDesk: en un negocio sin Mercado Pago activado no se ofrece.
  if (!disponible.activo) return null;

  return (
    <div className="flex flex-col gap-3 rounded-lg border-[1.5px] border-azul bg-azul-suave/40 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-n-900">Cobrar con Mercado Pago</p>
        {disponible.simulado && (
          <span className="rounded-full bg-amarillo-suave px-2 py-0.5 text-xs font-semibold text-amarillo-oscuro">
            Simulación: no mueve dinero
          </span>
        )}
      </div>

      {error && (
        <Alert variante="error" titulo="No se pudo completar">
          {error}
        </Alert>
      )}
      {aviso && <Alert variante="exito" titulo={aviso} />}

      {ordenActiva ? (
        <div className="flex flex-col gap-3 rounded-md border border-azul bg-white p-4">
          <div className="flex items-center gap-3">
            {!agotado && <Spinner />}
            <div>
              <p className="font-semibold text-n-900">
                {agotado ? "La terminal no ha respondido" : ETIQUETA_ESTADO[estadoTerminal] ?? estadoTerminal}
              </p>
              <p className="text-sm text-n-600">
                {agotado
                  ? `Pasaron ${disponible.esperaSegundos} segundos sin confirmación. Revisa que la terminal tenga internet y esté encendida.`
                  : `Pídele al cliente que pague en la terminal. ${segundos} s…`}
              </p>
            </div>
          </div>
          <AccionesFormulario>
            <Button type="button" variante="peligro" cargando={cancelando.cargando} onClick={cancelar}>
              {cancelando.cargando ? "Cancelando…" : agotado ? "Cancelar y registrar a mano" : "Cancelar cobro en terminal"}
            </Button>
            {agotado && (
              <Button type="button" variante="secundario" onClick={() => { setAgotado(false); setSegundos(0); setOrdenActiva((v) => v); }}>
                Seguir esperando
              </Button>
            )}
          </AccionesFormulario>
          {agotado && (
            <p className="text-sm text-n-600">
              Si el cliente SÍ pagó en la terminal, no registres nada a mano: en cuanto Mercado Pago lo confirme (webhook), el cobro entra solo aunque hayas cancelado aquí.
            </p>
          )}
        </div>
      ) : modo === "ninguno" ? (
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={!turnoAbierto || !disponible.terminal} onClick={() => setModo("terminal")}>
            Cobrar con terminal
          </Button>
          <Button type="button" variante="secundario" onClick={() => setModo("link")}>
            Mandar link de pago
          </Button>
          {!turnoAbierto && <span className="self-center text-sm text-n-600">La terminal necesita turno abierto; el link no.</span>}
          {turnoAbierto && !disponible.terminal && (
            <span className="self-center text-sm text-n-600">Sin terminal configurada (MERCADOPAGO_TERMINAL_ID).</span>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-3 rounded-md border border-n-200 bg-white p-4">
          <p className="font-semibold text-n-900">{modo === "terminal" ? "Mandar a la terminal" : "Link de pago por WhatsApp"}</p>
          <div className="flex flex-wrap items-end gap-3">
            <div className="w-36">
              <Field label="Monto" type="number" min="0" step="0.01" value={monto} onChange={(e) => setMonto(e.target.value)} autoFocus />
            </div>
            {modo === "terminal" && (
              <div className="w-44">
                <Select label="Meses sin intereses" value={plazos} onChange={(e) => setPlazos(e.target.value)}>
                  <option value="1">Un solo pago</option>
                  <option value="3">3 meses</option>
                  <option value="6">6 meses</option>
                  <option value="9">9 meses</option>
                  <option value="12">12 meses</option>
                </Select>
              </div>
            )}
            <div className="min-w-[220px] flex-1">
              <Field
                label={modo === "terminal" ? "Concepto (opcional)" : "Concepto"}
                value={concepto}
                onChange={(e) => setConcepto(e.target.value)}
                placeholder={modo === "terminal" ? "ej. Guardería de Motita" : "ej. Anticipo de hotel de Motita"}
              />
            </div>
          </div>
          {modo === "terminal" && Number(plazos) > 1 && (
            <p className="text-sm text-n-600">
              Los meses sin intereses los absorbe el negocio y tienen que estar activados en la cuenta de Mercado Pago; el plazo que el cliente elija en la terminal queda registrado en el cobro.
            </p>
          )}
          {modo === "link" && !clienteTelefono && (
            <p className="text-sm text-amarillo-oscuro">Este cliente no tiene teléfono: el link se genera igual, pero tendrás que mandarlo tú.</p>
          )}
          <AccionesFormulario error={null}>
            {modo === "terminal" ? (
              <Button type="button" cargando={iniciando.cargando} onClick={mandarATerminal}>
                {iniciando.cargando ? "Mandando…" : "Mandar a la terminal"}
              </Button>
            ) : (
              <Button type="button" cargando={generando.cargando} onClick={generarLink}>
                {generando.cargando ? "Generando…" : "Generar link"}
              </Button>
            )}
            <Button type="button" variante="secundario" onClick={() => setModo("ninguno")}>
              Cancelar
            </Button>
          </AccionesFormulario>
        </div>
      )}

      {link && (
        <div className="flex flex-col gap-2 rounded-md border border-verde bg-verde-suave p-4">
          <p className="font-semibold text-verde-oscuro">Link listo{link.simulado ? " (simulado: abrirlo equivale a pagarlo)" : ""}</p>
          <CampoCopiable valor={link.url} textoBoton="Copiar link" />
          {link.urlWhatsApp && (
            <a href={link.urlWhatsApp} target="_blank" rel="noreferrer" className="self-start">
              <Button type="button">Mandar por WhatsApp</Button>
            </a>
          )}
          <p className="text-sm text-verde-oscuro">Cuando el cliente pague, el cobro se registra solo (método transferencia) y el saldo baja.</p>
        </div>
      )}

      {historial.length > 0 && (
        <ul className="flex flex-col gap-1 text-sm">
          {historial.map((o) => (
            <li key={o.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-n-200 bg-white px-3 py-2">
              <span className="text-n-700">
                {o.tipo === "point" ? "Terminal" : "Link"} · {dinero(o.monto)}
                {o.installments && o.installments > 1 ? ` · ${o.installments} meses` : ""}
                {o.descripcion ? ` · ${o.descripcion}` : ""} · {formatearFecha(o.created_at, zona)}
                {o.simulado ? " · simulado" : ""}
                {o.detalle_error && o.estado !== "pagada" ? ` · ${o.detalle_error}` : ""}
              </span>
              <span className="flex items-center gap-2">
                {o.tipo === "link" && o.estado === "creada" && o.url_pago && (
                  <CampoCopiable valor={o.url_pago} textoBoton="Copiar" className="w-64" />
                )}
                <span
                  className={`rounded-full px-2 py-0.5 text-xs font-semibold ${
                    o.estado === "pagada" ? "bg-verde-suave text-verde-oscuro" : o.estado === "creada" || o.estado === "en_terminal" ? "bg-azul-suave text-azul" : "bg-n-100 text-n-600"
                  }`}
                >
                  {o.pendiente_de_registrar ? "Pagado, sin turno" : ETIQUETA_ESTADO[o.estado] ?? o.estado}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
