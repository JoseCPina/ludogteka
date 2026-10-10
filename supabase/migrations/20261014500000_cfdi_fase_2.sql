-- Facturación CFDI 4.0 (carril B, fase 2). Una factura sale de un cobro (o de
-- varios cobros juntos) o es la factura global al público en general.
--
-- Diseño (nada de lo que ya cuenta el dinero cambia de forma):
--  · NO se altera ninguna tabla de clientes, mascotas, inventario ni citas. La
--    clasificación fiscal de un producto o servicio vive en tablas aparte
--    (cfdi_insumo_fiscal, cfdi_servicio_fiscal, cfdi_clases).
--  · Los CONCEPTOS los calcula la base (cfdi_lineas_cobro) desde las líneas de la
--    cuenta que pagó el cobro, con el descuento repartido y lo cubierto por un
--    pase fuera, y escalados al monto cobrado (sin propina): la factura es por
--    lo que se cobró, centavo por centavo. La app nunca manda importes.
--  · El timbrado lo hace el servidor con el PAC (adaptador propio, hoy Facturapi);
--    la base solo guarda el resultado por funciones de service_role.
--  · La llave del PAC de cada negocio vive en Vault; nunca en una columna.
--  · Una factura timbrada, su cancelación y todo cambio de datos fiscales dejan
--    un evento inmutable (cfdi_eventos).
--
-- Permisos NUEVOS (apagados por omisión para recepción): facturar,
-- cancelar_facturas, editar_datos_fiscales.
--
-- REVERSA: apagar la facturación en Administración → Facturación (nada se
-- timbra sin la llave del PAC). Las tablas nuevas no cambian ninguna fila
-- existente; para quitarlas: drop de las tablas cfdi_* y de los tres triggers
-- cfdi_bloquea_* (anulación, monto y devolución de un cobro facturado).

-- ── 0. Permisos (se suman a los que ya existan, sin reescribir la lista) ─────
-- Con el catálogo de permisos (permisos_catalogo, carril A) es un insert; sin él,
-- la lista vive en el check de permisos_staff y en mis_permisos().
do $$
declare
  d text;
  v_def text;
begin
  if to_regclass('public.permisos_catalogo') is not null then
    insert into public.permisos_catalogo (clave, etiqueta, modulos, orden, updated_at) values
      ('facturar', 'Facturar', '{}', 40, now()),
      ('cancelar_facturas', 'Cancelar facturas', '{}', 41, now()),
      ('editar_datos_fiscales', 'Editar datos fiscales', '{}', 42, now())
    on conflict (clave) do nothing;
  else
    select pg_get_constraintdef(oid) into d from pg_constraint
    where conname = 'permisos_staff_permiso_check' and conrelid = 'public.permisos_staff'::regclass;
    if d is null then
      raise exception 'No existe permisos_staff_permiso_check.';
    end if;
    if position('''facturar''' in d) = 0 then
      d := replace(d, 'ARRAY[', 'ARRAY[''facturar''::text, ''cancelar_facturas''::text, ''editar_datos_fiscales''::text, ');
      alter table public.permisos_staff drop constraint permisos_staff_permiso_check;
      execute 'alter table public.permisos_staff add constraint permisos_staff_permiso_check ' || d;
    end if;
    select pg_get_functiondef('public.mis_permisos()'::regprocedure) into v_def;
    if position('''facturar''' in v_def) = 0 then
      v_def := replace(v_def, '''inventario_costos'',', '''inventario_costos'', ''facturar'', ''cancelar_facturas'', ''editar_datos_fiscales'',');
      if position('''facturar''' in v_def) = 0 then
        raise exception 'mis_permisos cambió: no se pudieron agregar los permisos de facturación.';
      end if;
      execute v_def;
    end if;
  end if;
end $$;

-- La acción «cfdi_tope» de plataforma_eventos: se lee la lista que haya y se le suma.
do $$
declare
  v_def text;
  v_acciones text[];
begin
  select pg_get_constraintdef(c.oid) into v_def
  from pg_constraint c where c.conname = 'plataforma_eventos_accion_check' and c.conrelid = 'public.plataforma_eventos'::regclass;
  -- La lista puede venir como ARRAY['a'::text, …] o como '{a,b,…}'::text[].
  if position('{' in v_def) > 0 then
    v_acciones := string_to_array(substring(v_def from '{([a-z_0-9,]+)}'), ',');
  else
    select coalesce(array_agg(distinct m[1]), '{}') into v_acciones
    from regexp_matches(v_def, '''([a-z_0-9]+)''', 'g') as m;
  end if;
  if not ('cfdi_tope' = any (v_acciones)) then
    v_acciones := (select array_agg(distinct a) from unnest(v_acciones || array['cfdi_tope']) a);
    alter table public.plataforma_eventos drop constraint plataforma_eventos_accion_check;
    execute format('alter table public.plataforma_eventos add constraint plataforma_eventos_accion_check check (accion = any (%L::text[]))', v_acciones);
  end if;
end $$;

-- ── 1. Catálogo del SAT / PAC (compartido: lo escribe el servidor) ───────────
create table public.cfdi_catalogos (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('regimen_fiscal', 'uso_cfdi', 'forma_pago', 'motivo_cancelacion')),
  clave text not null,
  descripcion text not null,
  persona text not null default 'ambas' check (persona in ('fisica', 'moral', 'ambas')),
  origen text not null default 'sat' check (origen in ('sat', 'pac')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  unique (tipo, clave)
);
create trigger set_updated_at before insert or update on public.cfdi_catalogos
  for each row execute function public.set_updated_at();
alter table public.cfdi_catalogos enable row level security;
create policy cfdi_catalogos_select on public.cfdi_catalogos
  for select to authenticated using ((select coalesce(public.is_staff(), false)) or (select public.mi_cliente_id()) is not null);
create policy cfdi_catalogos_plataforma on public.cfdi_catalogos
  for all to peludesk_definer using (true) with check (true);
revoke all on public.cfdi_catalogos from anon, authenticated;
grant select on public.cfdi_catalogos to authenticated;
grant select, insert, update, delete on public.cfdi_catalogos to peludesk_definer, service_role;

insert into public.cfdi_catalogos (tipo, clave, descripcion, persona, updated_at) values
  ('regimen_fiscal', '601', 'General de Ley Personas Morales', 'moral', now()),
  ('regimen_fiscal', '603', 'Personas Morales con Fines no Lucrativos', 'moral', now()),
  ('regimen_fiscal', '605', 'Sueldos y Salarios e Ingresos Asimilados a Salarios', 'fisica', now()),
  ('regimen_fiscal', '606', 'Arrendamiento', 'fisica', now()),
  ('regimen_fiscal', '607', 'Régimen de Enajenación o Adquisición de Bienes', 'fisica', now()),
  ('regimen_fiscal', '608', 'Demás ingresos', 'fisica', now()),
  ('regimen_fiscal', '609', 'Consolidación', 'moral', now()),
  ('regimen_fiscal', '610', 'Residentes en el Extranjero sin Establecimiento Permanente en México', 'ambas', now()),
  ('regimen_fiscal', '611', 'Ingresos por Dividendos (socios y accionistas)', 'fisica', now()),
  ('regimen_fiscal', '612', 'Personas Físicas con Actividades Empresariales y Profesionales', 'fisica', now()),
  ('regimen_fiscal', '614', 'Ingresos por intereses', 'fisica', now()),
  ('regimen_fiscal', '615', 'Régimen de los ingresos por obtención de premios', 'fisica', now()),
  ('regimen_fiscal', '616', 'Sin obligaciones fiscales', 'fisica', now()),
  ('regimen_fiscal', '620', 'Sociedades Cooperativas de Producción que optan por diferir sus ingresos', 'moral', now()),
  ('regimen_fiscal', '621', 'Incorporación Fiscal', 'fisica', now()),
  ('regimen_fiscal', '622', 'Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras', 'ambas', now()),
  ('regimen_fiscal', '623', 'Opcional para Grupos de Sociedades', 'moral', now()),
  ('regimen_fiscal', '624', 'Coordinados', 'moral', now()),
  ('regimen_fiscal', '625', 'Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas', 'fisica', now()),
  ('regimen_fiscal', '626', 'Régimen Simplificado de Confianza (RESICO)', 'ambas', now()),
  ('uso_cfdi', 'G01', 'Adquisición de mercancías', 'ambas', now()),
  ('uso_cfdi', 'G02', 'Devoluciones, descuentos o bonificaciones', 'ambas', now()),
  ('uso_cfdi', 'G03', 'Gastos en general', 'ambas', now()),
  ('uso_cfdi', 'I01', 'Construcciones', 'ambas', now()),
  ('uso_cfdi', 'I02', 'Mobiliario y equipo de oficina por inversiones', 'ambas', now()),
  ('uso_cfdi', 'I03', 'Equipo de transporte', 'ambas', now()),
  ('uso_cfdi', 'I04', 'Equipo de cómputo y accesorios', 'ambas', now()),
  ('uso_cfdi', 'I05', 'Dados, troqueles, moldes, matrices y herramental', 'ambas', now()),
  ('uso_cfdi', 'I06', 'Comunicaciones telefónicas', 'ambas', now()),
  ('uso_cfdi', 'I07', 'Comunicaciones satelitales', 'ambas', now()),
  ('uso_cfdi', 'I08', 'Otra maquinaria y equipo', 'ambas', now()),
  ('uso_cfdi', 'D01', 'Honorarios médicos, dentales y gastos hospitalarios', 'fisica', now()),
  ('uso_cfdi', 'D02', 'Gastos médicos por incapacidad o discapacidad', 'fisica', now()),
  ('uso_cfdi', 'D03', 'Gastos funerales', 'fisica', now()),
  ('uso_cfdi', 'D04', 'Donativos', 'fisica', now()),
  ('uso_cfdi', 'D05', 'Intereses reales efectivamente pagados por créditos hipotecarios', 'fisica', now()),
  ('uso_cfdi', 'D06', 'Aportaciones voluntarias al SAR', 'fisica', now()),
  ('uso_cfdi', 'D07', 'Primas por seguros de gastos médicos', 'fisica', now()),
  ('uso_cfdi', 'D08', 'Gastos de transportación escolar obligatoria', 'fisica', now()),
  ('uso_cfdi', 'D09', 'Depósitos en cuentas para el ahorro, primas de pensiones', 'fisica', now()),
  ('uso_cfdi', 'D10', 'Pagos por servicios educativos (colegiaturas)', 'fisica', now()),
  ('uso_cfdi', 'S01', 'Sin efectos fiscales', 'ambas', now()),
  ('forma_pago', '01', 'Efectivo', 'ambas', now()),
  ('forma_pago', '03', 'Transferencia electrónica de fondos', 'ambas', now()),
  ('forma_pago', '04', 'Tarjeta de crédito', 'ambas', now()),
  ('forma_pago', '28', 'Tarjeta de débito', 'ambas', now()),
  ('forma_pago', '99', 'Por definir', 'ambas', now()),
  ('motivo_cancelacion', '01', 'Comprobante emitido con errores con relación (lleva el UUID del que lo sustituye)', 'ambas', now()),
  ('motivo_cancelacion', '02', 'Comprobante emitido con errores sin relación', 'ambas', now()),
  ('motivo_cancelacion', '03', 'No se llevó a cabo la operación', 'ambas', now()),
  ('motivo_cancelacion', '04', 'Operación nominativa relacionada en una factura global', 'ambas', now());

-- ── 2. Tablas de cada negocio ────────────────────────────────────────────────
create table public.cfdi_config_negocio (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  activa boolean not null default false,
  modo text not null default 'pruebas' check (modo in ('pruebas', 'produccion')),
  pac text not null default 'facturapi' check (pac in ('facturapi', 'facturama')),
  rfc text,
  razon_social text,
  regimen_fiscal text,
  cp_expedicion text,
  tipo_persona text check (tipo_persona in ('fisica', 'moral', 'sociedad_civil')),
  serie text not null default 'A',
  global_periodicidad text not null default 'mes' check (global_periodicidad in ('dia', 'semana', 'mes')),
  global_automatica boolean not null default false,
  -- Desde cuándo la global junta cobros: el día en que se activó la facturación
  -- (nunca el historial anterior, que ya no se puede facturar al público).
  global_desde date,
  -- Solo la plataforma cambia el tope (plataforma_cfdi_tope).
  tope_timbres_mes integer not null default 100 check (tope_timbres_mes >= 0),
  aviso_timbres_pct integer not null default 80 check (aviso_timbres_pct between 1 and 100),
  llave_secreto_id uuid,
  llave_modo text check (llave_modo in ('pruebas', 'produccion')),
  llave_guardada_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  -- RESICO (626) solo factura global mensual.
  check (regimen_fiscal is distinct from '626' or global_periodicidad = 'mes')
);
create unique index cfdi_config_negocio_uq on public.cfdi_config_negocio (negocio_id) where deleted_at is null;

create table public.cfdi_datos_fiscales (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  cliente_id uuid not null references public.clientes(id),
  rfc text not null,
  nombre_fiscal text not null,
  cp text not null check (cp ~ '^[0-9]{5}$'),
  regimen_fiscal text not null,
  uso_cfdi text not null default 'G03',
  email text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index cfdi_datos_fiscales_cliente_uq on public.cfdi_datos_fiscales (negocio_id, cliente_id) where deleted_at is null;

-- Clasificación fiscal de cada clase de concepto (IVA y claves del SAT). Sin fila
-- se usa el valor por omisión de cfdi_regla_clase().
create table public.cfdi_clases (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  clase text not null check (clase in ('medicina_patente', 'alimento_mascotas', 'otro_producto', 'estetica', 'hospedaje', 'guarderia', 'consulta_veterinaria', 'otro_servicio')),
  tratamiento text not null check (tratamiento in ('tasa', 'exento')),
  tasa numeric(6, 4) not null default 0.16 check (tasa >= 0 and tasa <= 1),
  clave_prod_serv text not null default '01010101' check (clave_prod_serv ~ '^[0-9]{8}$'),
  clave_unidad text not null default 'E48' check (clave_unidad ~ '^[A-Z0-9]{2,3}$'),
  unidad text not null default 'Unidad de servicio',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index cfdi_clases_uq on public.cfdi_clases (negocio_id, clase) where deleted_at is null;

-- El atributo «de patente» y la clase de un producto vendible, SIN tocar insumos.
create table public.cfdi_insumo_fiscal (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  insumo_id uuid not null references public.insumos(id),
  de_patente boolean not null default false,
  clase text not null default 'otro_producto' check (clase in ('alimento_mascotas', 'otro_producto')),
  clave_prod_serv text check (clave_prod_serv is null or clave_prod_serv ~ '^[0-9]{8}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index cfdi_insumo_fiscal_uq on public.cfdi_insumo_fiscal (negocio_id, insumo_id) where deleted_at is null;

-- Un servicio que no cae solo en su clase (p. ej. una consulta veterinaria).
create table public.cfdi_servicio_fiscal (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  servicio_id uuid not null references public.servicios(id),
  clase text not null check (clase in ('estetica', 'hospedaje', 'guarderia', 'consulta_veterinaria', 'otro_servicio')),
  clave_prod_serv text check (clave_prod_serv is null or clave_prod_serv ~ '^[0-9]{8}$'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create unique index cfdi_servicio_fiscal_uq on public.cfdi_servicio_fiscal (negocio_id, servicio_id) where deleted_at is null;

create table public.cfdi_facturas (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  tipo text not null check (tipo in ('ingreso', 'global')),
  estado text not null default 'borrador' check (estado in ('borrador', 'timbrando', 'vigente', 'cancelacion_pendiente', 'cancelada', 'revisar', 'descartada')),
  cliente_id uuid references public.clientes(id),
  emisor jsonb not null,
  receptor jsonb not null,
  serie text,
  folio text,
  uuid_fiscal text,
  pac text not null default 'facturapi',
  pac_modo text not null default 'pruebas',
  pac_factura_id text,
  referencia text not null default gen_random_uuid()::text,
  moneda text not null default 'MXN',
  forma_pago text not null default '99',
  metodo_pago text not null default 'PUE',
  uso_cfdi text,
  subtotal numeric(12, 2) not null default 0,
  descuento numeric(12, 2) not null default 0,
  impuestos jsonb not null default '{}'::jsonb,
  total numeric(12, 2) not null default 0,
  total_esperado numeric(12, 2) not null default 0,
  periodo_desde date,
  periodo_hasta date,
  periodicidad text,
  limite_emision timestamptz,
  relacion_tipo text,
  relacionada_a uuid references public.cfdi_facturas(id),
  fecha_timbrado timestamptz,
  intentos integer not null default 0,
  error text,
  cancelacion_motivo text,
  cancelacion_sustituta text,
  cancelacion_solicitada_at timestamptz,
  cancelacion_limite timestamptz,
  cancelacion_estatus text check (cancelacion_estatus in ('pendiente', 'aceptada', 'rechazada', 'plazo_vencido')),
  cancelada_at timestamptz,
  pdf_path text,
  xml_path text,
  enviado_whatsapp_at timestamptz,
  enviado_correo_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  check (tipo <> 'global' or (periodo_desde is not null and periodo_hasta is not null and periodicidad is not null)),
  check (cancelacion_motivo is null or cancelacion_motivo in ('01', '02', '03', '04'))
);
create index cfdi_facturas_cliente_idx on public.cfdi_facturas (cliente_id) where cliente_id is not null;
create index cfdi_facturas_estado_idx on public.cfdi_facturas (negocio_id, estado);
create unique index cfdi_facturas_referencia_uq on public.cfdi_facturas (referencia);
create unique index cfdi_facturas_uuid_uq on public.cfdi_facturas (uuid_fiscal) where uuid_fiscal is not null;
-- Una sola factura global vigente por periodo.
create unique index cfdi_facturas_global_uq on public.cfdi_facturas (negocio_id, periodo_desde, periodo_hasta)
  where tipo = 'global' and estado in ('borrador', 'timbrando', 'vigente', 'cancelacion_pendiente', 'revisar') and deleted_at is null;

create table public.cfdi_conceptos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  factura_id uuid not null references public.cfdi_facturas(id),
  orden integer not null,
  descripcion text not null,
  clase text not null,
  clave_prod_serv text not null,
  clave_unidad text not null,
  unidad text not null,
  cantidad numeric(12, 3) not null check (cantidad > 0),
  valor_unitario numeric(14, 6) not null,
  importe numeric(12, 2) not null,
  objeto_imp text not null default '02',
  exento boolean not null default false,
  tasa numeric(6, 4) not null default 0,
  iva numeric(12, 2) not null default 0,
  importe_con_iva numeric(12, 2) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index cfdi_conceptos_factura_idx on public.cfdi_conceptos (factura_id);

create table public.cfdi_factura_cobros (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  factura_id uuid not null references public.cfdi_facturas(id),
  cobro_id uuid not null references public.cobros(id),
  monto numeric(12, 2) not null,
  vigente boolean not null default true,
  es_sustitucion boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index cfdi_factura_cobros_factura_idx on public.cfdi_factura_cobros (factura_id);
-- Un cobro está en una sola factura vigente (la sustituta convive un momento con la que reemplaza).
create unique index cfdi_factura_cobros_uq on public.cfdi_factura_cobros (cobro_id)
  where vigente and not es_sustitucion and deleted_at is null;

create table public.cfdi_enlaces (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  factura_id uuid not null references public.cfdi_facturas(id),
  token_hash text not null unique,
  vence_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create table public.cfdi_eventos (
  id uuid primary key default gen_random_uuid(),
  negocio_id uuid not null references public.negocios(id) default public.negocio_actual(),
  factura_id uuid references public.cfdi_facturas(id),
  cliente_id uuid references public.clientes(id),
  tipo text not null,
  actor uuid references auth.users(id) on delete set null,
  detalle jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null,
  deleted_at timestamptz,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);
create index cfdi_eventos_factura_idx on public.cfdi_eventos (factura_id);

-- Las dos redes de negocio, las tres de solo lectura, y quién lee cada tabla.
do $$
declare
  t text;
  v_lee text;
  v_perm_fact text := $p$((select coalesce(public.tiene_permiso('facturar'), false)) or (select coalesce(public.tiene_permiso('cancelar_facturas'), false)) or (select coalesce(public.tiene_permiso('editar_datos_fiscales'), false)))$p$;
  v_staff text := $p$((select coalesce(public.current_rol() in ('admin', 'recepcion'), false)))$p$;
begin
  foreach t in array array['cfdi_config_negocio', 'cfdi_datos_fiscales', 'cfdi_clases', 'cfdi_insumo_fiscal', 'cfdi_servicio_fiscal',
                           'cfdi_facturas', 'cfdi_conceptos', 'cfdi_factura_cobros', 'cfdi_enlaces', 'cfdi_eventos'] loop
    v_lee := case t
      when 'cfdi_config_negocio' then v_staff
      when 'cfdi_clases' then v_staff
      when 'cfdi_insumo_fiscal' then v_staff
      when 'cfdi_servicio_fiscal' then v_staff
      else v_perm_fact end;
    execute format('create index %I on public.%I (negocio_id)', t || '_negocio_idx', t);
    execute format('create trigger set_updated_at before insert or update on public.%I for each row execute function public.set_updated_at()', t);
    execute format('alter table public.%I enable row level security', t);
    execute format($f$create policy %I on public.%I as restrictive for all to authenticated
      using (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))
      with check (negocio_id = (select public.negocio_actual()) and (select public.es_miembro()))$f$, t || '_negocio', t);
    execute format($f$create policy %I on public.%I for all to peludesk_definer
      using (negocio_id = (select public.negocio_actual()))
      with check (negocio_id = (select public.negocio_actual()))$f$, t || '_negocio_definer', t);
    execute format($f$create policy %I on public.%I as restrictive for insert to authenticated, peludesk_definer
      with check ((select public.exigir_negocio_escribible()))$f$, t || '_escritura_ins', t);
    execute format($f$create policy %I on public.%I as restrictive for update to authenticated, peludesk_definer
      using ((select public.exigir_negocio_escribible())) with check ((select public.exigir_negocio_escribible()))$f$, t || '_escritura_upd', t);
    execute format($f$create policy %I on public.%I as restrictive for delete to authenticated, peludesk_definer
      using ((select public.exigir_negocio_escribible()))$f$, t || '_escritura_del', t);
    if t <> 'cfdi_enlaces' then
      execute format('create policy %I on public.%I for select to authenticated using (%s)', t || '_select', t, v_lee);
    end if;
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant select, insert, update, delete on public.%I to peludesk_definer', t);
    if t <> 'cfdi_enlaces' and t <> 'cfdi_config_negocio' then
      execute format('grant select on public.%I to authenticated', t);
    end if;
  end loop;
end $$;
-- La referencia a la llave del PAC no se lee por la API.
grant select (id, negocio_id, activa, modo, pac, rfc, razon_social, regimen_fiscal, cp_expedicion, tipo_persona, serie,
              global_periodicidad, global_automatica, global_desde, tope_timbres_mes, aviso_timbres_pct, llave_modo, llave_guardada_at,
              created_at, updated_at, deleted_at)
  on public.cfdi_config_negocio to authenticated;
grant select on public.cfdi_config_negocio to service_role;
grant select, update on public.cfdi_enlaces to service_role;

-- ── 3. Archivos (PDF y XML) en un bucket privado, sin políticas ──────────────
insert into storage.buckets (id, name, public) values ('cfdi-archivos', 'cfdi-archivos', false)
on conflict (id) do nothing;

-- ── 4. Funciones internas ────────────────────────────────────────────────────
create or replace function public.cfdi_log(p_factura_id uuid, p_cliente_id uuid, p_tipo text, p_detalle jsonb default '{}'::jsonb)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.cfdi_eventos (factura_id, cliente_id, tipo, actor, detalle)
  values (p_factura_id, p_cliente_id, p_tipo, auth.uid(), coalesce(p_detalle, '{}'::jsonb));
$$;
alter function public.cfdi_log(uuid, uuid, text, jsonb) owner to peludesk_definer;
revoke execute on function public.cfdi_log(uuid, uuid, text, jsonb) from public, anon, authenticated;

-- Valor por omisión de cada clase y lo que el negocio haya cambiado.
create or replace function public.cfdi_regla_clase(p_clase text)
returns table (tratamiento text, tasa numeric, clave_prod_serv text, clave_unidad text, unidad text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  c public.cfdi_clases%rowtype;
  v_hay boolean;
  v_tipo text;
begin
  select * into c from public.cfdi_clases
  where negocio_id = public.negocio_actual() and clase = p_clase and deleted_at is null;
  v_hay := found;
  if v_hay then
    return query select c.tratamiento, c.tasa, c.clave_prod_serv, c.clave_unidad, c.unidad;
    return;
  end if;
  select g.tipo_persona into v_tipo from public.cfdi_config_negocio g
  where g.negocio_id = public.negocio_actual() and g.deleted_at is null;
  if p_clase = 'medicina_patente' then
    return query select 'tasa'::text, 0::numeric, '01010101'::text, 'H87'::text, 'Pieza'::text;
  elsif p_clase in ('alimento_mascotas', 'otro_producto') then
    return query select 'tasa'::text, 0.16::numeric, '01010101'::text, 'H87'::text, 'Pieza'::text;
  elsif p_clase = 'consulta_veterinaria' then
    -- Exenta solo si quien factura es persona física o sociedad civil.
    if coalesce(v_tipo, '') in ('fisica', 'sociedad_civil') then
      return query select 'exento'::text, 0::numeric, '01010101'::text, 'E48'::text, 'Unidad de servicio'::text;
    else
      return query select 'tasa'::text, 0.16::numeric, '01010101'::text, 'E48'::text, 'Unidad de servicio'::text;
    end if;
  else
    return query select 'tasa'::text, 0.16::numeric, '01010101'::text, 'E48'::text, 'Unidad de servicio'::text;
  end if;
end;
$$;
alter function public.cfdi_regla_clase(text) owner to peludesk_definer;
revoke execute on function public.cfdi_regla_clase(text) from public, anon;
grant execute on function public.cfdi_regla_clase(text) to authenticated, service_role;

create or replace function public.cfdi_clase_de_linea(p_tipo text, p_origen uuid, p_servicio uuid)
returns text
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_clase text;
  v_patente boolean;
  v_cat text;
  v_inc uuid;
  v_hay boolean;
begin
  if p_servicio is not null then
    select f.clase into v_clase from public.cfdi_servicio_fiscal f
    where f.negocio_id = public.negocio_actual() and f.servicio_id = p_servicio and f.deleted_at is null;
    if v_clase is not null then
      return v_clase;
    end if;
  end if;
  if p_tipo = 'venta' then
    select f.de_patente, f.clase into v_patente, v_clase
    from public.ventas_mostrador v
    join public.cfdi_insumo_fiscal f on f.insumo_id = v.insumo_id and f.deleted_at is null
    where v.id = p_origen and v.negocio_id = public.negocio_actual();
    v_hay := found;
    if v_hay and v_patente then return 'medicina_patente'; end if;
    if v_hay then return v_clase; end if;
    return 'otro_producto';
  end if;
  if p_servicio is not null then
    select s.categoria, s.servicio_incluido_id into v_cat, v_inc from public.servicios s where s.id = p_servicio;
    if v_cat = 'bono' and v_inc is not null then
      select s2.categoria into v_cat from public.servicios s2 where s2.id = v_inc;
    end if;
    return case v_cat
      when 'guarderia' then 'guarderia'
      when 'hotel' then 'hospedaje'
      when 'estetica' then 'estetica'
      else 'otro_servicio' end;
  end if;
  return 'otro_servicio';
end;
$$;
alter function public.cfdi_clase_de_linea(text, uuid, uuid) owner to peludesk_definer;
revoke execute on function public.cfdi_clase_de_linea(text, uuid, uuid) from public, anon;
grant execute on function public.cfdi_clase_de_linea(text, uuid, uuid) to authenticated, service_role;

-- Lo que un cobro factura: las líneas de su cuenta, sin lo cubierto por un pase,
-- con el descuento repartido y escaladas a lo que se cobró (sin propina, menos
-- devoluciones). Reparto en centavos: la suma es EXACTAMENTE el monto cobrado.
create or replace function public.cfdi_lineas_cobro(p_cobro_id uuid)
returns table (cobro_id uuid, linea_tipo text, origen_id uuid, servicio_id uuid, descripcion text,
               cantidad numeric, valor_unitario numeric, importe numeric, clase text, monto_cobro numeric)
language plpgsql
security definer
set search_path = ''
as $$
declare
  c public.cobros%rowtype;
  v_neg uuid := public.negocio_actual();
  v_cobrado numeric;
  v_devuelto numeric;
  v_neto numeric;
  v_desc numeric;
  v_base numeric;
  v_n int;
  v_i int;
  v_resto bigint;
  v_tot bigint;
  r record;
begin
  select * into c from public.cobros x where x.id = p_cobro_id and x.negocio_id = v_neg and x.deleted_at is null;
  if not found then
    raise exception 'Ese cobro no existe.';
  end if;
  select coalesce(sum(cm.monto), 0) into v_cobrado from public.cobro_metodos cm
  where cm.cobro_id = c.id and cm.deleted_at is null;
  select coalesce(sum(dm.monto), 0) into v_devuelto
  from public.devolucion_metodos dm join public.devoluciones d on d.id = dm.devolucion_id
  where d.cobro_id = c.id;
  v_neto := v_cobrado - v_devuelto;
  if v_neto <= 0 then
    raise exception 'Este cobro no tiene importe por facturar.';
  end if;
  select coalesce(sum(da.monto_aplicado), 0) into v_desc from public.descuentos_aplicados da
  where da.reserva_id = c.reserva_id and da.cancelado = false;

  create temp table if not exists pg_temp.cfdi_l (
    ord int, tipo text, origen uuid, serv uuid, descr text, cant numeric, unit numeric, total numeric, neto numeric, despues numeric, final_c bigint, resto numeric
  ) on commit drop;
  truncate pg_temp.cfdi_l;

  insert into pg_temp.cfdi_l (ord, tipo, origen, serv, descr, cant, unit, total, neto)
  select row_number() over (), l.tipo, l.origen_id, l.servicio_id, l.descripcion, l.cantidad, l.precio_unitario, l.total,
    greatest(l.total - coalesce((
      select sum(case mb.tipo when 'consumo' then mb.cantidad when 'devolucion' then -mb.cantidad else 0 end)
      from public.movimientos_bono mb
      where mb.item_tipo = l.tipo and mb.item_id = l.origen_id and mb.tipo in ('consumo', 'devolucion')
    ), 0) * l.precio_unitario, 0)
  from public.cuenta_lineas_reserva(c.reserva_id) l;

  select coalesce(sum(neto), 0) into v_base from pg_temp.cfdi_l;
  if v_base <= 0 then
    raise exception 'La cuenta de este cobro no tiene líneas por facturar.';
  end if;
  v_desc := least(v_desc, v_base);
  update pg_temp.cfdi_l set despues = neto - v_desc * neto / v_base where true;
  select coalesce(sum(despues), 0) into v_base from pg_temp.cfdi_l;
  if v_base <= 0 then
    raise exception 'La cuenta de este cobro quedó en cero después del descuento.';
  end if;
  -- escala al monto cobrado, en centavos, por mayor residuo
  update pg_temp.cfdi_l set final_c = floor(despues * v_neto / v_base * 100)::bigint,
                            resto = (despues * v_neto / v_base * 100) - floor(despues * v_neto / v_base * 100)
  where despues > 0;
  update pg_temp.cfdi_l set final_c = 0, resto = 0 where despues <= 0;
  select coalesce(sum(final_c), 0) into v_tot from pg_temp.cfdi_l;
  v_resto := round(v_neto * 100)::bigint - v_tot;
  update pg_temp.cfdi_l t set final_c = t.final_c + 1
  where t.ord in (select x.ord from pg_temp.cfdi_l x where x.final_c > 0 or x.despues > 0 order by x.resto desc, x.ord limit greatest(v_resto, 0));

  return query
  select c.id, t.tipo, t.origen, t.serv, t.descr,
    case when t.final_c::numeric / 100 = t.total then t.cant else 1::numeric end,
    case when t.final_c::numeric / 100 = t.total then t.unit else t.final_c::numeric / 100 end,
    t.final_c::numeric / 100,
    public.cfdi_clase_de_linea(t.tipo, t.origen, t.serv),
    v_neto
  from pg_temp.cfdi_l t
  where t.final_c > 0
  order by t.ord;
end;
$$;
alter function public.cfdi_lineas_cobro(uuid) owner to peludesk_definer;
revoke execute on function public.cfdi_lineas_cobro(uuid) from public, anon;
grant execute on function public.cfdi_lineas_cobro(uuid) to authenticated, service_role;

-- Valida y normaliza los datos de un receptor (cliente o capturado al momento).
create or replace function public.cfdi_validar_receptor(p_rfc text, p_nombre text, p_cp text, p_regimen text, p_uso text)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_rfc text := upper(btrim(coalesce(p_rfc, '')));
  v_nombre text := btrim(coalesce(p_nombre, ''));
  v_cp text := btrim(coalesce(p_cp, ''));
  v_reg text := btrim(coalesce(p_regimen, ''));
  v_uso text := upper(btrim(coalesce(p_uso, '')));
  v_persona text;
  v_cp_exp text;
  v_pers_reg text;
begin
  select g.cp_expedicion into v_cp_exp from public.cfdi_config_negocio g
  where g.negocio_id = public.negocio_actual() and g.deleted_at is null;
  if v_rfc = 'XAXX010101000' then
    raise exception 'El RFC genérico XAXX010101000 (público en general) no se factura aparte: esas ventas van en la factura global del periodo.';
  end if;
  if v_rfc = 'XEXX010101000' then
    -- Extranjeros sin RFC: régimen 616, uso S01 y el código postal del lugar de expedición.
    if v_nombre = '' then raise exception 'Escribe el nombre del cliente extranjero.'; end if;
    return jsonb_build_object('rfc', v_rfc, 'nombre', v_nombre, 'cp', coalesce(v_cp_exp, v_cp), 'regimen', '616', 'uso', 'S01', 'extranjero', true);
  end if;
  if v_rfc !~ '^[A-ZÑ&]{3,4}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[A-Z0-9]{3}$' then
    raise exception 'El RFC no tiene un formato válido (12 caracteres para empresas, 13 para personas). Revísalo contra la constancia de situación fiscal.';
  end if;
  v_persona := case length(v_rfc) when 13 then 'fisica' else 'moral' end;
  if v_nombre = '' then
    raise exception 'Escribe el nombre o razón social exactamente como viene en la constancia de situación fiscal (sin el régimen de capital: S.A. de C.V., etc.).';
  end if;
  if v_cp !~ '^[0-9]{5}$' then
    raise exception 'El código postal fiscal debe tener 5 dígitos (el de la constancia).';
  end if;
  select c.persona into v_pers_reg from public.cfdi_catalogos c
  where c.tipo = 'regimen_fiscal' and c.clave = v_reg and c.deleted_at is null;
  if v_pers_reg is null then
    raise exception 'Escoge el régimen fiscal del cliente (el de su constancia).';
  end if;
  if v_pers_reg <> 'ambas' and v_pers_reg <> v_persona then
    raise exception 'El régimen % no corresponde a una persona %.', v_reg, case v_persona when 'fisica' then 'física' else 'moral' end;
  end if;
  if not exists (select 1 from public.cfdi_catalogos c where c.tipo = 'uso_cfdi' and c.clave = v_uso and c.deleted_at is null) then
    raise exception 'Escoge el uso del CFDI.';
  end if;
  return jsonb_build_object('rfc', v_rfc, 'nombre', v_nombre, 'cp', v_cp, 'regimen', v_reg, 'uso', v_uso, 'extranjero', false);
end;
$$;
alter function public.cfdi_validar_receptor(text, text, text, text, text) owner to peludesk_definer;
revoke execute on function public.cfdi_validar_receptor(text, text, text, text, text) from public, anon;
grant execute on function public.cfdi_validar_receptor(text, text, text, text, text) to authenticated, service_role;

create or replace function public.cfdi_timbres_mes()
returns table (usados integer, tope integer, aviso integer, cerca boolean, agotado boolean)
language sql
stable
security definer
set search_path = ''
as $$
  with g as (
    select coalesce(c.tope_timbres_mes, 100) as tope, coalesce(c.aviso_timbres_pct, 80) as aviso
    from (select 1) x left join public.cfdi_config_negocio c on c.negocio_id = public.negocio_actual() and c.deleted_at is null
  ), u as (
    select count(*)::int as n from public.cfdi_facturas f
    where f.negocio_id = public.negocio_actual() and f.fecha_timbrado is not null
      and (f.fecha_timbrado at time zone public.zona_negocio())::date >= date_trunc('month', public.fecha_negocio())::date
      and f.deleted_at is null
  )
  select u.n, g.tope, g.aviso, u.n * 100 >= g.tope * g.aviso, u.n >= g.tope from u, g;
$$;
alter function public.cfdi_timbres_mes() owner to peludesk_definer;
revoke execute on function public.cfdi_timbres_mes() from public, anon;
grant execute on function public.cfdi_timbres_mes() to authenticated, service_role;

-- ── 5. Configuración y datos fiscales (con permiso y con evento) ─────────────
create or replace function public.cfdi_guardar_config(p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  v_rfc text := upper(btrim(coalesce(p ->> 'rfc', '')));
  v_reg text := btrim(coalesce(p ->> 'regimen_fiscal', ''));
  v_cp text := btrim(coalesce(p ->> 'cp_expedicion', ''));
  v_tipo text := p ->> 'tipo_persona';
  v_per text := coalesce(p ->> 'global_periodicidad', 'mes');
  v_serie text := upper(btrim(coalesce(nullif(p ->> 'serie', ''), 'A')));
  v_activa boolean := coalesce((p ->> 'activa')::boolean, false);
  v_hay boolean;
begin
  if not coalesce(public.tiene_permiso('editar_datos_fiscales'), false) then
    raise exception 'Necesitas el permiso «Editar datos fiscales».';
  end if;
  if v_rfc !~ '^[A-ZÑ&]{3,4}[0-9]{2}(0[1-9]|1[0-2])(0[1-9]|[12][0-9]|3[01])[A-Z0-9]{3}$' then
    raise exception 'El RFC del negocio no tiene un formato válido.';
  end if;
  if btrim(coalesce(p ->> 'razon_social', '')) = '' then
    raise exception 'Escribe la razón social del negocio exactamente como viene en su constancia.';
  end if;
  if not exists (select 1 from public.cfdi_catalogos c where c.tipo = 'regimen_fiscal' and c.clave = v_reg and c.deleted_at is null) then
    raise exception 'Escoge el régimen fiscal del negocio.';
  end if;
  if v_cp !~ '^[0-9]{5}$' then
    raise exception 'El código postal de expedición debe tener 5 dígitos.';
  end if;
  if v_tipo not in ('fisica', 'moral', 'sociedad_civil') then
    raise exception 'Escoge si el negocio es persona física, moral o sociedad civil.';
  end if;
  if (v_tipo = 'fisica') <> (length(v_rfc) = 13) and v_tipo <> 'sociedad_civil' then
    raise exception 'El tipo de persona no coincide con el RFC (13 caracteres = física, 12 = moral).';
  end if;
  if v_per not in ('dia', 'semana', 'mes') then
    raise exception 'La periodicidad de la factura global debe ser diaria, semanal o mensual.';
  end if;
  if v_reg = '626' and v_per <> 'mes' then
    raise exception 'En RESICO la factura global es solo mensual.';
  end if;
  if v_serie !~ '^[A-Z0-9]{1,10}$' then
    raise exception 'La serie solo lleva letras y números (hasta 10).';
  end if;
  select exists (select 1 from public.cfdi_config_negocio g where g.negocio_id = v_neg and g.deleted_at is null) into v_hay;
  if v_hay then
    update public.cfdi_config_negocio g set
      activa = v_activa, rfc = v_rfc, razon_social = btrim(p ->> 'razon_social'), regimen_fiscal = v_reg,
      cp_expedicion = v_cp, tipo_persona = v_tipo, serie = v_serie, global_periodicidad = v_per,
      global_automatica = coalesce((p ->> 'global_automatica')::boolean, false),
      modo = coalesce(nullif(p ->> 'modo', ''), g.modo)
    where g.negocio_id = v_neg and g.deleted_at is null;
  else
    insert into public.cfdi_config_negocio (activa, rfc, razon_social, regimen_fiscal, cp_expedicion, tipo_persona, serie, global_periodicidad, global_automatica, modo)
    values (v_activa, v_rfc, btrim(p ->> 'razon_social'), v_reg, v_cp, v_tipo, v_serie, v_per,
            coalesce((p ->> 'global_automatica')::boolean, false), coalesce(nullif(p ->> 'modo', ''), 'pruebas'));
  end if;
  perform public.cfdi_log(null, null, 'config_editada', jsonb_build_object('rfc', v_rfc, 'regimen', v_reg, 'activa', v_activa, 'periodicidad', v_per, 'tipo_persona', v_tipo));
end;
$$;
alter function public.cfdi_guardar_config(jsonb) owner to peludesk_definer;
revoke execute on function public.cfdi_guardar_config(jsonb) from public, anon;
grant execute on function public.cfdi_guardar_config(jsonb) to authenticated;

create or replace function public.cfdi_guardar_datos_fiscales(p_cliente_id uuid, p jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  r jsonb;
  v_email text := nullif(btrim(coalesce(p ->> 'email', '')), '');
  v_hay boolean;
begin
  if not coalesce(public.tiene_permiso('editar_datos_fiscales'), false) then
    raise exception 'Necesitas el permiso «Editar datos fiscales».';
  end if;
  if not exists (select 1 from public.clientes c where c.id = p_cliente_id and c.negocio_id = v_neg and c.deleted_at is null and not coalesce(c.publico_general, false)) then
    raise exception 'Ese cliente no existe.';
  end if;
  r := public.cfdi_validar_receptor(p ->> 'rfc', p ->> 'nombre_fiscal', p ->> 'cp', p ->> 'regimen_fiscal', p ->> 'uso_cfdi');
  if v_email is not null and v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'El correo no parece válido.';
  end if;
  select exists (select 1 from public.cfdi_datos_fiscales d where d.cliente_id = p_cliente_id and d.negocio_id = v_neg and d.deleted_at is null) into v_hay;
  if v_hay then
    update public.cfdi_datos_fiscales d set rfc = r ->> 'rfc', nombre_fiscal = r ->> 'nombre', cp = r ->> 'cp',
      regimen_fiscal = r ->> 'regimen', uso_cfdi = r ->> 'uso', email = v_email
    where d.cliente_id = p_cliente_id and d.negocio_id = v_neg and d.deleted_at is null;
  else
    insert into public.cfdi_datos_fiscales (cliente_id, rfc, nombre_fiscal, cp, regimen_fiscal, uso_cfdi, email)
    values (p_cliente_id, r ->> 'rfc', r ->> 'nombre', r ->> 'cp', r ->> 'regimen', r ->> 'uso', v_email);
  end if;
  perform public.cfdi_log(null, p_cliente_id, 'datos_fiscales_editados', jsonb_build_object('rfc', r ->> 'rfc', 'regimen', r ->> 'regimen', 'uso', r ->> 'uso'));
end;
$$;
alter function public.cfdi_guardar_datos_fiscales(uuid, jsonb) owner to peludesk_definer;
revoke execute on function public.cfdi_guardar_datos_fiscales(uuid, jsonb) from public, anon;
grant execute on function public.cfdi_guardar_datos_fiscales(uuid, jsonb) to authenticated;

create or replace function public.cfdi_guardar_clase(p_clase text, p_tratamiento text, p_tasa numeric, p_clave_prod_serv text, p_clave_unidad text, p_unidad text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  v_hay boolean;
begin
  if not coalesce(public.tiene_permiso('editar_datos_fiscales'), false) then
    raise exception 'Necesitas el permiso «Editar datos fiscales».';
  end if;
  if p_tratamiento not in ('tasa', 'exento') then
    raise exception 'El tratamiento del IVA es «tasa» o «exento».';
  end if;
  if p_tasa is null or p_tasa < 0 or p_tasa > 1 then
    raise exception 'La tasa va entre 0 y 1 (por ejemplo 0.16).';
  end if;
  select exists (select 1 from public.cfdi_clases c where c.negocio_id = v_neg and c.clase = p_clase and c.deleted_at is null) into v_hay;
  if v_hay then
    update public.cfdi_clases c set tratamiento = p_tratamiento, tasa = p_tasa,
      clave_prod_serv = coalesce(nullif(btrim(p_clave_prod_serv), ''), c.clave_prod_serv),
      clave_unidad = coalesce(nullif(upper(btrim(p_clave_unidad)), ''), c.clave_unidad),
      unidad = coalesce(nullif(btrim(p_unidad), ''), c.unidad)
    where c.negocio_id = v_neg and c.clase = p_clase and c.deleted_at is null;
  else
    insert into public.cfdi_clases (clase, tratamiento, tasa, clave_prod_serv, clave_unidad, unidad)
    values (p_clase, p_tratamiento, p_tasa, coalesce(nullif(btrim(p_clave_prod_serv), ''), '01010101'),
            coalesce(nullif(upper(btrim(p_clave_unidad)), ''), 'E48'), coalesce(nullif(btrim(p_unidad), ''), 'Unidad de servicio'));
  end if;
  perform public.cfdi_log(null, null, 'iva_editado', jsonb_build_object('clase', p_clase, 'tratamiento', p_tratamiento, 'tasa', p_tasa));
end;
$$;
alter function public.cfdi_guardar_clase(text, text, numeric, text, text, text) owner to peludesk_definer;
revoke execute on function public.cfdi_guardar_clase(text, text, numeric, text, text, text) from public, anon;
grant execute on function public.cfdi_guardar_clase(text, text, numeric, text, text, text) to authenticated;

create or replace function public.cfdi_guardar_insumo(p_insumo_id uuid, p_de_patente boolean, p_clase text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  v_hay boolean;
begin
  if not coalesce(public.tiene_permiso('editar_datos_fiscales'), false) then
    raise exception 'Necesitas el permiso «Editar datos fiscales».';
  end if;
  if p_clase not in ('alimento_mascotas', 'otro_producto') then
    raise exception 'La clase de un producto es «alimento para mascotas» u «otro producto».';
  end if;
  if not exists (select 1 from public.insumos i where i.id = p_insumo_id and i.negocio_id = v_neg) then
    raise exception 'Ese producto no existe.';
  end if;
  select exists (select 1 from public.cfdi_insumo_fiscal f where f.negocio_id = v_neg and f.insumo_id = p_insumo_id and f.deleted_at is null) into v_hay;
  if v_hay then
    update public.cfdi_insumo_fiscal f set de_patente = coalesce(p_de_patente, false), clase = p_clase
    where f.negocio_id = v_neg and f.insumo_id = p_insumo_id and f.deleted_at is null;
  else
    insert into public.cfdi_insumo_fiscal (insumo_id, de_patente, clase) values (p_insumo_id, coalesce(p_de_patente, false), p_clase);
  end if;
  perform public.cfdi_log(null, null, 'producto_clasificado', jsonb_build_object('insumo_id', p_insumo_id, 'de_patente', coalesce(p_de_patente, false), 'clase', p_clase));
end;
$$;
alter function public.cfdi_guardar_insumo(uuid, boolean, text) owner to peludesk_definer;
revoke execute on function public.cfdi_guardar_insumo(uuid, boolean, text) from public, anon;
grant execute on function public.cfdi_guardar_insumo(uuid, boolean, text) to authenticated;

create or replace function public.cfdi_guardar_servicio(p_servicio_id uuid, p_clase text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  v_hay boolean;
begin
  if not coalesce(public.tiene_permiso('editar_datos_fiscales'), false) then
    raise exception 'Necesitas el permiso «Editar datos fiscales».';
  end if;
  if not exists (select 1 from public.servicios s where s.id = p_servicio_id and s.negocio_id = v_neg) then
    raise exception 'Ese servicio no existe.';
  end if;
  if p_clase is null or p_clase = '' then
    update public.cfdi_servicio_fiscal f set deleted_at = now() where f.negocio_id = v_neg and f.servicio_id = p_servicio_id and f.deleted_at is null;
  else
    select exists (select 1 from public.cfdi_servicio_fiscal f where f.negocio_id = v_neg and f.servicio_id = p_servicio_id and f.deleted_at is null) into v_hay;
    if v_hay then
      update public.cfdi_servicio_fiscal f set clase = p_clase where f.negocio_id = v_neg and f.servicio_id = p_servicio_id and f.deleted_at is null;
    else
      insert into public.cfdi_servicio_fiscal (servicio_id, clase) values (p_servicio_id, p_clase);
    end if;
  end if;
  perform public.cfdi_log(null, null, 'servicio_clasificado', jsonb_build_object('servicio_id', p_servicio_id, 'clase', p_clase));
end;
$$;
alter function public.cfdi_guardar_servicio(uuid, text) owner to peludesk_definer;
revoke execute on function public.cfdi_guardar_servicio(uuid, text) from public, anon;
grant execute on function public.cfdi_guardar_servicio(uuid, text) to authenticated;

-- ── 6. Preparar una factura (borrador con sus conceptos) ─────────────────────
create or replace function public.cfdi_preparar_cobros(p_cobro_ids uuid[], p_receptor jsonb default null, p_sustituye uuid default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_neg uuid := public.negocio_actual();
  g public.cfdi_config_negocio%rowtype;
  v_hay boolean;
  v_cliente uuid;
  v_clientes uuid[];
  v_receptor jsonb;
  v_df public.cfdi_datos_fiscales%rowtype;
  v_fac uuid;
  v_cid uuid;
  v_forma text;
  v_ord int := 0;
  l record;
  rg record;
  v_base numeric;
  v_iva numeric;
  v_total numeric := 0;
  v_subtotal numeric := 0;
  v_imp jsonb := '{}'::jsonb;
  v_clave text;
  v_t record;
  v_viejo public.cfdi_facturas%rowtype;
begin
  if not coalesce(public.tiene_permiso('facturar'), false) then
    raise exception 'Necesitas el permiso «Facturar».';
  end if;
  if p_cobro_ids is null or cardinality(p_cobro_ids) = 0 then
    raise exception 'Escoge al menos un cobro.';
  end if;
  select * into g from public.cfdi_config_negocio x where x.negocio_id = v_neg and x.deleted_at is null;
  v_hay := found;
  if not v_hay or not g.activa then
    raise exception 'La facturación no está activa. Un admin la configura en Administración → Facturación.';
  end if;
  if g.rfc is null or g.regimen_fiscal is null or g.cp_expedicion is null then
    raise exception 'Faltan los datos fiscales del negocio (RFC, régimen y código postal). Se capturan en Administración → Facturación.';
  end if;
  if (select u.agotado from public.cfdi_timbres_mes() u) then
    raise exception 'Se acabaron los timbres de este mes. PeluDesk puede ampliar el tope: escríbenos.';
  end if;

  select array_agg(distinct r.cliente_id) into v_clientes
  from public.cobros c join public.reservas r on r.id = c.reserva_id
  where c.id = any (p_cobro_ids) and c.negocio_id = v_neg and c.deleted_at is null;
  if v_clientes is null or cardinality(v_clientes) <> 1 or (select count(*) from public.cobros c where c.id = any (p_cobro_ids) and c.negocio_id = v_neg and c.deleted_at is null) <> cardinality(p_cobro_ids) then
    raise exception 'Los cobros tienen que existir y ser del mismo cliente.';
  end if;
  v_cliente := v_clientes[1];
  if exists (select 1 from public.cobros c where c.id = any (p_cobro_ids) and c.anulado_at is not null) then
    raise exception 'Uno de los cobros está anulado: no se factura.';
  end if;
  if p_sustituye is not null then
    select * into v_viejo from public.cfdi_facturas f where f.id = p_sustituye and f.negocio_id = v_neg and f.deleted_at is null;
    if not found or v_viejo.estado <> 'vigente' then
      raise exception 'Solo se sustituye una factura vigente.';
    end if;
  end if;
  if exists (
    select 1 from public.cfdi_factura_cobros fc
    where fc.cobro_id = any (p_cobro_ids) and fc.vigente and fc.deleted_at is null
      and fc.factura_id is distinct from p_sustituye
  ) then
    raise exception 'Alguno de esos cobros ya tiene una factura. Cancélala primero si hay que rehacerla.';
  end if;

  if p_receptor is not null then
    v_receptor := public.cfdi_validar_receptor(p_receptor ->> 'rfc', p_receptor ->> 'nombre_fiscal', p_receptor ->> 'cp', p_receptor ->> 'regimen_fiscal', p_receptor ->> 'uso_cfdi');
    v_receptor := v_receptor || jsonb_build_object('email', nullif(btrim(coalesce(p_receptor ->> 'email', '')), ''));
  else
    select * into v_df from public.cfdi_datos_fiscales d where d.cliente_id = v_cliente and d.negocio_id = v_neg and d.deleted_at is null;
    if not found then
      raise exception 'Este cliente no tiene datos fiscales. Captúralos en su ficha (RFC, nombre, código postal, régimen y uso del CFDI).';
    end if;
    v_receptor := public.cfdi_validar_receptor(v_df.rfc, v_df.nombre_fiscal, v_df.cp, v_df.regimen_fiscal, v_df.uso_cfdi)
                  || jsonb_build_object('email', v_df.email);
  end if;

  -- forma de pago: la del método con más monto
  select case m.metodo when 'efectivo' then '01' when 'transferencia' then '03' else '04' end into v_forma
  from public.cobro_metodos m where m.cobro_id = any (p_cobro_ids) and m.deleted_at is null
  group by m.metodo order by sum(m.monto) desc limit 1;

  insert into public.cfdi_facturas (tipo, cliente_id, emisor, receptor, serie, pac, pac_modo, forma_pago, uso_cfdi, relacion_tipo, relacionada_a)
  values ('ingreso', v_cliente,
    jsonb_build_object('rfc', g.rfc, 'nombre', g.razon_social),
    v_receptor, g.serie, g.pac, g.modo, coalesce(v_forma, '99'), v_receptor ->> 'uso',
    case when p_sustituye is not null then '04' end, p_sustituye)
  returning id into v_fac;

  foreach v_cid in array p_cobro_ids loop
    for l in select * from public.cfdi_lineas_cobro(v_cid) loop
      select * into rg from public.cfdi_regla_clase(l.clase);
      v_ord := v_ord + 1;
      if rg.tratamiento = 'exento' or rg.tasa = 0 then
        v_base := l.importe;
        v_iva := 0;
      else
        v_base := round(l.importe / (1 + rg.tasa), 2);
        v_iva := round(v_base * rg.tasa, 2);
      end if;
      v_clave := rg.clave_prod_serv;
      insert into public.cfdi_conceptos (factura_id, orden, descripcion, clase, clave_prod_serv, clave_unidad, unidad, cantidad, valor_unitario,
                                         importe, exento, tasa, iva, importe_con_iva)
      values (v_fac, v_ord, l.descripcion, l.clase, v_clave, rg.clave_unidad, rg.unidad,
              l.cantidad, case when l.cantidad = 1 then v_base else round(v_base / l.cantidad, 6) end,
              v_base, rg.tratamiento = 'exento', case when rg.tratamiento = 'exento' then 0 else rg.tasa end, v_iva, l.importe);
      v_subtotal := v_subtotal + v_base;
      v_total := v_total + v_base + v_iva;
    end loop;
    insert into public.cfdi_factura_cobros (factura_id, cobro_id, monto, es_sustitucion)
    select v_fac, v_cid, (select coalesce(sum(m.monto), 0) from public.cobro_metodos m where m.cobro_id = v_cid and m.deleted_at is null)
                         - (select coalesce(sum(dm.monto), 0) from public.devolucion_metodos dm join public.devoluciones d on d.id = dm.devolucion_id where d.cobro_id = v_cid),
           p_sustituye is not null;
  end loop;
  if v_ord = 0 then
    raise exception 'Esos cobros no tienen nada por facturar.';
  end if;

  for v_t in select c.tasa, c.exento, sum(c.importe) as base, sum(c.iva) as iva from public.cfdi_conceptos c where c.factura_id = v_fac group by c.tasa, c.exento loop
    v_imp := v_imp || jsonb_build_object(case when v_t.exento then 'exento' else to_char(v_t.tasa * 100, 'FM990.##') end,
                                          jsonb_build_object('base', v_t.base, 'iva', v_t.iva));
  end loop;
  update public.cfdi_facturas set subtotal = v_subtotal, impuestos = v_imp, total = v_total,
    total_esperado = (select coalesce(sum(fc.monto), 0) from public.cfdi_factura_cobros fc where fc.factura_id = v_fac)
  where id = v_fac;
  perform public.cfdi_log(v_fac, v_cliente, 'preparada', jsonb_build_object('cobros', to_jsonb(p_cobro_ids), 'total', v_total, 'sustituye', p_sustituye));
  return v_fac;
end;
$$;
alter function public.cfdi_preparar_cobros(uuid[], jsonb, uuid) owner to peludesk_definer;
revoke execute on function public.cfdi_preparar_cobros(uuid[], jsonb, uuid) from public, anon;
grant execute on function public.cfdi_preparar_cobros(uuid[], jsonb, uuid) to authenticated;
