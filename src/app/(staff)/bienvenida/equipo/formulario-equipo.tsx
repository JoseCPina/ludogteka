"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useEspera } from "@/hooks/use-espera";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Select } from "@/components/ui/select";
import { Alert } from "@/components/ui/alert";
import { AccionesFormulario } from "@/components/ui/acciones-formulario";
import { CampoCopiable } from "@/components/ui/campo-copiable";
import { altaEquipo, type DiaHorario, type EsquemaSimple } from "../acciones";

const DIAS = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];

/**
 * Alta de una persona del equipo desde la bienvenida: con cuenta (correo y rol: queda asignable en la agenda) o solo
 * en nómina (sin cuenta). Horario y forma de pago, opcionales, en el mismo formulario.
 */
export function FormularioEquipo({ conEmpleados, conEstetica, conVet }: { conEmpleados: boolean; conEstetica: boolean; conVet: boolean }) {
  const router = useRouter();
  const envio = useEspera();
  const [modo, setModo] = useState<"cuenta" | "nomina">("cuenta");
  const [nombre, setNombre] = useState("");
  const [puesto, setPuesto] = useState("");
  const [correo, setCorreo] = useState("");
  const [rol, setRol] = useState<"recepcion" | "estetica">(conEstetica ? "estetica" : "recepcion");
  const [telefono, setTelefono] = useState("");
  const [esMedico, setEsMedico] = useState(false);
  const [cedula, setCedula] = useState("");
  const [horario, setHorario] = useState<DiaHorario[]>(DIAS.map((_, i) => ({ dia_semana: i, hora_entrada: "", hora_salida: "" })));
  const [esquema, setEsquema] = useState<EsquemaSimple>({ tipo: "ninguno", monto: null, periodicidad: "quincenal" });
  const [error, setError] = useState<string | null>(null);
  const [exito, setExito] = useState<string | null>(null);
  const [link, setLink] = useState<string | null>(null);

  const faltan: string[] = [];
  if (nombre.trim().length < 2) faltan.push("el nombre");
  if (modo === "cuenta" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(correo.trim())) faltan.push("el correo");
  if (esMedico && !/^[0-9]{7,8}$/.test(cedula.replace(/[\s.-]/g, ""))) faltan.push("la cédula (7 u 8 números)");

  function dia(i: number, campo: "hora_entrada" | "hora_salida", valor: string) {
    setHorario((h) => h.map((d) => (d.dia_semana === i ? { ...d, [campo]: valor } : d)));
  }

  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setExito(null);
    setLink(null);
    if (faltan.length) return setError(`Falta ${faltan.join(", ")}.`);
    const r = await envio.ejecutar(() =>
      altaEquipo({ modo, nombre, puesto, correo, rol, telefono, esMedico: modo === "cuenta" && esMedico, cedula, horario, esquema })
    );
    if (r.inviteLink) setLink(r.inviteLink);
    if (r.error) return setError(r.error);
    setExito(r.exito ?? "Listo.");
    setNombre("");
    setPuesto("");
    setCorreo("");
    setTelefono("");
    setEsMedico(false);
    setCedula("");
    router.refresh();
  }

  return (
    <form method="post" onSubmit={guardar} data-formulario-equipo className="flex flex-col gap-4 rounded-lg border border-n-200 bg-white p-4">
      <h2 className="font-semibold text-n-900">Agregar a alguien</h2>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-medium text-n-800">¿Va a usar la app?</legend>
        <label className="flex items-start gap-2 text-n-900">
          <input type="radio" name="modo" checked={modo === "cuenta"} onChange={() => setModo("cuenta")} className="mt-1" />
          <span>
            <strong>Invitar con cuenta</strong> — le llega un link a su correo para crear su contraseña. Puede atender citas y entrar a la app.
          </span>
        </label>
        {conEmpleados && (
          <label className="flex items-start gap-2 text-n-900">
            <input type="radio" name="modo" checked={modo === "nomina"} onChange={() => setModo("nomina")} className="mt-1" />
            <span>
              <strong>Solo en nómina</strong> — sin cuenta (limpieza, chofer). Llevas su asistencia y su pago.
            </span>
          </label>
        )}
      </fieldset>

      {modo === "nomina" && (conEstetica || conVet) && (
        <Alert variante="advertencia" titulo="Sin cuenta no puede atender citas">
          Una persona solo en nómina no aparece en la agenda{conVet ? " ni puede firmar consultas" : ""}. Si va a atender, invítala con cuenta (o dale cuenta después desde su ficha).
        </Alert>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nombre completo *" value={nombre} onChange={(e) => setNombre(e.target.value)} required autoComplete="off" ayuda="Así sale en la agenda y en los historiales." />
        <Field label="Puesto (opcional)" value={puesto} onChange={(e) => setPuesto(e.target.value)} placeholder={rol === "estetica" ? "Estilista" : "Recepción"} />
        {modo === "cuenta" ? (
          <>
            <Field label="Correo *" type="email" value={correo} onChange={(e) => setCorreo(e.target.value)} required autoComplete="off" />
            <Select label="Qué hace en la app" value={rol} onChange={(e) => setRol(e.target.value as "recepcion" | "estetica")}>
              {(conEstetica || conVet) && <option value="estetica">{conVet && !conEstetica ? "Atiende consultas (sin caja)" : "Estética: atiende citas"}</option>}
              <option value="recepcion">Recepción: agenda, reservas y caja</option>
            </Select>
          </>
        ) : (
          <Field label="Teléfono (opcional)" type="tel" value={telefono} onChange={(e) => setTelefono(e.target.value)} />
        )}
      </div>

      {modo === "cuenta" && conVet && (
        <div className="flex flex-col gap-2 rounded-md border border-n-200 p-3">
          <label className="flex items-center gap-2 text-n-900">
            <input type="checkbox" checked={esMedico} onChange={(e) => setEsMedico(e.target.checked)} />
            Es médico veterinario
          </label>
          {esMedico && (
            <Field
              label="Cédula profesional *"
              inputMode="numeric"
              value={cedula}
              onChange={(e) => setCedula(e.target.value)}
              ayuda="7 u 8 números, como aparece en el Registro Nacional de Profesionistas."
            />
          )}
        </div>
      )}

      <details className="rounded-md border border-n-200 p-3" data-equipo-opcional>
        <summary className="cursor-pointer text-sm font-semibold text-morado">Horario y forma de pago (opcional)</summary>
        {conEmpleados ? (
          <div className="mt-3 flex flex-col gap-4">
            <div className="flex flex-col gap-2">
              <p className="text-sm text-n-600">Deja vacíos los días que descansa.</p>
              {DIAS.map((d, i) => (
                <div key={d} className="grid grid-cols-[5.5rem_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2">
                  <span className="text-sm text-n-800">{d}</span>
                  <input aria-label={`${d}: entrada`} type="time" value={horario[i].hora_entrada} onChange={(e) => dia(i, "hora_entrada", e.target.value)} className="min-h-10 w-full min-w-0 rounded-md border-[1.5px] border-borde px-2" />
                  <input aria-label={`${d}: salida`} type="time" value={horario[i].hora_salida} onChange={(e) => dia(i, "hora_salida", e.target.value)} className="min-h-10 w-full min-w-0 rounded-md border-[1.5px] border-borde px-2" />
                </div>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Select label="Cómo se le paga" value={esquema.tipo} onChange={(e) => setEsquema({ ...esquema, tipo: e.target.value as EsquemaSimple["tipo"] })}>
                <option value="ninguno">Lo capturo después</option>
                <option value="sueldo">Sueldo</option>
                <option value="dia">Pago por día</option>
              </Select>
              {esquema.tipo !== "ninguno" && (
                <Field label="Monto *" type="number" min="1" step="0.01" value={esquema.monto ?? ""} onChange={(e) => setEsquema({ ...esquema, monto: e.target.value === "" ? null : Number(e.target.value) })} />
              )}
              {esquema.tipo === "sueldo" && (
                <Select label="Cada cuándo" value={esquema.periodicidad} onChange={(e) => setEsquema({ ...esquema, periodicidad: e.target.value as EsquemaSimple["periodicidad"] })}>
                  <option value="semanal">Semanal</option>
                  <option value="quincenal">Quincenal</option>
                  <option value="mensual">Mensual</option>
                </Select>
              )}
            </div>
            <p className="text-xs text-n-500">La comisión y las propinas se ajustan después en su ficha de Empleados.</p>
          </div>
        ) : (
          <p className="mt-2 text-sm text-n-600">Empleados está apagado: el horario y la nómina se prenden en Módulos y plan.</p>
        )}
      </details>

      {link && <CampoCopiable etiqueta="Link de invitación (mándaselo)" valor={link} />}
      <AccionesFormulario error={error} exito={exito}>
        <Button type="submit" cargando={envio.cargando}>
          {modo === "cuenta" ? "Invitar" : "Dar de alta en nómina"}
        </Button>
        {faltan.length > 0 && <span className="text-sm text-n-600" data-falta-equipo>Falta {faltan.join(", ")}.</span>}
      </AccionesFormulario>
    </form>
  );
}
