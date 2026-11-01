import { dinero } from "@/lib/dinero";
import { Enlace } from "@/components/ui/enlace";

// QA S18 (N70): un servicio que se cobra por kilómetro (u hora) con precio por volumen dice, con SUS precios, cómo se
// calcula el cargo: el precio de cada tramo es por unidad y el tramo lo decide la cantidad TOTAL (la distancia del
// viaje). Así lo cobra la base: precio del tramo que contiene la cantidad × cantidad.
type Fila = { grupo_raza_id: string | null; tamano_id: string | null; pelaje_id: string | null; cantidad_desde: number; cantidad_hasta: number | null; precio: number | null; no_aplica: boolean };

const UNIDAD: Record<string, { una: string; varias: string; abrev: string }> = {
  km: { una: "kilómetro", varias: "kilómetros", abrev: "km" },
  hora: { una: "hora", varias: "horas", abrev: "h" },
};

// QA S21/S22 (N70): también va en la edición del servicio. Con tramos, el ejemplo se calcula con SUS precios a una
// cantidad típica (7 km, 3 h); sin tramos, un ejemplo ilustrativo con cifras marcadas como ejemplo y «Capturar tramos».
const EJEMPLO: Record<string, { cantidad: number; tramos: { desde: number; hasta: number | null; precio: number }[] }> = {
  km: { cantidad: 7, tramos: [{ desde: 1, hasta: 5, precio: 10 }, { desde: 6, hasta: null, precio: 8 }] },
  hora: { cantidad: 3, tramos: [{ desde: 1, hasta: 2, precio: 40 }, { desde: 3, hasta: null, precio: 35 }] },
};

export function tramoDe<T extends { cantidad_desde: number; cantidad_hasta: number | null }>(tramos: T[], cantidad: number): T | null {
  return tramos.find((t) => cantidad >= t.cantidad_desde && (t.cantidad_hasta == null || cantidad <= t.cantidad_hasta)) ?? null;
}

export function ComoSeCobra({ unidad, dependeCantidad, vigentes, enlaceTarifas, enlaceCapturar }: { unidad: string; dependeCantidad: boolean; vigentes: Fila[]; enlaceTarifas?: string; enlaceCapturar: string }) {
  const u = UNIDAD[unidad];
  if (!u) return null;
  const tramos = vigentes
    .filter((f) => !f.grupo_raza_id && !f.tamano_id && !f.pelaje_id && !f.no_aplica && f.precio != null)
    .sort((a, b) => a.cantidad_desde - b.cantidad_desde);
  const rango = (desde: number, hasta: number | null) => (hasta == null ? `Desde ${desde} ${u.abrev}` : `De ${desde} a ${hasta} ${u.abrev}`);
  const ej = EJEMPLO[unidad];
  // Con tramos: la cantidad típica si cae en uno; si no, una que caiga en el segundo tramo (o el primero).
  const tipica = ej && tramoDe(tramos, ej.cantidad) ? ej.cantidad : null;
  const tAlt = tramos[1] ?? tramos[0];
  const cantidad = tipica ?? (tAlt ? (tAlt.cantidad_hasta == null ? tAlt.cantidad_desde + 2 : Math.max(tAlt.cantidad_desde, Math.min(tAlt.cantidad_hasta, tAlt.cantidad_desde + 2))) : null);
  const t = cantidad != null ? tramoDe(tramos, cantidad) : null;
  const unidadDe = (n: number) => (n === 1 ? u.una : u.varias);
  const ejPrecio = ej ? (tramoDe(ej.tramos.map((x) => ({ ...x, cantidad_desde: x.desde, cantidad_hasta: x.hasta })), ej.cantidad)?.precio ?? 0) : 0;
  return (
    <section className="rounded-lg border border-morado-suave bg-morado-suave/40 p-4 text-sm text-n-800" data-como-se-cobra>
      <h2 className="font-semibold text-n-900">Cómo se cobra este servicio</h2>
      <p className="mt-1">
        El precio es <strong>por {u.una}</strong>. {dependeCantidad ? <>Cada tramo tiene su precio y el tramo lo decide la cantidad <strong>total</strong> (por ejemplo, la distancia completa del viaje); luego se multiplica por esa cantidad.</> : <>Se multiplica por la cantidad de {u.varias} que se capturen al aplicar el cargo.</>}
      </p>
      {tramos.length > 0 ? (
        <>
          <ul className="mt-2 flex flex-col gap-0.5" data-tramos-reales>
            {tramos.map((f, i) => (
              <li key={i}>
                {rango(f.cantidad_desde, f.cantidad_hasta)}: <strong>{dinero(Number(f.precio))}</strong> por {u.una}
              </li>
            ))}
          </ul>
          {t && cantidad != null && (
            <p className="mt-2 rounded-md bg-white px-3 py-2" data-ejemplo-cobro>
              A {cantidad} {unidadDe(cantidad)} se cobra <strong>{dinero(cantidad * Number(t.precio))}</strong> ({cantidad} × {dinero(Number(t.precio))}, el precio de «{rango(t.cantidad_desde, t.cantidad_hasta).toLowerCase()}»).
            </p>
          )}
        </>
      ) : (
        <div className="mt-2 flex flex-col gap-2" data-sin-tramos>
          <p className="text-n-700">Este servicio todavía no tiene precios capturados.</p>
          {ej && (
            <p className="rounded-md border border-dashed border-n-300 bg-white px-3 py-2" data-ejemplo-ilustrativo>
              <span className="font-semibold">Por ejemplo</span> (cifras de ejemplo, no son tus precios):{" "}
              {ej.tramos.map((x, i) => (
                <span key={i}>
                  {i > 0 ? "; " : ""}
                  {rango(x.desde, x.hasta).toLowerCase()} a {dinero(x.precio)} por {u.una}
                </span>
              ))}
              . A {ej.cantidad} {unidadDe(ej.cantidad)} se cobraría {ej.cantidad} × {dinero(ejPrecio)} = <strong>{dinero(ej.cantidad * ejPrecio)}</strong>.
            </p>
          )}
          <Enlace href={enlaceCapturar} className="self-start" data-capturar-tramos>
            <span className="inline-flex min-h-11 items-center rounded-md bg-morado px-4 font-semibold text-white hover:bg-morado-oscuro">Capturar tramos</span>
          </Enlace>
        </div>
      )}
      {enlaceTarifas && tramos.length > 0 && (
        <p className="mt-2">
          <Enlace href={enlaceTarifas} data-enlace-tarifas>
            Ver y editar los tramos y precios →
          </Enlace>
        </p>
      )}
    </section>
  );
}
