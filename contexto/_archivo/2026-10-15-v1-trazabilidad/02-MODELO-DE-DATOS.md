# Campo Digital - Modelo de Datos

## Estructura general

Base de datos PostgreSQL en Supabase. 17 tablas normalizadas con foreign keys, constraints y triggers. Una sola base de datos para todos los establecimientos (multi-establecimiento por diseño desde el inicio).

## Convenciones generales

- Todos los IDs son `BIGSERIAL` (autoincremental, generado por la base de datos)
- Todas las tablas tienen `created_at` y `updated_at` (actualizado automáticamente por trigger)
- Todas las tablas principales tienen `user_id UUID` para futuro multi-usuario (actualmente sin RLS)
- Nunca se borran registros - se desactivan con `estado = 'inactivo'` o `estado = 'vendido'` etc.
- Los selects de la app se alimentan dinámicamente desde la tabla `parametros`

---

## Tablas

### 1. parametros
Alimenta todos los selects de la app. Se edita directo en Supabase sin tocar código.

| Campo | Tipo | Descripción |
|-------|------|-------------|
| id | BIGSERIAL PK | |
| clave | TEXT | Ej: 'categorias_ganado' |
| valor | TEXT | Ej: 'Ternero' |
| orden | INTEGER | Orden de aparición en el select |
| activo | BOOLEAN | |
| created_at | TIMESTAMPTZ | |

**Claves disponibles**: categorias_ganado, razas, departamentos, tipos_movimiento_ganado, tipos_evento_sanitario, tipos_evento_reproductivo, tipos_labor, cultivos, categorias_insumos, tipos_maquinaria, rubros_ingreso, rubros_egreso, tipos_pastura, uso_subdivision, vias_aplicacion, formas_pago, roles_personal

---

### 2. establecimientos
Datos maestros de cada campo.

| Campo | Tipo | Oblig. | Descripción |
|-------|------|:------:|-------------|
| id | BIGSERIAL PK | sí | |
| user_id | UUID | no | Futuro multi-usuario |
| nombre | TEXT | sí | Único por user_id |
| departamento | TEXT | sí | |
| localidad | TEXT | no | |
| superficie_total | NUMERIC(10,2) | sí | Ha - debe ser > 0 |
| tipo | TEXT | sí | Ganadero / Agrícola / Mixto |
| propietario | TEXT | no | |
| rut | TEXT | no | |
| dicose | TEXT | no | Formato XX.XXX.XXX |
| fecha_alta | DATE | sí | Default: hoy |
| estado | TEXT | sí | activo / inactivo |
| observaciones | TEXT | no | |

---

### 3. potreros
Divisiones permanentes del establecimiento (alambrado fijo).

| Campo | Tipo | Oblig. | Descripción |
|-------|------|:------:|-------------|
| id | BIGSERIAL PK | sí | |
| user_id | UUID | no | |
| establecimiento_id | BIGINT FK | sí | → establecimientos |
| nombre | TEXT | sí | |
| superficie | NUMERIC(10,2) | sí | Ha - debe ser > 0 |
| uso_actual | TEXT | sí | Ganadería / Agricultura / Mixto / Reserva / Sin uso |
| tipo_pastura | TEXT | no | |
| aguada | BOOLEAN | no | |
| sombra | BOOLEAN | no | |
| estado | TEXT | sí | activo / inactivo |
| observaciones | TEXT | no | |

**Validación**: suma de superficies de potreros activos ≤ superficie del establecimiento → advierte (trigger)

---

### 4. parcelas
Subdivisiones opcionales dentro de un potrero (ej: eléctrico).

| Campo | Tipo | Oblig. | Descripción |
|-------|------|:------:|-------------|
| id | BIGSERIAL PK | sí | |
| user_id | UUID | no | |
| establecimiento_id | BIGINT FK | sí | → establecimientos |
| potrero_id | BIGINT FK | sí | → potreros |
| nombre | TEXT | sí | |
| superficie | NUMERIC(10,2) | sí | Ha - debe ser > 0 |
| uso_actual | TEXT | sí | Ganadería / Agricultura / Mixto / Reserva / Sin uso |
| tipo_pastura | TEXT | no | |
| estado | TEXT | sí | activo / inactivo |
| observaciones | TEXT | no | |

**Validación**: suma de superficies de parcelas activas ≤ superficie del potrero → advierte (trigger)

---

### 5. animales
Registro individual de cada animal. Un animal = una caravana SNIG.

| Campo | Tipo | Oblig. | Descripción |
|-------|------|:------:|-------------|
| id | BIGSERIAL PK | sí | |
| user_id | UUID | no | |
| establecimiento_id | BIGINT FK | sí | → establecimientos |
| caravana_snig | TEXT | sí | Único por establecimiento |
| caravana_propia | TEXT | no | Numeración interna |
| categoria | TEXT | sí | (desde parametros) |
| sexo | TEXT | sí | Macho / Hembra |
| raza | TEXT | no | |
| fecha_nacimiento | DATE | no | |
| madre_id | BIGINT FK | no | → animales |
| potrero_actual | BIGINT FK | no | → potreros (exclusivo con parcela_actual) |
| parcela_actual | BIGINT FK | no | → parcelas (exclusivo con potrero_actual) |
| peso_entrada | NUMERIC(8,2) | no | |
| fecha_peso_entrada | DATE | no | |
| origen | TEXT | no | Propio / Comprado / Nacido en campo |
| movimiento_origen_id | BIGINT | no | FK → movimientos_ganado |
| estado | TEXT | sí | activo / vendido / muerto / transferido |
| fecha_baja | DATE | no | Obligatorio si estado ≠ activo |
| observaciones | TEXT | no | |

**Reglas**:
- `potrero_actual` y `parcela_actual` son mutuamente excluyentes (constraint)
- Al dar de baja (vendido/muerto/transferido), `fecha_baja` es obligatoria y la ubicación se limpia (trigger)
- `caravana_snig` es única por establecimiento (constraint)

---

### 6. movimientos_ganado
Cada evento que afecta el stock del rodeo. El stock actual se calcula sumando/restando estos movimientos.

| Campo | Tipo | Oblig. | Descripción |
|-------|------|:------:|-------------|
| id | BIGSERIAL PK | sí | |
| user_id | UUID | no | |
| establecimiento_id | BIGINT FK | sí | → establecimientos |
| fecha | DATE | sí | No puede ser futura |
| tipo_movimiento | TEXT | sí | Compra / Venta / Nacimiento / Muerte / Traslado / Ajuste |
| categoria | TEXT | sí | |
| cantidad | INTEGER | sí | Debe ser > 0 |
| peso_promedio | NUMERIC(8,2) | no | |
| peso_total | NUMERIC(10,2) | no | |
| origen_tipo | TEXT | no | potrero / parcela |
| origen_id | BIGINT | no | FK según origen_tipo |
| destino_tipo | TEXT | no | potrero / parcela |
| destino_id | BIGINT | no | FK según destino_tipo |
| precio_unitario | NUMERIC(10,2) | no | |
| precio_base | TEXT | no | Por cabeza / Por kg vivo / Por kg carcasa |
| precio_total | NUMERIC(12,2) | no | |
| contraparte | TEXT | no | Frigorífico, vendedor, etc. |
| remito | TEXT | no | |
| guia_dgt | TEXT | no | |
| finanza_id | BIGINT | no | FK → finanzas |
| observaciones | TEXT | no | |

**Validaciones en trigger**:
- Fecha no puede ser futura → bloquea
- Traslado: origen y destino obligatorios y distintos → bloquea
- Venta/Muerte: origen obligatorio → bloquea
- Compra/Nacimiento: destino obligatorio → bloquea
- Venta/Muerte/Traslado: stock disponible en origen ≥ cantidad → bloquea si no alcanza

**Cálculo de stock**:
```
Stock(ubicación, categoría) =
  + Compras/Nacimientos con destino = ubicación
  + Traslados entrantes
  + Ajustes positivos
  - Ventas/Muertes con origen = ubicación
  - Traslados salientes
  - Ajustes negativos
```

---

### 7. pesajes
Historial de pesajes individuales o por lote.

| Campo | Tipo | Oblig. | Descripción |
|-------|------|:------:|-------------|
| id | BIGSERIAL PK | sí | |
| user_id | UUID | no | |
| establecimiento_id | BIGINT FK | sí | → establecimientos |
| fecha | DATE | sí | |
| tipo | TEXT | sí | Individual / Lote |
| animal_id | BIGINT FK | no | → animales (obligatorio si tipo = Individual) |
| categoria | TEXT | no | Obligatorio si tipo = Lote |
| origen_tipo | TEXT | no | potrero / parcela |
| origen_id | BIGINT | no | |
| cantidad_cabezas | INTEGER | no | Obligatorio si tipo = Lote |
| peso_promedio | NUMERIC(8,2) | sí | Debe ser > 0 |
| condicion_corporal | NUMERIC(3,1) | no | Escala 1 a 5 |
| observaciones | TEXT | no | |

---

### 8. sanidad
Eventos sanitarios: vacunaciones, tratamientos, diagnósticos.

| Campo | Tipo | Oblig. | Descripción |
|-------|------|:------:|-------------|
| id | BIGSERIAL PK | sí | |
| user_id | UUID | no | |
| establecimiento_id | BIGINT FK | sí | → establecimientos |
| fecha | DATE | sí | |
| tipo_evento | TEXT | sí | Vacunación / Tratamiento / Diagnóstico / Revisación / Otro |
| animal_id | BIGINT FK | no | → animales (si es individual) |
| categoria | TEXT | no | Si es grupal |
| origen_tipo | TEXT | no | potrero / parcela |
| origen_id | BIGINT | no | |
| cantidad_cabezas | INTEGER | no | Si es grupal |
| producto | TEXT | sí | |
| dosis | TEXT | no | |
| via_aplicacion | TEXT | no | Subcutánea / Intramuscular / Oral / Pour-on / Baño |
| lote_producto | TEXT | no | Trazabilidad |
| vencimiento_producto | DATE | no | |
| dias_carencia | INTEGER | no | |
| fecha_liberacion | DATE | no | Calculado: fecha + dias_carencia |
| veterinario | TEXT | no | |
| costo_total | NUMERIC(10,2) | no | |
| insumo_id | BIGINT | no | FK → stock_insumos |
| observaciones | TEXT | no | |

---

### 9. reproduccion
Eventos reproductivos del rodeo.

| Campo | Tipo | Oblig. | Descripción |
|-------|------|:------:|-------------|
| id | BIGSERIAL PK | sí | |
| user_id | UUID | no | |
| establecimiento_id | BIGINT FK | sí | → establecimientos |
| fecha | DATE | sí | |
| tipo_evento | TEXT | sí | Servicio / IATF / Diagnóstico preñez / Parto / Destete |
| animal_id | BIGINT FK | no | → animales (vaca/madre) |
| origen_tipo | TEXT | no | potrero / parcela |
| origen_id | BIGINT | no | |
| cantidad_animales | INTEGER | no | Para eventos grupales |
| toro_id | BIGINT FK | no | → animales |
| resultado | TEXT | no | Preñada / Vacía / Parida / Destetado |
| cria_id | BIGINT FK | no | → animales (ternero nacido) |
| observaciones | TEXT | no | |

---

### 10. lotes_agricolas
Cultivos por zafra en cada potrero o parcela.

| Campo | Tipo | Oblig. | Descripción |
|-------|------|:------:|-------------|
| id | BIGSERIAL PK | sí | |
| user_id | UUID | no | |
| establecimiento_id | BIGINT FK | sí | → establecimientos |
| ubicacion_tipo | TEXT | sí | potrero / parcela |
| ubicacion_id | BIGINT | sí | FK según ubicacion_tipo |
| zafra | TEXT | sí | Ej: 2025/2026 |
| cultivo | TEXT | sí | |
| variedad | TEXT | no | |
| superficie_sembrada | NUMERIC(10,2) | sí | Ha - debe ser > 0 |
| fecha_siembra | DATE | no | |
| fecha_cosecha | DATE | no | |
| rendimiento_kgha | NUMERIC(10,2) | no | |
| produccion_total | NUMERIC(12,2) | no | |
| estado | TEXT | sí | En curso / Cosechado / Perdido / Cancelado |
| observaciones | TEXT | no | |

---

### 11. labores_agricolas
Intervenciones sobre un lote agrícola.

| Campo | Tipo | Oblig. | Descripción |
|-------|------|:------:|-------------|
| id | BIGSERIAL PK | sí | |
| user_id | UUID | no | |
| lote_id | BIGINT FK | sí | → lotes_agricolas |
| fecha | DATE | sí | |
| tipo_labor | TEXT | sí | Siembra / Fertilización / Herbicida / Insecticida / Fungicida / Cosecha / Laboreo / Otro |
| insumo | TEXT | no | |
| dosis_ha | TEXT | no | |
| superficie_aplicada | NUMERIC(10,2) | no | |
| costo_total | NUMERIC(10,2) | no | |
| costo_ha | NUMERIC(10,2) | no | |
| proveedor | TEXT | no | |
| insumo_id | BIGINT | no | FK → stock_insumos |
| maquinaria_id | BIGINT | no | FK → stock_maquinaria |
| observaciones | TEXT | no | |

---

### 12. stock_insumos
Inventario de insumos del establecimiento.

| Campo | Tipo | Oblig. | Descripción |
|-------|------|:------:|-------------|
| id | BIGSERIAL PK | sí | |
| user_id | UUID | no | |
| establecimiento_id | BIGINT FK | sí | → establecimientos |
| nombre | TEXT | sí | |
| categoria | TEXT | sí | Agroquímico / Fertilizante / Semilla / Veterinario / Combustible / Lubricante / Otro |
| unidad | TEXT | sí | kg / litros / unidades / bolsas |
| stock_minimo | NUMERIC(10,2) | no | Umbral de alerta |
| ubicacion | TEXT | no | Galpón, depósito, etc. |
| proveedor_habitual | TEXT | no | |
| precio_ultimo | NUMERIC(10,2) | no | |
| fecha_ultima_compra | DATE | no | |
| vencimiento | DATE | no | |
| estado | TEXT | sí | activo / inactivo |
| observaciones | TEXT | no | |

**Nota**: el stock actual se calcula desde `movimientos_insumos`, igual que el stock ganadero.

---

### 13. movimientos_insumos
Entradas y salidas del inventario de insumos.

| Campo | Tipo | Oblig. | Descripción |
|-------|------|:------:|-------------|
| id | BIGSERIAL PK | sí | |
| user_id | UUID | no | |
| insumo_id | BIGINT FK | sí | → stock_insumos |
| fecha | DATE | sí | |
| tipo | TEXT | sí | Entrada / Salida / Ajuste |
| cantidad | NUMERIC(10,2) | sí | Debe ser > 0 |
| motivo | TEXT | no | Compra / Uso en labor / Uso en sanidad / Vencido / Ajuste inventario |
| referencia_id | TEXT | no | ID del labor o sanidad que generó la salida |
| costo_unitario | NUMERIC(10,2) | no | |
| proveedor | TEXT | no | |
| observaciones | TEXT | no | |

**Validación**: salida no puede dejar stock < 0 → bloquea (validar en frontend)

---

### 14. stock_maquinaria
Inventario de maquinaria e implementos.

| Campo | Tipo | Oblig. | Descripción |
|-------|------|:------:|-------------|
| id | BIGSERIAL PK | sí | |
| user_id | UUID | no | |
| establecimiento_id | BIGINT FK | sí | → establecimientos |
| nombre | TEXT | sí | |
| tipo | TEXT | sí | Tractor / Cosechadora / Pulverizadora / Sembradora / Implemento / Vehículo / Otro |
| marca | TEXT | no | |
| modelo | TEXT | no | |
| año | INTEGER | no | |
| numero_serie | TEXT | no | |
| patente | TEXT | no | |
| horas_actuales | NUMERIC(10,2) | no | Horómetro |
| valor_estimado | NUMERIC(12,2) | no | USD |
| estado_operativo | TEXT | sí | Operativo / En reparación / Fuera de servicio |
| estado | TEXT | sí | activo / inactivo |
| observaciones | TEXT | no | |

---

### 15. mantenimiento_maquinaria
Historial de mantenimientos correctivos y preventivos.

| Campo | Tipo | Oblig. | Descripción |
|-------|------|:------:|-------------|
| id | BIGSERIAL PK | sí | |
| user_id | UUID | no | |
| maquinaria_id | BIGINT FK | sí | → stock_maquinaria |
| fecha | DATE | sí | |
| tipo | TEXT | sí | Preventivo / Correctivo / Revisión |
| descripcion | TEXT | sí | |
| horas_en_intervencion | NUMERIC(10,2) | no | |
| costo_repuestos | NUMERIC(10,2) | no | |
| costo_mano_obra | NUMERIC(10,2) | no | |
| costo_total | NUMERIC(10,2) | no | |
| taller | TEXT | no | |
| proximo_service_horas | NUMERIC(10,2) | no | |
| observaciones | TEXT | no | |

---

### 16. finanzas
Ingresos y egresos del establecimiento.

| Campo | Tipo | Oblig. | Descripción |
|-------|------|:------:|-------------|
| id | BIGSERIAL PK | sí | |
| user_id | UUID | no | |
| establecimiento_id | BIGINT FK | sí | → establecimientos |
| fecha | DATE | sí | |
| tipo | TEXT | sí | Ingreso / Egreso |
| rubro | TEXT | sí | (desde parametros) |
| concepto | TEXT | sí | |
| monto | NUMERIC(12,2) | sí | Debe ser > 0 |
| moneda_original | TEXT | no | USD / UYU |
| tipo_cambio | NUMERIC(8,2) | no | Si es UYU |
| forma_pago | TEXT | no | Efectivo / Transferencia / Cheque / Crédito |
| referencia_id | TEXT | no | ID del evento que lo generó |
| estado | TEXT | no | Pagado / Pendiente / Parcial |
| observaciones | TEXT | no | |

---

### 17. personal
Empleados y contratistas del establecimiento.

| Campo | Tipo | Oblig. | Descripción |
|-------|------|:------:|-------------|
| id | BIGSERIAL PK | sí | |
| user_id | UUID | no | |
| establecimiento_id | BIGINT FK | sí | → establecimientos |
| nombre | TEXT | sí | |
| tipo | TEXT | sí | Dependiente / Contratista / Transitorio |
| rol | TEXT | no | Capataz / Peón / Tractorista / Veterinario / Administrador / Otro |
| cedula | TEXT | no | |
| telefono | TEXT | no | |
| fecha_ingreso | DATE | no | |
| salario_base | NUMERIC(10,2) | no | USD/mes |
| estado | TEXT | sí | activo / inactivo |
| observaciones | TEXT | no | |

---

## Mapa de relaciones

```
establecimientos
  ├── potreros
  │     └── parcelas (opcional)
  │
  ├── animales (ubicados en potrero O parcela)
  │     ├── pesajes
  │     ├── sanidad
  │     └── reproduccion
  │
  ├── movimientos_ganado (opera sobre potrero O parcela)
  │
  ├── lotes_agricolas (en potrero O parcela)
  │     └── labores_agricolas
  │
  ├── stock_insumos
  │     └── movimientos_insumos
  │
  ├── stock_maquinaria
  │     └── mantenimiento_maquinaria
  │
  ├── personal
  └── finanzas
```

---

## Triggers activos en la base de datos

| Trigger | Tabla | Acción |
|---------|-------|--------|
| update_updated_at | todas | Actualiza updated_at en cada UPDATE |
| trg_validar_superficie_potreros | potreros | Advierte si suma supera superficie del establecimiento |
| trg_validar_superficie_parcelas | parcelas | Advierte si suma supera superficie del potrero |
| trg_validar_baja_animal | animales | Requiere fecha_baja y limpia ubicación al dar de baja |
| trg_validar_movimiento_ganado | movimientos_ganado | Valida stock, origen/destino, fecha no futura |
