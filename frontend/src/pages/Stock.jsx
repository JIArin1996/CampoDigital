/**
 * Stock.jsx — Módulo de visualización de Stock Ganadero
 * Muestra el total de cabezas y un desglose visual (barras CSS) por categoría.
 */
import React, { useState, useEffect, useCallback } from 'react';
import { apiGet } from '../services/api';
import { formatearCabezas } from '../utils/formatters';
import Spinner, { ErrorEstado, EstadoVacio } from '../components/shared/Spinner';

export default function Stock({ establecimientoId }) {
  const [stock, setStock] = useState(null);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState(null);

  const cargarStock = useCallback(async () => {
    if (!establecimientoId) return;
    setCargando(true);
    setError(null);
    try {
      const res = await apiGet('get_stock', { establecimiento_id: establecimientoId });
      if (res.success) {
        setStock(res.data);
      } else {
        setError(res.error || 'Error al cargar el stock');
      }
    } catch (e) {
      setError('Error de conexión. Verificá tu red.');
    } finally {
      setCargando(false);
    }
  }, [establecimientoId]);

  useEffect(() => {
    cargarStock();
  }, [cargarStock]);

  if (!establecimientoId) {
    return (
      <EstadoVacio
        mensaje="Debés registrar tu establecimiento primero."
        accion="Ir al inicio"
        onAccion={() => window.location.hash = ''} // Delegado
      />
    );
  }

  if (cargando) return <Spinner mensaje="Calculando stock actual..." />;
  if (error) return <ErrorEstado mensaje={error} onReintentar={cargarStock} />;
  
  if (!stock || stock.total_cabezas === 0) {
    // Aún en cero (recién creado o todo se vendió/murió)
    return (
      <EstadoVacio
        mensaje="Tu stock actual es cero."
        accion="+ Registrar un movimiento de compra o nacimiento"
        onAccion={() => {/* No exponemos onNavegar a Stock, el menú lo hace */}}
      />
    );
  }

  const { total_cabezas, por_categoria } = stock;
  
  // Limpiamos las que tienen 0 y ordenamos por cantidad desc
  const categoriasActivas = Object.entries(por_categoria)
    .filter(([, cant]) => cant > 0)
    .sort(([, a], [, b]) => b - a);

  const maxCabezas = categoriasActivas[0] ? categoriasActivas[0][1] : 0;

  return (
    <div className="flex flex-col gap-6 animate-page">
      {/* ── Encabezado ── */}
      <div>
        <h2 className="text-xl font-bold text-gray-800">Estado del rodeo</h2>
        <p className="text-sm text-gray-500 mt-0.5">Stock actualizado en tiempo real</p>
      </div>

      {/* ── Total de Cabezas (Hero Card) ── */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#1a7f4b] to-[#125c35] text-white rounded-3xl p-6 shadow-lg">
        {/* Decoración de fondo */}
        <div className="absolute -top-12 -right-12 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
        <div className="absolute -bottom-8 -left-8 w-32 h-32 bg-black/10 rounded-full blur-xl" />
        
        <div className="relative z-10 flex flex-col items-center justify-center text-center">
          <p className="text-sm text-green-200 font-medium uppercase tracking-wide">Cabezas Totales</p>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-6xl font-extrabold tracking-tight">
              {formatearCabezas(total_cabezas)}
            </span>
          </div>
          <div className="mt-4 inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/20 text-xs font-semibold backdrop-blur-sm">
            <span className="w-2 h-2 rounded-full bg-green-300 animate-pulse" />
            Stock de Hoy
          </div>
        </div>
      </div>

      {/* ── Desglose por Categoría ── */}
      <div>
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-base font-bold text-gray-800">Composición del rodeo</h3>
          <span className="text-xs font-semibold text-[#1a7f4b] bg-green-50 px-2 py-1 rounded shadow-sm border border-green-100">
            {categoriasActivas.length} categorías
          </span>
        </div>

        <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4 flex flex-col gap-5">
          {categoriasActivas.map(([cat, cant], i) => {
            const porcentajeDeTotal = (cant / total_cabezas) * 100;
            const longitudBarra = (cant / maxCabezas) * 100; // En base al mayor (100%)
            
            // Asignar colores variados pero dentro de la paleta rural
            const colores = [
              'bg-[#1a7f4b]', 'bg-[#22a061]', 'bg-[#2ec278]', 
              'bg-[#8cc33f]', 'bg-[#a3d135]', 'bg-[#d8e036]'
            ];
            const bgClass = colores[i % colores.length];

            return (
              <div key={cat} className="flex flex-col gap-1.5">
                <div className="flex justify-between items-end">
                  <span className="text-sm font-semibold text-gray-700">{cat}</span>
                  <div className="flex flex-col items-end">
                    <span className="text-sm font-bold text-gray-900 tabular-nums">
                      {formatearCabezas(cant)}
                    </span>
                    <span className="text-[10px] text-gray-400 font-medium tracking-wide">
                      {porcentajeDeTotal.toFixed(1)}%
                    </span>
                  </div>
                </div>
                
                {/* Barra de progreso CSS pura */}
                <div className="h-2.5 w-full bg-gray-100 rounded-full overflow-hidden">
                  <div 
                    className={`h-full ${bgClass} rounded-full origin-left animate-[scaleX_1s_ease-out]`}
                    style={{ width: `${longitudBarra}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
      
      <p className="text-xs text-gray-400 text-center pb-4 italic">
        "El ojo del amo engorda el ganado"
      </p>
    </div>
  );
}
