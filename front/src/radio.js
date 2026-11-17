// Carga de emisoras de radio para un país.
// La petición anterior se cancela al iniciar una nueva.

import { normalizarCountry } from './paises.js';
import { API_BASE } from './utils.js';

let controladorAbort = null;

/**
 * Carga las emisoras de radio para un país dado (por su código ISO-2).
 * Usa AbortController para cancelar peticiones viejas.
 * @param {string} iso2 - Código ISO-2 de 2 letras
 * @returns {Promise<Object>} Objeto con loading, error, vacío, emisoras, url
 */
async function cargarRadio(iso2) {
  // Cancelar petición anterior si existe
  if (controladorAbort) {
    controladorAbort.abort();
  }
  controladorAbort = new AbortController();
  
  try {
    const res = await fetch(`${API_BASE}/countries/${iso2}/radio`, {
      signal: controladorAbort.signal,
      headers: {
        'User-Agent': 'ExploradorPlanet/1.0'
      }
    });
    
    if (!res.ok) {
      return { error: true, vacio: false, loading: false, url: `${API_BASE}/countries/${iso2}/radio` };
    }
    
    const data = await res.json();
    
    // La API responde: { data: [...] } o { data: [] }
    if (!data || !data.data) {
      return { error: false, vacio: true, loading: false, emisoras: [], url: '' };
    }
    
    const estaciones = data.data;
    
    // Normalizar estaciones al formato esperado.
    // `id` y `country` se conservan para poder crear el favorito con su
    // identidad real; no se inventan valores si la API no los envía.
    const emisoras = estaciones.map(st => ({
      id: st.id != null ? String(st.id) : '',
      country: normalizarCountry(st.country, iso2),
      nombre: st.name || 'Sin nombre',
      streamUrl: st.streamUrl || st.url || '',
      logo: st.logo || '',
    }));
    
    // Filtrar solo aquellas con streamUrl válido (no vacío)
    const emisorasConStream = emisoras.filter(e => e.streamUrl && e.streamUrl !== '');
    
    return {
      error: false,
      vacio: emisorasConStream.length === 0,
      loading: false,
      emisoras: emisorasConStream,
      url: ''
    };
    
  } catch (e) {
    if (e.name === 'AbortError') {
      // Petición cancelada, no mostrar error
      return { cancelled: true };
    }
    console.error('Error cargando radio:', e);
    return { error: true, vacio: false, loading: false, url: `${API_BASE}/countries/${iso2}/radio` };
  }
}



export function cancelarCargaRadio() {
  if (controladorAbort) controladorAbort.abort();
}

export { cargarRadio };
