"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { formatearFechaCalendario } from "@/lib/formato";
import {
  guardarEstablecimiento,
  guardarPermisoEstablecimiento,
  quitarPermisoEstablecimiento,
  type ResultadoEstablecimiento,
} from "./establecimiento-actions";

export type MedicoOpcion = { id: string; nombre: string; cedula: string };
export type PermisoEst = {
  id: string;
  tipo: string;
  numero: string;
  autoridad: string;
  nivel: string;
  emision: string;
  vencimiento: string;
  avisoDias: number;
  notas: string;
};

const NIVELES: Record<string, string> = { federal: "Federal", estatal: "Estatal", municipal: "Municipal" };

// Diferencia en días de calendario entre dos fechas AAAA-MM-DD (sin husos).
function diasEntre(desde: string, hasta: string): number {
  const [a1, m1, d1] = desde.split("-").map(Number);
  const [a2, m2, d2] = hasta.split("-").map(Number);
  return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86_400_000);
}

type Estado = { texto: string; tono: "rojo" | "ambar" | "verde" | "neutro" };
function estadoDe(p: PermisoEst, hoy: string): Estado {
  if (!p.vencimiento) return { texto: "Sin vencimiento", tono: "neutro" };
  const dias = diasEntre(hoy, p.vencimiento);
  if (dias < 0) {
    const n = -dias;
    return { texto: `Vencido hace ${n} ${n === 1 ? "día" : "días"}`, tono: "rojo" };
  }
  const texto = dias === 0 ? "Vence hoy" : `Vence en ${dias} ${dias === 1 ? "día" : "días"}`;
  return { texto, tono: dias <= p.avisoDias ? "ambar" : "verde" };
}
const TONOS: Record<Estado["tono"], string> = {
  rojo: "border-coral-oscuro bg-coral-suave text-coral-oscuro",
  ambar: "border-amber-500 bg-amber-50 text-amber-900",
  verde: "border-borde bg-white text-n-800",
  neutro: "border-borde bg-white text-n-700",
};

function ordenar(permisos: PermisoEst[]): PermisoEst[] {
  // Por vencimiento (los vencidos primero); los que no vencen, al final.
  return [...permisos].sort((a, b) => {
    if (!a.vencimiento && !b.vencimiento) return a.tipo.localeCompare(b.tipo, "es");
    if (!a.vencimiento) return 1;
    if (!b.vencimiento) return -1;
    return a.vencimiento.localeCompare(b.vencimiento);
  });
}

export function EstablecimientoForm(props: {
  hoy: string;
  aviso: string;
  avisoFecha: string;
  medicoId: string;
  mvraNombre: string;
  mvraCedula: string;
  notas: string;
  medicos: MedicoOpcion[];
  permisos: PermisoEst[];
}) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-borde bg-white p-4 sm:p-5" aria-labelledby="titulo-establecimiento">
      <header>
        <h2 id="titulo-establecimiento" className="text-lg font-bold text-n-900">Establecimiento veterinario</h2>
        <p className="mt-1 text-sm text-n-700">
          Estos datos son para tenerlos a la mano; PeluDesk te avisa en el tablero cuando un permiso está por vencer.
        </p>
      </header>
      <DatosEstablecimiento {...props} />
      <hr className="border-borde" />
      <ListaPermisos permisos={props.permisos} hoy={props.hoy} />
    </section>
  );
}

function DatosEstablecimiento(p: {
  aviso: string;
  avisoFecha: string;
  medicoId: string;
  mvraNombre: string;
  mvraCedula: string;
  notas: string;
  medicos: MedicoOpcion[];
}) {
  const router = useRouter();
  const envio = useEspera();
  const [medico, setMedico] = useState(p.medicoId);
  const [res, setRes] = useState<ResultadoEstablecimiento | null>(null);
  const elegido = p.medicos.find((m) => m.id === medico);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const r = await envio.ejecutar(() => guardarEstablecimiento(fd));
        setRes(r);
        if (!r.error) router.refresh();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Aviso de Inicio de Funcionamiento (SENASICA)" name="aviso" defaultValue={p.aviso} maxLength={120} ayuda="Número del aviso." />
        <Field label="Fecha del aviso (opcional)" name="aviso_fecha" type="date" defaultValue={p.avisoFecha} />
      </div>
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-1.5 text-sm font-medium text-n-800">Médico Veterinario Responsable Autorizado (MVRA)</legend>
        <Select
          label="Escoge de tus médicos designados"
          name="mvra_medico_id"
          value={medico}
          onChange={(e) => setMedico(e.target.value)}
          ayuda={p.medicos.length ? undefined : "Aún no hay médicos designados. Puedes escribir su nombre y cédula."}
        >
          <option value="">Otra persona (escribir nombre y cédula)</option>
          {p.medicos.map((m) => (
            <option key={m.id} value={m.id}>{m.nombre} · cédula {m.cedula}</option>
          ))}
        </Select>
        {medico && elegido ? (
          <p className="text-sm text-n-700">{elegido.nombre} · cédula profesional {elegido.cedula}</p>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre del MVRA" name="mvra_nombre" defaultValue={p.mvraNombre} maxLength={150} />
            <Field label="Cédula profesional" name="mvra_cedula" defaultValue={p.mvraCedula} maxLength={40} />
          </div>
        )}
      </fieldset>
      <Textarea label="Notas (opcional)" name="notas" defaultValue={p.notas} maxLength={600} />
      <AccionesFormulario error={res?.error} exito={res && !res.error ? res.exito ?? true : null}>
        <Button type="submit" cargando={envio.cargando}>Guardar establecimiento</Button>
      </AccionesFormulario>
    </form>
  );
}

function ListaPermisos({ permisos, hoy }: { permisos: PermisoEst[]; hoy: string }) {
  const [editando, setEditando] = useState<string | "nuevo" | null>(null);
  const ordenados = ordenar(permisos);
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-base font-bold text-n-900">Permisos del establecimiento</h3>
        {editando !== "nuevo" && (
          <Button type="button" variante="secundario" onClick={() => setEditando("nuevo")}>Agregar permiso</Button>
        )}
      </div>
      {editando === "nuevo" && <FormPermiso hoy={hoy} onTerminar={() => setEditando(null)} />}
      {ordenados.length === 0 && editando !== "nuevo" && (
        <p className="text-sm text-n-700">Aún no hay permisos. Agrega la licencia de funcionamiento, el aviso y los demás que tengas.</p>
      )}
      <ul className="flex flex-col gap-3">
        {ordenados.map((p) => {
          const estado = estadoDe(p, hoy);
          return (
            <li key={p.id} className="rounded-md border border-borde p-3">
              {editando === p.id ? (
                <FormPermiso permiso={p} hoy={hoy} onTerminar={() => setEditando(null)} />
              ) : (
                <FilaPermiso permiso={p} estado={estado} onEditar={() => setEditando(p.id)} />
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FilaPermiso({ permiso: p, estado, onEditar }: { permiso: PermisoEst; estado: Estado; onEditar: () => void }) {
  const router = useRouter();
  const envio = useEspera();
  const [res, setRes] = useState<ResultadoEstablecimiento | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-semibold text-n-900">{p.tipo}</p>
          <p className="text-sm text-n-700">
            {[p.numero && `No. ${p.numero}`, p.autoridad, NIVELES[p.nivel]].filter(Boolean).join(" · ")}
          </p>
        </div>
        <span className={`rounded-full border px-3 py-1 text-sm font-semibold ${TONOS[estado.tono]}`}>{estado.texto}</span>
      </div>
      <p className="text-sm text-n-700">
        {p.emision ? `Emitido el ${formatearFechaCalendario(p.emision)}` : "Sin fecha de emisión"}
        {p.vencimiento ? ` · Vence el ${formatearFechaCalendario(p.vencimiento)}` : ""}
      </p>
      {p.vencimiento && (
        <p className="text-sm text-n-600">Recordatorio: te avisamos {p.avisoDias} {p.avisoDias === 1 ? "día" : "días"} antes de que venza.</p>
      )}
      {p.notas && <p className="text-sm text-n-700">{p.notas}</p>}
      <AccionesFormulario error={res?.error} exito={res && !res.error ? res.exito ?? true : null}>
        <Button type="button" variante="secundario" onClick={onEditar}>Editar</Button>
        {confirmar ? (
          <>
            <Button
              type="button"
              variante="secundario"
              cargando={envio.cargando}
              onClick={async () => {
                const r = await envio.ejecutar(() => quitarPermisoEstablecimiento(p.id));
                setRes(r);
                setConfirmar(false);
                if (!r.error) router.refresh();
              }}
            >
              Sí, quitar
            </Button>
            <Button type="button" variante="secundario" onClick={() => setConfirmar(false)}>No</Button>
          </>
        ) : (
          <Button type="button" variante="secundario" onClick={() => setConfirmar(true)}>Quitar</Button>
        )}
      </AccionesFormulario>
    </div>
  );
}

function FormPermiso({ permiso, hoy, onTerminar }: { permiso?: PermisoEst; hoy: string; onTerminar: () => void }) {
  const router = useRouter();
  const envio = useEspera();
  const [res, setRes] = useState<ResultadoEstablecimiento | null>(null);
  return (
    <form
      className="flex flex-col gap-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const fd = new FormData(e.currentTarget);
        const r = await envio.ejecutar(() => guardarPermisoEstablecimiento(fd));
        setRes(r);
        if (!r.error) {
          router.refresh();
          onTerminar();
        }
      }}
    >
      <input type="hidden" name="id" value={permiso?.id ?? ""} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Tipo de permiso" name="tipo" defaultValue={permiso?.tipo ?? ""} maxLength={150} required ayuda="Por ejemplo: licencia de funcionamiento, aviso sanitario." />
        <Field label="Número" name="numero" defaultValue={permiso?.numero ?? ""} maxLength={120} />
        <Field label="Autoridad que lo emite" name="autoridad" defaultValue={permiso?.autoridad ?? ""} maxLength={150} />
        <Select label="Nivel" name="nivel" defaultValue={permiso?.nivel ?? "municipal"}>
          <option value="federal">Federal</option>
          <option value="estatal">Estatal</option>
          <option value="municipal">Municipal</option>
        </Select>
        <Field label="Fecha de emisión" name="emision" type="date" defaultValue={permiso?.emision ?? ""} max={hoy} />
        <Field label="Vencimiento (vacío si no vence)" name="vencimiento" type="date" defaultValue={permiso?.vencimiento ?? ""} />
        <Field
          label="Avisarme con cuántos días de anticipación"
          name="aviso_dias"
          type="number"
          inputMode="numeric"
          min={0}
          max={730}
          defaultValue={permiso?.avisoDias ?? 60}
        />
      </div>
      <Textarea label="Notas (opcional)" name="notas" defaultValue={permiso?.notas ?? ""} maxLength={600} />
      <AccionesFormulario error={res?.error} exito={res && !res.error ? res.exito ?? true : null}>
        <Button type="submit" cargando={envio.cargando}>{permiso ? "Guardar permiso" : "Agregar permiso"}</Button>
        <Button type="button" variante="secundario" onClick={onTerminar}>Cancelar</Button>
      </AccionesFormulario>
    </form>
  );
}
