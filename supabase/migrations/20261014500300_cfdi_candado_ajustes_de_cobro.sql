-- Facturación CFDI: un cobro facturado tampoco se corrige por el renglón
-- compensatorio. anular_cobro y editar_monto_cobro NO editan cobro_metodos: le
-- AGREGAN un renglón (ajuste_id) que compensa. El candado de la migración
-- 20261014500100 solo veía UPDATE/DELETE; este ve el INSERT del ajuste.
-- REVERSA: drop trigger cfdi_bloquea_ajuste on public.cobro_metodos.

create or replace function public.cfdi_bloquea_ajuste()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_f text;
begin
  if new.ajuste_id is null then
    return new;
  end if;
  v_f := public.cfdi_factura_de_cobro(new.cobro_id);
  if v_f is not null then
    raise exception 'Este cobro ya está facturado (%). Cancela la factura antes de anularlo o corregir su monto.', btrim(v_f);
  end if;
  return new;
end;
$$;
alter function public.cfdi_bloquea_ajuste() owner to peludesk_definer;
revoke execute on function public.cfdi_bloquea_ajuste() from public, anon, authenticated;
create trigger cfdi_bloquea_ajuste before insert on public.cobro_metodos
  for each row execute function public.cfdi_bloquea_ajuste();
