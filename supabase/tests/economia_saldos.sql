  -- Campo Digital v2 — Pruebas de economía: pagadores, saldos entre titulares, liquidaciones y datos de factura
  --
  -- CÓMO CORRERLO
  --   1. Con todas las migraciones aplicadas (hasta 20261027000200_factura_en_el_movimiento: la factura se escribe en
--      cada movimiento, sin catálogo de razones sociales).
  --   2. Pegar el script completo en el SQL Editor de Supabase y ejecutarlo (o node correr-pruebas.mjs saldos).
  --   3. TERMINA CON UN ERROR A PROPÓSITO: "PRUEBAS ECONOMÍA (SALDOS): N OK, ...", que deshace todo.
  --      El resultado esperado es "52 OK, 0 FALLA, 0 OMITIDAS, 0 PREPARACIONES FALLIDAS".
  --      Si una preparación falla (PREP), las pruebas que dependen de ella salen como OMITIDA.
  --
  -- La sección 4 es el ejemplo del diseño (contexto/DISENO-ECONOMIA-SALDOS.md): al final, Juan le debe
  -- USD 5.700 a Hermanos y USD 800 a Madre.
  -- Fechas relativas a hoy (fecha de Montevideo): "d-10" = hace 10 días.
  -- Usuarios de prueba (.test): A = administrador, O = operador y Q = consulta de Santa Remigia,
  -- X = operador de otro campo.

  begin;

  -- ════════════════════════════════════════════════════════════════════════════
  -- 0. Preparación (como administrador de la base)
  -- ════════════════════════════════════════════════════════════════════════════

  select set_config('test.rep', '', false);
  select set_config('test.u_admin',    'a0000000-0000-4000-8000-00000000000a', false);
  select set_config('test.u_operador', 'b0000000-0000-4000-8000-00000000000b', false);
  select set_config('test.u_consulta', 'c0000000-0000-4000-8000-00000000000c', false);
  select set_config('test.u_ajeno',    'd0000000-0000-4000-8000-00000000000d', false);

  insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
                          created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  select '00000000-0000-0000-0000-000000000000', current_setting('test.' || u.clave)::uuid,
        'authenticated', 'authenticated', u.email, '', now(), now(), now(), '{}'::jsonb, '{}'::jsonb
  from (values
    ('u_admin',    'admin@campodigital.test'),
    ('u_operador', 'operador@campodigital.test'),
    ('u_consulta', 'consulta@campodigital.test'),
    ('u_ajeno',    'ajeno@campodigital.test')
  ) as u(clave, email);

  insert into public.perfiles (id, email, nombre, es_admin)
  values
    (current_setting('test.u_admin')::uuid,    'admin@campodigital.test',    'Ana',    true),
    (current_setting('test.u_operador')::uuid, 'operador@campodigital.test', 'Oscar',  false),
    (current_setting('test.u_consulta')::uuid, 'consulta@campodigital.test', 'Quena',  false),
    (current_setting('test.u_ajeno')::uuid,    'ajeno@campodigital.test',    'Xavier', false)
  on conflict (id) do update set es_admin = excluded.es_admin, nombre = excluded.nombre;

  -- Esquema auxiliar de pruebas (desaparece con el rollback final)
  create schema pruebas;
  grant usage on schema pruebas to authenticated, anon;

  -- Registro de resultados. Cuatro tipos de línea:
  --   OK, FALLA, OMITIDA (depende de una preparación que falló) y PREP (preparación fallida: la causa raíz).
  create function pruebas.linea(p_tipo text, p text) returns void language plpgsql as $$
  begin
    perform set_config('test.rep', current_setting('test.rep') || E'\n' || rpad(p_tipo, 8) || p, false);
  end $$;

  create function pruebas.ok(p text)      returns void language sql as $$ select pruebas.linea('OK', p) $$;
  create function pruebas.falla(p text)   returns void language sql as $$ select pruebas.linea('FALLA', p) $$;
  create function pruebas.omitida(p text) returns void language sql as $$ select pruebas.linea('OMITIDA', p) $$;

  -- Id guardado durante la prueba. Si la preparación que lo crea falló (o nunca corrió),
  -- corta con el código propio ZZ001, que las pruebas registran como OMITIDA y no como FALLA.
  create function pruebas.id(p_clave text) returns uuid language plpgsql stable as $$
  declare
    v text := current_setting('test.' || p_clave, true);
  begin
    if v is null or v = '' or v = 'FALLIDA' then
      raise exception '%', p_clave using errcode = 'ZZ001';
    end if;
    return v::uuid;
  end $$;

  -- Fecha relativa a hoy
  create function pruebas.d(p_dias int) returns date language sql stable as $$
    select public.fecha_hoy() - p_dias
  $$;

  create function pruebas.como(p_clave text) returns void language plpgsql as $$
  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', current_setting('test.' || p_clave), 'role', 'authenticated')::text, true);
  end $$;

  -- Composición jsonb de una categoría: [{"categoria_id": ..., "cabezas": n}]
  create function pruebas.comp(p_cat text, p_cabezas int) returns jsonb language sql stable as $$
    select jsonb_build_array(jsonb_build_object('categoria_id', pruebas.id(p_cat), 'cabezas', p_cabezas))
  $$;

  -- Stock actual de una categoría en un lote (0 si no tiene)
  create function pruebas.stock(p_lote text, p_cat text) returns int language sql stable as $$
    select coalesce((select cabezas from public.v_stock_lote
                    where lote_id = pruebas.id(p_lote) and categoria_id = pruebas.id(p_cat)), 0)
  $$;

  create function pruebas.espera_error(p_nombre text, p_sql text, p_sqlstate text) returns void
  language plpgsql as $$
  begin
    begin
      execute p_sql;
    exception when others then
      if sqlstate = 'ZZ001' then
        perform pruebas.omitida(p_nombre || '  (depende de la preparación: ' || sqlerrm || ')');
      elsif sqlstate = p_sqlstate then
        perform pruebas.ok(p_nombre || '  [' || sqlstate || ']');
      else
        perform pruebas.falla(p_nombre || ': esperaba ' || p_sqlstate || ', dio ' || sqlstate || ' ' || sqlerrm);
      end if;
      return;
    end;
    perform pruebas.falla(p_nombre || ': NO dio error (esperaba ' || p_sqlstate || ')');
  end $$;

  create function pruebas.espera_ok(p_nombre text, p_sql text) returns void
  language plpgsql as $$
  begin
    execute p_sql;
    perform pruebas.ok(p_nombre);
  exception when others then
    if sqlstate = 'ZZ001' then
      perform pruebas.omitida(p_nombre || '  (depende de la preparación: ' || sqlerrm || ')');
    else
      perform pruebas.falla(p_nombre || ': error inesperado ' || sqlstate || ' ' || sqlerrm);
    end if;
  end $$;

  create function pruebas.espera_filas(p_nombre text, p_sql text, p_filas int) returns void
  language plpgsql as $$
  declare
    v_n int;
  begin
    execute p_sql;
    get diagnostics v_n = row_count;
    if v_n = p_filas then
      perform pruebas.ok(p_nombre || '  [' || v_n || ' filas]');
    else
      perform pruebas.falla(p_nombre || ': esperaba ' || p_filas || ' filas, afectó ' || v_n);
    end if;
  exception when others then
    if sqlstate = 'ZZ001' then
      perform pruebas.omitida(p_nombre || '  (depende de la preparación: ' || sqlerrm || ')');
    else
      perform pruebas.falla(p_nombre || ': error inesperado ' || sqlstate || ' ' || sqlerrm);
    end if;
  end $$;

  create function pruebas.espera_valor(p_nombre text, p_sql text, p_esperado text) returns void
  language plpgsql as $$
  declare
    v text;
  begin
    execute p_sql into v;
    if v is not distinct from p_esperado then
      perform pruebas.ok(p_nombre || '  [' || coalesce(v, 'null') || ']');
    else
      perform pruebas.falla(p_nombre || ': esperaba ' || coalesce(p_esperado, 'null') || ', dio ' || coalesce(v, 'null'));
    end if;
  exception when others then
    if sqlstate = 'ZZ001' then
      perform pruebas.omitida(p_nombre || '  (depende de la preparación: ' || sqlerrm || ')');
    else
      perform pruebas.falla(p_nombre || ': error inesperado ' || sqlstate || ' ' || sqlerrm);
    end if;
  end $$;

  -- Preparación que guarda un id en test.<clave>. Si falla, la clave queda FALLIDA:
  --   * si falló por su propia cuenta, es una causa raíz (PREP);
  --   * si falló porque dependía de otra preparación fallida, se registra como OMITIDA.
  create function pruebas.guardar(p_clave text, p_sql text) returns void
  language plpgsql as $$
  declare
    v text;
  begin
    execute p_sql into v;
    if v is null then
      raise exception 'la sentencia no devolvió ningún id' using errcode = 'P0002';
    end if;
    perform set_config('test.' || p_clave, v, false);
  exception when others then
    perform set_config('test.' || p_clave, 'FALLIDA', false);
    if sqlstate = 'ZZ001' then
      perform pruebas.omitida('preparación ' || p_clave || '  (depende de la preparación: ' || sqlerrm || ')');
    else
      perform pruebas.linea('PREP', p_clave || ': ' || sqlstate || ' ' || sqlerrm);
    end if;
  end $$;

  -- Preparación sin resultado (por ejemplo, un ajuste o una asignación de rol). Misma lógica:
  -- si falla, deja FALLIDA la clave indicada, para que lo que dependa de ella quede omitido.
  create function pruebas.preparar(p_clave text, p_sql text) returns void
  language plpgsql as $$
  begin
    execute p_sql;
  exception when others then
    perform set_config('test.' || p_clave, 'FALLIDA', false);
    if sqlstate = 'ZZ001' then
      perform pruebas.omitida('preparación ' || p_clave || '  (depende de la preparación: ' || sqlerrm || ')');
    else
      perform pruebas.linea('PREP', p_clave || ': ' || sqlstate || ' ' || sqlerrm);
    end if;
  end $$;

  -- Precio: {"monto", "moneda", "tipo_cambio", "estado"} más lo que se agregue (pagador, factura, etc.)
  create function pruebas.precio(p_monto numeric, p_moneda text, p_tc numeric, p_estado text, p_extra jsonb default '{}') returns jsonb
  language sql immutable as $$
    select jsonb_strip_nulls(jsonb_build_object('monto', p_monto, 'moneda', p_moneda, 'tipo_cambio', p_tc, 'estado', p_estado)) || p_extra
  $$;
  -- Parte de un titular en el reparto (en la moneda del movimiento)
  create function pruebas.tit(p_clave text, p_monto numeric) returns jsonb language sql stable as $$
    select jsonb_build_object('titular_id', pruebas.id(p_clave), 'monto', p_monto)
  $$;
  -- Movimiento manual de Santa Remigia, rubro General
  create function pruebas.mov(p_dias int, p_sentido text, p_concepto text, p_precio jsonb, p_titulares jsonb default null) returns uuid
  language sql as $$
    select public.registrar_movimiento(p_id => gen_random_uuid(), p_establecimiento_id => pruebas.id('est_a'), p_fecha => pruebas.d(p_dias),
      p_sentido => p_sentido, p_rubro_id => pruebas.id('r_general'), p_concepto_id => pruebas.id(p_concepto), p_precio => p_precio,
      p_titulares => p_titulares)
  $$;
  -- Lo que pasa a otro: 'pagador'/'titular' y la clave del id
  create function pruebas.liq(p_dias int, p_de_tipo text, p_de text, p_a_tipo text, p_a text, p_precio jsonb, p_id uuid default gen_random_uuid())
  returns uuid language sql as $$
    select public.registrar_liquidacion(p_id, pruebas.id('est_a'), pruebas.d(p_dias), p_de_tipo, pruebas.id(p_de), p_a_tipo, pruebas.id(p_a), p_precio)
  $$;
  -- Saldos de Santa Remigia como texto: "deudor>acreedor:monto"
  create function pruebas.saldos() returns text language sql stable as $$
    select coalesce(string_agg(deudor || '>' || acreedor || ':' || monto_usd, ' ' order by deudor, acreedor), 'sin saldos')
    from public.v_saldos where establecimiento_id = pruebas.id('est_a')
  $$;
  grant execute on all functions in schema pruebas to authenticated, anon;

  -- ════════════════════════════════════════════════════════════════════════════
  -- 1. Base (postgres)
  -- ════════════════════════════════════════════════════════════════════════════

  select pruebas.espera_valor('B01 Tablas nuevas con RLS; liquidaciones y preferencias solo lectura para authenticated; nada para anon',
    $q$ select (bool_and(c.relrowsecurity)
            and not has_table_privilege('authenticated', 'public.liquidaciones', 'insert')
            and not has_table_privilege('authenticated', 'public.liquidaciones', 'update')
            and not has_table_privilege('authenticated', 'public.preferencias_economia', 'insert')
            and not has_table_privilege('authenticated', 'public.preferencias_economia', 'update')
            and not has_table_privilege('anon', 'public.pagadores', 'select')
            and not has_table_privilege('anon', 'public.liquidaciones', 'select'))::text || '|' || count(*)
        from pg_class c where c.oid in ('public.pagadores'::regclass, 'public.liquidaciones'::regclass,
                                        'public.preferencias_economia'::regclass) $q$, 'true|3');
  select pruebas.espera_valor('B02 Funciones nuevas: search_path fijo, nada para anon; registrar y anular liquidación security definer para authenticated; las internas para nadie',
    $q$ select count(*) filter (where coalesce('search_path=""' = any (p.proconfig), false) and not has_function_privilege('anon', p.oid, 'execute')
                and has_function_privilege('authenticated', p.oid, 'execute') = (p.proname in ('registrar_liquidacion', 'anular_liquidacion'))
                and p.prosecdef = (p.proname in ('registrar_liquidacion', 'anular_liquidacion')))::text || '/' || count(*)
        from pg_proc p where p.pronamespace = 'public'::regnamespace
          and p.proname in ('registrar_liquidacion', 'anular_liquidacion', '_guardar_pago_y_factura', '_parte_de_saldo') $q$, '4/4');
  select pruebas.espera_valor('B03 Las tres vistas de saldos con security_invoker',
    $q$ select count(*)::text from pg_class c
        where c.oid in ('public.v_saldos_aportes'::regclass, 'public.v_saldos'::regclass, 'public.v_saldos_pendientes'::regclass)
          and 'security_invoker=true' = any (c.reloptions) $q$, '3');
  select pruebas.espera_valor('B04 Movimientos y reparto se leen con es_miembro (Consulta ve la plata, en modo lectura)',
    $q$ select (count(*) = 2 and bool_and(qual like '%es_miembro%'))::text from pg_policies
        where schemaname = 'public' and tablename in ('movimientos_economicos', 'movimiento_titulares') and cmd = 'SELECT' $q$, 'true');

  -- ════════════════════════════════════════════════════════════════════════════
  -- 2. Administrador: establecimientos, roles y titulares
  -- ════════════════════════════════════════════════════════════════════════════

  set local role authenticated;
  select pruebas.como('u_admin');
  select pruebas.guardar('est_a', $q$ select public.crear_establecimiento('Santa Remigia (prueba)', 'Durazno') $q$);
  select pruebas.guardar('est_x', $q$ select public.crear_establecimiento('Otro campo (prueba)', 'Salto') $q$);
  select pruebas.preparar('rol_u_operador', $q$ select public.asignar_rol(pruebas.id('u_operador'), pruebas.id('est_a'), 'operador') $q$);
  select pruebas.preparar('rol_u_consulta', $q$ select public.asignar_rol(pruebas.id('u_consulta'), pruebas.id('est_a'), 'consulta') $q$);
  select pruebas.preparar('rol_u_ajeno',    $q$ select public.asignar_rol(pruebas.id('u_ajeno'),    pruebas.id('est_x'), 'operador') $q$);
  select pruebas.guardar('r_general', $q$ select id from public.rubros where establecimiento_id = pruebas.id('est_a') and nombre = 'General' $q$);
  select pruebas.guardar('c_sanidad', $q$ select id from public.conceptos where establecimiento_id = pruebas.id('est_a') and nombre = 'Sanidad' $q$);
  select pruebas.guardar('c_venta',   $q$ select id from public.conceptos where establecimiento_id = pruebas.id('est_a') and nombre = 'Venta de ganado vacuno' $q$);
  select pruebas.guardar('c_otros',   $q$ select id from public.conceptos where establecimiento_id = pruebas.id('est_a') and nombre = 'Otros gastos' $q$);
  select pruebas.guardar('t_hermanos', $q$ insert into public.titulares (establecimiento_id, nombre) values (pruebas.id('est_a'), 'Hermanos') returning id $q$);
  select pruebas.guardar('t_madre',    $q$ insert into public.titulares (establecimiento_id, nombre) values (pruebas.id('est_a'), 'Madre') returning id $q$);
  select pruebas.guardar('t_juan',     $q$ insert into public.titulares (establecimiento_id, nombre) values (pruebas.id('est_a'), 'Juan') returning id $q$);
  select pruebas.guardar('t_x',        $q$ insert into public.titulares (establecimiento_id, nombre) values (pruebas.id('est_x'), 'Otro') returning id $q$);
  select pruebas.guardar('p_x',        $q$ insert into public.pagadores (establecimiento_id, nombre) values (pruebas.id('est_x'), 'Caja del otro campo') returning id $q$);
  select pruebas.guardar('p_baja',     $q$ insert into public.pagadores (establecimiento_id, nombre, activo) values (pruebas.id('est_a'), 'Cuenta vieja', false) returning id $q$);
  select pruebas.espera_valor('C01 Ya no hay catálogo de razones sociales: la factura se escribe en cada movimiento',
    $q$ select (to_regclass('public.razones_sociales') is null)::text $q$, 'true');

  -- ════════════════════════════════════════════════════════════════════════════
  -- 3. Operador: crea pagadores, pero no los edita ni los borra
  -- ════════════════════════════════════════════════════════════════════════════

  select pruebas.como('u_operador');
  select pruebas.guardar('p_juan',    $q$ insert into public.pagadores (establecimiento_id, nombre, titular_id)
        values (pruebas.id('est_a'), 'Juan', pruebas.id('t_juan')) returning id $q$);
  select pruebas.guardar('p_tarjeta', $q$ insert into public.pagadores (establecimiento_id, nombre, titular_id)
        values (pruebas.id('est_a'), 'Juan tarjeta', pruebas.id('t_juan')) returning id $q$);
  select pruebas.espera_valor('C02 El operador creó dos pagadores, los dos de Juan',
    $q$ select count(*)::text from public.pagadores where establecimiento_id = pruebas.id('est_a') and titular_id = pruebas.id('t_juan') $q$, '2');
  select pruebas.espera_filas('C03 El operador no edita un pagador: 0 filas',
    $q$ update public.pagadores set nombre = 'Juan editado' where id = pruebas.id('p_juan') $q$, 0);
  select pruebas.espera_filas('C04 El operador no borra un pagador: 0 filas',
    $q$ delete from public.pagadores where id = pruebas.id('p_tarjeta') $q$, 0);

  -- ════════════════════════════════════════════════════════════════════════════
  -- 4. El ejemplo del diseño (sección 4)
  -- ════════════════════════════════════════════════════════════════════════════
  -- 1. Gasto veterinaria USD 1.500: Hermanos 1.000 · Madre 500. Pagó Juan. Factura a nombre de Padre.
  -- 2. Ingreso UYU 400.000 a 40 (USD 10.000): Hermanos 268.000 (6.700) · Madre 132.000 (3.300). Cobró Juan.
  -- 3. Gasto USD 300, todo de Juan, pagado por Juan: no genera deuda.
  -- 4. Liquidación: Juan le pasa USD 2.000 a Madre.
  -- Además: g4 pendiente (no cuenta), g5 pagado sin pagador y g6 pagado sin reparto (los dos pendientes de saldo).

  select pruebas.guardar('g1', $q$ select pruebas.mov(10, 'egreso', 'c_sanidad',
        pruebas.precio(1500, 'USD', null, 'pagado', jsonb_build_object('pagador_id', pruebas.id('p_juan'),
          'factura_nombre', ' Padre ', 'factura_rut', '21.123456.0018', 'numero_comprobante', ' A-0001 ')),
        jsonb_build_array(pruebas.tit('t_hermanos', 1000), pruebas.tit('t_madre', 500))) $q$);
  select pruebas.guardar('i1', $q$ select pruebas.mov(8, 'ingreso', 'c_venta',
        pruebas.precio(400000, 'UYU', 40, 'pagado', jsonb_build_object('pagador_id', pruebas.id('p_juan'))),
        jsonb_build_array(pruebas.tit('t_hermanos', 268000), pruebas.tit('t_madre', 132000))) $q$);
  select pruebas.guardar('g3', $q$ select pruebas.mov(7, 'egreso', 'c_otros',
        pruebas.precio(300, 'USD', null, 'pagado', jsonb_build_object('pagador_id', pruebas.id('p_juan'))),
        jsonb_build_array(pruebas.tit('t_juan', 300))) $q$);
  select pruebas.guardar('g4', $q$ select pruebas.mov(6, 'egreso', 'c_otros',
        pruebas.precio(999, 'USD', null, 'pendiente', jsonb_build_object('pagador_id', pruebas.id('p_juan'))),
        jsonb_build_array(pruebas.tit('t_hermanos', 999))) $q$);
  select pruebas.guardar('g5', $q$ select pruebas.mov(6, 'egreso', 'c_otros', pruebas.precio(50, 'USD', null, 'pagado'),
        jsonb_build_array(pruebas.tit('t_hermanos', 50))) $q$);
  select pruebas.guardar('g6', $q$ select pruebas.mov(6, 'egreso', 'c_otros',
        pruebas.precio(70, 'USD', null, 'pagado', jsonb_build_object('pagador_id', pruebas.id('p_tarjeta')))) $q$);

  select pruebas.espera_valor('M01 El gasto guardó quién pagó, a nombre de quién es la factura, el RUT (solo dígitos) y el comprobante (sin espacios)',
    $q$ select (pagador_id = pruebas.id('p_juan'))::text || '|' || factura_nombre || '|' || factura_rut || '|' || numero_comprobante
        from public.movimientos_economicos where id = pruebas.id('g1') $q$, 'true|Padre|211234560018|A-0001');
  select pruebas.espera_valor('M02 Queda como último pagador del operador (el último que usó: Juan tarjeta)',
    $q$ select (ultimo_pagador_id = pruebas.id('p_tarjeta'))::text from public.preferencias_economia
        where user_id = pruebas.id('u_operador') and establecimiento_id = pruebas.id('est_a') $q$, 'true');
  select pruebas.espera_error('M03 Pagador de otro establecimiento',
    $q$ select pruebas.mov(1, 'egreso', 'c_otros', pruebas.precio(10, 'USD', null, 'pagado', jsonb_build_object('pagador_id', pruebas.id('p_x')))) $q$, '22023');
  select pruebas.espera_error('M04 Pagador dado de baja',
    $q$ select pruebas.mov(1, 'egreso', 'c_otros', pruebas.precio(10, 'USD', null, 'pagado', jsonb_build_object('pagador_id', pruebas.id('p_baja')))) $q$, '22023');
  select pruebas.espera_error('M05 RUT de la factura mal formado (no tiene 12 dígitos)',
    $q$ select pruebas.mov(1, 'egreso', 'c_otros', pruebas.precio(10, 'USD', null, 'pagado', jsonb_build_object('factura_rut', '1234'))) $q$, '22023');
  select pruebas.espera_error('M05b Comprobante de más de 50 caracteres',
    $q$ select pruebas.mov(1, 'egreso', 'c_otros', pruebas.precio(10, 'USD', null, 'pagado', jsonb_build_object('numero_comprobante', repeat('9', 51)))) $q$, '22023');

  -- ════════════════════════════════════════════════════════════════════════════
  -- 5. Liquidaciones
  -- ════════════════════════════════════════════════════════════════════════════

  select pruebas.guardar('res_antes', $q$ select coalesce(sum(case when sentido = 'ingreso' then monto_usd else -monto_usd end), 0)::text
        from public.v_resultado_detalle where establecimiento_id = pruebas.id('est_a') $q$);
  select set_config('test.l1', gen_random_uuid()::text, false);
  select pruebas.espera_valor('L01 Juan le pasa USD 2.000 a Madre (desde su pagador, que cuenta como el titular Juan)',
    $q$ select (pruebas.liq(5, 'pagador', 'p_juan', 'titular', 't_madre', pruebas.precio(2000, 'USD', null, null), pruebas.id('l1')) = pruebas.id('l1'))::text $q$, 'true');
  select pruebas.espera_valor('L02 Idempotente: el mismo envío no duplica',
    $q$ select (pruebas.liq(5, 'pagador', 'p_juan', 'titular', 't_madre', pruebas.precio(2000, 'USD', null, null), pruebas.id('l1')) = pruebas.id('l1'))::text
            || '|' || (select count(*) from public.liquidaciones where establecimiento_id = pruebas.id('est_a')) $q$, 'true|1');
  select pruebas.espera_error('L03 De Juan (pagador) a Juan (titular): es la misma persona',
    $q$ select pruebas.liq(5, 'pagador', 'p_juan', 'titular', 't_juan', pruebas.precio(10, 'USD', null, null)) $q$, '22023');
  select pruebas.espera_error('L04 A un titular de otro establecimiento',
    $q$ select pruebas.liq(5, 'titular', 't_madre', 'titular', 't_x', pruebas.precio(10, 'USD', null, null)) $q$, '22023');
  select pruebas.espera_error('L05 Con fecha futura',
    $q$ select pruebas.liq(-1, 'titular', 't_madre', 'titular', 't_hermanos', pruebas.precio(10, 'USD', null, null)) $q$, '22023');
  select pruebas.espera_error('L06 En pesos sin tipo de cambio',
    $q$ select pruebas.liq(5, 'titular', 't_madre', 'titular', 't_hermanos', pruebas.precio(4000, 'UYU', null, null)) $q$, '22023');
  select pruebas.guardar('l2', $q$ select pruebas.liq(4, 'titular', 't_madre', 'titular', 't_hermanos', pruebas.precio(4000, 'UYU', 40, null)) $q$);
  select pruebas.espera_valor('L07 En pesos: UYU 4.000 a 40 = USD 100, con tipo de cambio manual',
    $q$ select monto_usd || '|' || tipo_cambio_fuente from public.liquidaciones where id = pruebas.id('l2') $q$, '100.00|manual');
  select pruebas.espera_error('L08 Anular sin motivo',
    $q$ select public.anular_liquidacion(pruebas.id('l2'), ' ') $q$, '22023');
  select pruebas.espera_ok('L09 Anular la de pesos',
    $q$ select public.anular_liquidacion(pruebas.id('l2'), 'Cargada para probar') $q$);
  select pruebas.espera_error('L10 Ya anulada',
    $q$ select public.anular_liquidacion(pruebas.id('l2'), 'Otra vez') $q$, '22023');
  select pruebas.espera_error('L11 Una liquidación no se borra',
    $q$ delete from public.liquidaciones where id = pruebas.id('l1') $q$, '42501');

  -- ════════════════════════════════════════════════════════════════════════════
  -- 6. Saldos
  -- ════════════════════════════════════════════════════════════════════════════

  select pruebas.espera_valor('S01 Saldos compensados: Juan le debe 5.700 a Hermanos (6.700 − 1.000) y 800 a Madre (3.300 − 500 − 2.000)',
    $q$ select pruebas.saldos() $q$, 'Juan>Hermanos:5700.00 Juan>Madre:800.00');
  select pruebas.espera_valor('S02 El par Madre y Juan se compone de 500 (gasto), 3.300 (ingreso) y 2.000 (liquidación)',
    $q$ select string_agg(origen || ':' || monto_usd, ' ' order by monto_usd) from public.v_saldos_aportes
        where establecimiento_id = pruebas.id('est_a') and pruebas.id('t_madre') in (deudor_id, acreedor_id) $q$,
    'movimiento:500.00 liquidacion:2000.00 movimiento:3300.00');
  select pruebas.espera_valor('S03 Ni el gasto de Juan pagado por Juan ni el pendiente generan deuda',
    $q$ select count(*)::text from public.v_saldos_aportes where origen_id in (pruebas.id('g3'), pruebas.id('g4')) $q$, '0');
  select pruebas.espera_valor('S04 La liquidación anulada no cuenta',
    $q$ select count(*)::text from public.v_saldos_aportes where origen_id = pruebas.id('l2') $q$, '0');
  select pruebas.espera_valor('S05 Pendientes de saldo: el pagado sin pagador (50) y el pagado sin reparto (70)',
    $q$ select string_agg(monto_usd || ':' || falta_pagador || '/' || falta_reparto, ' ' order by monto_usd)
        from public.v_saldos_pendientes where establecimiento_id = pruebas.id('est_a') $q$, '50.00:true/false 70.00:false/true');
  select pruebas.espera_valor('S06 Las liquidaciones no cambian el resultado',
    $q$ select (coalesce(sum(case when sentido = 'ingreso' then monto_usd else -monto_usd end), 0)::text = current_setting('test.res_antes'))::text
        from public.v_resultado_detalle where establecimiento_id = pruebas.id('est_a') $q$, 'true');
  select pruebas.espera_valor('S07 Resultado por titular (lo da el reparto): Hermanos +4.651, Juan −300, Madre +2.800',
    $q$ select string_agg(titular || ':' || r, ' ' order by titular) from (
          select titular, sum(case when sentido = 'ingreso' then monto_usd else -monto_usd end) as r
          from public.v_resultado_detalle where establecimiento_id = pruebas.id('est_a') and titular is not null group by titular) x $q$,
    'Hermanos:4651.00 Juan:-300.00 Madre:2800.00');

  -- ════════════════════════════════════════════════════════════════════════════
  -- 7. Edición
  -- ════════════════════════════════════════════════════════════════════════════

  select pruebas.espera_ok('E01 Editar el gasto sin datos de factura: se le borran la razón social y el comprobante',
    $q$ select public.editar_movimiento(pruebas.id('g1'), pruebas.d(10), 'egreso', pruebas.id('r_general'), pruebas.id('c_sanidad'),
        pruebas.precio(1500, 'USD', null, 'pagado', jsonb_build_object('pagador_id', pruebas.id('p_juan'))), null, null,
        jsonb_build_array(pruebas.tit('t_hermanos', 1000), pruebas.tit('t_madre', 500))) $q$);
  select pruebas.espera_valor('E02 Sigue el pagador; sin factura ni comprobante; el saldo no cambia',
    $q$ select (m.pagador_id = pruebas.id('p_juan'))::text || '|' || coalesce(m.factura_nombre || m.factura_rut, 'sin factura') || '|'
            || coalesce(m.numero_comprobante, 'sin comprobante') || '|' || pruebas.saldos()
        from public.movimientos_economicos m where m.id = pruebas.id('g1') $q$,
    'true|sin factura|sin comprobante|Juan>Hermanos:5700.00 Juan>Madre:800.00');

  -- ════════════════════════════════════════════════════════════════════════════
  -- 8. Administrador: edita, da de baja y borra pagadores
  -- ════════════════════════════════════════════════════════════════════════════

  select pruebas.como('u_admin');
  select pruebas.espera_filas('A01 El administrador da de baja "Juan tarjeta"',
    $q$ update public.pagadores set activo = false where id = pruebas.id('p_tarjeta') $q$, 1);
  select pruebas.guardar('p_borrar', $q$ insert into public.pagadores (establecimiento_id, nombre) values (pruebas.id('est_a'), 'Sin uso') returning id $q$);
  select pruebas.espera_filas('A02 Borra un pagador que nadie usa',
    $q$ delete from public.pagadores where id = pruebas.id('p_borrar') $q$, 1);
  select pruebas.espera_error('A03 No borra uno que se usa en movimientos',
    $q$ delete from public.pagadores where id = pruebas.id('p_juan') $q$, '23503');

  select pruebas.como('u_operador');
  select pruebas.espera_ok('E03 Editar un movimiento que ya tenía un pagador dado de baja: se conserva',
    $q$ select public.editar_movimiento(pruebas.id('g6'), pruebas.d(6), 'egreso', pruebas.id('r_general'), pruebas.id('c_otros'),
        pruebas.precio(75, 'USD', null, 'pagado', jsonb_build_object('pagador_id', pruebas.id('p_tarjeta')))) $q$);
  select pruebas.espera_error('E04 ...pero no se le pone a otro movimiento',
    $q$ select public.editar_movimiento(pruebas.id('g5'), pruebas.d(6), 'egreso', pruebas.id('r_general'), pruebas.id('c_otros'),
        pruebas.precio(50, 'USD', null, 'pagado', jsonb_build_object('pagador_id', pruebas.id('p_tarjeta'))),
        null, null, jsonb_build_array(pruebas.tit('t_hermanos', 50))) $q$, '22023');

  -- ════════════════════════════════════════════════════════════════════════════
  -- 9. Permisos
  -- ════════════════════════════════════════════════════════════════════════════

  select pruebas.como('u_consulta');
  select pruebas.espera_valor('Q01 Consulta lee movimientos, reparto, liquidaciones, saldos y pendientes',
    $q$ select (select count(*) from public.movimientos_economicos where establecimiento_id = pruebas.id('est_a')) || '|'
            || (select count(*) from public.movimiento_titulares where establecimiento_id = pruebas.id('est_a')) || '|'
            || (select count(*) from public.liquidaciones where establecimiento_id = pruebas.id('est_a')) || '|'
            || pruebas.saldos() || '|'
            || (select count(*) from public.v_saldos_pendientes where establecimiento_id = pruebas.id('est_a')) $q$,
    '6|7|2|Juan>Hermanos:5700.00 Juan>Madre:800.00|2');
  select pruebas.espera_valor('Q02 Consulta no ve el último pagador de otro usuario',
    $q$ select count(*)::text from public.preferencias_economia $q$, '0');
  select pruebas.espera_error('Q03 Consulta no carga movimientos',
    $q$ select pruebas.mov(1, 'egreso', 'c_otros', pruebas.precio(10, 'USD', null, 'pagado')) $q$, '42501');
  select pruebas.espera_error('Q04 Consulta no registra liquidaciones',
    $q$ select pruebas.liq(1, 'titular', 't_madre', 'titular', 't_hermanos', pruebas.precio(10, 'USD', null, null)) $q$, '42501');
  select pruebas.espera_error('Q05 Consulta no anula liquidaciones',
    $q$ select public.anular_liquidacion(pruebas.id('l1'), 'Prueba') $q$, '42501');
  select pruebas.espera_error('Q06 Consulta no crea pagadores',
    $q$ insert into public.pagadores (establecimiento_id, nombre) values (pruebas.id('est_a'), 'Intruso') $q$, '42501');
  select pruebas.espera_error('Q07 Consulta no edita un movimiento directo (sin permiso de escritura)',
    $q$ update public.movimientos_economicos set concepto = 'Hackeado' where id = pruebas.id('g1') $q$, '42501');

  select pruebas.como('u_ajeno');
  select pruebas.espera_valor('X01 Otro establecimiento no ve los saldos ni las liquidaciones de Santa Remigia',
    $q$ select pruebas.saldos() || '|' || (select count(*) from public.liquidaciones where establecimiento_id = pruebas.id('est_a')) $q$, 'sin saldos|0');
  select pruebas.espera_error('X02 ...ni registra liquidaciones ahí',
    $q$ select pruebas.liq(1, 'titular', 't_madre', 'titular', 't_hermanos', pruebas.precio(10, 'USD', null, null)) $q$, '42501');

  reset role;
  set local role anon;
  select set_config('request.jwt.claims', '{"role":"anon"}', true);
  select pruebas.espera_error('N01 anon no lee saldos',
    $q$ select count(*) from public.v_saldos $q$, '42501');
  select pruebas.espera_error('N02 anon no lee liquidaciones',
    $q$ select count(*) from public.liquidaciones $q$, '42501');
  select pruebas.espera_error('N03 anon no lee pagadores',
    $q$ select count(*) from public.pagadores $q$, '42501');
  select pruebas.espera_error('N04 anon no registra liquidaciones',
    $q$ select pruebas.liq(1, 'titular', 't_madre', 'titular', 't_hermanos', pruebas.precio(10, 'USD', null, null)) $q$, '42501');

  reset role;

  -- ════════════════════════════════════════════════════════════════════════════
  -- 10. Reporte (error a propósito: deshace todo)
  -- ════════════════════════════════════════════════════════════════════════════

  do $$
  declare
    v_rep      text := current_setting('test.rep');
    v_ok       int  := (select count(*) from regexp_matches(v_rep, E'\nOK ', 'g'));
    v_falla    int  := (select count(*) from regexp_matches(v_rep, E'\nFALLA ', 'g'));
    v_omitida  int  := (select count(*) from regexp_matches(v_rep, E'\nOMITIDA ', 'g'));
    v_prep     int  := (select count(*) from regexp_matches(v_rep, E'\nPREP ', 'g'));
    v_raices   text := coalesce((select string_agg(m[1], E'\n') from regexp_matches(v_rep, E'\n(PREP [^\n]*)', 'g') m), '(ninguna)');
  begin
    raise exception E'PRUEBAS ECONOMÍA (SALDOS): % OK, % FALLA, % OMITIDAS, % PREPARACIONES FALLIDAS (este error es a propósito: deshace todos los datos de prueba)\n\nPreparaciones fallidas (causa raíz de las omitidas):\n%\n\nDetalle:%',
      v_ok, v_falla, v_omitida, v_prep, v_raices, v_rep;
  end $$;
