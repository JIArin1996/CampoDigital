/**
 * api.js — Servicio centralizado de conexión con Google Apps Script
 *
 * IMPORTANTE: Apps Script no acepta Content-Type: application/json desde
 * clientes web. Los POST se envían como text/plain y se parsean en el servidor.
 */

const APPS_SCRIPT_URL =
  'https://script.google.com/macros/s/AKfycbwvEMI5iuCg6F8Ala1O69BwlakvLtFRUvyMUTqgJ-nG4d7w_PM4sS1lcgWAcHEjoYXGkA/exec';

const CACHE_KEY_PARAMS = 'campo_digital_parametros';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hora en milisegundos

// ─── GET ───────────────────────────────────────────────────────────────────

/**
 * Realiza una petición GET al backend de Apps Script.
 * @param {string} action - Nombre de la acción (ej: 'get_parametros')
 * @param {Object} [params={}] - Parámetros adicionales de URL
 * @returns {Promise<Object>} - Respuesta JSON del servidor
 */
export async function apiGet(action, params = {}) {
  const url = new URL(APPS_SCRIPT_URL);
  url.searchParams.set('action', action);
  Object.entries(params).forEach(([k, v]) => {
    if (v !== null && v !== undefined && v !== '') {
      url.searchParams.set(k, v);
    }
  });

  const response = await fetch(url.toString());
  if (!response.ok) {
    throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

// ─── POST ──────────────────────────────────────────────────────────────────

/**
 * Realiza una petición POST al backend de Apps Script.
 * Envía el body como text/plain (quirk propio de Apps Script).
 *
 * @param {string} action - Nombre de la acción (ej: 'crear_establecimiento')
 * @param {Object} data - Datos del cuerpo de la petición
 * @returns {Promise<Object>} - Respuesta JSON del servidor
 */
export async function apiPost(action, data) {
  const response = await fetch(APPS_SCRIPT_URL, {
    method: 'POST',
    // Apps Script requiere text/plain para poder leer e.postData.contents
    headers: { 'Content-Type': 'text/plain' },
    body: JSON.stringify({ action, ...data }),
  });

  if (!response.ok) {
    throw new Error(`Error HTTP ${response.status}: ${response.statusText}`);
  }
  return response.json();
}

// ─── PARÁMETROS (con caché en localStorage) ────────────────────────────────

/**
 * Obtiene los parámetros del sistema con caché en localStorage.
 * Evita pedirlos al servidor en cada carga de la app.
 * La caché expira después de 1 hora.
 *
 * @param {boolean} [forzar=false] - Si true, ignora la caché y recarga
 * @returns {Promise<Object>} - Objeto { categorias_ganado: [...], departamentos: [...], ... }
 */
export async function getParametros(forzar = false) {
  // Intentar obtener de la caché
  if (!forzar) {
    try {
      const cached = localStorage.getItem(CACHE_KEY_PARAMS);
      if (cached) {
        const { data, timestamp } = JSON.parse(cached);
        const ahora = Date.now();
        if (ahora - timestamp < CACHE_TTL_MS) {
          return data; // Caché vigente
        }
      }
    } catch {
      // Si la caché está corrupta, simplemente ignorarla
    }
  }

  // Pedirlos al servidor
  const respuesta = await apiGet('get_parametros');
  if (!respuesta.success) {
    throw new Error(respuesta.error || 'Error al obtener parámetros');
  }

  // Guardar en caché
  try {
    localStorage.setItem(CACHE_KEY_PARAMS, JSON.stringify({
      data: respuesta.data,
      timestamp: Date.now(),
    }));
  } catch {
    // Si localStorage está lleno, continuar sin caché
  }

  return respuesta.data;
}

/**
 * Limpia la caché de parámetros (útil para depuración o actualizaciones manuales).
 */
export function limpiarCacheParametros() {
  localStorage.removeItem(CACHE_KEY_PARAMS);
}
