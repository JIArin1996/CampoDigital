/**
 * useParametros.js — Hook para cargar y cachear parámetros del sistema
 * Los datos se obtienen una sola vez y se guardan en localStorage (TTL 1h).
 */
import { useState, useEffect } from 'react';
import { getParametros } from '../services/api';

/**
 * @returns {{
 *   params: Object|null,
 *   cargando: boolean,
 *   error: string|null,
 *   recargar: Function
 * }}
 */
export function useParametros() {
  const [params, setParams] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const cargar = async (forzar = false) => {
    setCargando(true);
    setError(null);
    try {
      const datos = await getParametros(forzar);
      setParams(datos);
    } catch (err) {
      setError(err.message || 'Error al cargar parámetros');
    } finally {
      setCargando(false);
    }
  };

  useEffect(() => {
    cargar();
  }, []);

  return { params, cargando, error, recargar: () => cargar(true) };
}
