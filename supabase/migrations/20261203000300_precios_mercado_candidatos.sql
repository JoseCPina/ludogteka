-- Candidatos de precio del Índice PeluDesk (30 de octubre de 2026): la recolección (sitios web, reseñas, páginas
-- públicas) corre desde la computadora, pero la llave de Anthropic solo vive en Vercel. Así que los scripts dejan
-- aquí cada cantidad con su contexto (pendiente) y la tarea /api/cron/mercado-clasificar, cada hora, le pide a la IA
-- de qué servicio es y la pasa a precios_mercado (o la descarta). Tabla de la plataforma: la lee la administración;
-- la escribe solo el servidor.
create table public.precios_mercado_candidatos (
  id uuid primary key default gen_random_uuid(),
  giro text not null check (giro in ('estetica', 'hotel', 'guarderia', 'veterinaria')),
  precio numeric(10, 2) not null check (precio > 0 and precio < 100000),
  contexto text not null check (length(contexto) <= 600),
  fuente text not null check (fuente in ('sitio_web', 'resenas_google', 'doctoralia', 'cuidadores')),
  url text,
  prospecto_id uuid references public.prospectos(id) on delete set null,
  ciudad text,
  estado text,
  -- Para la huella del precio (no repetir el mismo precio de la misma fuente en el mismo mes).
  origen text,
  corrida_id uuid references public.precios_mercado_corridas(id) on delete set null,
  situacion text not null default 'pendiente' check (situacion in ('pendiente', 'clasificado', 'descartado', 'error')),
  servicio text,
  talla text check (talla is null or talla in ('chico', 'mediano', 'grande')),
  confianza numeric(3, 2),
  clasificado_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index precios_mercado_candidatos_pendientes on public.precios_mercado_candidatos (created_at) where situacion = 'pendiente' and deleted_at is null;
create index precios_mercado_candidatos_corrida on public.precios_mercado_candidatos (corrida_id) where deleted_at is null;
create trigger set_updated_at before insert or update on public.precios_mercado_candidatos for each row execute function public.set_updated_at();
alter table public.precios_mercado_candidatos enable row level security;
create policy precios_mercado_candidatos_plataforma on public.precios_mercado_candidatos for select to authenticated using ((select public.es_admin_plataforma()));

alter table public.precios_mercado_corridas drop constraint if exists precios_mercado_corridas_fuente_check;
alter table public.precios_mercado_corridas add constraint precios_mercado_corridas_fuente_check check (fuente in ('sitio_web', 'resenas_google', 'doctoralia', 'cuidadores', 'negocio_peludesk', 'reporte_mensual', 'clasificacion'));

do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.auditoria_frontera()'::regprocedure), E'\r', '') into v_def;
  if position($a$('precios_mercado_candidatos')$a$ in v_def) = 0 then
    v_def := replace(v_def, $a$('precios_mercado_corridas'), $a$, $b$('precios_mercado_corridas'), ('precios_mercado_candidatos'), $b$);
    if position($a$('precios_mercado_candidatos')$a$ in v_def) = 0 then
      raise exception 'auditoria_frontera cambió: no se pudo agregar precios_mercado_candidatos.';
    end if;
    execute v_def;
  end if;
end $$;
