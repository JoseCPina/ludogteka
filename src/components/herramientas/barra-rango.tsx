import { pesosMercado, type Rango } from "@/lib/mercado/catalogo";

/**
 * La barra del rango: la mitad de los negocios cobra entre p25 y p75 (banda menta), la mediana es la raya morada y,
 * si la persona escribió su precio, un triángulo lo ubica. La escala va del mínimo al máximo observados con un
 * respiro, para que la banda no ocupe toda la pista.
 */
export function BarraRango({ rango, precio, unidad }: { rango: Rango; precio?: number | null; unidad?: string }) {
  if (rango.nivel === "sin_datos" || rango.p25 == null || rango.p75 == null || rango.mediana == null) return null;
  const minimo = Math.min(rango.minimo ?? rango.p25, precio ?? Infinity, rango.p25 * 0.8);
  const maximo = Math.max(rango.maximo ?? rango.p75, precio ?? 0, rango.p75 * 1.2);
  const pos = (v: number) => `${Math.max(2, Math.min(98, ((v - minimo) / (maximo - minimo || 1)) * 100))}%`;
  return (
    <figure className="hta-aparece">
      <div className="relative pb-14 pt-4">
        <div className="hta-barra" role="img" aria-label={`La mitad de los negocios cobra entre ${pesosMercado(rango.p25)} y ${pesosMercado(rango.p75)}; la mediana es ${pesosMercado(rango.mediana)}${precio ? `; tu precio es ${pesosMercado(precio)}` : ""}.`}>
          <div className="hta-barra-banda" style={{ left: pos(rango.p25), right: `calc(100% - ${pos(rango.p75)})` }} />
          <div className="hta-barra-mediana" style={{ left: pos(rango.mediana) }} />
          {precio != null && precio > 0 && <div className="hta-barra-tu" style={{ left: pos(precio) }} data-tu-precio />}
        </div>
        <span className="hta-marca" style={{ left: pos(rango.p25) }}><b>{pesosMercado(rango.p25)}</b>25 %</span>
        <span className="hta-marca" style={{ left: pos(rango.mediana), top: "2.9rem" }}><b>{pesosMercado(rango.mediana)}</b>mediana</span>
        <span className="hta-marca" style={{ left: pos(rango.p75) }}><b>{pesosMercado(rango.p75)}</b>75 %</span>
      </div>
      <figcaption className="text-sm text-n-600">
        {precio != null && precio > 0 ? <>El triángulo es tu precio: {pesosMercado(precio)}{unidad ? ` ${unidad}` : ""}. </> : null}
        La banda verde va del 25 % al 75 %: ahí cobra la mitad de los negocios. La raya morada es la mediana.
      </figcaption>
    </figure>
  );
}
