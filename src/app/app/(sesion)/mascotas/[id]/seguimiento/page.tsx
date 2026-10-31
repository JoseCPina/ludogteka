import Link from "next/link";
import { notFound } from "next/navigation";
import { miMascota } from "@/lib/app/datos";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Seguimiento, type Gasto, type Medicamento, type Peso } from "./seguimiento";

export default async function SeguimientoPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const m = await miMascota(id);
  if (!m) notFound();
  const supabase = await createSupabaseServerClient("portal");
  const ahora = new Date();
  const mx = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Mexico_City", year: "numeric", month: "2-digit" }).format(ahora);
  const [anio, mes] = mx.split("-").map(Number);
  const inicioMes = `${anio}-${String(mes).padStart(2, "0")}-01`;
  const [{ data: pesos }, { data: meds }, { data: gastos }, { data: total }] = await Promise.all([
    supabase.from("mascotas_pesos").select("id, peso_kg, fecha, notas").eq("mascota_id", m.id).is("deleted_at", null).order("fecha", { ascending: false }).order("id").limit(30),
    supabase.from("mascotas_medicamentos").select("id, nombre, dosis, horas, fecha_inicio, fecha_fin").eq("mascota_id", m.id).is("deleted_at", null).eq("activo", true).order("created_at").order("id"),
    supabase.from("mascotas_gastos").select("id, concepto, monto, categoria, fecha").eq("mascota_id", m.id).is("deleted_at", null).gte("fecha", inicioMes).order("fecha", { ascending: false }).order("id").limit(200),
    supabase.rpc("app_gastos_mes", { p_mascota: m.id, p_anio: anio, p_mes: mes }),
  ]);
  const fila = (Array.isArray(total) ? total[0] : total) as { total?: number } | null;
  const mesNombre = new Intl.DateTimeFormat("es-MX", { timeZone: "America/Mexico_City", month: "long" }).format(ahora);
  return (
    <>
      <Link href={`/mascotas/${m.id}`} className="apd-enlace apd-aparece" style={{ display: "inline-block", marginTop: "0.25rem" }}>← {m.nombre}</Link>
      <div className="apd-aparece">
        <span className="apd-ceja" style={{ marginTop: "1rem" }}>Seguimiento</span>
        <h1 className="apd-titulo">Peso, medicinas y gastos de {m.nombre}</h1>
        <p className="apd-linea">Lo que se anota aquí es tuyo. Los medicamentos te los recordamos a sus horas.</p>
      </div>
      <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 1 }}>
        <Seguimiento
          mascotaId={m.id}
          pesosLista={((pesos ?? []) as Record<string, unknown>[]).map((p) => ({ id: p.id as string, pesoKg: Number(p.peso_kg), fecha: p.fecha as string, notas: (p.notas as string | null) ?? null })) as Peso[]}
          medicamentos={((meds ?? []) as Record<string, unknown>[]).map((x) => ({ id: x.id as string, nombre: x.nombre as string, dosis: (x.dosis as string | null) ?? null, horas: ((x.horas as string[]) ?? []).map((h) => h.slice(0, 5)), fechaInicio: x.fecha_inicio as string, fechaFin: (x.fecha_fin as string | null) ?? null })) as Medicamento[]}
          gastos={((gastos ?? []) as Record<string, unknown>[]).map((g) => ({ id: g.id as string, concepto: g.concepto as string, monto: Number(g.monto), categoria: g.categoria as string, fecha: g.fecha as string })) as Gasto[]}
          totalMes={Number(fila?.total ?? 0)}
          mesNombre={mesNombre}
        />
      </section>
    </>
  );
}
