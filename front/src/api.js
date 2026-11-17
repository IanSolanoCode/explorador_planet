// Acceso central a la API y aviso global.
// No importa auth ni favoritos: el manejo del 401 se inyecta desde fuera para
// evitar un ciclo (auth necesita peticionApi; peticionApi necesita cerrar sesión).

import { leerEstado } from './estado.js';
import { API_BASE } from './utils.js';

let avisoTimer = null;
let manejador401 = null;

// Registra qué hacer ante un 401 con el token vigente.
export function configurarManejador401(fn) {
  manejador401 = fn;
}

/**
 * Petición central a la API.
 * - Añade el token solo cuando corresponde.
 * - Devuelve un resultado normalizado, también para fallos de red o abortos.
 * - Ante un 401 autenticado, cierra la sesión local y avisa (salvo que se pida
 *   manejar401: false, como en la validación silenciosa del arranque).
 */
export async function peticionApi(ruta, opciones = {}) {
  const {
    usarToken = true,
    manejar401 = true,
    headers: cabeceras = {},
    ...opcionesFetch
  } = opciones;

  const headers = new Headers(cabeceras);
  headers.set('Accept', 'application/json');
  if (opcionesFetch.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const tokenEnvio = usarToken ? leerEstado('token') : '';
  if (tokenEnvio) headers.set('Authorization', `Bearer ${tokenEnvio}`);

  let res;
  try {
    res = await fetch(`${API_BASE}${ruta}`, { ...opcionesFetch, headers });
  } catch (e) {
    if (e && e.name === 'AbortError') {
      return { abortado: true, ok: false, status: 0, data: null };
    }
    return { red: true, ok: false, status: 0, data: null };
  }

  let data = null;
  if (res.status !== 204) {
    try {
      const texto = await res.text();
      if (texto) data = JSON.parse(texto);
    } catch {
      data = null;
    }
  }

  // Solo se cierra la sesión si la petición usó el token que sigue vigente.
  if (res.status === 401 && manejar401 && tokenEnvio && leerEstado('token') === tokenEnvio) {
    if (manejador401) manejador401({ aviso: 'Tu sesión terminó, vuelve a entrar.' });
  }

  return { ok: res.ok, status: res.status, data };
}

export function mostrarAviso(texto) {
  if (!texto) return;

  let aviso = document.getElementById('aviso-global');
  if (!aviso) {
    aviso = document.createElement('div');
    aviso.id = 'aviso-global';
    aviso.className = 'aviso-global';
    aviso.setAttribute('role', 'status');
    aviso.setAttribute('aria-live', 'polite');
    document.body.appendChild(aviso);
  }

  aviso.textContent = texto;
  aviso.hidden = false;

  if (avisoTimer) clearTimeout(avisoTimer);
  avisoTimer = setTimeout(() => {
    aviso.hidden = true;
    aviso.textContent = '';
    avisoTimer = null;
  }, 5000);
}
