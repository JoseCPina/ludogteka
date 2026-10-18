-- QA N24 (17 de octubre de 2026): en Empleados › ficha › «Cuenta en la app (opcional)» salía el correo de la cuenta
-- en vez del nombre. cuentas_para_empleado() devolvía profiles.nombre_completo (vacío en cuentas creadas sin nombre)
-- y la pantalla caía al correo. Ahora devuelve nombre_de_persona(): la ficha de empleado de ESTE negocio, luego la
-- cuenta, o NULL (la pantalla lo marca «Sin nombre (correo)», nunca como si el correo fuera el nombre).
do $$
declare v_def text;
begin
  select replace(pg_get_functiondef('public.cuentas_para_empleado()'::regprocedure), chr(13), '') into v_def;
  if position('nombre_de_persona' in v_def) = 0 then
    v_def := replace(v_def, 'select p.id, p.nombre_completo, m.rol, u.email::text,', 'select p.id, public.nombre_de_persona(p.id, null), m.rol, u.email::text,');
    v_def := replace(v_def, 'order by p.nombre_completo nulls last, u.email;', 'order by public.nombre_de_persona(p.id, null) nulls last, u.email;');
    if position('nombre_de_persona' in v_def) = 0 then raise exception 'cuentas_para_empleado cambió: no se pudo poner nombre_de_persona.'; end if;
    execute v_def;
  end if;
end $$;
