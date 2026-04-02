/**
 * Toast.jsx — Notificaciones temporales (éxito / error)
 * Se muestran por 3 segundos y desaparecen automáticamente.
 */
import React, { useEffect } from 'react';

/**
 * @param {{
 *   mensaje: string,
 *   tipo: 'exito' | 'error' | 'info',
 *   onCerrar: () => void
 * }} props
 */
export default function Toast({ mensaje, tipo = 'info', onCerrar }) {
  useEffect(() => {
    const timer = setTimeout(onCerrar, 3500);
    return () => clearTimeout(timer);
  }, [onCerrar]);

  const estilos = {
    exito: 'bg-green-700 text-white',
    error: 'bg-red-600 text-white',
    info:  'bg-gray-800 text-white',
  };

  const iconos = {
    exito: '✓',
    error: '✕',
    info:  'ℹ',
  };

  return (
    <div className={`
      fixed bottom-20 left-1/2 -translate-x-1/2 z-[100]
      flex items-center gap-3 px-4 py-3 rounded-xl shadow-xl
      max-w-[calc(100vw-2rem)] min-w-[200px]
      animate-[fadeSlideUp_0.25s_ease_both]
      ${estilos[tipo]}
    `}>
      <span className="text-lg font-bold">{iconos[tipo]}</span>
      <span className="text-sm font-medium">{mensaje}</span>
      <button onClick={onCerrar} className="ml-auto opacity-70 hover:opacity-100 text-lg leading-none">
        ×
      </button>
    </div>
  );
}
