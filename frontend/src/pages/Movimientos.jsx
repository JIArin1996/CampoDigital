/**
 * Movimientos.jsx — Módulo de registro y listado de movimientos de ganado
 */
import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { apiGet, apiPost } from '../services/api';
import { useParametros } from '../hooks/useParametros';
import { validarMovimiento } from '../utils/validators';
import { formatearFecha, formatearCabezas, formatearMoneda, colorTipoMovimiento } from '../utils/formatters';
import CampoFormulario, { claseInput } from '../components/shared/CampoFormulario';
import Spinner, { ErrorEstado, EstadoVacio } from '../components/shared/Spinner';

const HOY = new Date().toISOString().split('T')[0];

const FORM_INICIAL = {
  fecha:           HOY,
  tipo_movimiento: '',
  categoria:       '',
  cantidad:        '',
  peso_total:      '',
  potrero_origen:  '',
  potrero_destino: '',
  valor_total:     '',
  contraparte:     '',
  observaciones:   '',
};

// ─── Componente Principal ─────────────────────────────────────────────────

export default function Movimientos({ establecimientoId, mostrarToast }) {
  const { params, cargando: cargandoParams, error: errorParams } = useParametros();

  const [movimientos, setMovimientos] = useState([]);
  const [potreros, setPotreros] = useState([]); // Para los selects del formulario
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  const [modo, setModo] = useState('lista'); // 'lista' o 'formulario'
  // Filtros de la lista
  const [filtroTipo, setFiltroTipo] = useState('');
  const [filtroCat, setFiltroCat] = useState('');

  const cargarDatos = useCallback(async () => {
    if (!establecimientoId) return;
    setCargando(true);
    setError(null);
    try {
      // Cargar movimientos y potreros en paralelo
      const [resMov, resPot] = await Promise.all([
        apiGet('get_movimientos', { establecimiento_id: establecimientoId, limit: 50 }),
        apiGet('get_potreros', { establecimiento_id: establecimientoId })
      ]);
      
      if (resMov.success) setMovimientos(resMov.data);
      if (resPot.success) setPotreros(resPot.data);
      
    } catch (e) {
      setError('Error de conexión. Verificá tu acceso a internet.');
    } finally {
      setCargando(false);
    }
  }, [establecimientoId]);

  useEffect(() => {
    cargarDatos();
  }, [cargarDatos]);

  // Pantalla de bloqueo si no hay establecimiento
  if (!establecimientoId) {
    return (
      <EstadoVacio
        mensaje="Debés registrar tu establecimiento primero."
        accion="Registrar ahora"
        onAccion={() => window.location.hash = ''} // Delegado al Layout global
      />
    );
  }

  if (cargandoParams) return <Spinner mensaje="Cargando configuración..." />;
  if (errorParams) return <ErrorEstado mensaje={errorParams} />;

  const movimientosFiltrados = movimientos.filter(m => {
    if (filtroTipo && m.tipo_movimiento !== filtroTipo) return false;
    if (filtroCat && m.categoria !== filtroCat) return false;
    return true;
  });

  if (modo === 'formulario') {
    return (
      <FormularioMovimiento
        params={params}
        potreros={potreros}
        establecimientoId={establecimientoId}
        onGuardado={(nuevoMov) => {
          // Agregamos al principio y ordenamos por las dudas (el orden real lo da la BD, pero lo simulamos)
          setMovimientos(prev => [nuevoMov, ...prev]);
          setModo('lista');
        }}
        onCancelar={() => setModo('lista')}
        mostrarToast={mostrarToast}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 animate-page">
      {/* ── Encabezado ── */}
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Movimientos</h2>
          <p className="text-sm text-gray-500">Historial de tu rodeo</p>
        </div>
        <button
          onClick={() => setModo('formulario')}
          className="bg-[#1a7f4b] text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-sm
                     active:scale-95 transition-transform flex items-center gap-1"
        >
          <span className="text-lg leading-none">+</span> Nuevo
        </button>
      </div>

      {/* ── Filtros ── */}
      {movimientos.length > 0 && (
        <div className="flex gap-2">
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1a7f4b]"
          >
            <option value="">Todos los tipos</option>
            {params?.tipos_movimiento?.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <select
            value={filtroCat}
            onChange={(e) => setFiltroCat(e.target.value)}
            className="flex-1 rounded-lg border border-gray-300 px-3 py-2 text-sm bg-white focus:outline-none focus:border-[#1a7f4b]"
          >
            <option value="">Todas las categorías</option>
            {params?.categorias_ganado?.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      )}

      {/* ── Listado ── */}
      {cargando ? (
        <Spinner mensaje="Cargando historial..." />
      ) : error ? (
        <ErrorEstado mensaje={error} onReintentar={cargarDatos} />
      ) : movimientos.length === 0 ? (
        <EstadoVacio
          mensaje="No hay movimientos registrados aún."
          accion="+ Registrar movimiento"
          onAccion={() => setModo('formulario')}
        />
      ) : movimientosFiltrados.length === 0 ? (
        <EstadoVacio
          mensaje="Ningún movimiento coincide con los filtros."
          accion="Limpiar filtros"
          onAccion={() => { setFiltroTipo(''); setFiltroCat(''); }}
        />
      ) : (
        <div className="flex flex-col gap-3 pb-8">
          {movimientosFiltrados.map(mov => (
            <TarjetaMovimiento key={mov.id} mov={mov} potreros={potreros} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Componente: Tarjeta de Movimiento en la lista ────────────────────────

function TarjetaMovimiento({ mov, potreros }) {
  // Helpers para buscar los nombres de los potreros si existen
  const nombreOri = potreros.find(p => p.id === mov.potrero_origen)?.nombre;
  const nombreDes = potreros.find(p => p.id === mov.potrero_destino)?.nombre;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
      <div className="px-4 py-3 flex items-start gap-4">
        {/* Cabezas (destacado) */}
        <div className="flex flex-col items-center justify-center min-w-[3.5rem]">
          <span className="text-2xl font-bold text-[#1a7f4b]">
            {formatearCabezas(mov.cantidad)}
          </span>
          <span className="text-[10px] uppercase tracking-wider text-gray-500 font-medium">cab.</span>
        </div>

        {/* Info principal */}
        <div className="flex-1 min-w-0">
          <div className="flex justify-between items-start mb-1">
            <span className={`text-xs font-semibold px-2 py-0.5 rounded-md leading-none ${colorTipoMovimiento(mov.tipo_movimiento)}`}>
              {mov.tipo_movimiento}
            </span>
            <span className="text-[11px] text-gray-400 font-medium whitespace-nowrap">
              {formatearFecha(mov.fecha)}
            </span>
          </div>
          
          <h3 className="text-sm font-bold text-gray-800 mt-1.5 leading-tight">{mov.categoria}</h3>
          
          {/* Detalles dinámicos según el tipo */}
          <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-500">
            {mov.peso_total > 0 && (
              <span className="flex items-center gap-1">
                🏋️ {mov.peso_total} kg
              </span>
            )}
            {mov.valor_total > 0 && (
              <span className="flex items-center gap-1">
                💵 {formatearMoneda(mov.valor_total)}
              </span>
            )}
            {/* Si es traslado se muestran ambos potreros */}
            {mov.tipo_movimiento === 'Traslado' && (nombreOri || nombreDes) ? (
              <span className="flex items-center gap-1 text-blue-600 font-medium">
                📍 {nombreOri || '?'} → {nombreDes || '?'}
              </span>
            ) : (
              // Para otros, solo el que esté definido (dependerá si sumó o restó)
              (nombreOri || nombreDes) && (
                <span className="flex items-center gap-1">
                  📍 {nombreOri || nombreDes}
                </span>
              )
            )}
            {mov.contraparte && (
              <span className="flex items-center gap-1">
                🤝 {mov.contraparte}
              </span>
            )}
          </div>
        </div>
      </div>
      
      {mov.observaciones && (
        <div className="px-4 py-2 bg-gray-50 border-t border-gray-100 text-xs text-gray-500 italic">
          {mov.observaciones}
        </div>
      )}
    </div>
  );
}

// ─── Componente: Formulario de Alta ───────────────────────────────────────

function FormularioMovimiento({ params, potreros, establecimientoId, onGuardado, onCancelar, mostrarToast }) {
  const [form, setForm] = useState(FORM_INICIAL);
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);

  // Reglas fijas según el modelo de datos para cada tipo de movimiento
  const reglasPotrero = useMemo(() => {
    const reglas = {
      'Compra':           { requiere_origen: false, requiere_destino: true  },
      'Venta':            { requiere_origen: true,  requiere_destino: false },
      'Nacimiento':       { requiere_origen: false, requiere_destino: true  },
      'Muerte':           { requiere_origen: true,  requiere_destino: false },
      'Consumo':          { requiere_origen: true,  requiere_destino: false },
      'Traslado':         { requiere_origen: true,  requiere_destino: true  },
      'Cambio Categoría': { requiere_origen: true,  requiere_destino: false },
    };
    return reglas[form.tipo_movimiento] || { requiere_origen: false, requiere_destino: false };
  }, [form.tipo_movimiento]);

  const setcampo = useCallback((campo, valor) => {
    setForm(prev => {
      const next = { ...prev, [campo]: valor };
      // Limpiar campos que no aplican según el tipo elegido (ej si cambia de Traslado a Compra)
      if (campo === 'tipo_movimiento') {
        const reglas = {
          'Compra':           { requiere_origen: false, requiere_destino: true  },
          'Venta':            { requiere_origen: true,  requiere_destino: false },
          'Nacimiento':       { requiere_origen: false, requiere_destino: true  },
          'Muerte':           { requiere_origen: true,  requiere_destino: false },
          'Consumo':          { requiere_origen: true,  requiere_destino: false },
          'Traslado':         { requiere_origen: true,  requiere_destino: true  },
          'Cambio Categoría': { requiere_origen: true,  requiere_destino: false },
        };
        const specs = reglas[valor];
        if (specs) {
          if (!specs.requiere_origen) next.potrero_origen = '';
          if (!specs.requiere_destino) next.potrero_destino = '';
        }
      }
      return next;
    });
    setErrores(prev => ({ ...prev, [campo]: undefined }));
  }, [params]);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const result = validarMovimiento(form, potreros, params?.parametros_movimientos);
    if (!result.valido) {
      setErrores(result.errores);
      const primerError = document.querySelector('[data-error="true"]');
      primerError?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setEnviando(true);
    try {
      const payload = {
        establecimiento_id: establecimientoId,
        fecha:           form.fecha,
        tipo_movimiento: form.tipo_movimiento,
        categoria:       form.categoria,
        cantidad:        parseInt(form.cantidad, 10),
        peso_total:      form.peso_total ? parseFloat(form.peso_total) : undefined,
        potrero_origen:  reglasPotrero.requiere_origen ? form.potrero_origen : undefined,
        potrero_destino: reglasPotrero.requiere_destino ? form.potrero_destino : undefined,
        valor_total:     form.valor_total ? parseFloat(form.valor_total) : undefined,
        contraparte:     form.contraparte.trim() || undefined,
        observaciones:   form.observaciones.trim() || undefined,
      };

      const res = await apiPost('crear_movimiento', payload);

      if (res.success) {
        mostrarToast('Movimiento registrado correctamente 🎉', 'exito');
        onGuardado({ ...payload, id: res.id, estado: 'activo' });
      } else {
        if (res.field) setErrores({ [res.field]: res.error });
        else mostrarToast(res.error || 'Error al guardar', 'error');
      }
    } catch (e) {
      mostrarToast('Error de conexión. Intentá de nuevo.', 'error');
    } finally {
      setEnviando(false);
    }
  };

  const tiposMov          = params?.tipos_movimiento ?? [];
  const categorias        = params?.categorias_ganado ?? [];

  return (
    <div className="flex flex-col gap-1 animate-page">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-800">Registrar movimiento</h2>
        <p className="text-sm text-gray-500 mt-0.5">Ingresá los detalles para afectar el stock</p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4 pb-4">

        {/* ── Fecha y Tipo ── */}
        <div className="grid grid-cols-2 gap-3">
          <CampoFormulario label="Fecha" required error={errores.fecha}>
            <input
              type="date"
              value={form.fecha}
              onChange={e => setcampo('fecha', e.target.value)}
              className={claseInput(errores.fecha)}
              data-error={!!errores.fecha}
              max={HOY}
            />
          </CampoFormulario>

          <CampoFormulario label="Tipo" required error={errores.tipo_movimiento}>
            <select
              value={form.tipo_movimiento}
              onChange={e => setcampo('tipo_movimiento', e.target.value)}
              className={claseInput(errores.tipo_movimiento)}
              data-error={!!errores.tipo_movimiento}
            >
              <option value="">— Tipo —</option>
              {tiposMov.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </CampoFormulario>
        </div>

        {/* ── Categoría y Cantidad ── */}
        <div className="grid grid-cols-2 gap-3">
          <CampoFormulario label="Categoría" required error={errores.categoria}>
            <select
              value={form.categoria}
              onChange={e => setcampo('categoria', e.target.value)}
              className={claseInput(errores.categoria)}
              data-error={!!errores.categoria}
            >
              <option value="">— Categoría —</option>
              {categorias.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </CampoFormulario>

          <CampoFormulario label="Cabezas" required error={errores.cantidad}>
            <input
              type="number"
              min="1"
              step="1"
              placeholder="Ej: 25"
              value={form.cantidad}
              onChange={e => setcampo('cantidad', e.target.value)}
              className={claseInput(errores.cantidad)}
              data-error={!!errores.cantidad}
              inputMode="numeric"
            />
          </CampoFormulario>
        </div>

        {/* ── Dinámica de Potreros (origen / destino) ── */}
        {(reglasPotrero.requiere_origen || reglasPotrero.requiere_destino) && (
          <div className="bg-gray-50 border border-gray-200 rounded-xl p-3 flex flex-col gap-3">
            <h3 className="text-xs font-bold text-gray-500 uppercase tracking-widest">Ubicación física</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {reglasPotrero.requiere_origen && (
                <CampoFormulario label="Potrero de Origen" required error={errores.potrero_origen}>
                  <select
                    value={form.potrero_origen}
                    onChange={e => setcampo('potrero_origen', e.target.value)}
                    className={claseInput(errores.potrero_origen)}
                    data-error={!!errores.potrero_origen}
                  >
                    <option value="">— Seleccionar —</option>
                    {potreros.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </CampoFormulario>
              )}

              {reglasPotrero.requiere_destino && (
                <CampoFormulario label="Potrero de Destino" required error={errores.potrero_destino}>
                  <select
                    value={form.potrero_destino}
                    onChange={e => setcampo('potrero_destino', e.target.value)}
                    className={claseInput(errores.potrero_destino)}
                    data-error={!!errores.potrero_destino}
                  >
                    <option value="">— Seleccionar —</option>
                    {potreros.map(p => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                  </select>
                </CampoFormulario>
              )}
            </div>
            {potreros.length === 0 && (
              <p className="text-xs text-red-600 font-medium mt-1">⚠️ No hay potreros registrados en el establecimiento.</p>
            )}
          </div>
        )}

        <div className="flex items-center gap-2 my-1">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400 font-medium">Información Comercial (Opcional)</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* ── Peso y Valor ── */}
        <div className="grid grid-cols-2 gap-3">
          <CampoFormulario label="Peso Total (kg)" error={errores.peso_total}>
            <input
              type="number"
              min="0.1"
              step="0.1"
              placeholder="Ej: 5200"
              value={form.peso_total}
              onChange={e => setcampo('peso_total', e.target.value)}
              className={claseInput(errores.peso_total)}
              inputMode="decimal"
            />
          </CampoFormulario>

          <CampoFormulario label="Valor Total (USD)" error={errores.valor_total}>
            <input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Ej: 8500"
              value={form.valor_total}
              onChange={e => setcampo('valor_total', e.target.value)}
              className={claseInput(errores.valor_total)}
              inputMode="decimal"
            />
          </CampoFormulario>
        </div>

        {/* ── Contraparte y Notas ── */}
        <CampoFormulario label="Comprador / Vendedor" error={errores.contraparte}>
          <input
            type="text"
            placeholder="Nombre de la contraparte..."
            value={form.contraparte}
            onChange={e => setcampo('contraparte', e.target.value)}
            className={claseInput(errores.contraparte)}
            maxLength={100}
          />
        </CampoFormulario>

        <CampoFormulario label="Observaciones">
          <textarea
            placeholder="Ej: Guía de propiedad N° 00234..."
            value={form.observaciones}
            onChange={e => setcampo('observaciones', e.target.value)}
            className={claseInput(false) + ' resize-none'}
            rows={2}
            maxLength={200}
          />
        </CampoFormulario>

        {/* ── Botones ── */}
        <div className="flex gap-3 mt-4">
          <button
            type="button"
            onClick={onCancelar}
            className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-600 font-semibold text-sm
                       active:scale-95 transition-transform"
          >
            Cancelar
          </button>
          
          <button
            type="submit"
            disabled={enviando || (reglasPotrero.requiere_origen || reglasPotrero.requiere_destino) && potreros.length === 0}
            className="flex-1 py-3 rounded-xl bg-[#1a7f4b] text-white font-semibold text-sm shadow-md
                       active:scale-95 transition-transform disabled:opacity-60 disabled:cursor-not-allowed
                       flex items-center justify-center gap-2"
          >
            {enviando ? (
              <>
                <div className="spinner !w-4 !h-4 border-white border-t-transparent" />
                Registrando...
              </>
            ) : (
               'Guardar'
            )}
          </button>
        </div>

      </form>
    </div>
  );
}
