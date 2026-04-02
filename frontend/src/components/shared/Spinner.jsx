/**
 * Spinner.jsx — Indicador de carga genérico
 */
import React from 'react';

/** @param {{ mensaje?: string, className?: string }} props */
export default function Spinner({ mensaje = 'Cargando...', className = '' }) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 gap-3 text-gray-500 ${className}`}>
      <div className="spinner" />
      <p className="text-sm">{mensaje}</p>
    </div>
  );
}

/** Estado de error genérico */
export function ErrorEstado({ mensaje, onReintentar }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
      <span className="text-4xl">⚠️</span>
      <p className="text-sm text-red-600 font-medium">{mensaje}</p>
      {onReintentar && (
        <button
          onClick={onReintentar}
          className="text-sm text-[#1a7f4b] underline underline-offset-2"
        >
          Reintentar
        </button>
      )}
    </div>
  );
}

/** Estado vacío genérico */
export function EstadoVacio({ mensaje, accion, onAccion }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
      <span className="text-4xl">📭</span>
      <p className="text-sm text-gray-500">{mensaje}</p>
      {accion && onAccion && (
        <button
          onClick={onAccion}
          className="text-sm font-medium text-[#1a7f4b] underline underline-offset-2"
        >
          {accion}
        </button>
      )}
    </div>
  );
}
