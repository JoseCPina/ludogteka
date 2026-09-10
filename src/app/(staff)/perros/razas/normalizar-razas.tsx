"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Select } from "@/components/ui/select";
import { SelectorRaza, type RazaOpcion } from "@/components/selector-raza";
import { estimadoDeRaza, type CotizacionEstetica } from "@/lib/estetica/cotizacion";
import { asignarRazasEnLote, type AsignacionRaza } from "./acciones";

export type PerroSinRaza = {
  id: string;
  nombre: string;
  cliente_id: string;
  cliente_nombre: string;
  raza_escrita: string;
  tamano_id: string | null;
  sugerencia_id: string | null;
};

type Catalogo = { id: string; etiqueta: string };
type Eleccion = { raza_id: string | null; raza: string; tamano_id: string };

function pesos(n: number | null): string {
  return n === null ? "sin tarifa" : `$${n.toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
}

export function NormalizarRazas({
  perros,
  razas,
  tamanos,
  cotizacion,
  soloLectura = false,
}: {
  perros: PerroSinRaza[];
  razas: RazaOpcion[];
  tamanos: Catalogo[];
  cotizacion: CotizacionEstetica | null;
  soloLectura?: boolean;
}) {
  const router = useRouter();
  const porId = useMemo(() => new Map(razas.map((r) => [r.id, r])), [razas]);

  const [elecciones, setElecciones] = useState<Record<string, Eleccion>>(() =>
    Object.fromEntries(
      perros.map((p) => [
        p.id,
        { raza_id: null, raza: p.raza_escrita, tamano_id: p.tamano_id ?? "" },
      ])
    )
  );
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resultado, setResultado] = useState<string | null>(null);

  function actualizar(perroId: string, cambios: Partial<Eleccion>) {
    setElecciones((prev) => ({ ...prev, [perroId]: { ...prev[perroId], ...cambios } }));
  }

  function aplicarSugerencias() {
    setElecciones((prev) => {
      const copia = { ...prev };
      for (const p of perros) {
        if (!p.sugerencia_id || copia[p.id].raza_id) continue;
        const raza = porId.get(p.sugerencia_id);
        if (raza) copia[p.id] = { ...copia[p.id], raza_id: raza.id, raza: raza.nombre };
      }
      return copia;
    });
  }

  // Solo se manda lo que alguien decidió. Un renglón sin tocar no viaja:
  // no hay diferencia entre "no lo contesté" y "lo dejé igual", y en la
  // duda es mejor que siga apareciendo en esta lista.
  const listos = useMemo(() => {
    const salida: (AsignacionRaza & { perro: PerroSinRaza; faltaTalla: boolean })[] = [];
    for (const p of perros) {
      const eleccion = elecciones[p.id];
      if (!eleccion?.raza_id) continue;
      const raza = porId.get(eleccion.raza_id);
      if (!raza) continue;

      // Si el grupo de esa raza cobra por talla y el perro no la tiene,
      // asignarle la raza no basta: su cita se seguiría rechazando al
      // agendarse, ahora por el tamaño. Se pide aquí para no descubrirlo
      // en el mostrador.
      const faltaTalla = Boolean(raza.grupo_depende_tamano) && !eleccion.tamano_id;

      salida.push({
        perro_id: p.id,
        raza_id: raza.id,
        raza: raza.nombre,
        tamano_id: eleccion.tamano_id || null,
        perro: p,
        faltaTalla,
      });
    }
    return salida;
  }, [perros, elecciones, porId]);

  const bloqueados = listos.filter((l) => l.faltaTalla);
  const pendientesSugerencia = perros.filter(
    (p) => p.sugerencia_id && !elecciones[p.id]?.raza_id
  ).length;

  async function guardar() {
    setError(null);
    setResultado(null);
    if (bloqueados.length > 0) {
      setError(
        `Falta el tamaño de ${bloqueados.map((b) => b.perro.nombre).join(", ")}. Su grupo de raza cobra por talla y sin ella no se le puede agendar el baño.`
      );
      return;
    }

    setGuardando(true);
    const res = await asignarRazasEnLote(
      listos.map(({ perro_id, raza_id, raza, tamano_id }) => ({
        perro_id,
        raza_id,
        raza,
        tamano_id,
      }))
    );
    setGuardando(false);

    if (res.error) {
      setError(res.error);
      return;
    }
    setResultado(
      res.fallidos
        ? `Se guardaron ${res.guardados} de ${listos.length}. ${res.fallidos} no se pudieron: siguen en la lista.`
        : `Listo: ${res.guardados} ${res.guardados === 1 ? "perro" : "perros"} ya cotizan con su grupo.`
    );
    router.refresh();
  }

  function precios(perro: PerroSinRaza, eleccion: Eleccion) {
    if (!cotizacion) return null;
    const antes = estimadoDeRaza(cotizacion, null, "x", perro.tamano_id ?? "");
    const despues = eleccion.raza_id
      ? estimadoDeRaza(cotizacion, eleccion.raza_id, "x", eleccion.tamano_id)
      : null;
    return { antes, despues };
  }

  return (
    <div className="flex flex-col gap-4">
      {error && (
        <Alert variante="error" titulo="No se pudo guardar">
          {error}
        </Alert>
      )}
      {resultado && <Alert variante="exito" titulo={resultado} />}

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-n-200 bg-n-50 p-4">
        <Button
          type="button"
          variante="secundario"
          disabled={soloLectura || pendientesSugerencia === 0}
          onClick={aplicarSugerencias}
        >
          {pendientesSugerencia === 0
            ? "No quedan coincidencias exactas"
            : `Aplicar ${pendientesSugerencia} ${pendientesSugerencia === 1 ? "coincidencia exacta" : "coincidencias exactas"}`}
        </Button>
        <p className="text-sm text-n-600">
          Solo llena los que escribieron el nombre tal cual está en el catálogo. Los demás los
          decides tú: adivinar cambiaría el precio de ese perro sin que nadie lo haya resuelto.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {perros.map((perro) => {
          const eleccion = elecciones[perro.id];
          const raza = eleccion.raza_id ? porId.get(eleccion.raza_id) : null;
          const p = precios(perro, eleccion);
          const faltaTalla = Boolean(raza?.grupo_depende_tamano) && !eleccion.tamano_id;

          return (
            <div
              key={perro.id}
              className={`flex flex-col gap-3 rounded-lg border-[1.5px] bg-white p-4 ${
                eleccion.raza_id ? "border-verde" : "border-n-200"
              }`}
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div>
                  <Link
                    href={`/perros/${perro.id}`}
                    className="font-bold text-azul hover:underline"
                  >
                    {perro.nombre}
                  </Link>
                  <span className="text-n-600"> · {perro.cliente_nombre}</span>
                </div>
                <p className="text-sm text-n-600">
                  {perro.raza_escrita ? (
                    <>
                      Escribieron: <strong>«{perro.raza_escrita}»</strong>
                    </>
                  ) : (
                    <span className="font-semibold text-naranja-oscuro">
                      No escribieron ninguna raza
                    </span>
                  )}
                </p>
              </div>

              <SelectorRaza
                razas={razas}
                label="Raza del catálogo"
                mostrarGrupo
                disabled={soloLectura}
                valorId={eleccion.raza_id}
                valorTexto={eleccion.raza_id ? eleccion.raza : ""}
                onCambio={(v) => actualizar(perro.id, { raza_id: v.raza_id, raza: v.raza })}
              />

              {faltaTalla && (
                <div className="flex flex-col gap-2 rounded-md border-[1.5px] border-naranja-oscuro bg-naranja-suave p-3">
                  <p className="text-sm font-bold text-naranja-oscuro">
                    Este grupo cobra por talla y {perro.nombre} no tiene tamaño registrado.
                  </p>
                  <p className="text-sm text-n-700">
                    Sin él, su cita de estética se sigue rechazando al agendarla — ahora por el
                    tamaño en vez de por la raza.
                  </p>
                  <Select
                    label="Tamaño"
                    value={eleccion.tamano_id}
                    onChange={(e) => actualizar(perro.id, { tamano_id: e.target.value })}
                    className="max-w-[220px]"
                  >
                    <option value="">Elige uno</option>
                    {tamanos.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.etiqueta}
                      </option>
                    ))}
                  </Select>
                </div>
              )}

              {p && (
                <p className="text-sm text-n-600">
                  Baño estético: hoy <strong>{pesos(p.antes?.desde ?? null)}</strong> (grupo por
                  defecto)
                  {p.despues && (
                    <>
                      {" → "}
                      <strong className="text-n-900">{pesos(p.despues.desde)}</strong>{" "}
                      con {raza?.nombre}
                    </>
                  )}
                </p>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-n-200 pt-4">
        <Button
          type="button"
          disabled={soloLectura || listos.length === 0 || guardando}
          onClick={guardar}
        >
          {guardando
            ? "Guardando…"
            : listos.length === 0
              ? "Nada que guardar todavía"
              : `Guardar ${listos.length} ${listos.length === 1 ? "raza" : "razas"}`}
        </Button>
        <p className="text-sm text-n-600">
          Se guardan solo los que asignaste. Los que dejes sin tocar siguen aquí para después.
        </p>
      </div>
    </div>
  );
}
