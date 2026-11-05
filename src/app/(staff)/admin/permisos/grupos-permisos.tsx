"use client";

import { useId, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Alternar } from "@/components/ui/alternar";
import { Field } from "@/components/ui/field";
import { Chip } from "@/components/ui/chip";
import { PERMISOS } from "@/lib/auth/permisos";
import { PERMISOS_POR_OMISION, permisosPorGrupo, type GrupoPermiso } from "@/lib/auth/permisos-grupos";
import { cambiarPermiso, cambiarPermisos } from "./permisos-actions";

type Permiso = (typeof PERMISOS)[number];

function normalizar(t: string): string {
  return t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

/**
 * Los permisos de UNA persona de recepción, en grupos plegables (un acordeón por área: Recepción y agenda, Hotel y
 * guardería, Estética, Veterinaria, Clientes y mascotas, Caja y cobros, Inventario y gastos, Reportes, Equipo,
 * Configuración), cada uno con cuántos están activos de cuántos y «Activar todo el grupo» / «Quitar todo el grupo». Con
 * buscador: al escribir, solo quedan los permisos que coinciden (nombre o lo que implican) y sus grupos se abren solos.
 * Cada interruptor guarda al momento en la base (queda en la bitácora con quién y cuándo) y se pinta con lo que la base
 * devolvió. Referencia de diseño: el editor de permisos por grupo de Shopify (Mobbin), adaptado al sistema de PeluDesk.
 */
export function GruposPermisos({ profileId, activos }: { profileId: string; activos: string[] }) {
  const router = useRouter();
  const guardando = useEspera();
  const idBase = useId();
  const [enCurso, setEnCurso] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [abiertos, setAbiertos] = useState<Record<string, boolean>>({});
  const [marcados, setMarcados] = useState<string[]>(activos);

  const grupos = useMemo(() => permisosPorGrupo(), []);
  const q = normalizar(busqueda.trim());
  const coincide = (p: Permiso) => !q || normalizar(`${p.etiqueta} ${p.implica} ${p.clave}`).includes(q);

  async function alternar(clave: string, activar: boolean) {
    setError(null);
    setEnCurso(clave);
    const antes = marcados;
    setMarcados(activar ? [...marcados, clave] : marcados.filter((c) => c !== clave));
    const res = await guardando.ejecutar(() => cambiarPermiso(profileId, clave, activar));
    setEnCurso(null);
    if (res.error) {
      setMarcados(res.activos ?? antes);
      setError(res.error);
      return;
    }
    if (res.activos) setMarcados(res.activos);
    router.refresh();
  }

  async function todoElGrupo(grupo: GrupoPermiso, claves: string[], activar: boolean) {
    setError(null);
    setEnCurso(`grupo:${grupo}`);
    const antes = marcados;
    setMarcados(activar ? Array.from(new Set([...marcados, ...claves])) : marcados.filter((c) => !claves.includes(c)));
    const pendientes = activar ? claves.filter((c) => !antes.includes(c)) : claves.filter((c) => antes.includes(c));
    const res = pendientes.length ? await guardando.ejecutar(() => cambiarPermisos(profileId, pendientes, activar)) : { error: null as string | null, activos: antes };
    setEnCurso(null);
    if (res.error) {
      setMarcados(res.activos ?? antes);
      setError(res.error);
      return;
    }
    if (res.activos) setMarcados(res.activos);
    router.refresh();
  }

  const totalActivos = marcados.filter((c) => PERMISOS.some((p) => p.clave === c)).length;

  return (
    <div className="flex flex-col gap-3" data-grupos-permisos>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form role="search" className="w-full sm:max-w-xs" onSubmit={(e) => e.preventDefault()}>
          <Field label="Buscar un permiso" type="search" value={busqueda} onChange={(e) => setBusqueda(e.target.value)} placeholder="Ej. devoluciones, nómina, vacunas" />
        </form>
        <p className="text-sm text-n-600" data-permisos-resumen>
          <strong className="text-n-900">{totalActivos}</strong> de {PERMISOS.length} activos
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {grupos.map(({ grupo, permisos }) => {
          const visibles = permisos.filter(coincide);
          if (q && visibles.length === 0) return null;
          const activosDelGrupo = permisos.filter((p) => marcados.includes(p.clave)).length;
          const abierto = q ? true : Boolean(abiertos[grupo]);
          const todos = activosDelGrupo === permisos.length;
          const idPanel = `${idBase}-${normalizar(grupo).replace(/\s+/g, "-")}`;
          const trabajando = guardando.cargando && enCurso === `grupo:${grupo}`;
          return (
            <li key={grupo} className="rounded-lg border border-border bg-white" data-grupo-permisos={grupo}>
              <div className="flex flex-wrap items-center gap-2 px-3 py-2 sm:px-4">
                <Alternar
                  className="flex flex-1 items-center gap-2 text-left"
                  aria-expanded={abierto}
                  aria-controls={idPanel}
                  onClick={() => setAbiertos((a) => ({ ...a, [grupo]: !abierto }))}
                  data-sin-bloqueo
                >
                  <ChevronDown className={`h-5 w-5 shrink-0 text-n-600 transition-transform ${abierto ? "rotate-180" : ""}`} aria-hidden />
                  <span className="font-semibold text-n-900">{grupo}</span>
                  <Chip tono={activosDelGrupo === 0 ? "neutro" : todos ? "exito" : "info"} punto={false}>
                    {activosDelGrupo} de {permisos.length}
                  </Chip>
                </Alternar>
                <Button
                  type="button"
                  variante="secundario"
                  tamano="compacto"
                  cargando={trabajando}
                  disabled={guardando.cargando && !trabajando}
                  onClick={() => todoElGrupo(grupo, permisos.map((p) => p.clave), !todos)}
                  data-grupo-todo={todos ? "quitar" : "activar"}
                >
                  {todos ? "Quitar todo el grupo" : "Activar todo el grupo"}
                </Button>
              </div>
              {abierto && (
                <ul id={idPanel} className="divide-y divide-border border-t border-border">
                  {visibles.map((p) => {
                    const activo = marcados.includes(p.clave);
                    const cargando = guardando.cargando && enCurso === p.clave;
                    const porOmision = PERMISOS_POR_OMISION.includes(p.clave);
                    const idTexto = `${idPanel}-${p.clave}`;
                    return (
                      <li key={p.clave} className={`flex items-start gap-3 px-3 py-3 sm:px-4 ${activo ? "bg-morado-suave/40" : ""}`} data-permiso={p.clave}>
                        <Alternar
                          activo={activo}
                          cargando={cargando}
                          disabled={guardando.cargando && !cargando}
                          onClick={() => alternar(p.clave, !activo)}
                          aria-labelledby={idTexto}
                          className="mt-0.5 shrink-0"
                        />
                        <div className="min-w-0 flex-1">
                          <p id={idTexto} className="font-semibold text-n-900">
                            {p.etiqueta}
                            {porOmision && <span className="ml-2 align-middle text-xs font-normal text-n-500">viene prendido</span>}
                            {cargando && <span className="ml-2 text-xs font-normal text-n-500">Guardando…</span>}
                          </p>
                          <p className="mt-0.5 text-sm text-n-600">{p.implica}</p>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
      {q && grupos.every(({ permisos }) => permisos.filter(coincide).length === 0) && (
        <p className="text-sm text-n-600">Ningún permiso coincide con «{busqueda.trim()}».</p>
      )}
      {error && (
        <p role="alert" className="rounded-md border-l-4 border-coral bg-coral-suave px-3 py-2 text-sm font-semibold text-coral-oscuro">
          {error}
        </p>
      )}
    </div>
  );
}
