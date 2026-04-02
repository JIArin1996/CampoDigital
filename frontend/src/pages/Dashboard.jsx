/**
 * Dashboard.jsx — Pantalla principal con resumen del establecimiento
 * Placeholder — se implementará como siguiente módulo.
 */
import React from 'react';
import Spinner from '../components/shared/Spinner';
import { apiGet } from '../services/api';
import { formatearCabezas, formatearFecha, colorTipoMovimiento } from '../utils/formatters';

export default function Dashboard({ establecimientoId, onNavegar }) {
  const [stock, setStock] = React.useState(null);
  const [movimientos, setMovimientos] = React.useState([]);
  const [cargando, setCargando] = React.useState(false);
  const [error, setError] = React.useState(null);

  React.useEffect(() => {
    if (!establecimientoId) return;
    const cargar = async () => {
      setCargando(true);
      setError(null);
      try {
        const [resStock, resMov] = await Promise.all([
          apiGet('get_stock', { establecimiento_id: establecimientoId }),
          apiGet('get_movimientos', { establecimiento_id: establecimientoId, limit: 5 }),
        ]);
        if (resStock.success) setStock(resStock.data);
        if (resMov.success) setMovimientos(resMov.data);
      } catch (e) {
        setError('Error al cargar datos. Verifica tu conexión.');
      } finally {
        setCargando(false);
      }
    };
    cargar();
  }, [establecimientoId]);

  if (!establecimientoId) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
        <span className="text-6xl">🌿</span>
        <h2 className="text-xl font-bold text-gray-800">Bienvenido a Campo Digital</h2>
        <p className="text-sm text-gray-500 max-w-xs">
          Para empezar, registrá tu establecimiento rural.
        </p>
        <button
          onClick={() => onNavegar('establecimiento')}
          className="mt-2 bg-[#1a7f4b] text-white font-semibold px-6 py-3 rounded-xl shadow-md active:scale-95 transition-transform"
        >
          Registrar establecimiento
        </button>
      </div>
    );
  }

  if (cargando) return <Spinner mensaje="Cargando resumen..." />;
  if (error) return (
    <div className="py-8 text-center text-red-600 text-sm">{error}</div>
  );

  const totalCabezas = stock?.total_cabezas ?? 0;
  const porCategoria = stock?.por_categoria ?? {};

  return (
    <div className="flex flex-col gap-5">
      <h2 className="text-lg font-bold text-gray-800">Resumen del campo</h2>

      {/* ── Accesos rápidos ── */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'Nuevo movimiento', icono: '↕️', seccion: 'movimientos' },
          { label: 'Ver stock',        icono: '📊', seccion: 'stock' },
          { label: 'Nuevo potrero',    icono: '🗺️', seccion: 'potreros' },
          { label: 'Ver potreros',     icono: '🌾', seccion: 'potreros' },
        ].map(({ label, icono, seccion }) => (
          <button
            key={label}
            onClick={() => onNavegar(seccion)}
            className="flex flex-col items-center gap-2 bg-white border border-gray-200 rounded-xl p-4
                       shadow-sm active:scale-95 transition-transform"
          >
            <span className="text-2xl">{icono}</span>
            <span className="text-xs font-medium text-gray-700 text-center leading-tight">{label}</span>
          </button>
        ))}
      </div>

      {/* ── Stock total ── */}
      <div className="bg-[#1a7f4b] text-white rounded-2xl p-5 shadow-md">
        <p className="text-sm text-green-200 font-medium">Stock total</p>
        <p className="text-4xl font-bold mt-1">{formatearCabezas(totalCabezas)}</p>
        <p className="text-xs text-green-300 mt-0.5">cabezas</p>
      </div>

      {/* ── Stock por categoría ── */}
      {Object.keys(porCategoria).length > 0 && (
        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100">
            <h3 className="text-sm font-semibold text-gray-700">Por categoría</h3>
          </div>
          <div className="divide-y divide-gray-50">
            {Object.entries(porCategoria)
              .filter(([, v]) => v > 0)
              .sort(([, a], [, b]) => b - a)
              .map(([cat, cant]) => (
                <div key={cat} className="flex justify-between items-center px-4 py-2.5">
                  <span className="text-sm text-gray-700">{cat}</span>
                  <span className="text-sm font-semibold text-[#1a7f4b]">{formatearCabezas(cant)}</span>
                </div>
              ))}
          </div>
        </div>
      )}

      {/* ── Últimos movimientos ── */}
      <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
          <h3 className="text-sm font-semibold text-gray-700">Últimos movimientos</h3>
          <button onClick={() => onNavegar('movimientos')} className="text-xs text-[#1a7f4b] font-medium">
            Ver todos
          </button>
        </div>
        {movimientos.length === 0 ? (
          <p className="text-sm text-gray-400 text-center py-6">Sin movimientos registrados</p>
        ) : (
          <div className="divide-y divide-gray-50">
            {movimientos.map((mov) => (
              <div key={mov.id} className="flex items-center gap-3 px-4 py-3">
                <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${colorTipoMovimiento(mov.tipo_movimiento)}`}>
                  {mov.tipo_movimiento}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-800 truncate">{mov.categoria}</p>
                  <p className="text-xs text-gray-400">{formatearFecha(mov.fecha)}</p>
                </div>
                <span className="text-sm font-semibold text-gray-700 tabular-nums">
                  {formatearCabezas(mov.cantidad)} cab.
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
