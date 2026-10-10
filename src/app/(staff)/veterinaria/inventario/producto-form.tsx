"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { guardarProductoClinico } from "../actions";
import { CLASIFICACIONES_LGS, GRUPOS_SENASICA, type PrincipioActivo } from "../comun";

export type ProductoClinico = {
  id: string;
  nombre: string;
  area_id: string | null;
  stock_minimo: number; // en unidad de consumo
  dias_aviso_caducidad: number | null;
  principio_activo_id: string | null;
  grupo_senasica: string | null;
  clasificacion_lgs: string | null;
  es_antimicrobiano: boolean;
  clasificacion_por_confirmar: boolean;
  unidad_compra_etiqueta?: string;
  unidad_consumo_etiqueta?: string;
};

type Opcion = { id: string; etiqueta: string };

/**
 * Alta o edición de un producto clínico. Al elegir un principio activo se
 * PRELLENAN el grupo SENASICA, la clasificación de la Ley General de Salud y
 * el antimicrobiano, pero cada producto guarda las suyas y se pueden cambiar.
 */
export function ProductoForm({
  producto,
  areas,
  unidades,
  principios,
  puedeEditar,
}: {
  producto?: ProductoClinico;
  areas: Opcion[];
  unidades: Opcion[];
  principios: PrincipioActivo[];
  puedeEditar: boolean;
}) {
  const router = useRouter();
  const envio = useEspera();
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [principioId, setPrincipioId] = useState(producto?.principio_activo_id ?? "");
  const [grupo, setGrupo] = useState(producto?.grupo_senasica ?? "");
  const [lgs, setLgs] = useState(producto?.clasificacion_lgs ?? "");
  const [antimicrobiano, setAntimicrobiano] = useState(producto?.es_antimicrobiano ?? false);
  const [porConfirmar, setPorConfirmar] = useState(producto?.clasificacion_por_confirmar ?? false);
  const [prellenado, setPrellenado] = useState<string | null>(null);

  function elegirPrincipio(id: string) {
    setPrincipioId(id);
    const p = principios.find((x) => x.id === id);
    if (!p) {
      setPrellenado(null);
      return;
    }
    setGrupo(p.grupo_senasica ?? "");
    setLgs(p.clasificacion_lgs ?? "");
    setAntimicrobiano(p.es_antimicrobiano);
    setPorConfirmar(p.por_confirmar);
    setPrellenado(
      `Tomamos las clasificaciones de «${p.nombre}»${p.nota ? ` (${p.nota})` : ""}. Puedes cambiarlas si este producto es distinto.`
    );
  }

  const bloqueado = !puedeEditar || envio.cargando;

  return (
    <form
      className="flex flex-col gap-4 rounded-lg border border-n-200 bg-white p-5"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        setExito(null);
        const datos = new FormData(e.currentTarget);
        const res = await envio.ejecutar(() => guardarProductoClinico(datos));
        if (res.error) {
          setError(res.error);
          return;
        }
        if (res.ir) {
          router.push(res.ir);
          return;
        }
        setExito(res.exito ?? "Guardado");
        router.refresh();
      }}
    >
      {producto && <input type="hidden" name="id" value={producto.id} />}
      <Field label="Nombre del producto" name="nombre" defaultValue={producto?.nombre ?? ""} required disabled={bloqueado} />
      <div className="grid gap-3 sm:grid-cols-2">
        <Select label="Área" name="area_id" defaultValue={producto?.area_id ?? ""} disabled={bloqueado} required>
          <option value="">Elige un área</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>
              {a.etiqueta}
            </option>
          ))}
        </Select>
        {producto ? (
          <p className="self-end text-sm text-n-600">
            Se compra en {producto.unidad_compra_etiqueta ?? "—"} y se surte en {producto.unidad_consumo_etiqueta ?? "—"}. Las unidades no se cambian una vez que hay movimientos.
          </p>
        ) : (
          <div />
        )}
        {!producto && (
          <>
            <Select label="Unidad de compra" name="unidad_compra_id" defaultValue="" disabled={bloqueado} required ayuda="Como viene en la caja: frasco, caja, pieza…">
              <option value="">Elige una unidad</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.etiqueta}
                </option>
              ))}
            </Select>
            <Select label="Unidad de consumo" name="unidad_consumo_id" defaultValue="" disabled={bloqueado} required ayuda="Como se surte: ml, tableta, pieza…">
              <option value="">Elige una unidad</option>
              {unidades.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.etiqueta}
                </option>
              ))}
            </Select>
          </>
        )}
        <Field
          label={`Stock mínimo${producto?.unidad_consumo_etiqueta ? ` (${producto.unidad_consumo_etiqueta})` : " (en unidad de consumo)"}`}
          name="stock_minimo"
          type="number"
          step="0.01"
          min="0"
          defaultValue={producto ? String(producto.stock_minimo) : "0"}
          disabled={bloqueado}
        />
        <Field
          label="Avisar de la caducidad con (días)"
          name="dias_aviso_caducidad"
          type="number"
          min="1"
          defaultValue={String(producto?.dias_aviso_caducidad ?? 30)}
          disabled={bloqueado}
        />
      </div>

      <fieldset className="flex flex-col gap-3 rounded-md border border-n-200 bg-n-50 p-4" disabled={bloqueado}>
        <legend className="px-1 text-sm font-bold text-n-800">Clasificación</legend>
        <Select label="Principio activo" name="principio_activo_id" value={principioId} onChange={(e) => elegirPrincipio(e.target.value)} ayuda="Opcional. Al elegirlo se llenan las clasificaciones de abajo; el catálogo lo mantiene PeluDesk.">
          <option value="">Sin principio activo</option>
          {principios.map((p) => (
            <option key={p.id} value={p.id}>
              {p.nombre}
            </option>
          ))}
        </Select>
        {prellenado && <p className="text-sm text-morado">{prellenado}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Grupo SENASICA" name="grupo_senasica" value={grupo} onChange={(e) => setGrupo(e.target.value)}>
            <option value="">Ninguno</option>
            {GRUPOS_SENASICA.map((g) => (
              <option key={g.valor} value={g.valor}>
                {g.etiqueta}
              </option>
            ))}
          </Select>
          <Select label="Clasificación de la Ley General de Salud" name="clasificacion_lgs" value={lgs} onChange={(e) => setLgs(e.target.value)}>
            <option value="">Ninguna</option>
            {CLASIFICACIONES_LGS.map((c) => (
              <option key={c.valor} value={c.valor}>
                {c.etiqueta}
              </option>
            ))}
          </Select>
        </div>
        <p className="text-xs text-n-600">Las dos clasificaciones son independientes: un producto puede tener una, las dos o ninguna.</p>
        <label className="flex items-center gap-2 text-n-800">
          <input type="checkbox" name="es_antimicrobiano" checked={antimicrobiano} onChange={(e) => setAntimicrobiano(e.target.checked)} className="h-5 w-5" />
          Es un antimicrobiano
        </label>
        <label className="flex items-center gap-2 text-n-800">
          <input type="checkbox" name="clasificacion_por_confirmar" checked={porConfirmar} onChange={(e) => setPorConfirmar(e.target.checked)} className="h-5 w-5" />
          Clasificación por confirmar (no estoy seguro)
        </label>
      </fieldset>

      {puedeEditar ? (
        <AccionesFormulario error={error} exito={exito}>
          <Button type="submit" cargando={envio.cargando}>
            {producto ? "Guardar producto" : "Crear producto"}
          </Button>
        </AccionesFormulario>
      ) : (
        <p className="text-sm text-n-600">Solo ves esta ficha: editarla necesita el permiso «Administrar lotes e inventario clínico».</p>
      )}
    </form>
  );
}
