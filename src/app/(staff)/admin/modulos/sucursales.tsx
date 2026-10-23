"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { conIva, pesosDeCentavos } from "@/lib/cobro/iva";
import { irANegocio } from "@/lib/negocio/ir-a-negocio";
import { abrirSucursal, darBajaSucursal } from "./cobro-actions";
import { Textarea } from "@/components/ui/textarea";
import { useZonaNegocio } from "@/components/zona-negocio";
import { formatearFecha } from "@/lib/formato";

export type GrupoSucursales = {
  principal_id: string;
  es_principal: boolean;
  soy_admin_principal: boolean;
  estado_stripe: string | null;
  negocios: { id: string; nombre: string; slug: string; es_principal: boolean; activo: boolean; soy_miembro: boolean; baja_at?: string | null; baja_hasta?: string | null }[];
};

/** De un nombre, un subdominio sugerido (sin acentos ni ñ, en minúsculas y con guiones). */
export function subdominioSugerido(nombre: string): string {
  return nombre
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/ñ/g, "n")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42);
}

// «Sucursales» en Módulos y plan: cada sucursal es un negocio con su propia caja, agenda, personal y página,
// ligado a la cuenta del dueño. La primera paga el plan; cada sucursal adicional se suma a la misma suscripción.
export function Sucursales({ grupo, precioMensual, dominio }: { grupo: GrupoSucursales; precioMensual: number | null; dominio: string }) {
  const router = useRouter();
  const zona = useZonaNegocio();
  const [nombre, setNombre] = useState("");
  const [sub, setSub] = useState("");
  const [subEditado, setSubEditado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [nueva, setNueva] = useState<string | null>(null);
  const envio = useEspera({ tope: 60_000 });
  const entrar = useEspera();
  // QA S17: dar de baja una sucursal adicional (solo el admin de la primera).
  const bajaEnvio = useEspera({ tope: 60_000 });
  const [dandoBaja, setDandoBaja] = useState<string | null>(null);
  const [motivoBaja, setMotivoBaja] = useState("");
  const [errorBaja, setErrorBaja] = useState<string | null>(null);

  async function confirmarBaja(id: string) {
    setErrorBaja(null);
    setExito(null);
    const res = await bajaEnvio.ejecutar(() => darBajaSucursal(id, motivoBaja));
    if (res.error) return setErrorBaja(res.error);
    setExito(res.exito ?? "Listo.");
    setDandoBaja(null);
    setMotivoBaja("");
    router.refresh();
  }
  const principal = grupo.negocios.find((n) => n.es_principal);
  const pagada = grupo.estado_stripe === "active";
  const precio = precioMensual != null ? conIva(precioMensual) : null;
  const subdominio = subEditado ? sub : subdominioSugerido(nombre);

  async function abrir(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setExito(null);
    const res = await envio.ejecutar(() => abrirSucursal(nombre, subdominio));
    if (res.error) return setError(res.error);
    setExito(res.exito ?? "Listo.");
    setNueva(res.negocioId ?? null);
    setNombre("");
    setSub("");
    setSubEditado(false);
    router.refresh();
  }
  async function irA(id: string) {
    setError(null);
    const res = await entrar.ejecutar(() => irANegocio(id));
    if (res.error || !res.url) return setError(res.error ?? "No pudimos abrir esa sucursal.");
    window.location.assign(res.url);
  }

  return (
    <section aria-labelledby="t-sucursales" data-sucursales className="flex flex-col gap-4 rounded-xl border border-n-200 bg-white p-5">
      <div>
        <h2 id="t-sucursales" className="text-lg font-bold text-n-900">Sucursales</h2>
        <p className="mt-1 text-sm text-n-700">
          Cada sucursal es un negocio en PeluDesk, con su propia caja, agenda, personal y página.
          {precio && (
            <>
              {" "}La primera paga el plan; cada sucursal adicional cuesta <strong>{pesosDeCentavos(precio.neto)} + IVA al mes</strong> ({pesosDeCentavos(precio.total)} con
              IVA) y se suma a la misma suscripción. La prueba gratis es solo para la primera.
            </>
          )}
        </p>
      </div>

      {!grupo.es_principal && principal && (
        <p className="rounded-md bg-n-50 px-3 py-2 text-sm text-n-800" data-es-sucursal>
          Esta es una sucursal de <strong>{principal.nombre}</strong>. Su cobro va en la suscripción de {principal.nombre}: el plan, la tarjeta, las facturas y
          los datos de facturación se ven desde ahí.
        </p>
      )}

      <ul className="flex flex-col divide-y divide-n-100 rounded-lg border border-n-200">
        {grupo.negocios.map((n) => (
          <li key={n.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
            <span>
              <span className="font-semibold text-n-900">{n.nombre}</span>{" "}
              <span className="text-n-600">
                · {n.slug}.{dominio} · {n.es_principal ? "primera sucursal (paga el plan)" : "sucursal adicional"}
              </span>
            </span>
            <span className="flex flex-wrap items-center gap-2">
              {n.baja_at ? (
                <span className="rounded-full bg-n-100 px-2 py-0.5 text-xs font-semibold text-n-700" data-sucursal-baja={n.id}>
                  Dada de baja · solo lectura{n.baja_hasta ? ` hasta el ${formatearFecha(n.baja_hasta, zona)}` : ""}
                </span>
              ) : (
                <>
                  {n.soy_miembro && (
                    <Button type="button" variante="secundario" className="min-h-9 px-3 text-sm" cargando={entrar.cargando} onClick={() => irA(n.id)} data-entrar-sucursal={n.id}>
                      Entrar
                    </Button>
                  )}
                  {grupo.soy_admin_principal && !n.es_principal && dandoBaja !== n.id && (
                    <Button type="button" variante="secundario" className="min-h-9 px-3 text-sm" onClick={() => { setDandoBaja(n.id); setMotivoBaja(""); }} data-dar-baja-sucursal={n.id}>
                      Dar de baja
                    </Button>
                  )}
                </>
              )}
            </span>
            {dandoBaja === n.id && (
              <div className="flex w-full flex-col gap-2 rounded-md border border-coral bg-coral-suave p-3" data-confirmar-baja-sucursal>
                <p className="text-sm text-n-800">
                  <strong>{n.nombre}</strong> queda en solo lectura 90 días (se puede consultar, no se captura nada), sale de «Tus negocios» y deja de cobrarse: la
                  parte proporcional queda a favor en tu siguiente cobro.
                </p>
                <Textarea label="Motivo (obligatorio)" rows={2} maxLength={300} value={motivoBaja} onChange={(e) => setMotivoBaja(e.target.value)} />
                <AccionesFormulario error={errorBaja}>
                  <Button type="button" variante="peligro" cargando={bajaEnvio.cargando} disabled={motivoBaja.trim().length < 5} onClick={() => confirmarBaja(n.id)}>
                    Dar de baja la sucursal
                  </Button>
                  <Button type="button" variante="secundario" onClick={() => setDandoBaja(null)}>
                    Dejarla
                  </Button>
                </AccionesFormulario>
              </div>
            )}
          </li>
        ))}
      </ul>

      {grupo.soy_admin_principal && (
        pagada ? (
          <form method="post" onSubmit={abrir} className="flex flex-col gap-3" data-abrir-sucursal>
            <h3 className="font-semibold text-n-900">Abrir otra sucursal</h3>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nombre de la sucursal" name="nombre_sucursal" value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder="Ej. Patitas Juriquilla" />
              <Field
                label="Subdominio"
                name="subdominio_sucursal"
                value={subdominio}
                onChange={(e) => {
                  setSubEditado(true);
                  setSub(e.target.value.toLowerCase());
                }}
                ayuda={`Su dirección: ${subdominio || "tu-sucursal"}.${dominio}`}
              />
            </div>
            <p className="text-sm text-n-700">
              Hoy se cobra la parte proporcional a lo que queda de tu periodo; después va junto con tu plan. Tú quedas como admin de la sucursal nueva; a su
              personal lo invitas desde ahí.
            </p>
            <AccionesFormulario error={error} exito={exito}>
              <Button type="submit" cargando={envio.cargando} disabled={!nombre.trim() || !subdominio}>
                Abrir sucursal
              </Button>
              {nueva && (
                <Button type="button" variante="secundario" cargando={entrar.cargando} onClick={() => irA(nueva)}>
                  Entrar a la sucursal nueva
                </Button>
              )}
            </AccionesFormulario>
          </form>
        ) : (
          <p className="rounded-md bg-ambar-suave px-3 py-2 text-sm text-n-800" data-sucursal-sin-pago>
            La prueba gratis es solo para tu primera sucursal. Puedes abrir otra cuando tu plan ya esté pagado: si contrataste durante la prueba, al terminar
            la prueba, con el primer cobro.
          </p>
        )
      )}
      {!(grupo.soy_admin_principal && pagada) && error && <p role="alert" className="text-sm text-coral-oscuro">{error}</p>}
      {!(grupo.soy_admin_principal && pagada) && exito && <p role="status" className="text-sm font-semibold text-menta-oscuro">{exito}</p>}
    </section>
  );
}
