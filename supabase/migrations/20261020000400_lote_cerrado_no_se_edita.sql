-- Campo Digital v2 — Un lote cerrado no se edita
--
-- Hasta ahora la política lotes_update solo exigía poder cargar (puede_operar): un operador podía
-- cambiar nombre, notas, años de nacimiento o potrero de un lote cerrado con un UPDATE directo.
-- La app ya lo impedía (Editar solo con lote abierto); desde acá lo impide la base.
--
-- Por qué en la política y no con un trigger:
--   * Los únicos UPDATE directos sobre lotes son los de la app (rol authenticated), y solo sobre las
--     columnas con permiso: nombre, notas, anios_nacimiento y potrero_id. Esos son justo los que hay
--     que frenar, y la política es el lugar donde ya se decide quién puede editar.
--   * Las funciones que escriben en lotes (cerrar_lote, reabrir_lote, _cerrar_si_vacio, dividir_lote,
--     unir_lotes, anular_actividad, crear_lote, registrar_compra, registrar_paricion...) son
--     security definer: corren como el dueño de la tabla, y el dueño no está sujeto a RLS (lotes no
--     tiene FORCE ROW LEVEL SECURITY). No dependen de esta política y siguen igual.
--   * Un trigger correría también dentro de esas funciones: habría que distinguir reabrir (cambia el
--     estado) de editar, y cualquier función futura que toque un lote cerrado tendría que tenerlo en
--     cuenta. Más reglas, más riesgo, mismo resultado para el usuario.
--
-- Lo que cambia para la app: editar un lote cerrado no da error, afecta 0 filas (como todo lo que
-- filtra el RLS). editarLote ya trata 0 filas como rechazo (exigirFilas).
--
-- WITH CHECK repite la condición por simetría: el usuario no puede cambiar el estado (no tiene
-- permiso de columna), así que la fila nueva siempre conserva el estado de la vieja.

alter policy lotes_update on public.lotes
  using      (public.puede_operar(establecimiento_id) and estado = 'activo')
  with check (public.puede_operar(establecimiento_id) and estado = 'activo');
