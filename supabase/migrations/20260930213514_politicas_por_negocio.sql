-- Políticas y reglas por negocio (30 de septiembre de 2026).
--
-- Los textos de reglas que se le dicen al dueño (alta por link, complemento
-- y portal) vivían escritos en el código con las reglas de Ludogteka:
-- «no recibimos perros agresivos», «después del cierre se cobra como noche
-- de hotel», «para reservar nos escribes por WhatsApp»… Un negocio nuevo
-- las veía como suyas. Desde hoy cada negocio escribe las suyas en
-- Administración → Políticas y reglas (una clave por regla, catálogo en
-- src/lib/politicas/catalogo.ts); lo que no escribe sale con un texto
-- neutro (solo lo que la app hace igual para todos) o no sale. Ludogteka
-- conserva exactamente sus textos: se cargan aquí en su fila.

create table public.negocio_politicas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  -- { clave_de_regla: texto }. Clave presente con texto vacío = el negocio
  -- decidió no mencionarla; clave ausente = texto por omisión del catálogo.
  textos jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  constraint negocio_politicas_textos_objeto check (jsonb_typeof(textos) = 'object')
);
create unique index negocio_politicas_negocio_unico on public.negocio_politicas (negocio_id) where deleted_at is null;
create index negocio_politicas_negocio_idx on public.negocio_politicas (negocio_id);
create trigger set_updated_at before insert or update on public.negocio_politicas
  for each row execute function public.set_updated_at();
comment on table public.negocio_politicas is
  'Textos de reglas del negocio para sus clientes (alta por link, portal), una clave por regla. Se escriben solo por guardar_politicas_negocio.';

alter table public.negocio_politicas enable row level security;
-- Las dos redes de PeluDesk.
create policy negocio_politicas_negocio on public.negocio_politicas as restrictive for all to authenticated
  using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
  with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()));
create policy negocio_politicas_negocio_definer on public.negocio_politicas for all to peludesk_definer
  using (negocio_id = (select public.negocio_actual()))
  with check (negocio_id = (select public.negocio_actual()));
-- Todo miembro del negocio las lee (el dueño las ve en su portal; el alta
-- por link, sin sesión, las lee con la secret key filtrando negocio).
create policy negocio_politicas_select on public.negocio_politicas for select to authenticated
  using ((select public.es_miembro()));
-- Nadie escribe con su sesión: solo la función de abajo.
create policy negocio_politicas_sin_insert on public.negocio_politicas for insert to authenticated with check (false);
create policy negocio_politicas_sin_update on public.negocio_politicas for update to authenticated using (false);
-- Solo lectura del negocio (prueba vencida, cobro fallido).
create policy negocio_politicas_escritura_ins on public.negocio_politicas as restrictive for insert to authenticated, peludesk_definer
  with check ((select public.exigir_negocio_escribible()));
create policy negocio_politicas_escritura_upd on public.negocio_politicas as restrictive for update to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()));
create policy negocio_politicas_escritura_del on public.negocio_politicas as restrictive for delete to authenticated, peludesk_definer
  using ((select public.exigir_negocio_escribible()));
revoke all on public.negocio_politicas from anon, authenticated;
grant select on public.negocio_politicas to authenticated;
grant select, insert, update, delete on public.negocio_politicas to peludesk_definer;

-- Guardar las reglas: admin o quien tenga «Configuración del negocio».
-- Solo claves del catálogo, texto plano acotado; una fila por negocio.
create or replace function public.guardar_politicas_negocio(p_textos jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_claves text[] := array['evaluacion', 'celo_gestantes', 'agresivos', 'despues_del_cierre', 'como_reservar', 'como_agendar_estetica', 'cancelaciones', 'recoleccion'];
  v_limpio jsonb := '{}'::jsonb;
  v_clave text;
  v_texto text;
  v_id uuid;
begin
  if not public.tiene_permiso('configuracion_negocio') then
    raise exception 'Solo un admin, o quien tenga el permiso «Configuración del negocio», puede cambiar las políticas del negocio.';
  end if;
  if p_textos is null or jsonb_typeof(p_textos) <> 'object' then
    raise exception 'Manda las reglas como un objeto {clave: texto}.';
  end if;
  for v_clave in select jsonb_object_keys(p_textos) loop
    if not (v_clave = any (v_claves)) then
      raise exception 'La regla «%» no existe.', v_clave;
    end if;
    if jsonb_typeof(p_textos -> v_clave) <> 'string' then
      raise exception 'La regla «%» tiene que ser texto.', v_clave;
    end if;
    v_texto := btrim(p_textos ->> v_clave);
    if length(v_texto) > 600 then
      raise exception 'La regla «%» pasa de 600 caracteres.', v_clave;
    end if;
    v_limpio := v_limpio || jsonb_build_object(v_clave, v_texto);
  end loop;

  select id into v_id from public.negocio_politicas
  where negocio_id = public.negocio_actual() and deleted_at is null;
  if v_id is null then
    insert into public.negocio_politicas (negocio_id, textos) values (public.negocio_actual(), v_limpio)
    returning id into v_id;
  else
    update public.negocio_politicas set textos = v_limpio where id = v_id;
  end if;
  return v_limpio;
end;
$$;
alter function public.guardar_politicas_negocio(jsonb) owner to peludesk_definer;
revoke execute on function public.guardar_politicas_negocio(jsonb) from public, anon;
grant execute on function public.guardar_politicas_negocio(jsonb) to authenticated;

-- Ludogteka conserva exactamente lo que decía el código hasta hoy
-- (src/app/alta/[token]/requisitos-guarderia-hotel.tsx y
-- src/lib/alta/tipos-link.ts). Solo si existe y solo si no tiene fila.
insert into public.negocio_politicas (negocio_id, textos)
select n.id, jsonb_build_object(
  'evaluacion', 'Evaluación previa de comportamiento: la hacemos nosotros en su primera visita, antes de recibirlo en guardería u hotel.',
  'celo_gestantes', 'No recibimos perras en celo ni gestantes mientras dure esa etapa.',
  'agresivos', 'No recibimos perros agresivos, por la seguridad de los demás.',
  'despues_del_cierre', 'Si tu perro sigue con nosotros después del cierre, se queda a dormir y se cobra como noche de hotel.',
  'como_reservar', 'Para reservar, cambiar o cancelar nos escribes por WhatsApp.',
  'como_agendar_estetica', 'Para agendar, cambiar o cancelar una cita nos escribes por WhatsApp.'
)
from public.negocios n
where n.slug = 'ludogteka'
  and not exists (select 1 from public.negocio_politicas p where p.negocio_id = n.id and p.deleted_at is null);
