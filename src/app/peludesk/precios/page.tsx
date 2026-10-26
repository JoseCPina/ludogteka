import type { Metadata } from "next";
import Link from "next/link";
import { MarcoSitio } from "@/components/peludesk/sitio";
import { LlamadaSobria, Migas } from "@/components/peludesk/blog";
import { EventoPixelAlVer } from "@/components/peludesk/consentimiento/evento-pixel";
import { EnlaceRegistro } from "@/components/peludesk/enlace-registro";
import { PrecioPlan } from "@/components/peludesk/precio-plan";
import { Relacionadas } from "@/components/peludesk/seo-bloques";
import { MODULOS_TRES } from "@/lib/peludesk/veterinaria";
import { pesos, planUnico } from "@/lib/peludesk/plan";
import { preguntasDeContratacion } from "@/lib/peludesk/preguntas-contratacion";
import { recordatoriosVigentes } from "@/lib/peludesk/recordatorios";
import { JsonLd, SITIO, aplicacionPeluDesk, metaPagina, migas, preguntasFrecuentes } from "@/lib/peludesk/seo";

export async function generateMetadata(): Promise<Metadata> {
  const plan = await planUnico();
  return metaPagina({
    titulo: plan ? `Precios de PeluDesk: ${pesos(plan.mensual)} + IVA al mes, todo incluido` : "Precios de PeluDesk",
    descripcion: plan
      ? `Un solo plan de ${pesos(plan.mensual)} + IVA al mes con clínica veterinaria, hotel y guardería, estética, caja, contratos y portal. Sin costo inicial y 15 días de prueba sin tarjeta.`
      : "Un solo plan con todos los módulos, sin costo inicial y con 15 días de prueba sin tarjeta.",
    ruta: "/precios",
    imagen: { url: "/peludesk/capturas/precios-escritorio-1600.webp", width: 1600, height: 1000, alt: "Pantalla de tarifas de PeluDesk" },
  });
}

const INCLUYE = [
  "Veterinaria: expediente por consulta, carnet con QR, recetas, hospitalización e inventario con lotes",
  "Hotel y guardería: reservas con cupo, check-in y check-out, pases y mensualidades",
  "Estética: agenda por estilista, precios por raza y pelaje, comisiones",
  "Caja: cobros, turnos con arqueo, devoluciones y reportes",
  "Contratos firmados desde el celular y portal para los dueños",
  "Inventario, empleados y nómina, gastos del local y reportes",
  "Facturación CFDI 4.0 con tu proveedor de timbrado",
  "Página web del negocio",
  "Soporte por WhatsApp: asistente las 24 horas y una persona de PeluDesk el mismo día en horario hábil",
  "Factura (CFDI) de tu suscripción, emitida por Menteo, S.A.S.",
];

export default async function Precios() {
  const [plan, contratacion, recordatorios] = await Promise.all([planUnico(), preguntasDeContratacion(), recordatoriosVigentes()]);
  const incluye = [`Recordatorios automáticos por WhatsApp de citas, consultas, hotel y guardería: ${recordatorios.lineaPrecio.charAt(0).toLowerCase()}${recordatorios.lineaPrecio.slice(1)}`, ...INCLUYE];
  const preguntas: [string, string][] = [
    ["¿Cuánto cuesta PeluDesk?", plan ? `Un solo plan: ${pesos(plan.mensual)} + IVA al mes (${pesos(plan.total)} con IVA). No hay costo inicial ni cargo de activación.` : "Un solo plan, sin costo inicial. Consulta el monto vigente en esta página."],
    ["¿Hay que pagar por cada módulo?", "No. El plan incluye Veterinaria, Hotel y guardería, Estética y la página web. Prendes solo lo que haces."],
    ["¿Hay prueba gratis?", "Sí, 15 días con todo abierto y sin tarjeta. Al terminar no se borra nada: consultas lo tuyo y vuelves a capturar cuando contratas."],
    ["¿El precio incluye IVA?", "No. El monto publicado es sin IVA; el total con IVA se muestra antes de pagar."],
    ["¿Hay plan anual?", plan ? `Sí: ${pesos(plan.anual)} + IVA al año, diez mensualidades por doce meses.` : "Sí, el anual cobra diez mensualidades por doce meses."],
    ["¿Cobran comisión por mis ventas?", "PeluDesk no cobra comisión por tus cobros. Mercado Pago cobra la suya por cada pago con tarjeta; PeluDesk la registra como gasto."],
    ["¿Puedo cancelar?", "Sí. Cancelas desde el portal de pagos y el plan sigue hasta el fin del periodo ya pagado."],
    ...contratacion,
    ["¿Qué se paga aparte?", `Los recordatorios por WhatsApp que pasen de los gratis del mes: ${recordatorios.adicional ? recordatorios.adicional.charAt(0).toLowerCase() + recordatorios.adicional.slice(1) : "centavos por mensaje entregado, más IVA."} El timbrado de facturas lo cobra tu proveedor autorizado, y Mercado Pago cobra según sus propias tarifas.`],
  ];
  return (
    <MarcoSitio>
      <JsonLd datos={[migas([{ nombre: "Inicio", ruta: "/" }, { nombre: "Precios", ruta: "/precios" }]), preguntasFrecuentes(preguntas), aplicacionPeluDesk(plan, { url: `${SITIO}/precios` })]} />
      <EventoPixelAlVer nombre="ViewContent" datos={{ content_name: "precios", content_category: "precio" }} />
      <section className="mx-auto max-w-4xl px-4 py-10 sm:px-6 md:py-14">
        <Migas items={[{ nombre: "Inicio", ruta: "/" }, { nombre: "Precios" }]} />
        <h1 className="mt-4 text-3xl font-bold leading-tight tracking-tight text-n-900 md:text-[2.6rem]">Un solo plan, con todo incluido</h1>
        <p className="mt-4 max-w-[56ch] text-lg text-n-700">Sin elegir módulos, sin costo de alta y sin tarjeta para probar.</p>
        {plan && (
          <div className="mt-8 rounded-3xl border border-n-200 bg-white p-6 sm:p-8">
            <PrecioPlan plan={plan} desglose />
            <p className="mt-3 text-n-700">Plan anual: {pesos(plan.anual)} + IVA (diez mensualidades por doce meses).</p>
            <div className="mt-6 flex flex-col gap-3 sm:flex-row">
              <EnlaceRegistro className="pd-boton pd-boton-primario inline-flex min-h-12 items-center justify-center whitespace-nowrap rounded-full bg-morado px-6 text-base font-semibold text-white hover:bg-morado-oscuro focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-morado-suave">
                Pruébalo gratis
              </EnlaceRegistro>
            </div>
          </div>
        )}
        <div className="mt-8 rounded-3xl bg-menta-suave p-6 sm:p-8">
          <h2 className="text-2xl font-bold text-n-900">Recordatorios automáticos por WhatsApp</h2>
          <p className="mt-2 text-lg font-semibold text-n-900">{recordatorios.lineaPrecio}</p>
          {recordatorios.adicional && <p className="mt-1 tabular-nums text-n-700">{recordatorios.adicional}</p>}
          <p className="mt-3 max-w-[62ch] text-n-700">{recordatorios.cobro}</p>
          <p className="mt-3">
            <Link href="/#recordatorios" className="font-semibold text-morado underline underline-offset-2">Mira cómo le llega a tu cliente</Link>
          </p>
        </div>
        <h2 className="mt-12 text-2xl font-bold text-n-900">Qué incluye</h2>
        <ul className="mt-4 list-disc space-y-2 pl-5 text-n-700">
          {incluye.map((x) => <li key={x}>{x}</li>)}
        </ul>
        <h2 className="mt-12 text-2xl font-bold text-n-900">Los tres servicios</h2>
        <ul className="mt-4 grid gap-4 md:grid-cols-3">
          {MODULOS_TRES.map((m) => (
            <li key={m.clave} className="rounded-2xl border border-n-200 bg-white p-5">
              <h3 className="text-lg font-bold text-n-900">{m.nombre}</h3>
              <p className="mt-2 text-n-700">{m.texto}</p>
            </li>
          ))}
        </ul>
        <h2 className="mt-12 text-2xl font-bold text-n-900">Preguntas sobre el precio</h2>
        <dl className="mt-4 flex flex-col gap-3">
          {preguntas.map(([q, r]) => (
            <div key={q} className="rounded-2xl border border-n-200 bg-white p-5">
              <dt className="text-lg font-bold text-n-900">{q}</dt>
              <dd className="mt-2 text-n-700">{r}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-6 text-n-700">
          ¿Comparando opciones? Mira <Link href="/alternativas" className="font-semibold text-morado underline underline-offset-2">cómo se compara PeluDesk con otras alternativas</Link>.
        </p>
        <Relacionadas rutas={["/veterinaria", "/software-para-guarderias-caninas", "/software-para-esteticas-caninas", "/software-para-hoteles-caninos", "/ayuda/modulos-y-plan"]} />
        <div className="mt-10"><LlamadaSobria /></div>
      </section>
    </MarcoSitio>
  );
}
