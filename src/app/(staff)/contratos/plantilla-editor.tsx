"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field } from "@/components/ui/field";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { publicarPlantilla, marcarRequiereRefirma } from "./plantilla-actions";

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

export type PlantillaHistorialItem = {
  id: string;
  version: number;
  titulo: string;
  requiere_refirma: boolean;
};

export function PlantillaEditor({
  version,
  titulo,
  cuerpo,
  esAdmin,
  historial,
}: {
  version: number | null;
  titulo: string | null;
  cuerpo: string | null;
  esAdmin: boolean;
  historial: PlantillaHistorialItem[];
}) {
  const router = useRouter();
  const [editando, setEditando] = useState(false);
  const [nuevoTitulo, setNuevoTitulo] = useState(titulo ?? "Contrato de prestación de servicios");
  const [nuevoCuerpo, setNuevoCuerpo] = useState(cuerpo ?? "");
  const [requiereRefirma, setRequiereRefirma] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [actualizandoId, setActualizandoId] = useState<string | null>(null);

  async function guardar() {
    setEnviando(true);
    setError(null);
    const res = await publicarPlantilla(nuevoTitulo, nuevoCuerpo, requiereRefirma);
    setEnviando(false);
    if (res.error) {
      setError(res.error);
      return;
    }
    setEditando(false);
    setRequiereRefirma(false);
    router.refresh();
  }

  async function alternarRefirma(item: PlantillaHistorialItem) {
    setActualizandoId(item.id);
    setError(null);
    const res = await marcarRequiereRefirma(item.id, !item.requiere_refirma);
    setActualizandoId(null);
    if (res.error) {
      setError(res.error);
      return;
    }
    router.refresh();
  }

  if (!editando) {
    return (
      <div className="flex flex-col gap-4">
        {version === null ? (
          <Alert variante="advertencia" titulo="Sin plantilla configurada">
            Todavía no hay una plantilla de contrato. No se pueden generar contratos hasta que un admin publique una.
          </Alert>
        ) : (
          <div className="rounded-lg border border-n-200 bg-white p-5">
            <p className="text-sm text-n-600">Versión {version} · activa</p>
            <p className="mt-1 text-lg font-bold text-n-900">{titulo}</p>
            <pre className="mt-3 whitespace-pre-wrap rounded-md bg-n-50 p-4 text-sm text-n-700">{cuerpo}</pre>
          </div>
        )}
        {esAdmin && (
          <Button type="button" variante="secundario" className="self-start" onClick={() => setEditando(true)}>
            {version === null ? "Crear plantilla" : "Editar plantilla (nueva versión)"}
          </Button>
        )}

        {historial.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="text-sm font-bold uppercase tracking-wide text-n-600">Historial de versiones</p>
            {error && (
              <Alert variante="error" titulo="No se pudo actualizar">
                {error}
              </Alert>
            )}
            <ul className="flex flex-col gap-2">
              {historial.map((item) => (
                <li
                  key={item.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-n-200 bg-n-50 px-3 py-2 text-sm"
                >
                  <span className="text-n-700">
                    Versión {item.version} · {item.titulo}
                  </span>
                  {esAdmin ? (
                    <label className="flex items-center gap-2 text-n-900">
                      <input
                        type="checkbox"
                        checked={item.requiere_refirma}
                        disabled={actualizandoId === item.id}
                        onChange={() => alternarRefirma(item)}
                        className="h-4 w-4"
                      />
                      Requiere refirma
                    </label>
                  ) : (
                    item.requiere_refirma && (
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

  return (
    <div className="flex flex-col gap-4 rounded-lg border border-n-200 bg-n-50 p-5">
      {version !== null && (
        <Alert variante="advertencia" titulo="Esto publica una versión nueva">
          Los contratos ya firmados conservan el texto de su propia versión — no se modifican. Esta edición solo
          aplica a los contratos que se generen de aquí en adelante.
        </Alert>
      )}

      {error && (
        <Alert variante="error" titulo="No se pudo publicar">
          {error}
        </Alert>
      )}

      <Field label="Título" value={nuevoTitulo} onChange={(e) => setNuevoTitulo(e.target.value)} />
      <Textarea
        label="Cuerpo del contrato"
        value={nuevoCuerpo}
        onChange={(e) => setNuevoCuerpo(e.target.value)}
        rows={16}
        ayuda="Usa {{token}} para los campos que se llenan solos — lista abajo."
      />

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

      <label className="flex items-start gap-2 rounded-md border-[1.5px] border-n-200 bg-white p-3 text-n-900">
        <input
          type="checkbox"
          checked={requiereRefirma}
          onChange={(e) => setRequiereRefirma(e.target.checked)}
          className="mt-0.5 h-4 w-4"
        />
        <span>
          Esta versión requiere que los contratos ya firmados se actualicen
          <span className="mt-0.5 block text-sm font-normal text-n-600">
            Los perros con un contrato firmado en una versión anterior a esta van a mostrarse como
            &quot;Requiere actualización&quot; en check-in y en la ficha del cliente — es un aviso, no
            bloquea nada.
          </span>
        </span>
      </label>

      <div className="flex gap-2">
        <Button type="button" disabled={enviando} onClick={guardar}>
          {enviando ? "Publicando…" : "Publicar nueva versión"}
        </Button>
        <Button type="button" variante="secundario" onClick={() => setEditando(false)}>
          Cancelar
        </Button>
      </div>
    </div>
  );
}
