"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { propuestaVacia, type DatosRazaPropuesta } from "@/lib/razas-propuesta";

export type OpcionCatalogo = { id: string; etiqueta: string };

/**
 * «No la encuentro: agregar esta raza». Una hoja corta (en el celular sube
 * desde abajo y ocupa casi toda la pantalla) con lo mínimo para que la
 * plataforma la entienda: nombre, otros nombres, y —solo para el personal—
 * talla y pelo típicos. El grupo de precio solo aparece si `grupos` trae
 * algo, y eso solo pasa con «Precios y tarifas»: la hoja del dueño nunca
 * tiene un precio ni un grupo.
 *
 * Se pinta en un portal fuera del <form> del perro: así Enter dentro de la
 * hoja no envía el formulario de abajo a medio capturar.
 */
export function HojaRazaNueva({
  nombreInicial,
  modo,
  tamanos = [],
  pelajes = [],
  grupos = [],
  inicial,
  guardando = false,
  error,
  onGuardar,
  onCancelar,
}: {
  nombreInicial: string;
  modo: "personal" | "dueno";
  tamanos?: OpcionCatalogo[];
  pelajes?: OpcionCatalogo[];
  grupos?: { id: string; nombre: string }[];
  inicial?: DatosRazaPropuesta | null;
  guardando?: boolean;
  error?: string | null;
  onGuardar: (datos: DatosRazaPropuesta) => void;
  onCancelar: () => void;
}) {
  const [datos, setDatos] = useState<DatosRazaPropuesta>(inicial ?? propuestaVacia(nombreInicial));
  const [falta, setFalta] = useState<string | null>(null);

  useEffect(() => {
    const alTeclear = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancelar();
    };
    window.addEventListener("keydown", alTeclear);
    return () => window.removeEventListener("keydown", alTeclear);
  }, [onCancelar]);

  const cambiar = (c: Partial<DatosRazaPropuesta>) => setDatos((d) => ({ ...d, ...c }));
  const esDueno = modo === "dueno";

  function guardar() {
    if (!datos.nombre.trim()) return setFalta("Escribe el nombre de la raza.");
    setFalta(null);
    onGuardar({ ...datos, nombre: datos.nombre.trim() });
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center" onMouseDown={(e) => e.target === e.currentTarget && onCancelar()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Agregar una raza"
        data-hoja-raza
        className="flex max-h-[92dvh] w-full flex-col gap-4 overflow-y-auto rounded-t-2xl bg-white p-4 shadow-xl sm:max-w-md sm:rounded-2xl"
        onKeyDown={(e) => {
          // Enter en un campo de una línea no debe guardar ni enviar nada por sorpresa.
          if (e.key === "Enter" && (e.target as HTMLElement).tagName === "INPUT") e.preventDefault();
        }}
      >
        <div>
          <h2 className="text-lg font-bold text-n-900">Agregar esta raza</h2>
          <p className="mt-0.5 text-sm text-n-600">
            {esDueno
              ? "Cuéntanos de qué raza es tu perro. Nosotros la revisamos y la agregamos."
              : "La revisa PeluDesk y, al aprobarla, entra al catálogo de todos. Mientras tanto el perro queda ligado a esta propuesta."}
          </p>
        </div>

        {(falta || error) && <Alert variante="error" titulo={falta ?? "No se pudo guardar"}>{falta ? undefined : error}</Alert>}

        <Field label="Nombre de la raza" value={datos.nombre} maxLength={80} onChange={(e) => cambiar({ nombre: e.target.value })} autoFocus />
        <Field
          label="Otros nombres con los que se le conoce (opcional)"
          value={datos.variantes}
          maxLength={300}
          onChange={(e) => cambiar({ variantes: e.target.value })}
          ayuda="Separados por comas."
        />
        {!esDueno && (
          <div className="grid grid-cols-2 gap-3">
            <Select label="Tamaño típico" value={datos.tamanoId} onChange={(e) => cambiar({ tamanoId: e.target.value })}>
              <option value="">No sé</option>
              {tamanos.map((t) => <option key={t.id} value={t.id}>{t.etiqueta}</option>)}
            </Select>
            <Select label="Tipo de pelaje" value={datos.pelajeId} onChange={(e) => cambiar({ pelajeId: e.target.value })}>
              <option value="">No sé</option>
              {pelajes.map((p) => <option key={p.id} value={p.id}>{p.etiqueta}</option>)}
            </Select>
          </div>
        )}
        <Textarea
          label={esDueno ? "¿Cómo es o a qué raza se parece? (opcional)" : "Notas (opcional)"}
          value={datos.notas}
          maxLength={600}
          rows={3}
          onChange={(e) => cambiar({ notas: e.target.value })}
          ayuda={esDueno ? undefined : "Por ejemplo, de qué raza se parece o cómo se maneja."}
        />
        {!esDueno && grupos.length > 0 && (
          <Select
            label="Grupo de precio de estética en este negocio (opcional)"
            value={datos.grupoId}
            onChange={(e) => cambiar({ grupoId: e.target.value })}
          >
            <option value="">Todavía no lo sé</option>
            {grupos.map((g) => <option key={g.id} value={g.id}>{g.nombre}</option>)}
          </Select>
        )}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button type="button" variante="secundario" onClick={onCancelar} disabled={guardando}>Cancelar</Button>
          <Button type="button" cargando={guardando} onClick={guardar}>Guardar raza</Button>
        </div>
      </div>
    </div>,
    document.body
  );
}
