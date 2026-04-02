/**
 * Potreros.jsx — Módulo de gestión de potreros
 * Lista los potreros del establecimiento y permite crear nuevos.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost } from '../services/api';
import { useParametros } from '../hooks/useParametros';
import { validarPotrero } from '../utils/validators';
import { formatearHectareas } from '../utils/formatters';
import CampoFormulario, { claseInput } from '../components/shared/CampoFormulario';
import Spinner, { ErrorEstado, EstadoVacio } from '../components/shared/Spinner';

// ─── Estado inicial del formulario ────────────────────────────────────────
const FORM_INICIAL = {
  nombre:       '',
  superficie:   '',
  uso_actual:   '',
  tipo_pastura: '',
  aguada:       '',
  observaciones:'',
};

// ─── Componente principal ─────────────────────────────────────────────────

export default function Potreros({ establecimientoId, mostrarToast }) {
  const { params, cargando: cargandoParams, error: errorParams } = useParametros();

  const [potreros, setPotreros] = useState([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  const [modo, setModo] = useState('lista'); // 'lista' o 'formulario'

  const cargarPotreros = useCallback(async () => {
    if (!establecimientoId) return;
    setCargando(true);
    setError(null);
    try {
      const res = await apiGet('get_potreros', { establecimiento_id: establecimientoId });
      if (res.success) {
        setPotreros(res.data);
      } else {
        setError(res.error || 'Error al cargar los potreros');
      }
    } catch (e) {
      setError('Error de conexión. Verificá tu acceso a internet.');
    } finally {
      setCargando(false);
    }
  }, [establecimientoId]);

  useEffect(() => {
    cargarPotreros();
  }, [cargarPotreros]);

  // Pantalla de bloqueo si no hay establecimiento
  if (!establecimientoId) {
    return (
      <EstadoVacio
        mensaje="Debés registrar tu establecimiento primero."
        accion="Registrar ahora"
        onAccion={() => window.location.hash = ''} // Solo visual, el NavBar lo maneja mejor
      />
    );
  }

  if (cargandoParams) return <Spinner mensaje="Cargando configuración..." />;
  if (errorParams) return <ErrorEstado mensaje={errorParams} />;

  if (modo === 'formulario') {
    return (
      <FormularioAlta
        params={params}
        establecimientoId={establecimientoId}
        onGuardado={(nuevoPotrero) => {
          setPotreros(prev => [...prev, nuevoPotrero]);
          setModo('lista');
        }}
        onCancelar={() => setModo('lista')}
        mostrarToast={mostrarToast}
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 animate-page">
      <div className="flex justify-between items-end">
        <div>
          <h2 className="text-xl font-bold text-gray-800">Potreros</h2>
          <p className="text-sm text-gray-500">Subdivisiones de tu campo</p>
        </div>
        <button
          onClick={() => setModo('formulario')}
          className="bg-[#1a7f4b] text-white text-sm font-semibold px-4 py-2 rounded-xl shadow-sm
                     active:scale-95 transition-transform flex items-center gap-1"
        >
          <span className="text-lg leading-none">+</span> Nuevo
        </button>
      </div>

      {cargando ? (
        <Spinner mensaje="Cargando potreros..." />
      ) : error ? (
        <ErrorEstado mensaje={error} onReintentar={cargarPotreros} />
      ) : potreros.length === 0 ? (
        <EstadoVacio
          mensaje="Aún no tenés potreros registrados."
          accion="+ Crear el primer potrero"
          onAccion={() => setModo('formulario')}
        />
      ) : (
        <div className="flex flex-col gap-3 pb-8">
          {potreros.map(pot => (
            <TarjetaPotrero key={pot.id} potrero={pot} />
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Tarjeta de vista en modo lista ───────────────────────────────────────

function TarjetaPotrero({ potrero }) {
  // Configuro colores según uso
  const colorUso = {
    'Ganadería':   'bg-green-100 text-green-800',
    'Agricultura': 'bg-yellow-100 text-yellow-800',
    'Reserva':     'bg-blue-100 text-blue-800',
    'Sin uso':     'bg-gray-100 text-gray-700',
  }[potrero.uso_actual] || 'bg-gray-100 text-gray-700';

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex justify-between items-start mb-2">
        <h3 className="text-base font-bold text-gray-800">{potrero.nombre}</h3>
        <span className="text-sm font-semibold text-[#1a7f4b]">
          {formatearHectareas(potrero.superficie)}
        </span>
      </div>
      
      <div className="flex flex-wrap gap-2 mt-3">
        <span className={`text-xs font-semibold px-2.5 py-1 rounded-md ${colorUso}`}>
          {potrero.uso_actual}
        </span>
        {potrero.tipo_pastura && (
          <span className="text-xs font-medium px-2.5 py-1 rounded-md bg-green-50 text-green-700 border border-green-100">
            🌾 {potrero.tipo_pastura}
          </span>
        )}
        {potrero.aguada === 'Sí' && (
          <span className="text-xs font-medium px-2.5 py-1 rounded-md bg-blue-50 text-blue-700 border border-blue-100">
            💧 Aguada
          </span>
        )}
      </div>

      {potrero.observaciones && (
        <p className="mt-3 text-sm text-gray-500 italic border-l-2 border-gray-200 pl-2">
          {potrero.observaciones}
        </p>
      )}
    </div>
  );
}

// ─── Formulario de alta ───────────────────────────────────────────────────

function FormularioAlta({ params, establecimientoId, onGuardado, onCancelar, mostrarToast }) {
  const [form, setForm] = useState(FORM_INICIAL);
  const [errores, setErrores] = useState({});
  const [enviando, setEnviando] = useState(false);

  const setcampo = useCallback((campo, valor) => {
    setForm(prev => ({ ...prev, [campo]: valor }));
    setErrores(prev => ({ ...prev, [campo]: undefined }));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    const { valido, errores: nuevosErrores } = validarPotrero(form);
    if (!valido) {
      setErrores(nuevosErrores);
      // Mover el scroll al primer campo con error
      const primerError = document.querySelector('[data-error="true"]');
      primerError?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setEnviando(true);
    try {
      const payload = {
        establecimiento_id: establecimientoId,
        nombre:             form.nombre.trim(),
        superficie:         parseFloat(form.superficie),
        uso_actual:         form.uso_actual,
        tipo_pastura:       form.tipo_pastura || undefined,
        aguada:             form.aguada       || undefined,
        observaciones:      form.observaciones.trim() || undefined,
      };

      const res = await apiPost('crear_potrero', payload);

      if (res.success) {
        mostrarToast('Potrero creado correctamente 🎉', 'exito');
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

  const usosPotrero  = params?.usos_potrero ?? ['Ganadería', 'Agricultura', 'Reserva', 'Sin uso'];
  const tiposPastura = params?.tipos_pastura ?? [];
  const opcionesAguada = params?.aguada ?? ['Sí', 'No'];

  return (
    <div className="flex flex-col gap-1 animate-page">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-800">Nuevo potrero</h2>
        <p className="text-sm text-gray-500 mt-0.5">Definí las subdivisiones de tu campo</p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">

        <CampoFormulario label="Nombre o identificador" required error={errores.nombre}>
          <input
            type="text"
            placeholder="Ej: Potrero 1 - Frente"
            value={form.nombre}
            onChange={e => setcampo('nombre', e.target.value)}
            className={claseInput(errores.nombre)}
            data-error={!!errores.nombre}
            maxLength={100}
          />
        </CampoFormulario>

        <div className="grid grid-cols-2 gap-3">
          <CampoFormulario label="Superficie (ha)" required error={errores.superficie}>
            <input
              type="number"
              placeholder="120"
              value={form.superficie}
              onChange={e => setcampo('superficie', e.target.value)}
              className={claseInput(errores.superficie)}
              data-error={!!errores.superficie}
              min="0.1"
              step="0.1"
              inputMode="decimal"
            />
          </CampoFormulario>

          <CampoFormulario label="Uso actual" required error={errores.uso_actual}>
            <select
              value={form.uso_actual}
              onChange={e => setcampo('uso_actual', e.target.value)}
              className={claseInput(errores.uso_actual)}
              data-error={!!errores.uso_actual}
            >
              <option value="">— Uso —</option>
              {usosPotrero.map(u => (
                <option key={u} value={u}>{u}</option>
              ))}
            </select>
          </CampoFormulario>
        </div>

        {/* Divider */}
        <div className="flex items-center gap-2 my-1">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400 font-medium">Características (Opcional)</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        <div className="grid grid-cols-2 gap-3">
          <CampoFormulario label="Tipo de pastura" error={errores.tipo_pastura}>
            <select
              value={form.tipo_pastura}
              onChange={e => setcampo('tipo_pastura', e.target.value)}
              className={claseInput(errores.tipo_pastura)}
            >
              <option value="">— Pastura —</option>
              {tiposPastura.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </CampoFormulario>

          <CampoFormulario label="Tiene aguada" error={errores.aguada}>
            <select
              value={form.aguada}
              onChange={e => setcampo('aguada', e.target.value)}
              className={claseInput(errores.aguada)}
            >
              <option value="">— Aguada —</option>
              {opcionesAguada.map(a => (
                <option key={a} value={a}>{a}</option>
              ))}
            </select>
          </CampoFormulario>
        </div>

        <CampoFormulario label="Observaciones">
          <textarea
            placeholder="Notas adicionales..."
            value={form.observaciones}
            onChange={e => setcampo('observaciones', e.target.value)}
            className={claseInput(false) + ' resize-none'}
            rows={2}
            maxLength={300}
          />
        </CampoFormulario>

        {/* Botones */}
        <div className="flex gap-3 mt-2">
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
            disabled={enviando}
            className="flex-1 py-3 rounded-xl bg-[#1a7f4b] text-white font-semibold text-sm shadow-md
                       active:scale-95 transition-transform disabled:opacity-60 disabled:cursor-not-allowed
                       flex items-center justify-center gap-2"
          >
            {enviando ? (
              <>
                <div className="spinner !w-4 !h-4 border-white border-t-transparent" />
                Guardando...
              </>
            ) : (
              'Crear potrero'
            )}
          </button>
        </div>

      </form>
    </div>
  );
}
