import Link from "next/link";
import { notFound } from "next/navigation";
import { miMascota } from "@/lib/app/datos";
import { cartillaDe } from "@/lib/app/cartilla";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { Cartilla } from "./cartilla";
import { BorrarFotos } from "./borrar-fotos";

export default async function CartillaPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ capturar?: string; guardado?: string }> }) {
  const [{ id }, q] = await Promise.all([params, searchParams]);
  const m = await miMascota(id);
  if (!m) notFound();
  const supabase = await createSupabaseServerClient("portal");
  const [registros, { count: fotosRevisadas }, { data: atenciones }] = await Promise.all([
    cartillaDe(m.id),
    supabase.from("mascotas_cartilla_fotos").select("id", { count: "exact", head: true }).eq("mascota_id", m.id).is("deleted_at", null).or("confirmada_at.not.is.null,estado.in.(sin_datos,error)"),
    // Fase 2: el nombre del negocio que registró por QR (sin columnas internas: por función).
    supabase.rpc("app_mis_atenciones", { p_mascota: m.id }),
  ]);
  const negociosQR = Object.fromEntries(((atenciones ?? []) as { id: string; negocio_nombre: string }[]).map((a) => [a.id, a.negocio_nombre]));
  return (
    <>
      <Link href={`/mascotas/${m.id}`} className="apd-enlace apd-aparece" style={{ display: "inline-block", marginTop: "0.25rem" }}>← {m.nombre}</Link>
      <div className="apd-aparece">
        <span className="apd-ceja" style={{ marginTop: "1rem" }}>Cartilla</span>
        <h1 className="apd-titulo">La cartilla de {m.nombre}</h1>
        <p className="apd-linea">{registros.length ? `${registros.length} ${registros.length === 1 ? "registro" : "registros"}. ` : ""}Compártela en PDF con cualquier vet; te avisamos cuando toque cada dosis.</p>
      </div>
      {q.guardado && <p className="apd-aviso apd-aviso-ok apd-aparece" role="status" data-guardado>Listo: {q.guardado} {q.guardado === "1" ? "registro guardado" : "registros guardados"} de la foto de su cartilla.</p>}
      <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 1 }}>
        <div className="apd-fila" style={{ flexWrap: "wrap" }}>
          <Link href={`/mascotas/${m.id}/cartilla/leer`} className="apd-boton" data-leer-foto>Leer con foto</Link>
          {registros.length > 0 && <a href={`/mascotas/${m.id}/cartilla/pdf`} className="apd-boton-sec" target="_blank" rel="noopener" data-pdf>Descargar PDF</a>}
        </div>
      </section>
      <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 2 }}>
        <Cartilla mascotaId={m.id} especie={m.especie} registros={registros} abrirCaptura={Boolean(q.capturar)} recordatoriosApagados={m.recordatoriosApagados} negocios={negociosQR} />
      </section>
      {(fotosRevisadas ?? 0) > 0 && (
        <section className="apd-seccion apd-aparece" style={{ ["--i" as string]: 3 }}>
          <BorrarFotos mascotaId={m.id} cuantas={fotosRevisadas ?? 0} />
        </section>
      )}
    </>
  );
}
