-- Tipo de un producto clínico: «vacuna» o «desparasitante» (o ninguno).
-- El carnet ofrecía cualquier producto con lotes (xilazina, morfina…) en «Vacuna del inventario»:
-- ahora cada lista ofrece solo los productos de su tipo. Se clasifica en la ficha del producto.

alter table public.insumos
  add column if not exists tipo_clinico text check (tipo_clinico in ('vacuna', 'desparasitante'));

-- Los productos con lotes que ya existen se clasifican por su nombre (solo coincidencias claras);
-- el resto queda sin tipo y se clasifica en su ficha.
-- La migración corre como el sistema (no como un negocio): pasa el candado de módulos por negocio.
select set_config('request.jwt.claims', '{"role":"service_role"}', true);
update public.insumos
set tipo_clinico = case
  when nombre ~* '(vacuna|rabia|parvo|moquillo|bordetella|leptospir|qu[ií]ntuple|s[eé]xtuple|triple felina|leucemia felina)' then 'vacuna'
  when nombre ~* '(desparasit|praziquantel|pirantel|fenbendazol|albendazol|milbemicina|ivermectina)' then 'desparasitante'
  else null end
where controla_lotes and deleted_at is null and tipo_clinico is null;
select set_config('request.jwt.claims', '', true);

create or replace function public.producto_clinico_tipo_guardar(p_id uuid, p_tipo text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.exigir_lotes_clinicos();
  if nullif(p_tipo, '') is not null and p_tipo not in ('vacuna', 'desparasitante') then
    raise exception 'Ese tipo de producto no existe.';
  end if;
  update public.insumos set tipo_clinico = nullif(p_tipo, '')
  where id = p_id and deleted_at is null and controla_lotes;
  if not found then
    raise exception 'Ese producto clínico no existe.';
  end if;
end;
$$;
alter function public.producto_clinico_tipo_guardar(uuid, text) owner to peludesk_definer;
revoke execute on function public.producto_clinico_tipo_guardar(uuid, text) from public, anon;
grant execute on function public.producto_clinico_tipo_guardar(uuid, text) to authenticated, service_role;
