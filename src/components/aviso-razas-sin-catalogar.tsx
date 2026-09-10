import Link from "next/link";
import { Alert } from "@/components/ui/alert";

/**
 * El aviso de que hay perros cotizando con el grupo equivocado.
 *
 * Va donde el error se cobra —la agenda de estética y el catálogo de
 * servicios— y no en una sección propia del menú: es una limpieza que se
 * hace una vez y desaparece sola cuando ya no queda ninguno. Una entrada
 * fija en el menú seguiría ahí para siempre invitando a entrar a una
 * pantalla vacía.
 */
export function AvisoRazasSinCatalogar({ cuantos }: { cuantos: number }) {
  if (cuantos === 0) return null;

  return (
    <Alert
      variante="advertencia"
      titulo={
        cuantos === 1
          ? "1 perro se está cotizando con el grupo más barato"
          : `${cuantos} perros se están cotizando con el grupo más barato`
      }
    >
      Tienen la raza escrita a mano, de antes del catálogo, y sin raza del catálogo su baño se
      cobra como pelo corto. Un shih tzu ahí paga como chihuahua.{" "}
      <Link href="/perros/razas" className="font-semibold text-azul hover:underline">
        Asignarles su raza →
      </Link>
    </Alert>
  );
}
