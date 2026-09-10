"use client";

import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { SelectorRaza, type RazaOpcion } from "@/components/selector-raza";
import type { CotizacionEstetica } from "@/lib/estetica/cotizacion";
import type { CampoPerro } from "@/lib/alta/campos-perro";
import type { PerroAlta } from "../tipos";
import { PrecioEstetica } from "./precio-estetica";

export type Catalogo = { id: string; etiqueta: string };

export function TarjetaPerro({
  perro,
  titulo,
  campos,
  razas,
  tamanos,
  pelajes,
  cotizacion,
  foto,
  onCambio,
  onFoto,
  onQuitar,
  pedirNombre = true,
}: {
  perro: PerroAlta;
  titulo: string;
  campos: CampoPerro[];
  razas: RazaOpcion[];
  tamanos: Catalogo[];
  pelajes: Catalogo[];
  // Solo en el flujo de estética. Null en guardería/hotel: ahí el precio
  // depende de cuántas noches se queda, no de la raza, y enseñar el del
  // baño sería contestar una pregunta que nadie hizo.
  cotizacion: CotizacionEstetica | null;
  foto: File | null;
  onCambio: (cambios: Partial<PerroAlta>) => void;
  onFoto: ((archivo: File | null) => void) | null;
  onQuitar: (() => void) | null;
  pedirNombre?: boolean;
}) {
  const pide = (campo: CampoPerro) => campos.includes(campo);
  const pideEmergencia = pide("contacto_emergencia_nombre") || pide("contacto_emergencia_telefono");
  const pideVeterinario =
    pide("veterinario_nombre") || pide("veterinario_telefono") || pide("veterinario_clinica");

  return (
    <div className="flex flex-col gap-4 rounded-lg border-[1.5px] border-n-200 bg-white p-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="font-bold text-n-900">{titulo}</h3>
        {onQuitar && (
          <Button type="button" variante="secundario" onClick={onQuitar}>
            Quitar
          </Button>
        )}
      </div>

      {pedirNombre && (
        <Field
          label="¿Cómo se llama?"
          value={perro.nombre}
          onChange={(e) => onCambio({ nombre: e.target.value })}
          required
        />
      )}

      {pide("raza") && (
        <SelectorRaza
          razas={razas}
          label="¿De qué raza es?"
          valorId={perro.raza_id}
          valorTexto={perro.raza}
          onCambio={(v) => onCambio({ raza: v.raza, raza_id: v.raza_id })}
          ayuda="Si no sabes o es mestizo, escribe «mestizo» y escógelo de la lista."
        />
      )}

      {(pide("sexo") || pide("fecha_nacimiento")) && (
        <div className="grid grid-cols-2 gap-3">
          {pide("sexo") && (
            <Select label="Sexo" value={perro.sexo} onChange={(e) => onCambio({ sexo: e.target.value })}>
              <option value="">Prefiero no decir</option>
              <option value="macho">Macho</option>
              <option value="hembra">Hembra</option>
            </Select>
          )}
          {pide("fecha_nacimiento") && (
            <Field
              label="Fecha de nacimiento"
              type="date"
              value={perro.fecha_nacimiento}
              onChange={(e) => onCambio({ fecha_nacimiento: e.target.value })}
              ayuda="Aproximada está bien."
            />
          )}
        </div>
      )}

      {(pide("tamano_id") || pide("pelaje_id")) && (
        <div className="grid grid-cols-2 gap-3">
          {pide("tamano_id") && (
            <Select
              label="Tamaño"
              value={perro.tamano_id}
              onChange={(e) => onCambio({ tamano_id: e.target.value })}
            >
              <option value="">No sé</option>
              {tamanos.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.etiqueta}
                </option>
              ))}
            </Select>
          )}
          {pide("pelaje_id") && (
            <Select
              label="Pelaje"
              value={perro.pelaje_id}
              onChange={(e) => onCambio({ pelaje_id: e.target.value })}
            >
              <option value="">No sé</option>
              {pelajes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.etiqueta}
                </option>
              ))}
            </Select>
          )}
        </div>
      )}

      {cotizacion && (
        <PrecioEstetica
          cotizacion={cotizacion}
          razaId={perro.raza_id}
          razaEscrita={perro.raza}
          tamanoId={perro.tamano_id}
        />
      )}

      {pide("alimentacion_notas") && (
        <Textarea
          label="Alimentación"
          value={perro.alimentacion_notas}
          onChange={(e) => onCambio({ alimentacion_notas: e.target.value })}
          placeholder="Qué come, cuánto y a qué horas. Si trae su propia comida, dínoslo aquí."
          rows={3}
        />
      )}

      {pideEmergencia && (
        <fieldset className="flex flex-col gap-3 rounded-md border border-n-200 p-3">
          <legend className="px-1 text-sm font-bold text-n-700">Contacto de emergencia</legend>
          <p className="text-sm text-n-600">A quién le hablamos si no te localizamos a ti.</p>
          {pide("contacto_emergencia_nombre") && (
            <Field
              label="Nombre"
              value={perro.contacto_emergencia_nombre}
              onChange={(e) => onCambio({ contacto_emergencia_nombre: e.target.value })}
            />
          )}
          {pide("contacto_emergencia_telefono") && (
            <Field
              label="Teléfono"
              inputMode="tel"
              value={perro.contacto_emergencia_telefono}
              onChange={(e) => onCambio({ contacto_emergencia_telefono: e.target.value })}
            />
          )}
        </fieldset>
      )}

      {pideVeterinario && (
        <fieldset className="flex flex-col gap-3 rounded-md border border-n-200 p-3">
          <legend className="px-1 text-sm font-bold text-n-700">Su veterinario</legend>
          {pide("veterinario_nombre") && (
            <Field
              label="Nombre del veterinario"
              value={perro.veterinario_nombre}
              onChange={(e) => onCambio({ veterinario_nombre: e.target.value })}
            />
          )}
          {pide("veterinario_clinica") && (
            <Field
              label="Clínica"
              value={perro.veterinario_clinica}
              onChange={(e) => onCambio({ veterinario_clinica: e.target.value })}
            />
          )}
          {pide("veterinario_telefono") && (
            <Field
              label="Teléfono"
              inputMode="tel"
              value={perro.veterinario_telefono}
              onChange={(e) => onCambio({ veterinario_telefono: e.target.value })}
            />
          )}
        </fieldset>
      )}

      {onFoto && (
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-n-800">Foto (opcional)</label>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={(e) => onFoto(e.target.files?.[0] ?? null)}
            className="w-full rounded-md border-[1.5px] border-n-400 bg-white p-2.5 text-sm text-n-700"
          />
          {foto && <p className="mt-1 text-sm text-verde-oscuro">Foto lista: {foto.name}</p>}
        </div>
      )}
    </div>
  );
}
