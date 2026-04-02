/**
 * Establecimiento.jsx — Módulo de gestión del establecimiento rural
 *
 * Maneja dos vistas:
 *   1. FormularioAlta  → cuando no hay establecimiento registrado
 *   2. VistaDetalle    → cuando ya existe el establecimiento
 */
import React, { useState, useEffect, useCallback } from 'react';
import { apiGet, apiPost } from '../services/api';
import { useParametros } from '../hooks/useParametros';
import { validarEstablecimiento, esDicoseValido } from '../utils/validators';
import { formatearFecha, formatearHectareas } from '../utils/formatters';
import CampoFormulario, { claseInput } from '../components/shared/CampoFormulario';
import Spinner, { ErrorEstado } from '../components/shared/Spinner';

// ─── Estado inicial del formulario ────────────────────────────────────────
const FORM_INICIAL = {
  nombre:          '',
  departamento:    '',
  superficie_total: '',
  tipo:            '',
  propietario:     '',
  localidad:       '',
  dicose:          '',
  observaciones:   '',
};

// ─── Componente principal ─────────────────────────────────────────────────

/**
 * @param {{
 *   establecimientoId: string|null,
 *   onEstablecimientoCreado: (id: string) => void,
 *   mostrarToast: (msg: string, tipo: string) => void
 * }} props
 */
export default function Establecimiento({ establecimientoId, onEstablecimientoCreado, mostrarToast }) {
  const { params, cargando: cargandoParams, error: errorParams } = useParametros();

  // Datos del establecimiento existente (si ya hay uno creado)
  const [datosEst, setDatosEst] = useState(null);
  const [cargandoEst, setCargandoEst] = useState(false);
  const [errorEst, setErrorEst] = useState(null);

  // Modo: 'ver' o 'formulario'
  const [modo, setModo] = useState(establecimientoId ? 'ver' : 'formulario');

  // Cargar datos del establecimiento si ya existe
  useEffect(() => {
    if (!establecimientoId) {
      setModo('formulario');
      return;
    }
    const cargar = async () => {
      setCargandoEst(true);
      setErrorEst(null);
      try {
        const res = await apiGet('get_establecimiento', { establecimiento_id: establecimientoId });
        if (res.success) {
          setDatosEst(res.data);
          setModo('ver');
        } else {
          setErrorEst(res.error || 'No se pudo cargar el establecimiento');
        }
      } catch (e) {
        setErrorEst('Error de conexión. Verificá tu acceso a internet.');
      } finally {
        setCargandoEst(false);
      }
    };
    cargar();
  }, [establecimientoId]);

  if (cargandoParams) return <Spinner mensaje="Cargando parámetros..." />;
  if (errorParams)   return <ErrorEstado mensaje={errorParams} />;
  if (cargandoEst)   return <Spinner mensaje="Cargando establecimiento..." />;
  if (errorEst)      return <ErrorEstado mensaje={errorEst} />;

  if (modo === 'ver' && datosEst) {
    return (
      <VistaDetalle
        datos={datosEst}
        onEditar={() => setModo('formulario')}
      />
    );
  }

  return (
    <FormularioAlta
      params={params}
      datosIniciales={datosEst}   // pre-rellena en modo edición (future use)
      establecimientoId={establecimientoId}
      onGuardado={(id, datos) => {
        setDatosEst(datos);
        setModo('ver');
        if (!establecimientoId) {
          // Nuevo establecimiento: lo registramos en el estado global de la app
          onEstablecimientoCreado(id);
        } else {
          mostrarToast('Establecimiento actualizado', 'exito');
        }
      }}
      onCancelar={datosEst ? () => setModo('ver') : null}
      mostrarToast={mostrarToast}
    />
  );
}

// ─── Formulario de alta / edición ─────────────────────────────────────────

function FormularioAlta({ params, datosIniciales, establecimientoId, onGuardado, onCancelar, mostrarToast }) {
  const [form, setForm] = useState({ ...FORM_INICIAL, ...datosIniciales });
  const [errores, setErrores] = useState({});
  const [advertencias, setAdvertencias] = useState({});
  const [enviando, setEnviando] = useState(false);

  // Actualiza un campo del formulario y limpia su error
  const setcampo = useCallback((campo, valor) => {
    setForm(prev => ({ ...prev, [campo]: valor }));
    setErrores(prev => ({ ...prev, [campo]: undefined }));

    // Validar DICOSE en tiempo real (advertencia, no error)
    if (campo === 'dicose' && valor) {
      if (!esDicoseValido(valor)) {
        setAdvertencias(prev => ({ ...prev, dicose: 'Formato sugerido: XX.XXX.XXX (ej: 12.345.678)' }));
      } else {
        setAdvertencias(prev => ({ ...prev, dicose: undefined }));
      }
    }
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();

    // Validar antes de enviar
    const { valido, errores: nuevosErrores } = validarEstablecimiento(form);
    if (!valido) {
      setErrores(nuevosErrores);
      // Mover el scroll al primer campo con error
      const primerError = document.querySelector('[data-error="true"]');
      primerError?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    setEnviando(true);
    try {
      // Construir payload limpio (sin campos vacíos opcionales)
      const payload = {
        nombre:          form.nombre.trim(),
        departamento:    form.departamento,
        superficie_total: parseFloat(form.superficie_total),
        tipo:            form.tipo,
        propietario:     form.propietario.trim() || undefined,
        localidad:       form.localidad.trim()   || undefined,
        dicose:          form.dicose.trim()       || undefined,
        observaciones:   form.observaciones.trim()|| undefined,
      };

      const res = await apiPost('crear_establecimiento', payload);

      if (res.success) {
        mostrarToast('Establecimiento creado correctamente 🎉', 'exito');
        onGuardado(res.id, { ...payload, id: res.id, estado: 'activo' });
      } else {
        // Error del servidor: puede venir con campo específico
        if (res.field) {
          setErrores({ [res.field]: res.error });
        } else {
          mostrarToast(res.error || 'Error al guardar', 'error');
        }
      }
    } catch (e) {
      mostrarToast('Error de conexión. Intentá de nuevo.', 'error');
    } finally {
      setEnviando(false);
    }
  };

  const departamentos = params?.departamentos ?? [];
  const tiposEst      = params?.tipos_establecimiento ?? ['Ganadero', 'Agrícola', 'Mixto'];

  return (
    <div className="flex flex-col gap-1 animate-page">
      <div className="mb-4">
        <h2 className="text-xl font-bold text-gray-800">
          {establecimientoId ? 'Editar establecimiento' : 'Nuevo establecimiento'}
        </h2>
        <p className="text-sm text-gray-500 mt-0.5">
          {establecimientoId
            ? 'Modificá los datos de tu campo'
            : 'Registrá los datos básicos de tu campo'}
        </p>
      </div>

      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">

        {/* ── Nombre ── */}
        <CampoFormulario label="Nombre del campo" required error={errores.nombre}>
          <input
            type="text"
            placeholder="Ej: La Esperanza"
            value={form.nombre}
            onChange={e => setcampo('nombre', e.target.value)}
            className={claseInput(errores.nombre)}
            data-error={!!errores.nombre}
            maxLength={100}
            autoComplete="off"
          />
        </CampoFormulario>

        {/* ── Departamento ── */}
        <CampoFormulario label="Departamento" required error={errores.departamento}>
          <select
            value={form.departamento}
            onChange={e => setcampo('departamento', e.target.value)}
            className={claseInput(errores.departamento)}
            data-error={!!errores.departamento}
          >
            <option value="">— Seleccioná un departamento —</option>
            {departamentos.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </CampoFormulario>

        {/* ── Superficie + Tipo (en fila) ── */}
        <div className="grid grid-cols-2 gap-3">
          <CampoFormulario label="Superficie (ha)" required error={errores.superficie_total}>
            <input
              type="number"
              placeholder="850"
              value={form.superficie_total}
              onChange={e => setcampo('superficie_total', e.target.value)}
              className={claseInput(errores.superficie_total)}
              data-error={!!errores.superficie_total}
              min="0.1"
              step="0.1"
              inputMode="decimal"
            />
          </CampoFormulario>

          <CampoFormulario label="Tipo" required error={errores.tipo}>
            <select
              value={form.tipo}
              onChange={e => setcampo('tipo', e.target.value)}
              className={claseInput(errores.tipo)}
              data-error={!!errores.tipo}
            >
              <option value="">— Tipo —</option>
              {tiposEst.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </CampoFormulario>
        </div>

        {/* Divider: Datos opcionales */}
        <div className="flex items-center gap-2 my-1">
          <div className="flex-1 h-px bg-gray-200" />
          <span className="text-xs text-gray-400 font-medium">Datos opcionales</span>
          <div className="flex-1 h-px bg-gray-200" />
        </div>

        {/* ── Propietario ── */}
        <CampoFormulario label="Propietario" error={errores.propietario}>
          <input
            type="text"
            placeholder="Nombre del titular"
            value={form.propietario}
            onChange={e => setcampo('propietario', e.target.value)}
            className={claseInput(errores.propietario)}
            maxLength={100}
          />
        </CampoFormulario>

        {/* ── Localidad ── */}
        <CampoFormulario label="Localidad / Referencia" error={errores.localidad}>
          <input
            type="text"
            placeholder="Ej: Minas de Corrales"
            value={form.localidad}
            onChange={e => setcampo('localidad', e.target.value)}
            className={claseInput(errores.localidad)}
            maxLength={100}
          />
        </CampoFormulario>

        {/* ── DICOSE ── */}
        <CampoFormulario
          label="N° DICOSE"
          error={errores.dicose}
          hint={advertencias.dicose || 'Formato: XX.XXX.XXX (ej: 12.345.678)'}
        >
          <input
            type="text"
            placeholder="12.345.678"
            value={form.dicose}
            onChange={e => setcampo('dicose', e.target.value)}
            className={claseInput(errores.dicose)}
            maxLength={11}
            inputMode="numeric"
          />
        </CampoFormulario>

        {/* ── Observaciones ── */}
        <CampoFormulario label="Observaciones" error={errores.observaciones}>
          <textarea
            placeholder="Notas libres sobre el campo..."
            value={form.observaciones}
            onChange={e => setcampo('observaciones', e.target.value)}
            className={claseInput(errores.observaciones) + ' resize-none'}
            rows={3}
            maxLength={500}
          />
        </CampoFormulario>

        {/* ── Botones ── */}
        <div className={`flex gap-3 mt-2 ${onCancelar ? '' : ''}`}>
          {onCancelar && (
            <button
              type="button"
              onClick={onCancelar}
              className="flex-1 py-3 rounded-xl border border-gray-300 text-gray-600 font-semibold text-sm
                         active:scale-95 transition-transform"
            >
              Cancelar
            </button>
          )}
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
              establecimientoId ? 'Guardar cambios' : 'Crear establecimiento'
            )}
          </button>
        </div>

      </form>
    </div>
  );
}

// ─── Vista de detalle del establecimiento ─────────────────────────────────

function VistaDetalle({ datos, onEditar }) {
  const infoCampos = [
    { label: 'Departamento',  valor: datos.departamento },
    { label: 'Localidad',     valor: datos.localidad    || '—' },
    { label: 'Superficie',    valor: formatearHectareas(datos.superficie_total) },
    { label: 'Tipo',          valor: datos.tipo },
    { label: 'Propietario',   valor: datos.propietario  || '—' },
    { label: 'N° DICOSE',     valor: datos.dicose        || '—' },
    { label: 'Fecha de alta', valor: formatearFecha(datos.fecha_alta) },
    { label: 'Estado',        valor: datos.estado },
  ];

  return (
    <div className="flex flex-col gap-5 animate-page">

      {/* ── Encabezado ── */}
      <div className="bg-[#1a7f4b] text-white rounded-2xl px-5 py-6 shadow-md">
        <p className="text-xs text-green-300 uppercase tracking-widest font-medium mb-1">
          {datos.id}
        </p>
        <h2 className="text-2xl font-bold leading-tight">{datos.nombre}</h2>
        <p className="text-green-200 text-sm mt-1">
          {datos.departamento} · {formatearHectareas(datos.superficie_total)} · {datos.tipo}
        </p>
      </div>

      {/* ── Datos ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100">
          <h3 className="text-sm font-semibold text-gray-700">Datos del campo</h3>
        </div>
        <dl className="divide-y divide-gray-50">
          {infoCampos.map(({ label, valor }) => (
            <div key={label} className="flex justify-between items-center px-4 py-3 gap-4">
              <dt className="text-sm text-gray-500 shrink-0">{label}</dt>
              <dd className="text-sm font-medium text-gray-800 text-right truncate">{valor}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* ── Observaciones ── */}
      {datos.observaciones && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm px-4 py-4">
          <p className="text-xs text-gray-400 uppercase tracking-wide font-medium mb-1">Observaciones</p>
          <p className="text-sm text-gray-700">{datos.observaciones}</p>
        </div>
      )}

      {/* ── Acción ── */}
      <button
        onClick={onEditar}
        className="w-full py-3 rounded-xl border-2 border-[#1a7f4b] text-[#1a7f4b] font-semibold text-sm
                   active:scale-95 transition-transform"
      >
        ✏️ Editar establecimiento
      </button>
    </div>
  );
}
