-- Un reembolso hecho en el panel de Mercado Pago no lo autorizó nadie de la
-- app: su devolución en caja queda sin autorizador. Una devolución a mano
-- sigue exigiendo quién la autorizó.
alter table public.devoluciones alter column autorizado_por drop not null;
alter table public.devoluciones add constraint devoluciones_autorizador_manual
  check (autorizado_por is not null or origen <> 'manual');
