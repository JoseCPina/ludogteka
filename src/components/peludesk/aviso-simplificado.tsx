import Link from "next/link";
import { DOCUMENTOS_LEGALES, EMPRESA } from "@/lib/peludesk/legal";

/**
 * El aviso de privacidad simplificado: lo corto que va en el formulario de
 * registro y al inicio del aviso integral. Dice lo mismo que el integral
 * (identidad, datos, finalidades con las secundarias aparte, cómo negarse y
 * cómo ejercer derechos) y manda a él para el resto.
 */
export function AvisoSimplificado({ className = "", compacto = false }: { className?: string; compacto?: boolean }) {
  return (
    <section aria-label="Aviso de privacidad simplificado" className={`rounded-2xl border border-n-200 bg-white p-5 text-sm leading-relaxed text-n-700 ${className}`}>
      <p className="text-base font-bold text-n-900">Aviso de privacidad simplificado</p>
      <p className="mt-2">
        <strong className="font-semibold text-n-900">{EMPRESA.razonSocial}</strong> (PeluDesk), con domicilio en {EMPRESA.domicilio}, es responsable de tus datos.
      </p>
      <p className="mt-2">
        <strong className="font-semibold text-n-900">Datos:</strong> tu nombre, el de tu negocio, tu ciudad, tu teléfono, tu contraseña (cifrada), tu IP y tu navegador, y de qué campaña llegaste. No pedimos datos sensibles.
      </p>
      <p className="mt-2">
        <strong className="font-semibold text-n-900">Los usamos para:</strong> abrir y administrar tu cuenta, darte el servicio y soporte, cobrar tu suscripción, proteger el servicio y guardar evidencia de que aceptaste. <strong className="font-semibold text-n-900">Finalidades secundarias</strong> (solo si lo aceptas en el aviso de cookies): analítica de visitas y medición de anuncios con el píxel de Meta. Puedes negarte sin perder el servicio.
      </p>
      {!compacto && (
        <p className="mt-2">
          <strong className="font-semibold text-n-900">Con quién:</strong> proveedores que nos ayudan a prestar el servicio (Supabase, Vercel, Stripe, Meta, Anthropic, Telegram y Google), en México y en el extranjero, sobre todo Estados Unidos. No vendemos tus datos.
        </p>
      )}
      <p className="mt-2">
        <strong className="font-semibold text-n-900">Tus derechos:</strong> acceso, rectificación, cancelación y oposición (ARCO), y revocar tu consentimiento, escribiendo a{" "}
        <a href={`mailto:${EMPRESA.correo}`} className="font-semibold text-morado underline underline-offset-2">{EMPRESA.correo}</a>. Si eres cliente de un negocio que usa PeluDesk, ese negocio es el responsable de tus datos.
      </p>
      <p className="mt-2">
        Lee el{" "}
        <Link href={DOCUMENTOS_LEGALES.aviso_privacidad.ruta} target="_blank" className="font-semibold text-morado underline underline-offset-2">
          aviso de privacidad integral
        </Link>
        , con los plazos y las transferencias completas.
      </p>
    </section>
  );
}
