// Carga de canales de TV para un país.
// Mantiene su propio AbortController para descartar la petición anterior.

import { normalizarCountry } from './paises.js';
import { API_BASE } from './utils.js';

let controladorTv = null;

/**
 * Carga los canales de TV de un país.
 * Usa su propio AbortController para descartar la petición anterior.
 * @param {string} iso2 - Código ISO-2 de 2 letras
 * @returns {Promise<Object>} estado de carga, canales normalizados y URL intentada
 */
async function cargarTv(iso2) {
  if (controladorTv) controladorTv.abort();
  controladorTv = new AbortController();

  const url = `${API_BASE}/countries/${iso2}/tv`;

  try {
    const res = await fetch(url, { signal: controladorTv.signal });

    if (!res.ok) {
      return { error: true, url };
    }

    const data = await res.json();

    if (!data || !Array.isArray(data.data)) {
      return { error: false, vacio: true, canales: [], url };
    }

    const canales = data.data
      .filter((canal) => canal && canal.streamUrl)
      .map((canal) => ({
        // Se conserva el id y se toma el país del propio canal, con respaldo
        // en el código del país seleccionado.
        id: canal.id != null ? String(canal.id) : '',
        country: normalizarCountry(canal.country, iso2),
        nombre: canal.name || 'Sin nombre',
        streamUrl: canal.streamUrl,
        logo: canal.logo || '',
        categoria: canal.category || '',
        // La API envía booleano; solo un false explícito marca el enlace como inseguro.
        secure: canal.secure !== false,
      }));

    return {
      error: false,
      vacio: canales.length === 0,
      canales,
      url,
    };
  } catch (e) {
    if (e.name === 'AbortError') {
      return { cancelled: true };
    }
    console.error('Error cargando TV:', e);
    return { error: true, url };
  }
}


export function cancelarCargaTv() {
  if (controladorTv) controladorTv.abort();
}

export { cargarTv };
