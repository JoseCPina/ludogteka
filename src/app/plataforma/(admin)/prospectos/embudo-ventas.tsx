import { Alert } from "@/components/ui/alert";
import { TablaResponsiva } from "@/components/ui/tabla-responsiva";

// «Embudo del bot de ventas» en /plataforma/prospectos: por giro y por fuente, cuántos le escribieron al bot,
// dijeron su giro, contestaron la pregunta de calificación, abrieron el formulario «Probar gratis» y abrieron su
// negocio desde él, con la tasa entre cada paso. Los conteos los hace la base (wa_ventas_embudo).

export type FilaEmbudo = { giro: string; fuente: string; entraron: number; con_giro: number; calificados: number; abrieron_flow: number; registrados: number };

const GIROS: Record<string, string> = { estetica: "Estética", hotel_guarderia: "Hotel o guardería", veterinaria: "Veterinaria", varios: "Varios", sin_giro: "Sin decir su giro" };
const FUENTES: Record<string, string> = { directo: "Escribió directo", google_places: "Prospección (Google)", manual: "Prospecto capturado a mano", anuncio_meta: "Anuncio de Meta" };
const PASOS = [
  ["entraron", "Entraron"],
  ["con_giro", "Dijeron su giro"],
  ["calificados", "Calificados"],
  ["abrieron_flow", "Abrieron el formulario"],
  ["registrados", "Registrados"],
] as const;
type Totales = Record<(typeof PASOS)[number][0], number>;

function sumar(filas: FilaEmbudo[], clave: (f: FilaEmbudo) => string): [string, Totales][] {
  const m = new Map<string, Totales>();
  for (const f of filas) {
    const t = m.get(clave(f)) ?? { entraron: 0, con_giro: 0, calificados: 0, abrieron_flow: 0, registrados: 0 };
    for (const [c] of PASOS) t[c] += Number(f[c] ?? 0);
    m.set(clave(f), t);
  }
  return [...m.entries()];
}

/** La tasa contra el paso anterior («—» si el anterior es cero). */
const tasa = (n: number, anterior: number) => (anterior > 0 ? `${Math.round((n / anterior) * 100)} %` : "—");

function Tabla({ titulo, filas, nombres }: { titulo: string; filas: [string, Totales][]; nombres: Record<string, string> }) {
  return (
    <TablaResponsiva className="tabla-tarjetas mt-3 w-full text-sm">
      <thead>
        <tr className="text-left text-n-600">
          <th className="py-1 pr-3">{titulo}</th>
          {PASOS.map(([c, t]) => <th key={c} className="py-1 pr-3 text-right">{t}</th>)}
        </tr>
      </thead>
      <tbody>
        {filas.map(([k, t]) => (
          <tr key={k} className="border-t border-n-100">
            <td className="py-1 pr-3 font-semibold text-n-900">{nombres[k] ?? k}</td>
            {PASOS.map(([c, nombre], i) => (
              <td key={c} data-label={nombre} className="py-1 pr-3 text-right">
                {t[c].toLocaleString("es-MX")}
                {i > 0 && <span className="block text-xs text-n-500">{tasa(t[c], t[PASOS[i - 1][0]])}</span>}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </TablaResponsiva>
  );
}

export function EmbudoVentas({ filas, error }: { filas: FilaEmbudo[]; error: string | null }) {
  const total = sumar(filas, () => "Total");
  return (
    <section className="rounded-lg border border-n-200 bg-white p-5" data-embudo-ventas>
      <h2 className="text-lg font-bold text-n-900">Embudo del bot de ventas</h2>
      <p className="mt-1 text-sm text-n-600">
        Prospectos que le escribieron al bot de WhatsApp: cuántos dijeron su giro, contestaron la pregunta de calificación, abrieron el formulario «Probar
        gratis» y abrieron su negocio desde él. Debajo de cada cifra, la tasa contra el paso anterior.
      </p>
      {error && <Alert variante="error" titulo="No pudimos cargar el embudo">{error}</Alert>}
      {!error && total.length === 0 && <p className="mt-3 text-sm text-n-600">Todavía no le ha escrito nadie al bot de ventas.</p>}
      {total.length > 0 && (
        <>
          <Tabla titulo="Por giro" filas={[...sumar(filas, (f) => f.giro), ...total]} nombres={{ ...GIROS, Total: "Total" }} />
          <Tabla titulo="Por fuente" filas={sumar(filas, (f) => f.fuente)} nombres={FUENTES} />
        </>
      )}
    </section>
  );
}
