import type { ClavePolitica } from "@/lib/politicas/catalogo";

export type RequisitoSanitarioPublico = { etiqueta: string; vigencia_meses: number };
export type HorarioDia = { dia_semana: number; hora_apertura: string | null; hora_cierre: string | null };
export type PoliticaVisible = { clave: ClavePolitica; etiqueta: string; texto: string };

const NOMBRE_DIA = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];

function hora(h: string | null): string {
  return h ? h.slice(0, 5) : "";
}

// "Lunes a viernes de 9:00 a 19:00" a partir del horario configurado:
// agrupa días consecutivos con el mismo horario. Si no hay horario
// capturado, no inventa uno.
function resumirHorario(dias: HorarioDia[]): string[] {
  const abiertos = dias
    .filter((d) => d.hora_apertura && d.hora_cierre)
    .sort((a, b) => ((a.dia_semana + 6) % 7) - ((b.dia_semana + 6) % 7));
  const tramos: { desde: number; hasta: number; texto: string }[] = [];
  for (const d of abiertos) {
    const texto = `${hora(d.hora_apertura)} a ${hora(d.hora_cierre)}`;
    const ultimo = tramos[tramos.length - 1];
    if (ultimo && ultimo.texto === texto && (ultimo.hasta + 1) % 7 === d.dia_semana) {
      ultimo.hasta = d.dia_semana;
    } else {
      tramos.push({ desde: d.dia_semana, hasta: d.dia_semana, texto });
    }
  }
  return tramos.map((t) =>
    t.desde === t.hasta
      ? `${NOMBRE_DIA[t.desde]} de ${t.texto}`
      : `${NOMBRE_DIA[t.desde]} a ${NOMBRE_DIA[t.hasta]} de ${t.texto}`
  );
}

/**
 * Lo que se le va a pedir al perro para quedarse en guardería u hotel,
 * dicho desde el registro para que nadie se entere en el mostrador.
 *
 * Nada de aquí es de un negocio en particular: las vacunas y sus
 * vigencias salen del catálogo real (las mismas que la app va a exigir),
 * el horario del que el negocio configuró (solo con guardería prendida) y
 * cada regla redactada —evaluación, celo, agresivos, después del cierre,
 * cómo se reserva— de Políticas y reglas del negocio, ya filtradas por
 * sus módulos (`politicasVisibles`). Lo que el negocio no escribió no
 * sale.
 */
export function RequisitosGuarderiaHotel({
  requisitos,
  horario,
  politicas,
  conGuarderia,
}: {
  requisitos: RequisitoSanitarioPublico[];
  horario: HorarioDia[];
  politicas: PoliticaVisible[];
  conGuarderia: boolean;
}) {
  const tramos = conGuarderia ? resumirHorario(horario) : [];
  const regla = (clave: ClavePolitica) => politicas.find((p) => p.clave === clave)?.texto ?? "";
  const reglasSueltas = politicas.filter((p) => ["evaluacion", "celo_gestantes", "agresivos", "cancelaciones", "recoleccion"].includes(p.clave));
  return (
    <section className="rounded-lg border border-n-200 bg-n-50 p-4" data-politicas-alta>
      <h2 className="font-bold text-n-900">Lo que le vamos a pedir a tu perro</h2>
      <p className="mt-1 text-sm text-n-600">
        Para cuidarlo bien y cuidar a los demás perros, antes de su primera estancia necesitamos:
      </p>
      <ul className="mt-3 flex flex-col gap-2 text-sm text-n-800">
        <li>
          <span className="font-semibold">Cartilla de vacunación vigente</span>
          {requisitos.length > 0 && (
            <ul className="mt-1 list-inside list-disc pl-2 text-n-700">
              {requisitos.map((r) => (
                <li key={r.etiqueta}>
                  {r.etiqueta} — vigencia de {r.vigencia_meses} {r.vigencia_meses === 1 ? "mes" : "meses"}
                </li>
              ))}
            </ul>
          )}
        </li>
        {reglasSueltas.map((p) => (
          <li key={p.clave} data-politica={p.clave}>
            {p.texto}
          </li>
        ))}
        {tramos.length > 0 && (
          <li data-politica="horario">
            <span className="font-semibold">Horario de guardería</span>: {tramos.join("; ")}.
            {regla("despues_del_cierre") ? ` ${regla("despues_del_cierre")}` : ""}
          </li>
        )}
      </ul>
    </section>
  );
}
