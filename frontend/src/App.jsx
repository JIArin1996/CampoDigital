/**
 * App.jsx — Router principal de Campo Digital
 * Maneja la navegación entre secciones y el contexto del establecimiento activo.
 */
import React, { useState, useEffect, useCallback } from 'react';
import Layout from './components/Layout';
import Toast from './components/shared/Toast';

// Lazy imports de páginas para mejor performance
const Dashboard      = React.lazy(() => import('./pages/Dashboard'));
const Establecimiento = React.lazy(() => import('./pages/Establecimiento'));
const Potreros       = React.lazy(() => import('./pages/Potreros'));
const Movimientos    = React.lazy(() => import('./pages/Movimientos'));
const Stock          = React.lazy(() => import('./pages/Stock'));

/**
 * Estado de toast global.
 * @typedef {{ mensaje: string, tipo: 'exito'|'error'|'info' }|null} ToastState
 */

export default function App() {
  const [seccion, setSeccion] = useState('dashboard');
  const [toast, setToast] = useState(null);

  // ID del establecimiento activo (guardado en localStorage para persistir entre recargas)
  const [establecimientoId, setEstablecimientoId] = useState(
    () => localStorage.getItem('campo_digital_est_id') || null
  );

  // Persiste el ID del establecimiento activo
  useEffect(() => {
    if (establecimientoId) {
      localStorage.setItem('campo_digital_est_id', establecimientoId);
    } else {
      localStorage.removeItem('campo_digital_est_id');
    }
  }, [establecimientoId]);

  // Registrar el Service Worker para PWA
  useEffect(() => {
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {
        // El SW es opcional; si falla, la app igual funciona
      });
    }
  }, []);

  /** Muestra un toast global */
  const mostrarToast = useCallback((mensaje, tipo = 'info') => {
    setToast({ mensaje, tipo });
  }, []);

  /** Props comunes que se pasan a todas las páginas */
  const paginaProps = {
    establecimientoId,
    onEstablecimientoCreado: (id) => {
      setEstablecimientoId(id);
      mostrarToast('Establecimiento creado correctamente', 'exito');
      setSeccion('dashboard');
    },
    onNavegar: setSeccion,
    mostrarToast,
  };

  const renderSeccion = () => {
    switch (seccion) {
      case 'dashboard':       return <Dashboard {...paginaProps} />;
      case 'establecimiento': return <Establecimiento {...paginaProps} />;
      case 'potreros':        return <Potreros {...paginaProps} />;
      case 'movimientos':     return <Movimientos {...paginaProps} />;
      case 'stock':           return <Stock {...paginaProps} />;
      default:                return <Dashboard {...paginaProps} />;
    }
  };

  return (
    <Layout seccionActual={seccion} onNavegar={setSeccion}>
      <React.Suspense fallback={
        <div className="flex justify-center py-16">
          <div className="spinner" />
        </div>
      }>
        {renderSeccion()}
      </React.Suspense>

      {/* Toast global */}
      {toast && (
        <Toast
          mensaje={toast.mensaje}
          tipo={toast.tipo}
          onCerrar={() => setToast(null)}
        />
      )}
    </Layout>
  );
}
