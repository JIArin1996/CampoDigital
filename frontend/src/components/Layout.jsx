/**
 * Layout.jsx — Estructura principal de la aplicación
 * Incluye header con título y menú de navegación inferior (mobile-first).
 */
import React from 'react';

// Íconos SVG inline para no depender de una librería externa

const IcoHome = ({ activo }) => (
  <svg viewBox="0 0 24 24" fill={activo ? 'currentColor' : 'none'} stroke="currentColor"
    strokeWidth={activo ? 0 : 1.8} className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M3 12l2-2m0 0l7-7 7 7m-14 0v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3
         m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
  </svg>
);

const IcoEstablecimiento = ({ activo }) => (
  <svg viewBox="0 0 24 24" fill={activo ? 'currentColor' : 'none'} stroke="currentColor"
    strokeWidth={activo ? 0 : 1.8} className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945
         M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0
         2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064
         M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const IcoPotrero = ({ activo }) => (
  <svg viewBox="0 0 24 24" fill={activo ? 'currentColor' : 'none'} stroke="currentColor"
    strokeWidth={activo ? 0 : 1.8} className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618
         a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 13l4.553 2.276
         A1 1 0 0021 21.382V10.618a1 1 0 00-.553-.894L15 7m0 13V7m0 0L9 4" />
  </svg>
);

const IcoMovimiento = ({ activo }) => (
  <svg viewBox="0 0 24 24" fill={activo ? 'currentColor' : 'none'} stroke="currentColor"
    strokeWidth={activo ? 0 : 1.8} className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
  </svg>
);

const IcoStock = ({ activo }) => (
  <svg viewBox="0 0 24 24" fill={activo ? 'currentColor' : 'none'} stroke="currentColor"
    strokeWidth={activo ? 0 : 1.8} className="w-6 h-6">
    <path strokeLinecap="round" strokeLinejoin="round"
      d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6
         a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2
         a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5
         a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
  </svg>
);

const SECCIONES = [
  { id: 'dashboard',       label: 'Inicio',        Icono: IcoHome },
  { id: 'establecimiento', label: 'Campo',          Icono: IcoEstablecimiento },
  { id: 'potreros',        label: 'Potreros',       Icono: IcoPotrero },
  { id: 'movimientos',     label: 'Movimientos',    Icono: IcoMovimiento },
  { id: 'stock',           label: 'Stock',          Icono: IcoStock },
];

/**
 * @param {{
 *   seccionActual: string,
 *   onNavegar: (seccion: string) => void,
 *   children: React.ReactNode
 * }} props
 */
export default function Layout({ seccionActual, onNavegar, children }) {
  const seccion = SECCIONES.find(s => s.id === seccionActual);

  return (
    <div className="flex flex-col h-full bg-[#f0fdf6]">

      {/* ── Header ── */}
      <header className="flex-shrink-0 bg-[#1a7f4b] text-white shadow-md">
        <div className="flex items-center justify-between px-4 py-3 max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            {/* Logo */}
            <span className="text-2xl">🌿</span>
            <div>
              <h1 className="text-base font-bold leading-tight">Campo Digital</h1>
              <p className="text-xs text-green-200 leading-tight">
                {seccion?.label ?? 'Inicio'}
              </p>
            </div>
          </div>
          {/* Estado de conexión */}
          <div className="flex items-center gap-1.5 text-xs text-green-200">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse inline-block" />
            En línea
          </div>
        </div>
      </header>

      {/* ── Contenido principal ── */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto px-4 py-4 pb-24 animate-page">
          {children}
        </div>
      </main>

      {/* ── Navegación inferior (bottom tab bar) ── */}
      <nav className="flex-shrink-0 fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 shadow-lg z-50">
        <div className="flex max-w-lg mx-auto">
          {SECCIONES.map(({ id, label, Icono }) => {
            const activo = seccionActual === id;
            return (
              <button
                key={id}
                onClick={() => onNavegar(id)}
                className={`
                  flex-1 flex flex-col items-center justify-center gap-0.5
                  py-2 text-[10px] font-medium transition-colors duration-150
                  ${activo
                    ? 'text-[#1a7f4b]'
                    : 'text-gray-400 active:text-gray-600'
                  }
                `}
                aria-current={activo ? 'page' : undefined}
              >
                <Icono activo={activo} />
                <span>{label}</span>
                {activo && (
                  <span className="absolute bottom-0 w-8 h-0.5 bg-[#1a7f4b] rounded-t-full" />
                )}
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
