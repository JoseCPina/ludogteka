"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/chip";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { CampoCopiable } from "@/components/ui/campo-copiable";
import { ReceptorForm } from "@/components/cfdi/receptor-form";
import { dinero, ESTADOS_FACTURA, type ItemCatalogo } from "@/components/cfdi/textos";
import { useZonaNegocio } from "@/components/zona-negocio";
import { formatearFecha } from "@/lib/formato";
import {
  actualizarCancelaciones,
  cancelarUnaFactura,
  correoDeFactura,
  descartarBorrador,
  enlaceDeFactura,
  revisarPorRevisar,
  sustituirFactura,
  timbrarBorrador,
  type ReceptorManual,
  type ResultadoFactura,
} from "../facturacion-actions";

export type FilaFactura = {
  id: string;
  tipo: "ingreso" | "global";
  estado: string;
  serie: string | null;
  folio: string | null;
  uuid_fiscal: string | null;
  receptor: { rfc: string; nombre: string; cp: string; regimen: string; uso: string; email?: string | null };
  total: number;
  fecha_timbrado: string | null;
  created_at: string;
  error: string | null;
  cancelacion_limite: string | null;
  periodo_desde: string | null;
  periodo_hasta: string | null;
  enviado_whatsapp_at: string | null;
  enviado_correo_at: string | null;
  tiene_archivos: boolean;
};

type Panel = null | "cancelar" | "correo" | "sustituir";

export function ListaFacturas({
  facturas,
  catalogos,
  puedeFacturar,
  puedeCancelar,
}: {
  facturas: FilaFactura[];
  catalogos: ItemCatalogo[];
  puedeFacturar: boolean;
  puedeCancelar: boolean;
}) {
  const hayPendientes = facturas.some((f) => f.estado === "cancelacion_pendiente");
  return (
    <div className="flex flex-col gap-3">
      {hayPendientes && <ActualizarCancelaciones />}
      {facturas.length === 0 ? (
        <p className="rounded-lg border border-n-200 bg-n-50 p-4 text-sm text-n-700">Todavía no hay facturas. Se emiten desde el cobro de una cuenta.</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {facturas.map((f) => (
            <Fila key={f.id} f={f} catalogos={catalogos} puedeFacturar={puedeFacturar} puedeCancelar={puedeCancelar} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ActualizarCancelaciones() {
  const router = useRouter();
  const envio = useEspera({ tope: 60_000 });
  const [res, setRes] = useState<ResultadoFactura | null>(null);
  return (
    <AccionesFormulario error={res?.error} exito={res?.aviso}>
      <Button
        type="button"
        variante="secundario"
        cargando={envio.cargando}
        onClick={async () => {
          setRes(await envio.ejecutar(() => actualizarCancelaciones()));
          router.refresh();
        }}
      >
        Ver si el cliente ya respondió
      </Button>
    </AccionesFormulario>
  );
}

function Fila({ f, catalogos, puedeFacturar, puedeCancelar }: { f: FilaFactura; catalogos: ItemCatalogo[]; puedeFacturar: boolean; puedeCancelar: boolean }) {
  const router = useRouter();
  const zona = useZonaNegocio();
  const envio = useEspera({ tope: 70_000 });
  const [panel, setPanel] = useState<Panel>(null);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [wa, setWa] = useState<{ url?: string; mensaje?: string } | null>(null);
  const [motivo, setMotivo] = useState("02");
  const [correo, setCorreo] = useState(f.receptor.email ?? "");
  const st = ESTADOS_FACTURA[f.estado] ?? { texto: f.estado, tono: "neutro" as const };
  const folio = `${f.serie ?? ""}${f.folio ?? ""}` || "sin folio";
  const vigente = f.estado === "vigente";

  async function correr(accion: () => Promise<ResultadoFactura>, alTerminar?: (r: ResultadoFactura) => void) {
    setError(null);
    setExito(null);
    const r = await envio.ejecutar(accion);
    if (r.error) {
      setError(r.error);
      router.refresh();
      return;
    }
    setExito(r.aviso ?? "Listo.");
    setPanel(null);
    alTerminar?.(r);
    router.refresh();
  }

  const motivos = catalogos.filter((c) => c.tipo === "motivo_cancelacion" && c.clave !== "01");

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-n-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-n-900">
            {f.tipo === "global" ? "Factura global" : "Factura"} {folio}
            {f.tipo === "global" && f.periodo_desde && f.periodo_hasta ? ` · ${f.periodo_desde} al ${f.periodo_hasta}` : ""}
          </p>
          <p className="truncate text-sm text-n-700">
            {f.receptor.nombre} · {f.receptor.rfc}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="font-bold tabular-nums text-n-900">{dinero(f.total)}</span>
          <Chip tono={st.tono}>{st.texto}</Chip>
        </div>
      </div>
      <p className="text-xs text-n-600">
        {f.fecha_timbrado ? `Timbrada el ${formatearFecha(f.fecha_timbrado, zona)}` : `Preparada el ${formatearFecha(f.created_at, zona)}`}
        {f.uuid_fiscal ? ` · UUID ${f.uuid_fiscal}` : ""}
        {f.enviado_whatsapp_at ? " · mandada por WhatsApp" : ""}
        {f.enviado_correo_at ? " · mandada por correo" : ""}
      </p>
      {f.estado === "cancelacion_pendiente" && f.cancelacion_limite && (
        <p className="text-sm text-ambar-oscuro">
          Esperando al cliente: tiene hasta el {formatearFecha(f.cancelacion_limite, zona)} para aceptar. Si no responde, el SAT la da por aceptada.
        </p>
      )}
      {f.error && f.estado !== "vigente" && <p className="text-sm text-coral-oscuro">{f.error}</p>}
      {f.error && f.estado === "vigente" && <p className="text-sm text-ambar-oscuro">{f.error}</p>}

      <div className="flex flex-wrap gap-2">
        {(vigente || f.estado === "cancelacion_pendiente" || f.estado === "cancelada") && f.tiene_archivos && (
          <>
            <a className="inline-flex" href={`/caja/facturas/${f.id}/pdf`}>
              <Button type="button" variante="secundario">Descargar PDF</Button>
            </a>
            <a className="inline-flex" href={`/caja/facturas/${f.id}/xml`}>
              <Button type="button" variante="secundario">Descargar XML</Button>
            </a>
          </>
        )}
        {puedeFacturar && vigente && (
          <>
            <Button
              type="button"
              variante="secundario"
              cargando={envio.cargando}
              onClick={() =>
                correr(() => enlaceDeFactura(f.id), (r) => {
                  setWa({ url: r.enlaceWhatsapp, mensaje: r.mensaje });
                })
              }
            >
              Mandar por WhatsApp
            </Button>
            <Button type="button" variante="secundario" onClick={() => setPanel(panel === "correo" ? null : "correo")}>
              Mandar por correo
            </Button>
          </>
        )}
        {puedeCancelar && vigente && (
          <>
            {f.tipo === "ingreso" && (
              <Button type="button" variante="secundario" onClick={() => setPanel(panel === "sustituir" ? null : "sustituir")}>
                Corregir y sustituir
              </Button>
            )}
            <Button type="button" variante="peligro" onClick={() => setPanel(panel === "cancelar" ? null : "cancelar")}>
              Cancelar factura
            </Button>
          </>
        )}
        {puedeFacturar && f.estado === "borrador" && (
          <>
            <Button type="button" cargando={envio.cargando} onClick={() => correr(() => timbrarBorrador(f.id))}>
              Timbrar
            </Button>
            <Button type="button" variante="secundario" disabled={envio.cargando} onClick={() => correr(() => descartarBorrador(f.id))}>
              Descartar
            </Button>
          </>
        )}
        {puedeFacturar && f.estado === "revisar" && (
          <Button type="button" cargando={envio.cargando} onClick={() => correr(() => revisarPorRevisar(f.id))}>
            Revisar si sí salió
          </Button>
        )}
      </div>

      {wa && (
        <div className="flex flex-col gap-2 rounded-md border border-n-200 bg-n-50 p-3">
          {wa.url && (
            <a href={wa.url} target="_blank" rel="noopener noreferrer" className="w-fit text-sm font-semibold text-morado hover:underline">
              Abrir WhatsApp con el mensaje →
            </a>
          )}
          {wa.mensaje && <CampoCopiable valor={wa.mensaje} etiqueta="Mensaje para el cliente (con el link de descarga)" />}
        </div>
      )}

      {panel === "correo" && (
        <div className="flex flex-col gap-2 rounded-md border border-n-200 bg-n-50 p-3">
          <Field label="Correo del cliente" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} />
          <AccionesFormulario error={error}>
            <Button type="button" cargando={envio.cargando} onClick={() => correr(() => correoDeFactura(f.id, correo))}>
              Enviar
            </Button>
          </AccionesFormulario>
        </div>
      )}

      {panel === "sustituir" && (
        <div className="flex flex-col gap-2 rounded-md border border-n-200 bg-n-50 p-3">
          <p className="text-sm text-n-700">
            Se emite otra factura de los mismos cobros con los datos de abajo y, si sale bien, esta se cancela con el motivo 01 (con errores, con relación). Corrige aquí el RFC, el nombre, el régimen o el uso.
          </p>
          <ReceptorForm
            catalogos={catalogos}
            inicial={{ rfc: f.receptor.rfc, nombre_fiscal: f.receptor.nombre, cp: f.receptor.cp, regimen_fiscal: f.receptor.regimen, uso_cfdi: f.receptor.uso, email: f.receptor.email ?? "" }}
            cargando={envio.cargando}
            error={error}
            textoBoton="Emitir la nueva y cancelar esta"
            onEnviar={(r: ReceptorManual) => void correr(() => sustituirFactura(f.id, r))}
            onCancelar={() => setPanel(null)}
          />
        </div>
      )}

      {panel === "cancelar" && (
        <div className="flex flex-col gap-2 rounded-md border border-coral/40 bg-coral-suave/30 p-3">
          <p className="text-sm text-n-800">
            Cancelar una factura es ante el SAT y no se deshace. Si es por datos mal capturados, mejor usa «Corregir y sustituir» (motivo 01). Con un monto alto, el cliente tiene hasta 3 días para aceptar.
          </p>
          <Select label="Motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)}>
            {motivos.map((m) => (
              <option key={m.clave} value={m.clave}>
                {m.clave} · {m.descripcion}
              </option>
            ))}
          </Select>
          <AccionesFormulario error={error}>
            <Button type="button" variante="peligro" cargando={envio.cargando} onClick={() => correr(() => cancelarUnaFactura(f.id, motivo, null))}>
              Sí, cancelar la factura
            </Button>
            <Button type="button" variante="secundario" onClick={() => setPanel(null)}>
              No
            </Button>
          </AccionesFormulario>
        </div>
      )}

      {panel === null && (error || exito) && <AccionesFormulario error={error} exito={exito}>{null}</AccionesFormulario>}
    </li>
  );
}
