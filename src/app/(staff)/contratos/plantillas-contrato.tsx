"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import {
  crearTipoContrato,
  actualizarTipoContrato,
  archivarTipoContrato,
  reactivarTipoContrato,
  publicarPlantilla,
  marcarRequiereRefirma,
  type CategoriaServicioContrato,
} from "./plantilla-actions";

const TOKENS_DISPONIBLES = [
  "cliente_nombre",
  "cliente_telefono",
  "cliente_email",
  "cliente_rfc",
  "perro_nombre",
  "perro_raza",
  "perro_sexo",
  "perro_fecha_nacimiento",
  "perro_tamano",
  "autorizacion_medica_notas",
  "tope_gasto_autorizado",
  "consentimiento_imagen",
  "servicios_disponibles",
  "fecha_firma",
];

const CATEGORIAS: { clave: CategoriaServicioContrato; etiqueta: string }[] = [
  { clave: "guarderia", etiqueta: "Guardería" },
  { clave: "hotel", etiqueta: "Hotel" },
  { clave: "estetica", etiqueta: "Estética" },
];

export type VersionPlantilla = {
  id: string;
  version: number;
  titulo: string;
  cuerpo: string;
  activa: boolean;
  requiere_refirma: boolean;
};

export type TipoContratoVista = {
  id: string;
  nombre: string;
  categorias: CategoriaServicioContrato[];
  archivado: boolean;
  versiones: VersionPlantilla[];
};

function etiquetaCategoria(clave: string) {
  return CATEGORIAS.find((c) => c.clave === clave)?.etiqueta ?? clave;
}

function SelectorCategorias({
  seleccionadas,
  onCambio,
}: {
  seleccionadas: CategoriaServicioContrato[];
  onCambio: (valor: CategoriaServicioContrato[]) => void;
}) {
  function alternar(clave: CategoriaServicioContrato) {
    onCambio(
      seleccionadas.includes(clave)
        ? seleccionadas.filter((c) => c !== clave)
        : [...seleccionadas, clave]
    );
  }

  return (
    <div className="rounded-md border-[1.5px] border-n-200 bg-white p-3">
      <p className="text-sm font-bold text-n-900">¿A qué servicios aplica?</p>
      <p className="mt-0.5 text-sm text-n-600">
        Solo se le va a pedir a los perros que usan esos servicios. Si no marcas ninguno, se le pide a
        todos los perros.
      </p>
      <div className="mt-2 flex flex-wrap gap-3">
        {CATEGORIAS.map((c) => (
          <label key={c.clave} className="flex items-center gap-2 text-n-900">
            <input
              type="checkbox"
              className="h-4 w-4"
              checked={seleccionadas.includes(c.clave)}
              onChange={() => alternar(c.clave)}
            />
            {c.etiqueta}
          </label>
        ))}
      </div>
    </div>
  );
}

function AyudaTokens() {
  return (
    <div className="rounded-md border border-n-200 bg-white p-3">
      <p className="mb-2 text-xs font-bold uppercase tracking-wide text-n-600">Campos disponibles</p>
      <div className="flex flex-wrap gap-1.5">
        {TOKENS_DISPONIBLES.map((t) => (
          <code key={t} className="rounded bg-n-100 px-1.5 py-0.5 text-xs text-n-700">
            {`{{${t}}}`}
          </code>
        ))}
      </div>
    </div>
  );
}

function CasillaRefirma({
  valor,
  onCambio,
}: {
  valor: boolean;
  onCambio: (v: boolean) => void;
}) {
  return (
    <label className="flex items-start gap-2 rounded-md border-[1.5px] border-n-200 bg-white p-3 text-n-900">
      <input
        type="checkbox"
        checked={valor}
        onChange={(e) => onCambio(e.target.checked)}
        className="mt-0.5 h-4 w-4"
      />
      <span>
        Esta versión requiere que los contratos ya firmados se actualicen
        <span className="mt-0.5 block text-sm font-normal text-n-600">
          Los perros con este contrato firmado en una versión anterior se van a mostrar como
          &quot;Requiere actualización&quot; en check-in y en la ficha del cliente — es un aviso, no
          bloquea nada, y solo afecta a este contrato, no a los demás.
        </span>
      </span>
    </label>
  );
}

function FormularioNuevoTipo({ onListo }: { onListo: () => void }) {
  const router = useRouter();
  const [nombre, setNombre] = useState("");
  const [categorias, setCategorias] = useState<CategoriaServicioContrato[]>([]);
  const [titulo, setTitulo] = useState("");
  const [cuerpo, setCuerpo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setEnviando(true);
    setError(null);
    const res = await crearTipoContrato(nombre, categorias, titulo, cuerpo);
    setEnviando(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    onListo();
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-n-200 bg-n-50 p-5">
      <h2 className="text-lg font-bold text-n-900">Nuevo contrato</h2>

      {error && (
        <Alert variante="error" titulo="No se pudo crear">
          {error}
        </Alert>
      )}

      <Field
        label="Nombre del contrato"
        value={nombre}
        onChange={(e) => setNombre(e.target.value)}
        placeholder="ej. Contrato de hotel"
        ayuda="Es el nombre que va a ver recepción cuando falte: “Falta: Contrato de hotel”."
      />
      <SelectorCategorias seleccionadas={categorias} onCambio={setCategorias} />
      <Field
        label="Título del documento"
        value={titulo}
        onChange={(e) => setTitulo(e.target.value)}
        placeholder="ej. Contrato de hospedaje canino"
        ayuda="Es el encabezado que se imprime en el PDF."
      />
      <Textarea
        label="Cuerpo del contrato"
        value={cuerpo}
        onChange={(e) => setCuerpo(e.target.value)}
        rows={16}
        ayuda="Usa {{token}} para los campos que se llenan solos — lista abajo."
      />
      <AyudaTokens />

      <div className="flex gap-2">
        <Button type="button" disabled={enviando} onClick={guardar}>
          {enviando ? "Creando…" : "Crear y publicar versión 1"}
        </Button>
        <Button type="button" variante="secundario" onClick={onListo}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function FormularioNuevaVersion({
  tipo,
  onListo,
}: {
  tipo: TipoContratoVista;
  onListo: () => void;
}) {
  const router = useRouter();
  const activa = tipo.versiones.find((v) => v.activa) ?? null;
  const [titulo, setTitulo] = useState(activa?.titulo ?? "");
  const [cuerpo, setCuerpo] = useState(activa?.cuerpo ?? "");
  const [requiereRefirma, setRequiereRefirma] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setEnviando(true);
    setError(null);
    const res = await publicarPlantilla(tipo.id, titulo, cuerpo, requiereRefirma);
    setEnviando(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    onListo();
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-n-200 bg-n-50 p-5">
      <Alert variante="advertencia" titulo="Esto publica una versión nueva">
        Los contratos ya firmados conservan el texto de su propia versión — no se modifican. Esta
        edición solo aplica a los contratos de <strong>{tipo.nombre}</strong> que se generen de aquí
        en adelante.
      </Alert>

      {error && (
        <Alert variante="error" titulo="No se pudo publicar">
          {error}
        </Alert>
      )}

      <Field label="Título del documento" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
      <Textarea
        label="Cuerpo del contrato"
        value={cuerpo}
        onChange={(e) => setCuerpo(e.target.value)}
        rows={16}
        ayuda="Usa {{token}} para los campos que se llenan solos — lista abajo."
      />
      <AyudaTokens />
      <CasillaRefirma valor={requiereRefirma} onCambio={setRequiereRefirma} />

      <div className="flex gap-2">
        <Button type="button" disabled={enviando} onClick={guardar}>
          {enviando ? "Publicando…" : "Publicar nueva versión"}
        </Button>
        <Button type="button" variante="secundario" onClick={onListo}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function FormularioDatosTipo({
  tipo,
  onListo,
}: {
  tipo: TipoContratoVista;
  onListo: () => void;
}) {
  const router = useRouter();
  const [nombre, setNombre] = useState(tipo.nombre);
  const [categorias, setCategorias] = useState<CategoriaServicioContrato[]>(tipo.categorias);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function guardar() {
    setEnviando(true);
    setError(null);
    const res = await actualizarTipoContrato(tipo.id, nombre, categorias);
    setEnviando(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    onListo();
    router.refresh();
  }

  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-n-200 pt-3">
      {error && (
        <Alert variante="error" titulo="No se pudo guardar">
          {error}
        </Alert>
      )}
      <p className="text-sm text-n-600">
        Cambiar el nombre o los servicios no toca el texto ni las versiones: los contratos ya
        firmados siguen igual.
      </p>
      <Field label="Nombre del contrato" value={nombre} onChange={(e) => setNombre(e.target.value)} />
      <SelectorCategorias seleccionadas={categorias} onCambio={setCategorias} />
      <div className="flex gap-2">
        <Button type="button" disabled={enviando} onClick={guardar}>
          {enviando ? "Guardando…" : "Guardar"}
        </Button>
        <Button type="button" variante="secundario" onClick={onListo}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}

function TarjetaTipo({ tipo, esAdmin }: { tipo: TipoContratoVista; esAdmin: boolean }) {
  const router = useRouter();
  const [editandoTexto, setEditandoTexto] = useState(false);
  const [editandoDatos, setEditandoDatos] = useState(false);
  const [confirmandoArchivo, setConfirmandoArchivo] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activa = tipo.versiones.find((v) => v.activa) ?? null;
  const historial = tipo.versiones.filter((v) => !v.activa);

  async function alternarRefirma(version: VersionPlantilla) {
    setOcupado(true);
    setError(null);
    const res = await marcarRequiereRefirma(version.id, !version.requiere_refirma);
    setOcupado(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  async function archivar() {
    setOcupado(true);
    setError(null);
    const res = await archivarTipoContrato(tipo.id);
    setOcupado(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setConfirmandoArchivo(false);
    router.refresh();
  }

  if (editandoTexto) {
    return <FormularioNuevaVersion tipo={tipo} onListo={() => setEditandoTexto(false)} />;
  }

  return (
    <div className="rounded-lg border border-n-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg font-bold text-n-900">{tipo.nombre}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            {tipo.categorias.length === 0 ? (
              <span className="rounded-full bg-n-100 px-2 py-0.5 text-xs font-semibold text-n-600">
                Aplica a todos los perros
              </span>
            ) : (
              tipo.categorias.map((c) => (
                <span
                  key={c}
                  className="rounded-full bg-azul-suave px-2 py-0.5 text-xs font-semibold text-azul-oscuro"
                >
                  {etiquetaCategoria(c)}
                </span>
              ))
            )}
          </div>
        </div>
        <p className="text-sm text-n-600">
          {activa ? `Versión ${activa.version} · activa` : "Sin versión activa"}
        </p>
      </div>

      {error && (
        <div className="mt-3">
          <Alert variante="error" titulo="No se pudo completar la acción">
            {error}
          </Alert>
        </div>
      )}

      {activa && (
        <>
          <p className="mt-3 font-semibold text-n-900">{activa.titulo}</p>
          <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md bg-n-50 p-4 text-sm text-n-700">
            {activa.cuerpo}
          </pre>
        </>
      )}

      {esAdmin && !editandoDatos && !confirmandoArchivo && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button type="button" variante="secundario" onClick={() => setEditandoTexto(true)}>
            Editar texto (nueva versión)
          </Button>
          <Button type="button" variante="secundario" onClick={() => setEditandoDatos(true)}>
            Editar nombre y servicios
          </Button>
          <Button type="button" variante="peligro" onClick={() => setConfirmandoArchivo(true)}>
            Archivar
          </Button>
        </div>
      )}

      {esAdmin && editandoDatos && (
        <FormularioDatosTipo tipo={tipo} onListo={() => setEditandoDatos(false)} />
      )}

      {esAdmin && confirmandoArchivo && (
        <div className="mt-3 flex flex-col gap-2 border-t border-n-200 pt-3">
          <p className="text-sm text-n-700">
            Archivar deja de pedir este contrato y de poder generarlo. Los que ya se firmaron siguen
            en el expediente de cada perro, con su texto intacto. Se puede reactivar después.
          </p>
          <div className="flex gap-2">
            <Button type="button" variante="peligro" disabled={ocupado} onClick={archivar}>
              {ocupado ? "Archivando…" : "Sí, archivar"}
            </Button>
            <Button type="button" variante="secundario" onClick={() => setConfirmandoArchivo(false)}>
              No
            </Button>
          </div>
        </div>
      )}

      {tipo.versiones.length > 0 && (
        <div className="mt-4 flex flex-col gap-2 border-t border-n-200 pt-3">
          <p className="text-sm font-bold uppercase tracking-wide text-n-600">Versiones</p>
          <ul className="flex flex-col gap-2">
            {[activa, ...historial]
              .filter((v): v is VersionPlantilla => v !== null)
              .map((v) => (
                <li
                  key={v.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-n-200 bg-n-50 px-3 py-2 text-sm"
                >
                  <span className="text-n-700">
                    Versión {v.version} · {v.titulo}
                    {v.activa && <span className="ml-2 font-semibold text-verde-oscuro">activa</span>}
                  </span>
                  {esAdmin ? (
                    <label className="flex items-center gap-2 text-n-900">
                      <input
                        type="checkbox"
                        checked={v.requiere_refirma}
                        disabled={ocupado}
                        onChange={() => alternarRefirma(v)}
                        className="h-4 w-4"
                      />
                      Requiere refirma
                    </label>
                  ) : (
                    v.requiere_refirma && (
                      <span className="rounded-full bg-amarillo-suave px-2 py-0.5 text-xs font-semibold text-amarillo-oscuro">
                        Requiere refirma
                      </span>
                    )
                  )}
                </li>
              ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function TarjetaArchivado({ tipo, esAdmin }: { tipo: TipoContratoVista; esAdmin: boolean }) {
  const router = useRouter();
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function reactivar() {
    setOcupado(true);
    setError(null);
    const res = await reactivarTipoContrato(tipo.id);
    setOcupado(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  return (
    <li className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-n-200 bg-n-50 px-3 py-2 text-sm">
      <span className="text-n-600">
        {tipo.nombre} · {tipo.versiones.length}{" "}
        {tipo.versiones.length === 1 ? "versión" : "versiones"}
      </span>
      {error && <span className="text-sm text-naranja-oscuro">{error}</span>}
      {esAdmin && (
        <Button type="button" variante="secundario" disabled={ocupado} onClick={reactivar}>
          {ocupado ? "Reactivando…" : "Reactivar"}
        </Button>
      )}
    </li>
  );
}

export function PlantillasContrato({
  tipos,
  archivados,
  esAdmin,
}: {
  tipos: TipoContratoVista[];
  archivados: TipoContratoVista[];
  esAdmin: boolean;
}) {
  const [creando, setCreando] = useState(false);

  return (
    <div className="flex flex-col gap-4">
      {tipos.length === 0 && !creando && (
        <Alert variante="advertencia" titulo="Sin contratos configurados">
          Todavía no hay ninguna plantilla de contrato. No se pueden generar contratos hasta que un
          admin cree la primera.
        </Alert>
      )}

      {tipos.map((tipo) => (
        <TarjetaTipo key={tipo.id} tipo={tipo} esAdmin={esAdmin} />
      ))}

      {creando ? (
        <FormularioNuevoTipo onListo={() => setCreando(false)} />
      ) : (
        esAdmin && (
          <Button type="button" variante="secundario" className="self-start" onClick={() => setCreando(true)}>
            Nuevo contrato
          </Button>
        )
      )}

      {archivados.length > 0 && (
        <div className="flex flex-col gap-2 border-t border-n-200 pt-4">
          <p className="text-sm font-bold uppercase tracking-wide text-n-600">Archivados</p>
          <p className="-mt-1 text-sm text-n-600">
            Ya no se piden ni se generan. Lo que se firmó con ellos sigue en el expediente del perro.
          </p>
          <ul className="flex flex-col gap-2">
            {archivados.map((tipo) => (
              <TarjetaArchivado key={tipo.id} tipo={tipo} esAdmin={esAdmin} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
