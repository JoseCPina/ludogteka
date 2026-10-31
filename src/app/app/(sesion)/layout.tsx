import Link from "next/link";
import Image from "next/image";
import { redirect } from "next/navigation";
import { sesionApp } from "@/lib/app/sesion";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { NavApp } from "@/components/app/nav";
import { PwaApp } from "@/components/app/pwa-app";

export const dynamic = "force-dynamic";

// Todo lo que pide sesión en la app para dueños: encabezado chico, el cuerpo y las tres pestañas.
export default async function SesionLayout({ children }: { children: React.ReactNode }) {
  const s = await sesionApp();
  if (!s) redirect("/entrar");
  const supabase = await createSupabaseServerClient("portal");
  const { count } = await supabase.from("app_avisos").select("id", { count: "exact", head: true }).is("leido_at", null).is("deleted_at", null);
  const inicial = (s.dueno.nombre?.trim()?.[0] ?? "").toUpperCase();
  return (
    <>
      <PwaApp usuarioId={s.user.id} />
      <header className="apd-encabezado">
        <Link href="/" className="apd-marca" aria-label="PeluDesk, inicio">
          <Image src="/marca/peludesk/isotipo.svg" alt="" width={28} height={28} unoptimized /> PeluDesk
        </Link>
        <Link href="/yo" className="apd-yo" aria-label="Mi cuenta" data-mi-cuenta>
          {inicial || <span aria-hidden>·</span>}
        </Link>
      </header>
      <main className="apd-cuerpo">{children}</main>
      <NavApp avisosSinLeer={count ?? 0} />
    </>
  );
}
