-- Campo Digital v2 — Etapa 3: valores iniciales de parametros
--
-- Listas globales y simples para los selects de la app. Se escriben solo por migración.

begin;

insert into public.parametros (clave, valor, orden)
select 'departamentos', d.valor, d.orden::int
from unnest(array[
  'Artigas', 'Canelones', 'Cerro Largo', 'Colonia', 'Durazno', 'Flores', 'Florida',
  'Lavalleja', 'Maldonado', 'Montevideo', 'Paysandú', 'Río Negro', 'Rivera', 'Rocha',
  'Salto', 'San José', 'Soriano', 'Tacuarembó', 'Treinta y Tres'
]) with ordinality as d(valor, orden);

insert into public.parametros (clave, valor, orden)
select 'tipos_pastura', p.valor, p.orden::int
from unnest(array[
  'Campo natural', 'Campo natural mejorado', 'Pradera', 'Verdeo de invierno', 'Verdeo de verano'
]) with ordinality as p(valor, orden);

insert into public.parametros (clave, valor, orden)
select 'uso_potrero', u.valor, u.orden::int
from unnest(array['Ganadería', 'Forestación', 'Reserva', 'Sin uso']) with ordinality as u(valor, orden);

commit;
