/**
 * El botón de WhatsApp de peludesk.mx (el bot de ventas y soporte). Flotante,
 * en todas las páginas del sitio; solo se pinta si el número ya contestó
 * (whatsappPeluDesk() del layout devuelve null si no). En celular va arriba de
 * la barra de "Pruébalo" de la landing y debajo del aviso de cookies.
 */
export function BotonWhatsApp({ href }: { href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener"
      aria-label="Escríbenos por WhatsApp"
      className="fixed bottom-24 right-4 z-50 inline-flex h-14 items-center justify-center gap-2 rounded-full bg-[#1a7f4b] px-4 text-base font-semibold text-white shadow-[0_8px_24px_rgb(26_127_75/0.35)] transition-transform hover:bg-[#15683d] active:scale-95 focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-[#1a7f4b] md:bottom-6 md:right-6"
    >
      <svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true" fill="currentColor">
        <path d="M16.04 3C9.4 3 4 8.38 4 15.02c0 2.12.55 4.19 1.6 6.02L4 29l8.14-1.56a12 12 0 0 0 3.9.66C22.68 28.1 28 22.72 28 16.08S22.68 3 16.04 3Zm0 22.1c-1.24 0-2.45-.3-3.5-.87l-.5-.28-4.83.93.96-4.7-.3-.5a9.02 9.02 0 0 1-1.4-4.86c0-4.99 4.07-9.05 9.06-9.05a9.05 9.05 0 0 1 9.06 9.05 9.05 9.05 0 0 1-9.05 9.28Zm4.97-6.77c-.27-.14-1.6-.79-1.85-.88-.25-.09-.43-.14-.61.14-.18.27-.7.88-.86 1.06-.16.18-.32.2-.59.07-.27-.14-1.15-.42-2.19-1.35-.81-.72-1.35-1.61-1.51-1.88-.16-.27-.02-.42.12-.55.12-.12.27-.32.4-.48.14-.16.18-.27.27-.45.09-.18.05-.34-.02-.48-.07-.14-.61-1.47-.84-2.02-.22-.53-.45-.46-.61-.47h-.52c-.18 0-.48.07-.73.34-.25.27-.95.93-.95 2.27s.98 2.63 1.11 2.81c.14.18 1.92 2.94 4.66 4.12.65.28 1.16.45 1.56.58.65.21 1.25.18 1.72.11.52-.08 1.6-.65 1.83-1.29.23-.63.23-1.17.16-1.29-.07-.11-.25-.18-.52-.32Z" />
      </svg>
      <span className="hidden sm:inline">WhatsApp</span>
    </a>
  );
}
