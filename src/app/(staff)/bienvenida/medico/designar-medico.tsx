"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { designarmeMedico, designarMedico } from "../acciones";

const valida = (c: string) => /^[0-9]{7,8}$/.test(c.replace(/[\s.-]/g, ""));

/** «Yo soy el médico» (con su cédula) o designar a otra persona del personal que ya tiene cuenta. */
export function DesignarMedico({ soyMedico, candidatos }: { soyMedico: boolean; candidatos: { id: string; nombre: string }[] }) {
  const router = useRouter();
  const yo = useEspera();
  const otro = useEspera();
  const [cedula, setCedula] = useState("");
  const [cpa, setCpa] = useState("");
  const [persona, setPersona] = useState(candidatos[0]?.id ?? "");
  const [cedulaOtro, setCedulaOtro] = useState("");
  const [r1, setR1] = useState<{ error: string | null; exito?: string } | null>(null);
  const [r2, setR2] = useState<{ error: string | null; exito?: string } | null>(null);

  async function soyYo(e: React.FormEvent) {
    e.preventDefault();
    if (!valida(cedula)) return setR1({ error: "La cédula profesional son 7 u 8 números, sin letras." });
    const r = await yo.ejecutar(() => designarmeMedico(cedula, cpa));
    setR1(r);
    if (!r.error) router.refresh();
  }
  async function esOtro(e: React.FormEvent) {
    e.preventDefault();
    if (!persona) return setR2({ error: "Escoge a la persona." });
    if (!valida(cedulaOtro)) return setR2({ error: "La cédula profesional son 7 u 8 números, sin letras." });
    const r = await otro.ejecutar(() => designarMedico(persona, cedulaOtro));
    setR2(r);
    if (!r.error) router.refresh();
  }

  return (
    <div className="flex flex-col gap-4">
      {!soyMedico && (
        <form method="post" onSubmit={soyYo} data-yo-soy-medico className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-4">
          <h2 className="font-semibold text-n-900">Yo soy el médico</h2>
          <p className="text-sm text-n-600">Tu cuenta queda designada como médico veterinario: agendas y firmas consultas a tu nombre.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field
              label="Cédula profesional *"
              inputMode="numeric"
              value={cedula}
              onChange={(e) => setCedula(e.target.value)}
              error={cedula && !valida(cedula) ? "Son 7 u 8 números." : undefined}
              ayuda={!cedula || valida(cedula) ? "7 u 8 números." : undefined}
            />
            <Field label="CPA del SITPV (opcional)" value={cpa} onChange={(e) => setCpa(e.target.value)} ayuda="Solo para recetar medicamentos controlados." />
          </div>
          <AccionesFormulario error={r1?.error} exito={r1?.exito}>
            <Button type="submit" cargando={yo.cargando} disabled={!valida(cedula)}>
              Designarme médico
            </Button>
            {!valida(cedula) && <span className="text-sm text-n-600">Escribe tu cédula para continuar.</span>}
          </AccionesFormulario>
        </form>
      )}
      <form method="post" onSubmit={esOtro} data-designar-otro className="flex flex-col gap-3 rounded-lg border border-n-200 bg-white p-4">
        <h2 className="font-semibold text-n-900">El médico es otra persona</h2>
        {candidatos.length === 0 ? (
          <p className="text-sm text-n-600">
            Primero invítalo con su correo en{" "}
            <Link href="/bienvenida/equipo" className="font-semibold text-morado hover:underline">
              Tu equipo
            </Link>{" "}
            (marca «Es médico veterinario» y escribe su cédula ahí mismo).
          </p>
        ) : (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Select label="Persona del personal *" value={persona} onChange={(e) => setPersona(e.target.value)}>
                {candidatos.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nombre}
                  </option>
                ))}
              </Select>
              <Field label="Cédula profesional *" inputMode="numeric" value={cedulaOtro} onChange={(e) => setCedulaOtro(e.target.value)} ayuda="7 u 8 números." />
            </div>
            <AccionesFormulario error={r2?.error} exito={r2?.exito}>
              <Button type="submit" variante="secundario" cargando={otro.cargando} disabled={!valida(cedulaOtro)}>
                Designar médico
              </Button>
            </AccionesFormulario>
          </>
        )}
      </form>
    </div>
  );
}
