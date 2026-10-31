/** La insignia «Negocio verificado»: el dueño reclamó su ficha y comprobó su WhatsApp. */
export function NegocioVerificado({ className = "", compacta = false }: { className?: string; compacta?: boolean }) {
  return (
    <span data-verificado className={`inline-flex items-center gap-1.5 rounded-full bg-menta-suave px-2.5 py-1 text-xs font-bold text-menta-oscuro ${className}`} title="El dueño reclamó esta ficha y comprobó su WhatsApp">
      <svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="#1f6b57" /><path d="M5.5 10.5l3 3L14.5 7" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" /></svg>
      {compacta ? "Verificado" : "Negocio verificado"}
    </span>
  );
}
