"use client";

import { Pantalla } from "./pantalla";

// Dictado → nota SOAP línea por línea → receta con folio SITPV → carnet con QR.
const SOAP: [string, string][] = [
  ["S", "Cojea de la pata trasera desde ayer."],
  ["O", "Peso 12.4 kg · temperatura 38.6 °C."],
  ["A", "Esguince leve (presuntivo)."],
  ["P", "Reposo 5 días y antiinflamatorio."],
];
const ALTURAS = [34, 58, 26, 70, 44, 82, 38, 62, 30, 74, 48, 56, 28, 66];

// Un QR de adorno (no lleva a ningún lado): cuadrícula fija.
const QR = "1110111010011101011010111011100101110111010100010100101".split("").map((c) => c === "1");

export default function DemoVet() {
  return (
    <Pantalla altura="h-[560px] sm:h-[300px]" tiempos={[300, 2900, 3600, 4300, 5000, 6200, 7200]} etiqueta="Ejemplo animado de Veterinaria: el dictado se convierte en una nota clínica, con su receta y el carnet con código QR.">
      {({ paso, ciclo }) => (
        <div key={ciclo} className="grid h-full gap-3 sm:grid-cols-3">
          <div className="flex flex-col rounded-xl border border-n-200 bg-white p-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-n-600">Dictado → nota SOAP</p>
            <div className="mt-2 flex h-10 items-center gap-[3px]">
              {ALTURAS.map((h, i) => (
                <span
                  key={i}
                  className={`w-1.5 rounded-full bg-morado ${paso >= 1 && paso < 2 ? "pd-onda-voz" : ""}`}
                  style={{ height: paso >= 2 ? 6 : h * 0.45, animationDelay: `${i * 70}ms`, transition: "height 300ms ease", opacity: paso >= 1 ? 1 : 0.25 }}
                />
              ))}
              {paso >= 2 && <span className="pd-entra ml-2 text-[11px] font-semibold text-menta-oscuro">Borrador listo</span>}
            </div>
            <ul className="mt-2 flex flex-col gap-1.5">
              {SOAP.map(([letra, texto], i) =>
                paso >= 2 + Math.min(i, 3) && paso >= 2 ? (
                  <li key={letra} className="pd-pop flex items-start gap-2 text-[11px] leading-snug text-n-800" style={{ animationDelay: `${i * 0}ms` }}>
                    <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded bg-morado text-[10px] font-bold text-white">{letra}</span>
                    {texto}
                  </li>
                ) : null
              )}
            </ul>
          </div>
          <div className="flex flex-col rounded-xl border border-dashed border-n-300 bg-white/60 p-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-n-600">Receta</p>
            {paso >= 6 && (
              <div className="pd-pop mt-2 rounded-lg border border-n-200 bg-white p-2.5">
                <p className="text-xs font-bold text-n-900">Luna · antiinflamatorio</p>
                <p className="mt-1 text-[11px] text-n-700">1 tableta cada 12 h por 5 días</p>
                <p className="mt-2 inline-block rounded-full bg-morado-suave px-2 py-0.5 text-[10px] font-bold tabular-nums text-morado">Folio SITPV 0001234</p>
                <p className="mt-1.5 text-[10px] text-n-600">Firmada por la médica veterinaria</p>
              </div>
            )}
          </div>
          <div className="flex flex-col rounded-xl border border-dashed border-n-300 bg-white/60 p-3">
            <p className="text-[11px] font-bold uppercase tracking-[0.08em] text-n-600">Carnet de la mascota</p>
            {paso >= 7 && (
              <div className="pd-pop mt-2 flex items-center gap-3 rounded-lg border border-n-200 bg-white p-2.5">
                <svg viewBox="0 0 9 9" width="64" height="64" shapeRendering="crispEdges" className="shrink-0">
                  {QR.slice(0, 49).map((on, i) => (on ? <rect key={i} x={i % 7 + 1} y={Math.floor(i / 7) + 1} width={1} height={1} fill="#2b2a33" /> : null))}
                  <rect x={0.2} y={0.2} width={8.6} height={8.6} fill="none" stroke="#2b2a33" strokeWidth={0.4} />
                </svg>
                <div>
                  <p className="text-xs font-bold text-n-900">Luna</p>
                  <p className="text-[11px] text-n-700">Rabia · próxima dosis en 11 meses</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </Pantalla>
  );
}
