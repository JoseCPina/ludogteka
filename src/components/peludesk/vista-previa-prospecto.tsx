import { CalendarBlank, CashRegister, UserCircle, CheckCircle, PawPrint, Syringe, Camera } from "@phosphor-icons/react/dist/ssr";

// Cómo se verían la agenda, la caja y el portal de un prospecto en PeluDesk (peludesk.mx/para/<slug>). Con su
// nombre y sus servicios; las mascotas, los dueños y las cifras son de ejemplo y lo dicen.

type Props = { nombre: string; servicios: string[]; color: string };

const Marco = ({ titulo, icono, children, color }: { titulo: string; icono: React.ReactNode; children: React.ReactNode; color: string }) => (
  <section className="overflow-hidden rounded-[16px] border border-n-200 bg-white shadow-sm">
    <header className="flex items-center gap-2 border-b border-n-200 px-4 py-3" style={{ background: `${color}12` }}>
      <span style={{ color }} aria-hidden>{icono}</span>
      <h3 className="font-bold text-n-900">{titulo}</h3>
      <span className="ml-auto rounded-full bg-n-100 px-2 py-0.5 text-[11px] font-semibold text-n-600">Datos de ejemplo</span>
    </header>
    <div className="p-4 text-sm">{children}</div>
  </section>
);

function Agenda({ servicios, color }: { servicios: string[]; color: string }) {
  if (servicios.includes("veterinaria") && servicios.length === 1) {
    const citas = [
      ["10:00", "Luna", "Consulta general", "Dra. Montes"],
      ["11:00", "Max", "Vacuna antirrábica", "Dra. Montes"],
      ["12:30", "Michi (gato)", "Revisión de seguimiento", "Dr. Ruiz"],
    ];
    return (
      <ul className="flex flex-col divide-y divide-n-100">
        {citas.map(([h, m, s, med]) => (
          <li key={h} className="flex items-center gap-3 py-2">
            <span className="w-12 font-semibold tabular-nums" style={{ color }}>{h}</span>
            <span className="min-w-0 flex-1"><b>{m}</b> · {s}<span className="block text-xs text-n-500">{med}</span></span>
          </li>
        ))}
      </ul>
    );
  }
  if (servicios.length === 1 && servicios[0] === "estetica") {
    const columnas = [
      { quien: "Estilista 1", citas: [["10:00", "Luna", "Baño completo"], ["12:00", "Rocky", "Corte de pelo"]] },
      { quien: "Estilista 2", citas: [["10:30", "Canela", "Baño exprés"], ["13:00", "Toby", "Baño completo"]] },
    ];
    return (
      <div className="grid grid-cols-2 gap-3">
        {columnas.map((c) => (
          <div key={c.quien}>
            <p className="mb-2 text-xs font-bold uppercase tracking-wide text-n-500">{c.quien}</p>
            <ul className="flex flex-col gap-2">
              {c.citas.map(([h, m, s]) => (
                <li key={h} className="rounded-md border-l-4 bg-n-50 px-2 py-1.5" style={{ borderColor: color }}>
                  <span className="font-semibold tabular-nums">{h}</span> {m}
                  <span className="block text-xs text-n-600">{s}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    );
  }
  const filas = [
    ["Llega", "Toby", servicios.includes("guarderia") ? "Guardería · vacunas al día" : "Hotel · 3 noches"],
    ["Llega", "Canela", servicios.includes("hotel") ? "Hotel · 2 noches · trae su cama" : "Guardería · pase de 10 días (quedan 4)"],
    ["Sale", "Max", servicios.includes("hotel") ? "Hotel · recoge su dueña Ana" : "Guardería · sale 18:00"],
  ];
  return (
    <>
      <p className="mb-2 text-n-700">Hoy en la casa: <b>12 perros</b> de día · <b>5</b> de noche</p>
      <ul className="flex flex-col divide-y divide-n-100">
        {filas.map(([t, m, d]) => (
          <li key={m} className="flex items-center gap-3 py-2">
            <span className="w-12 text-xs font-bold uppercase" style={{ color }}>{t}</span>
            <span><b>{m}</b> · {d}</span>
          </li>
        ))}
      </ul>
    </>
  );
}

function Caja({ servicios, color }: { servicios: string[]; color: string }) {
  const lineas: [string, string, number][] = [];
  if (servicios.includes("guarderia")) lineas.push(["Toby", "Guardería por día", 350]);
  if (servicios.includes("hotel")) lineas.push(["Canela", "Hotel, 2 noches", 600]);
  if (servicios.includes("estetica")) lineas.push(["Luna", "Baño completo", 320]);
  if (servicios.includes("veterinaria")) lineas.push(["Max", "Consulta y vacuna", 650]);
  const total = lineas.reduce((a, l) => a + l[2], 0);
  const pesos = (n: number) => `$${n.toLocaleString("es-MX")}`;
  return (
    <>
      <ul className="flex flex-col divide-y divide-n-100">
        {lineas.map(([m, s, n]) => (
          <li key={s} className="flex items-center justify-between gap-3 py-2">
            <span><b>{m}</b> · {s}</span>
            <span className="font-semibold tabular-nums">{pesos(n)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex items-center justify-between rounded-md px-3 py-2 text-white" style={{ background: color }}>
        <span className="font-semibold">Corte del día</span>
        <span className="flex items-center gap-1.5 font-bold tabular-nums"><CheckCircle size={18} weight="fill" aria-hidden /> {pesos(total)} · cuadra</span>
      </div>
      <p className="mt-2 text-xs text-n-500">Efectivo, transferencia y terminal en su propia línea.</p>
    </>
  );
}

function Portal({ nombre, servicios, color }: Props) {
  const proxima = servicios.includes("estetica") ? "Baño completo · sábado 10:00" : servicios.includes("veterinaria") ? "Refuerzo de vacuna · en 12 días" : "Guardería · lunes 9:00";
  return (
    <div className="mx-auto max-w-[300px] rounded-[22px] border-4 border-n-900 bg-crema p-3">
      <p className="text-xs font-semibold" style={{ color }}>{nombre}</p>
      <p className="mt-1 text-base font-bold">Hola, Ana</p>
      <div className="mt-3 flex items-center gap-3 rounded-lg bg-white p-3">
        <span className="grid h-10 w-10 place-items-center rounded-full text-white" style={{ background: color }}><PawPrint size={20} weight="fill" aria-hidden /></span>
        <div><p className="font-semibold">Luna</p><p className="text-xs text-n-600">{proxima}</p></div>
      </div>
      <div className="mt-2 flex items-center gap-2 rounded-lg bg-white p-3 text-xs"><Syringe size={16} style={{ color }} aria-hidden /> Vacunas al día · carnet con QR</div>
      {(servicios.includes("guarderia") || servicios.includes("hotel")) && (
        <div className="mt-2 flex items-center gap-2 rounded-lg bg-white p-3 text-xs"><Camera size={16} style={{ color }} aria-hidden /> Reporte de hoy: jugó, comió bien, 3 fotos</div>
      )}
    </div>
  );
}

export function VistaPreviaApp(p: Props) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Marco titulo="Su agenda" icono={<CalendarBlank size={20} weight="bold" />} color={p.color}><Agenda servicios={p.servicios} color={p.color} /></Marco>
      <Marco titulo="Su caja" icono={<CashRegister size={20} weight="bold" />} color={p.color}><Caja servicios={p.servicios} color={p.color} /></Marco>
      <Marco titulo="Portal para sus clientes" icono={<UserCircle size={20} weight="bold" />} color={p.color}><Portal {...p} /></Marco>
    </div>
  );
}
