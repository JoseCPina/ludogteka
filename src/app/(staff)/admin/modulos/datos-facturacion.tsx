"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import type { DatosFacturacion as Datos } from "@/lib/cobro/facturacion";
import { guardarDatosFacturacion } from "./cobro-actions";

type Opcion = { clave: string; descripcion: string };

// «Datos de facturación»: para la factura (CFDI) de la suscripción a PeluDesk, que emite Menteo, S.A.S. Se guardan
// en el cliente de Stripe del negocio y con cada pago la factura llega por correo en los días siguientes.
export function DatosFacturacion({ inicial, regimenes, usos, aviso }: { inicial: Datos | null; regimenes: Opcion[]; usos: Opcion[]; aviso: string }) {
  const router = useRouter();
  const [d, setD] = useState<Datos>(
    inicial ?? { rfc: "", razon_social: "", regimen_fiscal: "", codigo_postal: "", uso_cfdi: "G03", correo: "" }
  );
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const envio = useEspera();
  const campo = (k: keyof Datos) => ({
    value: d[k],
    onChange: (e: { target: { value: string } }) => {
      setExito(null);
      setD({ ...d, [k]: e.target.value });
    },
  });

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setExito(null);
    const res = await envio.ejecutar(() => guardarDatosFacturacion(d));
    if (res.error) return setError(res.error);
    setExito(res.exito ?? "Guardado.");
    router.refresh();
  }

  return (
    <section aria-labelledby="t-facturacion" data-datos-facturacion className="flex flex-col gap-4 rounded-xl border border-n-200 bg-white p-5">
      <div>
        <h2 id="t-facturacion" className="text-lg font-bold text-n-900">Datos de facturación</h2>
        <p className="mt-1 text-sm text-n-700">
          {aviso} Escríbelos tal cual vienen en tu constancia de situación fiscal. Si no los capturas, no se emite factura.
        </p>
        {inicial && <p className="mt-2 rounded-md bg-menta-suave px-3 py-2 text-sm text-n-800">Ya tenemos tus datos: la factura de cada pago se emite a nombre de {inicial.razon_social} ({inicial.rfc}).</p>}
      </div>
      <form onSubmit={guardar} className="grid gap-3 sm:grid-cols-2">
        <Field label="RFC" name="rfc" autoComplete="off" maxLength={13} {...campo("rfc")} />
        <Field label="Razón social o nombre" name="razon_social" {...campo("razon_social")} />
        <Select label="Régimen fiscal" name="regimen_fiscal" {...campo("regimen_fiscal")}>
          <option value="">Escoge…</option>
          {regimenes.map((r) => (
            <option key={r.clave} value={r.clave}>
              {r.clave} · {r.descripcion}
            </option>
          ))}
        </Select>
        <Field label="Código postal fiscal" name="codigo_postal" inputMode="numeric" maxLength={5} {...campo("codigo_postal")} />
        <Select label="Uso del CFDI" name="uso_cfdi" {...campo("uso_cfdi")}>
          {usos.map((u) => (
            <option key={u.clave} value={u.clave}>
              {u.clave} · {u.descripcion}
            </option>
          ))}
        </Select>
        <Field label="Correo para recibir la factura" name="correo" type="email" autoComplete="email" {...campo("correo")} />
        <div className="sm:col-span-2">
          <AccionesFormulario error={error} exito={exito}>
            <Button type="submit" cargando={envio.cargando}>
              Guardar datos de facturación
            </Button>
          </AccionesFormulario>
        </div>
      </form>
    </section>
  );
}
