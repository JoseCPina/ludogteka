"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Field } from "@/components/ui/field";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { conIva, pesosDeCentavos } from "@/lib/cobro/iva";
import { irANegocio } from "@/lib/negocio/ir-a-negocio";
import { abrirSucursal } from "./cobro-actions";

export type GrupoSucursales = {
  principal_id: string;
  es_principal: boolean;
  soy_admin_principal: boolean;
  estado_stripe: string | null;
  negocios: { id: string; nombre: string; slug: string; es_principal: boolean; activo: boolean; soy_miembro: boolean }[];
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
  const [nombre, setNombre] = useState("");
  const [sub, setSub] = useState("");
  const [subEditado, setSubEditado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [nueva, setNueva] = useState<string | null>(null);
  const envio = useEspera({ tope: 60_000 });
  const entrar = useEspera();
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
            {n.soy_miembro && (
              <Button type="button" variante="secundario" className="min-h-9 px-3 text-sm" cargando={entrar.cargando} onClick={() => irA(n.id)} data-entrar-sucursal={n.id}>
                Entrar
              </Button>
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
    </section>
  );
}
