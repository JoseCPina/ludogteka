"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { useZonaNegocio } from "@/components/zona-negocio";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { formatearFecha } from "@/lib/formato";
import { conIva, netoDe, pesosDeCentavos, sumar, type Periodicidad } from "@/lib/cobro/iva";
import { tipoDeCambio } from "@/lib/cobro/cambio";
import type { MiCobro, ModuloQueSeApaga, PlanOferta, Seleccion } from "@/lib/cobro/tipos";
import { abrirPortalPagos, cambiarPlanSuscripcion, cancelarCambioProgramado, contratar, impactoDeCambio } from "./cobro-actions";

const POR = { mensual: "al mes", anual: "al año" } as const;

function Precio({ neto, periodicidad }: { neto: number; periodicidad: Periodicidad }) {
  return (
    <div>
      <p className="text-2xl font-bold text-n-900">
        {pesosDeCentavos(neto)}
        <span className="text-base font-medium text-n-600"> {POR[periodicidad]}</span>
      </p>
      <p className="text-sm text-n-600">+ IVA{periodicidad === "anual" ? " · 2 meses gratis" : ""}</p>
    </div>
  );
}

export function Suscripcion({
  cobro,
  planes,
  nombresModulos,
  planSugerido,
}: {
  cobro: MiCobro;
  planes: PlanOferta[];
  nombresModulos: Record<string, string>;
  planSugerido: string | null;
}) {
  const router = useRouter();
  const zona = useZonaNegocio();
  const fecha = (iso: string | null) => (iso ? formatearFecha(iso, zona) : "");
  const deCobro = planes.filter((p) => p.tipo === "plan" && p.precio_mensual > 0);
  const complementoWeb = planes.find((p) => p.tipo === "complemento" && p.modulos.includes("pagina_web")) ?? null;
  const contratado = planes.find((p) => p.id === cobro.plan_contratado) ?? null;
  const tieneSub = cobro.tiene_suscripcion;

  const inicial: Seleccion = {
    plan: contratado?.clave ?? planes.find((p) => p.id === planSugerido)?.clave ?? deCobro[deCobro.length - 1]?.clave ?? "",
    periodicidad: cobro.periodicidad ?? "mensual",
    web: cobro.complementos_contratados.includes("pagina_web"),
  };
  const [sel, setSel] = useState<Seleccion>(inicial);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [impactoDe, setImpactoDe] = useState<{ clave: string; modulos: ModuloQueSeApaga[] } | null>(null);
  const envio = useEspera({ tope: 45_000 });
  const portal = useEspera();
  const deshacer = useEspera();

  const oferta = deCobro.find((p) => p.clave === sel.plan) ?? null;
  const webIncluida = Boolean(oferta?.modulos.includes("pagina_web"));
  const webCobrada = sel.web && !cobro.web_gratis && !webIncluida && Boolean(complementoWeb);
  const desglosePlan = oferta ? conIva(netoDe(oferta.precio_mensual, sel.periodicidad)) : null;
  const desgloseWeb = webCobrada && complementoWeb ? conIva(netoDe(complementoWeb.precio_mensual, sel.periodicidad)) : null;
  const total = sumar([desglosePlan, desgloseWeb].filter((d): d is NonNullable<typeof d> => Boolean(d)));

  const igualQueHoy =
    tieneSub && contratado?.clave === sel.plan && cobro.periodicidad === sel.periodicidad && cobro.complementos_contratados.includes("pagina_web") === webCobrada;
  const tipo =
    !tieneSub || cobro.estado_stripe === "trialing" || !cobro.periodicidad || cobro.monto_centavos == null
      ? null
      : tipoDeCambio({ total: cobro.monto_centavos, periodicidad: cobro.periodicidad }, { total: total.total, periodicidad: sel.periodicidad });

  // Antes de bajar (o de escoger un plan menor que el de la prueba) se dice qué se apagaría.
  const avisarImpacto = tipo === "bajar" || cobro.plan === "prueba";
  const claveSel = `${sel.plan}|${sel.periodicidad}|${sel.web}`;
  useEffect(() => {
    if (!avisarImpacto || !sel.plan) return;
    let vigente = true;
    impactoDeCambio(sel).then((r) => {
      if (vigente) setImpactoDe({ clave: `${sel.plan}|${sel.periodicidad}|${sel.web}`, modulos: r.modulos ?? [] });
    });
    return () => {
      vigente = false;
    };
  }, [avisarImpacto, sel]);
  const impacto = avisarImpacto && impactoDe?.clave === claveSel ? impactoDe.modulos : null;

  async function pagar() {
    setError(null);
    setExito(null);
    const res = await envio.ejecutar(() => (tieneSub ? cambiarPlanSuscripcion(sel) : contratar(sel)));
    if (res.error) return setError(res.error);
    if (res.url) {
      window.location.href = res.url;
      return;
    }
    setExito(res.exito ?? "Listo.");
    router.refresh();
  }
  async function irAlPortal() {
    setError(null);
    const res = await portal.ejecutar(() => abrirPortalPagos());
    if (res.error) return setError(res.error);
    if (res.url) window.location.href = res.url;
  }
  async function quedarme() {
    setError(null);
    const res = await deshacer.ejecutar(() => cancelarCambioProgramado());
    if (res.error) return setError(res.error);
    setExito(res.exito ?? "Listo.");
    router.refresh();
  }

  if (cobro.exento) {
    return (
      <section className="rounded-xl border border-n-200 bg-white p-5 text-n-700">
        Tu negocio está fuera del cobro de PeluDesk: no hay nada que pagar.
      </section>
    );
  }

  const enPruebaSinContratar = cobro.plan === "prueba" && !tieneSub && cobro.estado === "prueba";
  const cuando = !tieneSub
    ? enPruebaSinContratar
      ? `No se te cobra hoy. El primer cobro es el ${fecha(cobro.prueba_termina_at)}, al terminar tu prueba; después, ${pesosDeCentavos(total.total)} ${POR[sel.periodicidad]}.`
      : `Se cobra hoy y después ${pesosDeCentavos(total.total)} ${POR[sel.periodicidad]}.`
    : cobro.estado_stripe === "trialing"
      ? `Cambia lo que se cobrará al terminar tu prueba (${fecha(cobro.prueba_hasta)}): ${pesosDeCentavos(total.total)} ${POR[sel.periodicidad]}.`
      : tipo === "bajar"
        ? `Se aplica el ${fecha(cobro.periodo_fin)}, al terminar lo que ya pagaste. Hasta entonces sigues con tu plan actual.`
        : `Se aplica hoy: se cobra la diferencia proporcional a lo que queda de tu periodo, y después ${pesosDeCentavos(total.total)} ${POR[sel.periodicidad]}.`;

  return (
    <section className="flex flex-col gap-5 rounded-xl border border-n-200 bg-white p-5">
      <EstadoActual cobro={cobro} contratado={contratado} fecha={fecha} planes={planes} />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-bold text-n-900">{tieneSub ? "Cambiar de plan" : "Contratar PeluDesk"}</h2>
        <div role="radiogroup" aria-label="Periodicidad" className="inline-flex rounded-full bg-n-100 p-1 text-sm font-semibold">
          {(["mensual", "anual"] as const).map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={sel.periodicidad === p}
              onClick={() => setSel({ ...sel, periodicidad: p })}
              className={`rounded-full px-4 py-1.5 ${sel.periodicidad === p ? "bg-white text-n-900 shadow-sm" : "text-n-600"}`}
            >
              {p === "mensual" ? "Mensual" : "Anual · 2 meses gratis"}
            </button>
          ))}
        </div>
      </div>

      <div role="radiogroup" aria-label="Plan" className="grid gap-3 md:grid-cols-3">
        {deCobro.map((p) => {
          const d = conIva(netoDe(p.precio_mensual, sel.periodicidad));
          const escogido = sel.plan === p.clave;
          return (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={escogido}
              onClick={() => setSel({ ...sel, plan: p.clave })}
              className={`flex flex-col gap-2 rounded-lg border p-4 text-left ${escogido ? "border-morado ring-2 ring-morado" : "border-n-200 hover:border-n-400"}`}
            >
              <span className="flex items-center justify-between gap-2 font-semibold text-n-900">
                {p.nombre}
                {tieneSub && contratado?.id === p.id && <span className="rounded-full bg-menta-suave px-2 py-0.5 text-xs text-menta-oscuro">Tu plan</span>}
              </span>
              <Precio neto={d.neto} periodicidad={sel.periodicidad} />
              {p.descripcion && <span className="text-sm text-n-700">{p.descripcion}</span>}
              <span className="text-xs text-n-600">{p.modulos.map((m) => nombresModulos[m] ?? m).join(" · ")}</span>
            </button>
          );
        })}
      </div>

      {complementoWeb && !webIncluida && (
        cobro.web_gratis ? (
          <p className="rounded-md bg-menta-suave px-3 py-2 text-sm text-menta-oscuro">
            Tu página web es gratis de por vida: la ganaste completando tu perfil en la prueba.
          </p>
        ) : (
          <label className="flex items-start gap-3 rounded-lg border border-n-200 p-4">
            <input type="checkbox" checked={sel.web} onChange={(e) => setSel({ ...sel, web: e.target.checked })} className="mt-1 h-4 w-4 accent-morado" />
            <span className="flex-1">
              <span className="font-semibold text-n-900">{complementoWeb.nombre}</span>
              <span className="block text-sm text-n-700">{complementoWeb.descripcion}</span>
            </span>
            <span className="text-right text-sm">
              <span className="font-semibold text-n-900">
                {pesosDeCentavos(conIva(netoDe(complementoWeb.precio_mensual, sel.periodicidad)).neto)} {POR[sel.periodicidad]}
              </span>
              <span className="block text-n-600">+ IVA</span>
            </span>
          </label>
        )
      )}

      {oferta && (
        <div className="rounded-lg bg-n-50 p-4 text-sm" aria-live="polite">
          <h3 className="mb-2 font-semibold text-n-900">Resumen</h3>
          <dl className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 text-n-800">
            <dt>
              Plan {oferta.nombre} ({sel.periodicidad})
            </dt>
            <dd className="text-right">{pesosDeCentavos(desglosePlan!.neto)}</dd>
            {desgloseWeb && complementoWeb && (
              <>
                <dt>{complementoWeb.nombre}</dt>
                <dd className="text-right">{pesosDeCentavos(desgloseWeb.neto)}</dd>
              </>
            )}
            <dt>IVA (16 %)</dt>
            <dd className="text-right">{pesosDeCentavos(total.iva)}</dd>
            <dt className="font-bold text-n-900">Total con IVA</dt>
            <dd className="text-right font-bold text-n-900">
              {pesosDeCentavos(total.total)} {POR[sel.periodicidad]}
            </dd>
          </dl>
          <p className="mt-3 text-n-700">{cuando}</p>
          {impacto && impacto.length > 0 && (
            <div className="mt-3 rounded-md border border-ambar bg-ambar-suave p-3 text-n-800">
              <p className="font-semibold text-ambar-oscuro">
                {cobro.plan === "prueba" ? "Al terminar tu prueba, con este plan se apagan:" : "Con este cambio se apagan:"}
              </p>
              <ul className="mt-1 list-disc pl-5">
                {impacto.map((m) => (
                  <li key={m.clave}>
                    {m.nombre}
                    {m.pendientes > 0 && m.que ? ` (tienes ${m.pendientes} ${m.que})` : ""}
                  </li>
                ))}
              </ul>
              <p className="mt-1">No se borra nada: lo capturado reaparece si vuelves a un plan que los incluya.</p>
            </div>
          )}
        </div>
      )}

      <AccionesFormulario error={error} exito={exito}>
        <Button type="button" cargando={envio.cargando} disabled={!oferta || Boolean(igualQueHoy)} onClick={pagar}>
          {tieneSub ? (igualQueHoy ? "Es tu plan actual" : "Cambiar a este plan") : "Pagar con tarjeta"}
        </Button>
        {cobro.tiene_cliente && (
          <Button type="button" variante="secundario" cargando={portal.cargando} onClick={irAlPortal}>
            Tarjeta, facturas y cancelación
          </Button>
        )}
        {cobro.cambio_programado && (
          <Button type="button" variante="secundario" cargando={deshacer.cargando} onClick={quedarme}>
            Quedarme con mi plan actual
          </Button>
        )}
      </AccionesFormulario>
      <p className="text-xs text-n-600">
        El pago lo procesa Stripe; PeluDesk no guarda los datos de tu tarjeta. Desde «Tarjeta, facturas y cancelación» cambias la
        tarjeta, descargas tus facturas o cancelas (sigues con acceso hasta el final del periodo pagado).
      </p>
    </section>
  );
}

function EstadoActual({
  cobro,
  contratado,
  fecha,
  planes,
}: {
  cobro: MiCobro;
  contratado: PlanOferta | null;
  fecha: (iso: string | null) => string;
  planes: PlanOferta[];
}) {
  const monto = cobro.monto_centavos != null && cobro.periodicidad ? `${pesosDeCentavos(cobro.monto_centavos)} ${POR[cobro.periodicidad]} con IVA` : "";
  const cambio = cobro.cambio_programado;
  const planCambio = cambio?.plan ? planes.find((p) => p.clave === cambio.plan) : null;
  let texto: React.ReactNode = null;
  let tono = "bg-n-50 text-n-800";
  switch (cobro.estado) {
    case "prueba":
      texto = cobro.tiene_suscripcion ? (
        <>
          Contrataste el plan <strong>{contratado?.nombre}</strong> ({cobro.periodicidad}). Tu prueba sigue hasta el {fecha(cobro.prueba_hasta)} y ese
          día se hace el primer cobro: {monto}.
        </>
      ) : (
        <>
          Estás en la prueba gratis hasta el <strong>{fecha(cobro.prueba_termina_at)}</strong>. Contrata cuando quieras: no pierdes los días que te
          quedan, el primer cobro es al terminar.
        </>
      );
      tono = "bg-morado-suave text-morado";
      break;
    case "al_corriente":
      texto = cobro.cancela_al_terminar ? (
        <>
          Cancelaste tu suscripción: sigues con el plan <strong>{contratado?.nombre}</strong> hasta el {fecha(cobro.periodo_fin)}. Después el negocio queda
          en solo lectura; puedes volver a contratar cuando quieras.
        </>
      ) : (
        <>
          Plan <strong>{contratado?.nombre}</strong> ({cobro.periodicidad}), al corriente. Próximo cobro el {fecha(cobro.periodo_fin)}: {monto}.
        </>
      );
      tono = cobro.cancela_al_terminar ? "bg-ambar-suave text-n-800" : "bg-menta-suave text-n-800";
      break;
    case "gracia":
      texto = (
        <>
          <strong>No pudimos cobrar tu suscripción.</strong> Todo sigue funcionando hasta el {fecha(cobro.solo_lectura_desde)}; ese día el negocio queda en
          solo lectura. Paga la factura pendiente o cambia tu tarjeta.
        </>
      );
      tono = "bg-ambar-suave text-n-800";
      break;
    case "solo_lectura":
      texto = (
        <>
          <strong>Tu negocio está en solo lectura</strong> porque no se pudo cobrar la suscripción. Tu información está a salvo: en cuanto se pague, todo
          vuelve a funcionar solo.
        </>
      );
      tono = "bg-coral-suave text-n-800";
      break;
    case "cancelado":
      texto = <>Tu suscripción terminó y el negocio está en solo lectura. Contrata de nuevo y todo vuelve a funcionar al instante.</>;
      tono = "bg-coral-suave text-n-800";
      break;
    case "prueba_vencida":
      texto = <>Tu prueba gratis terminó y el negocio está en solo lectura. Contrata y todo vuelve a funcionar al instante; no se perdió nada.</>;
      tono = "bg-ambar-suave text-n-800";
      break;
    default:
      texto = null;
  }
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-lg font-bold text-n-900">Tu suscripción</h2>
      {texto && <p className={`rounded-md px-3 py-2 text-sm ${tono}`}>{texto}</p>}
      {(cobro.estado === "gracia" || cobro.estado === "solo_lectura") && cobro.factura_pendiente_url && (
        <a href={cobro.factura_pendiente_url} className="self-start rounded-md bg-morado px-4 py-2 text-sm font-semibold text-white hover:bg-menta-oscuro">
          Pagar la factura pendiente
        </a>
      )}
      {cambio && (
        <p className="rounded-md bg-n-50 px-3 py-2 text-sm text-n-800">
          Programado: el {fecha(cambio.desde)} pasas al plan <strong>{planCambio?.nombre ?? cambio.plan}</strong> ({cambio.periodicidad}).
        </p>
      )}
    </div>
  );
}
