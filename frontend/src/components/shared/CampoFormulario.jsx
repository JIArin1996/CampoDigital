/**
 * CampoFormulario.jsx — Campo de formulario reutilizable con etiqueta y error
 */
import React from 'react';

/**
 * @param {{
 *   label: string,
 *   error?: string,
 *   required?: boolean,
 *   children: React.ReactNode,
 *   hint?: string,
 * }} props
 */
export default function CampoFormulario({ label, error, required, children, hint }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && !error && <p className="text-xs text-gray-500">{hint}</p>}
      {error && (
        <p className="text-xs text-red-600 flex items-center gap-1">
          <span>⚠</span> {error}
        </p>
      )}
    </div>
  );
}

/**
 * Clase base compartida para inputs, selects y textareas.
 * Exportada para usarse en cualquier componente de forma consistente.
 */
export const claseInput = (error) => `
  w-full rounded-lg border px-3 py-2.5 text-sm transition-colors duration-150
  focus:outline-none focus:ring-2 focus:ring-[#1a7f4b]/40
  ${error
    ? 'border-red-400 bg-red-50 focus:border-red-500'
    : 'border-gray-300 bg-white focus:border-[#1a7f4b]'
  }
`;
