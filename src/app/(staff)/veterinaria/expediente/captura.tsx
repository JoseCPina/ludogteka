"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { AvisoDemo } from "@/components/ui/aviso-demo";
import { AVISO_ARCHIVO_DEMO, AVISO_FOTO_DEMO } from "@/lib/solo-lectura";
import { FormularioAccion } from "@/components/formulario-accion";
import { comprimirImagen } from "@/lib/imagen";
import { subirConProgreso } from "@/lib/media/subir";
import { TIPOS_CITA, type MedicoVet } from "@/lib/veterinaria/expediente";
import { capturarResultado, confirmarAdjunto, iniciarConsulta, prepararAdjunto } from "./actions";

/** «Nueva consulta» sin cita: tipo y médico (el médico que es quien llama viene elegido). */
export function IniciarConsulta({ perroId, medicos, medicoPropio }: { perroId: string; medicos: MedicoVet[]; medicoPropio: string | null }) {
  return (
    <FormularioAccion accion={(fd) => iniciarConsulta(perroId, fd)} textoBoton="Abrir la consulta" className="rounded-lg border-[1.5px] border-n-200 bg-n-50 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Tipo de consulta" name="tipo" defaultValue="consulta">
          {Object.entries(TIPOS_CITA).map(([clave, nombre]) => (
            <option key={clave} value={clave}>
              {nombre}
            </option>
          ))}
        </Select>
        <Select label="Médico a cargo" name="medico_id" defaultValue={medicoPropio ?? medicos[0]?.id ?? ""} required ayuda="Quien firma la consulta con su cédula.">
          {medicos.map((m) => (
            <option key={m.id} value={m.id}>
              {m.nombre}
            </option>
          ))}
        </Select>
      </div>
    </FormularioAccion>
  );
}

type Fila = { nombre: string; valor: string; unidad: string; rango: string };
const FILA_VACIA: Fila = { nombre: "", valor: "", unidad: "", rango: "" };

/** Un resultado de laboratorio capturado a mano: estudio, parámetros con valor, unidad y rango (la bandera sale sola). */
export function CapturarResultado({ perroId, consultaId, hoy }: { perroId: string; consultaId: string | null; hoy: string }) {
  const [filas, setFilas] = useState<Fila[]>([{ ...FILA_VACIA }, { ...FILA_VACIA }]);
  const cambiar = (i: number, k: keyof Fila, v: string) => setFilas((f) => f.map((x, j) => (j === i ? { ...x, [k]: v } : x)));
  const utiles = filas.filter((f) => f.nombre.trim() && f.valor.trim());
  return (
    <FormularioAccion accion={(fd) => capturarResultado(perroId, consultaId, fd)} textoBoton="Guardar resultado" textoExito="Resultado guardado" className="rounded-lg border-[1.5px] border-n-200 bg-n-50 p-4">
      <input type="hidden" name="parametros" value={JSON.stringify(utiles.map((f) => ({ nombre: f.nombre, valor: f.valor, unidad: f.unidad || null, rango: f.rango || null })))} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Estudio" name="estudio" required placeholder="Biometría hemática" />
        <Field label="Fecha del estudio" name="fecha" type="date" max={hoy} defaultValue={hoy} required />
        <Field label="Laboratorio (opcional)" name="laboratorio" />
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-n-800">Parámetros</p>
        {filas.map((f, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]">
            <input aria-label={`Parámetro ${i + 1}`} placeholder="Parámetro" value={f.nombre} onChange={(e) => cambiar(i, "nombre", e.target.value)} className="min-h-11 rounded-md border-[1.5px] border-borde px-3" />
            <input aria-label={`Valor ${i + 1}`} placeholder="Valor" value={f.valor} onChange={(e) => cambiar(i, "valor", e.target.value)} className="min-h-11 rounded-md border-[1.5px] border-borde px-3" />
            <input aria-label={`Unidad ${i + 1}`} placeholder="Unidad" value={f.unidad} onChange={(e) => cambiar(i, "unidad", e.target.value)} className="min-h-11 rounded-md border-[1.5px] border-borde px-3" />
            <input aria-label={`Rango ${i + 1}`} placeholder="Rango (37 - 55)" value={f.rango} onChange={(e) => cambiar(i, "rango", e.target.value)} className="min-h-11 rounded-md border-[1.5px] border-borde px-3" />
            <button type="button" className="text-sm font-semibold text-coral-oscuro hover:underline" onClick={() => setFilas((x) => (x.length > 1 ? x.filter((_, j) => j !== i) : x))}>
              Quitar
            </button>
          </div>
        ))}
        <button type="button" className="w-fit text-sm font-semibold text-morado hover:underline" onClick={() => setFilas((x) => [...x, { ...FILA_VACIA }])}>
          + Otro parámetro
        </button>
        <p className="text-sm text-n-600">Con un rango como «37 - 55» y un valor numérico, el sistema marca solo si está alto o bajo.</p>
      </div>
      <Field label="Notas (opcional)" name="notas" />
    </FormularioAccion>
  );
}

/** Foto o PDF de hasta 15 MB: sube directo al almacenamiento privado y queda registrado en el expediente. */
export function SubirAdjunto({ perroId, consultaId }: { perroId: string; consultaId: string | null }) {
  const router = useRouter();
  const envio = useEspera({ tope: 10 * 60_000 });
  const entrada = useRef<HTMLInputElement>(null);
  const [descripcion, setDescripcion] = useState("");
  const [progreso, setProgreso] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  // En la demo no se sube nada: se enseña lo elegido (la foto, o el nombre del PDF) con el aviso de la demo.
  const [demo, setDemo] = useState<{ vista: string | null; nombre: string } | null>(null);

  async function subir() {
    setError(null);
    setExito(null);
    setDemo(null);
    const archivo = entrada.current?.files?.[0];
    if (!archivo) {
      setError("Elige una foto o un PDF.");
      return;
    }
    const r = await envio.correr(async () => {
      let blob: Blob = archivo;
      let mime = archivo.type;
      let nombre = archivo.name;
      if (mime.startsWith("image/") && mime !== "image/heic" && mime !== "image/heif") {
        try {
          blob = await comprimirImagen(archivo, 2200);
          mime = "image/jpeg";
          nombre = nombre.replace(/\.[A-Za-z0-9]+$/, "") + ".jpg";
        } catch {
          blob = archivo;
        }
      }
      if (mime === "image/heif") mime = "image/heic";
      const p = await prepararAdjunto(perroId, nombre, mime, blob.size);
      if (p.demo) return { demo: { vista: mime.startsWith("image/") && mime !== "image/heic" ? URL.createObjectURL(blob) : null, nombre } };
      if (p.error || !p.urlFirmada || !p.ruta) throw new Error(p.error ?? "No pudimos preparar la subida.");
      await subirConProgreso({ url: p.urlFirmada, blob, onProgreso: setProgreso });
      const c = await confirmarAdjunto(perroId, consultaId, p.ruta, nombre, mime, descripcion);
      if (c.error) throw new Error(c.error);
      return { demo: null };
    });
    setProgreso(null);
    if (!r.ok) {
      setError(r.error);
      return;
    }
    if (r.valor.demo) {
      setDemo(r.valor.demo);
      return;
    }
    setExito("Archivo adjuntado.");
    setDescripcion("");
    if (entrada.current) entrada.current.value = "";
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-3 rounded-lg border-[1.5px] border-n-200 bg-n-50 p-4">
      <div>
        <label htmlFor={`adjunto-${consultaId ?? perroId}`} className="mb-1.5 block text-sm font-medium text-n-800">
          Foto o PDF (hasta 15 MB)
        </label>
        <input id={`adjunto-${consultaId ?? perroId}`} ref={entrada} type="file" accept="image/jpeg,image/png,image/webp,image/heic,application/pdf" className="block w-full text-sm" />
      </div>
      <Field label="Qué es (opcional)" name="descripcion_adjunto" value={descripcion} onChange={(e) => setDescripcion(e.target.value)} placeholder="Radiografía de tórax, resultado de laboratorio…" />
      {progreso !== null && (
        <div className="h-2 overflow-hidden rounded-full bg-n-200" role="progressbar" aria-valuenow={Math.round(progreso * 100)} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-morado" style={{ width: `${Math.round(progreso * 100)}%` }} />
        </div>
      )}
      {demo && (
        <div className="flex flex-col gap-2">
          {demo.vista ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={demo.vista} alt="" className="h-28 w-28 rounded-md border border-n-200 object-cover" />
          ) : (
            <p className="text-sm font-semibold text-n-900">{demo.nombre}</p>
          )}
          <AvisoDemo texto={demo.vista ? AVISO_FOTO_DEMO : AVISO_ARCHIVO_DEMO} />
        </div>
      )}
      <AccionesFormulario error={error} exito={exito}>
        <Button type="button" cargando={envio.cargando} onClick={subir}>
          Subir archivo
        </Button>
      </AccionesFormulario>
    </div>
  );
}
