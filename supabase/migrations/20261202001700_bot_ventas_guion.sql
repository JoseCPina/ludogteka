-- Bot de ventas de PeluDesk (25 de octubre de 2026): una conversación de enganche hasta el registro, con respuestas
-- fijas y la IA solo para entender lo que escribe la persona y elegir la rama (src/lib/whatsapp/ventas/).
--
--   wa_ventas        una fila por teléfono de prospecto: en qué paso del guion va (etapa), su giro, su respuesta de
--                    calificación (tamaño del negocio o sistema actual), las preguntas que el bot no supo contestar
--                    seguidas, los seguimientos mandados y el programado. De la PLATAFORMA (como wa_hilos).
--   prospectos       tamano_negocio, sistema_actual y calificacion_texto: lo que contestó al bot.
--   wa_flow_sesiones los puntos nuevos donde el guion ofrece el botón «Probar gratis».
--   wa_uso_ia        «clasifico»: una llamada a la IA solo para elegir la rama (cuenta en el tope de gasto).
--   wa_ventas_embudo el embudo por giro y fuente para /plataforma/prospectos.

create table public.wa_ventas (
  id uuid primary key default gen_random_uuid(),
  telefono text not null check (telefono ~ '^[0-9]{8,15}$'),
  etapa text not null default 'nueva' check (etapa in ('nueva', 'giro', 'calificacion', 'cierre', 'cerrada')),
  giro text check (giro is null or giro in ('estetica', 'hotel_guarderia', 'veterinaria', 'varios')),
  giro_origen text check (giro_origen is null or giro_origen in ('prospecto', 'respuesta')),
  fuente text not null default 'directo' check (fuente in ('directo', 'google_places', 'manual', 'anuncio_meta')),
  prospecto_id uuid references public.prospectos(id) on delete set null,
  calif_numero int check (calif_numero is null or calif_numero between 0 and 100000),
  calif_sistema text check (calif_sistema is null or calif_sistema in ('papel', 'excel', 'otro_sistema', 'ninguno')),
  calif_texto text check (calif_texto is null or length(calif_texto) <= 300),
  ultima_rama text check (ultima_rama is null or length(ultima_rama) <= 40),
  desconocidas int not null default 0 check (desconocidas between 0 and 50),
  entro_at timestamptz not null default now(),
  giro_preguntado_at timestamptz,
  giro_at timestamptz,
  calificado_at timestamptz,
  cierre_at timestamptz,
  humano_at timestamptz,
  baja_at timestamptz,
  ultimo_entrante_at timestamptz,
  seguimientos int not null default 0 check (seguimientos between 0 and 10),
  ultimo_seguimiento_at timestamptz,
  ultimo_seguimiento_tipo text check (ultimo_seguimiento_tipo is null or ultimo_seguimiento_tipo in ('flow_sin_completar', 'sin_giro', 'lo_pienso')),
  seguimiento_programado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index wa_ventas_telefono on public.wa_ventas (telefono) where deleted_at is null;
create index wa_ventas_seguimiento on public.wa_ventas (seguimiento_programado_at) where deleted_at is null and seguimiento_programado_at is not null;
create index wa_ventas_giro_pendiente on public.wa_ventas (giro_preguntado_at) where deleted_at is null and etapa = 'giro';
create trigger set_updated_at before insert or update on public.wa_ventas for each row execute function public.set_updated_at();

alter table public.wa_ventas enable row level security;
create policy wa_ventas_select_plataforma on public.wa_ventas for select to authenticated using ((select public.es_admin_plataforma()));
create policy wa_ventas_sin_escritura on public.wa_ventas for insert to authenticated with check (false);
revoke all on public.wa_ventas from anon;
grant select on public.wa_ventas to authenticated;

alter table public.prospectos
  add column tamano_negocio int check (tamano_negocio is null or tamano_negocio between 0 and 100000),
  add column sistema_actual text check (sistema_actual is null or sistema_actual in ('papel', 'excel', 'otro_sistema', 'ninguno')),
  add column calificacion_texto text check (calificacion_texto is null or length(calificacion_texto) <= 300);

alter table public.wa_flow_sesiones drop constraint wa_flow_sesiones_punto_check;
alter table public.wa_flow_sesiones add constraint wa_flow_sesiones_punto_check check (punto in (
  'saludo', 'menu', 'precio', 'prueba', 'prospeccion', 'anuncio', 'manual',
  'cierre', 'objecion', 'funcion', 'ya_cuenta', 'cliente', 'seguimiento'));

alter table public.wa_uso_ia drop constraint wa_uso_ia_resultado_check;
alter table public.wa_uso_ia add constraint wa_uso_ia_resultado_check check (resultado in ('respondio', 'escalo', 'error', 'clasifico'));

-- El embudo de ventas por giro y fuente: entraron, dijeron su giro, se calificaron, abrieron el formulario y se
-- registraron (abrieron su negocio desde el formulario). Lo cuenta la base.
create or replace function public.wa_ventas_embudo(p_desde timestamptz default null)
returns table (giro text, fuente text, entraron bigint, con_giro bigint, calificados bigint, abrieron_flow bigint, registrados bigint)
language sql
stable
set search_path = ''
as $$
  select coalesce(v.giro, 'sin_giro'), v.fuente,
    count(*),
    count(*) filter (where v.giro is not null),
    count(*) filter (where v.calificado_at is not null),
    count(*) filter (where exists (select 1 from public.wa_flow_sesiones s where s.telefono = v.telefono and s.deleted_at is null and s.abierto_at is not null)),
    count(*) filter (where exists (select 1 from public.wa_flow_sesiones s where s.telefono = v.telefono and s.deleted_at is null and s.estado = 'cuenta_creada'))
  from public.wa_ventas v
  where v.deleted_at is null
    and (p_desde is null or v.entro_at >= p_desde)
    and coalesce(public.es_admin_plataforma(), false)
  group by 1, 2
  order by 1, 2;
$$;
revoke execute on function public.wa_ventas_embudo(timestamptz) from public, anon;
grant execute on function public.wa_ventas_embudo(timestamptz) to authenticated, service_role;

do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), E'\r', '') into v_def;
  if position($a$('wa_ventas')$a$ in v_def) = 0 then
    v_def := replace(v_def, $a$('wa_flow_sesiones'), $a$, $b$('wa_flow_sesiones'), ('wa_ventas'), $b$);
    if position($a$('wa_ventas')$a$ in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudo agregar wa_ventas.';
    end if;
    execute v_def;
  end if;
end $$;
