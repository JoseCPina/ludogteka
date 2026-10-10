"use client";

import { useState } from "react";
import QRCode from "qrcode";
import { useEspera } from "@/hooks/use-espera";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { CampoCopiable } from "@/components/ui/campo-copiable";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { BotonAccion, FormularioAccion } from "@/components/formulario-accion";
import { formatearFechaCalendario } from "@/lib/formato";
import {
  anularRegistroCarnet,
  generarEnlaceCarnet,
  recordatoriosDeMascota,
  registrarDesparasitacion,
  registrarVacuna,
  revocarEnlaceCarnet,
} from "../actions";

import type { MedicoOpcion, ProductoConLotes } from "@/lib/veterinaria/lotes";

export type RequisitoOpcion = { id: string; etiqueta: string };

/** Producto y lote del inventario con lotes; si no hay, texto libre. */
function ProductoYLote({ productos, etiquetaProducto, nombreTexto }: { productos: ProductoConLotes[]; etiquetaProducto: string; nombreTexto: "biologico" | "producto" }) {
  const [productoId, setProductoId] = useState("");
  const producto = productos.find((p) => p.id === productoId);
  const [loteId, setLoteId] = useState("");
  return (
    <div className="flex flex-col gap-3">
      {productos.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          <Select
            label={`${etiquetaProducto} del inventario (opcional)`}
            name="insumo_id"
            value={productoId}
            onChange={(e) => {
              setProductoId(e.target.value);
              setLoteId("");
            }}
            ayuda="Si no está aquí, escríbelo abajo."
          >
            <option value="">— Lo escribo yo —</option>
            {productos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
          </Select>
          <Select label="Lote" name="lote_id" value={loteId} onChange={(e) => setLoteId(e.target.value)} disabled={!producto} ayuda={producto ? "Descuenta una dosis del lote." : "Elige primero el producto."}>
            <option value="">— Sin lote del inventario —</option>
            {producto?.lotes.map((l) => (
              <option key={l.id} value={l.id}>
                {l.codigo}
                {l.caducidad ? ` · caduca ${formatearFechaCalendario(l.caducidad)}` : ""} · {l.dosis.toLocaleString("es-MX")} dosis
              </option>
            ))}
          </Select>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={producto ? `${etiquetaProducto} (si quieres cambiar el nombre)` : etiquetaProducto} name={nombreTexto} required={!producto} placeholder={producto?.nombre} />
        {!loteId && <Field label="Lote (texto, si no es del inventario)" name="lote_texto" />}
      </div>
    </div>
  );
}

export function FormularioVacuna({
  perroId, hoy, productos, medicos, medicoPropio, requisitos,
}: { perroId: string; hoy: string; productos: ProductoConLotes[]; medicos: MedicoOpcion[]; medicoPropio: string | null; requisitos: RequisitoOpcion[] }) {
  return (
    <FormularioAccion accion={(fd) => registrarVacuna(perroId, fd)} textoBoton="Registrar vacuna" textoExito="Vacuna registrada" reiniciar className="rounded-lg border-[1.5px] border-n-200 bg-n-50 p-4">
      <ProductoYLote productos={productos} etiquetaProducto="Vacuna" nombreTexto="biologico" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Laboratorio (opcional)" name="laboratorio" />
        <Field label="Dosis (opcional)" name="dosis" placeholder="1 mL" />
        <Field label="Fecha de aplicación" name="fecha" type="date" max={hoy} defaultValue={hoy} required />
        <Field label="Próxima dosis (opcional)" name="proxima" type="date" min={hoy} ayuda="Con esta fecha se programan los recordatorios." />
        <Select label="Médico veterinario que aplica" name="medico_id" defaultValue={medicoPropio ?? ""} required>
          <option value="">— Elige —</option>
          {medicos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </Select>
        {requisitos.length > 0 && (
          <Select label="¿Cubre un requisito del check-in?" name="tipo_requisito_id" defaultValue="" ayuda="Si el negocio acepta el carnet en lugar del comprobante, esta vacuna lo cubre.">
            <option value="">— No —</option>
            {requisitos.map((r) => (
              <option key={r.id} value={r.id}>
                {r.etiqueta}
              </option>
            ))}
          </Select>
        )}
      </div>
      <Textarea label="Notas (opcional)" name="notas" rows={2} />
    </FormularioAccion>
  );
}

export function FormularioDesparasitacion({
  perroId, hoy, productos, medicos, medicoPropio,
}: { perroId: string; hoy: string; productos: ProductoConLotes[]; medicos: MedicoOpcion[]; medicoPropio: string | null }) {
  return (
    <FormularioAccion accion={(fd) => registrarDesparasitacion(perroId, fd)} textoBoton="Registrar desparasitación" textoExito="Desparasitación registrada" reiniciar className="rounded-lg border-[1.5px] border-n-200 bg-n-50 p-4">
      <ProductoYLote productos={productos} etiquetaProducto="Producto" nombreTexto="producto" />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Tipo" name="tipo" defaultValue="interna">
          <option value="interna">Interna</option>
          <option value="externa">Externa</option>
          <option value="ambas">Interna y externa</option>
        </Select>
        <Field label="Dosis (opcional)" name="dosis" placeholder="1 tableta" />
        <Field label="Fecha de aplicación" name="fecha" type="date" max={hoy} defaultValue={hoy} required />
        <Field label="Próxima dosis (opcional)" name="proxima" type="date" min={hoy} />
        <Select label="Médico veterinario (opcional)" name="medico_id" defaultValue={medicoPropio ?? ""}>
          <option value="">— Ninguno —</option>
          {medicos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </Select>
      </div>
      <Textarea label="Notas (opcional)" name="notas" rows={2} />
    </FormularioAccion>
  );
}

/** Anular un registro: pide el motivo y queda en el historial. */
export function AnularRegistro({ perroId, tipo, id }: { perroId: string; tipo: "vacuna" | "desparasitacion"; id: string }) {
  const [abierto, setAbierto] = useState(false);
  if (!abierto) {
    return (
      <button type="button" className="text-sm font-semibold text-coral-oscuro hover:underline" onClick={() => setAbierto(true)}>
        Anular
      </button>
    );
  }
  return (
    <FormularioAccion
      accion={(fd) => anularRegistroCarnet(perroId, tipo, id, fd)}
      textoBoton="Anular registro"
      variante="peligro"
      className="mt-2 rounded-md border border-n-200 bg-white p-3"
      otrosBotones={
        <Button type="button" variante="secundario" onClick={() => setAbierto(false)}>
          Cancelar
        </Button>
      }
    >
      <Textarea label="Motivo de la anulación" name="motivo" rows={2} required ayuda="El registro no se borra: queda anulado con tu nombre y este motivo." />
    </FormularioAccion>
  );
}

export function RecordatoriosMascota({ perroId, apagados }: { perroId: string; apagados: boolean }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-sm text-n-700">
        {apagados ? "Esta mascota NO recibe recordatorios de próxima dosis." : "Esta mascota recibe recordatorios de próxima dosis (si el negocio los tiene prendidos)."}
      </p>
      <div>
        <BotonAccion accion={() => recordatoriosDeMascota(perroId, !apagados)} texto={apagados ? "Volver a prender los recordatorios" : "Apagar recordatorios de esta mascota"} variante="secundario" />
      </div>
    </div>
  );
}

/** El enlace verificable: se genera una vez (el token en claro solo se ve ahora), con su QR. */
export function EnlaceCarnet({ perroId, vigente }: { perroId: string; vigente: boolean }) {
  const generar = useEspera();
  const revocar = useEspera();
  const [url, setUrl] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);

  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm text-n-700">
        Un enlace público que muestra solo el nombre de la mascota, el de su dueño, las vacunas vigentes y este negocio. Sin dinero ni datos clínicos. Generar uno nuevo desactiva el anterior.
      </p>
      {url && (
        <div className="flex flex-col gap-3 rounded-md border border-n-200 bg-white p-3">
          <CampoCopiable valor={url} etiqueta="Enlace del carnet" />
          {qr && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={qr} alt="Código QR del carnet verificable" width={240} height={240} className="h-60 w-60 rounded-md border border-n-200" />
          )}
          <p className="text-sm text-n-600">Guárdalo ahora: por seguridad este enlace no se vuelve a mostrar completo. Si lo pierdes, genera otro.</p>
        </div>
      )}
      <AccionesFormulario error={error} exito={exito}>
        <Button
          type="button"
          variante={vigente || url ? "secundario" : "primario"}
          cargando={generar.cargando}
          onClick={async () => {
            setError(null);
            setExito(null);
            const r = await generar.ejecutar(() => generarEnlaceCarnet(perroId));
            if (r.error || !r.url) return setError(r.error ?? "No pudimos generar el enlace.");
            setUrl(r.url);
            setQr(await QRCode.toDataURL(r.url, { margin: 1, width: 240, errorCorrectionLevel: "M" }).catch(() => null));
          }}
        >
          {vigente || url ? "Generar un enlace nuevo" : "Generar enlace verificable"}
        </Button>
        {(vigente || url) && (
          <Button
            type="button"
            variante="secundario"
            cargando={revocar.cargando}
            onClick={async () => {
              setError(null);
              const r = await revocar.ejecutar(() => revocarEnlaceCarnet(perroId));
              if (r.error) return setError(r.error);
              setUrl(null);
              setQr(null);
              setExito(r.exito ?? "Enlace desactivado.");
            }}
          >
            Desactivar el enlace
          </Button>
        )}
      </AccionesFormulario>
    </div>
  );
}
