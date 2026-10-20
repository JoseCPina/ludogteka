import { dinero } from "@/lib/dinero";

// QA S18 (N70): un servicio que se cobra por kilómetro (u hora) con precio por volumen dice, con SUS precios, cómo se
// calcula el cargo: el precio de cada tramo es por unidad y el tramo lo decide la cantidad TOTAL (la distancia del
// viaje). Así lo cobra la base: precio del tramo que contiene la cantidad × cantidad.
type Fila = { grupo_raza_id: string | null; tamano_id: string | null; pelaje_id: string | null; cantidad_desde: number; cantidad_hasta: number | null; precio: number | null; no_aplica: boolean };

const UNIDAD: Record<string, { una: string; varias: string; abrev: string }> = {
  km: { una: "kilómetro", varias: "kilómetros", abrev: "km" },
  hora: { una: "hora", varias: "horas", abrev: "h" },
};

export function ComoSeCobra({ unidad, dependeCantidad, vigentes }: { unidad: string; dependeCantidad: boolean; vigentes: Fila[] }) {
  const u = UNIDAD[unidad];
  if (!u) return null;
  const tramos = vigentes
    .filter((f) => !f.grupo_raza_id && !f.tamano_id && !f.pelaje_id && !f.no_aplica && f.precio != null)
    .sort((a, b) => a.cantidad_desde - b.cantidad_desde);
  const texto = (t: Fila) => (t.cantidad_hasta == null ? `Desde ${t.cantidad_desde} ${u.abrev}` : `De ${t.cantidad_desde} a ${t.cantidad_hasta} ${u.abrev}`);
  // El ejemplo cae en el segundo tramo si hay (así se ve que el tramo cambia el precio), si no en el primero.
  const t = tramos[1] ?? tramos[0];
  const cantidad = t ? (t.cantidad_hasta == null ? t.cantidad_desde + 2 : Math.max(t.cantidad_desde, Math.min(t.cantidad_hasta, t.cantidad_desde + 2))) : null;
  return (
    <section className="rounded-lg border border-morado-suave bg-morado-suave/40 p-4 text-sm text-n-800" data-como-se-cobra>
      <h2 className="font-semibold text-n-900">Cómo se cobra este servicio</h2>
      <p className="mt-1">
        El precio es <strong>por {u.una}</strong>. {dependeCantidad ? <>Cada tramo tiene su precio y el tramo lo decide la cantidad <strong>total</strong> (por ejemplo, la distancia completa del viaje); luego se multiplica por esa cantidad.</> : <>Se multiplica por la cantidad de {u.varias} que se capturen al aplicar el cargo.</>}
      </p>
      {tramos.length > 0 ? (
        <>
          <ul className="mt-2 flex flex-col gap-0.5">
            {tramos.map((f, i) => (
              <li key={i}>
                {texto(f)}: <strong>{dinero(Number(f.precio))}</strong> por {u.una}
              </li>
            ))}
          </ul>
          {t && cantidad != null && (
            <p className="mt-2 rounded-md bg-white px-3 py-2" data-ejemplo-cobro>
              Ejemplo: {cantidad} {cantidad === 1 ? u.una : u.varias} caen en «{texto(t).toLowerCase()}» y se cobran {cantidad} × {dinero(Number(t.precio))} ={" "}
              <strong>{dinero(cantidad * Number(t.precio))}</strong>.
            </p>
          )}
        </>
      ) : (
        <p className="mt-2 text-n-600">
          Todavía no tiene precios. {dependeCantidad ? "Agrega tramos abajo (por ejemplo, de 0 a 5 y desde 6) y el precio por " + u.una + " de cada uno." : "Captura abajo el precio por " + u.una + "."}
        </p>
      )}
    </section>
  );
}
