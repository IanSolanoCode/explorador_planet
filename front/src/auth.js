// Sesión: token en localStorage, cierre de sesión y validación al arrancar.
// No importa cuenta.js ni modal-auth.js: avisa del cambio con el registro.

import { escribirEstado, leerEstado, mapaFavoritos } from './estado.js';
import { mostrarAviso, peticionApi } from './api.js';
import {
  actualizarCorazonesVisibles,
  cargarFavoritos,
  invalidarPeticionesFavoritos,
  renderFavoritosPanel,
} from './favoritos.js';
import { notificarCambioSesion } from './registro.js';

// El token solo se guarda en localStorage (con try/catch) y se envía como Bearer.
const TOKEN_CLAVE = 'explorador-planet:token';

function leerToken() {
  try {
    return localStorage.getItem(TOKEN_CLAVE) || '';
  } catch {
    // localStorage puede fallar en modo privado: se usa una sesión solo en memoria.
    return '';
  }
}

function guardarToken(nuevoToken) {
  escribirEstado('token', typeof nuevoToken === 'string' ? nuevoToken : '');
  try {
    if (leerEstado('token')) {
      localStorage.setItem(TOKEN_CLAVE, leerEstado('token'));
    } else {
      localStorage.removeItem(TOKEN_CLAVE);
    }
  } catch {
    // Si no se puede persistir, la sesión sigue funcionando en esta pestaña.
  }
}

function borrarToken() {
  escribirEstado('token', '');
  try {
    localStorage.removeItem(TOKEN_CLAVE);
  } catch {
    // El token en memoria ya se borró; no hay nada más que hacer.
  }
}

async function cerrarSesionRemota() {
  const botonSalir = document.getElementById('btn-salir');
  if (botonSalir) botonSalir.disabled = true;

  // Se invalida desde el primer momento, antes de esperar al servidor.
  invalidarPeticionesFavoritos();

  try {
    if (leerEstado('token')) {
      // Aunque falle la petición, la sesión local se cierra en el finally.
      await peticionApi('/auth/logout', { method: 'POST', manejar401: false });
    }
  } finally {
    cerrarSesionLocal();
    if (botonSalir) botonSalir.disabled = false;
  }
}

function cerrarSesionLocal({ aviso = '' } = {}) {
  invalidarPeticionesFavoritos();

  borrarToken();
  escribirEstado('usuarioActual', null);
  mapaFavoritos().clear();

  notificarCambioSesion();
  actualizarCorazonesVisibles();
  if (leerEstado('vistaFavoritos')) renderFavoritosPanel({ sinSesion: true });
  if (aviso) mostrarAviso(aviso);
}

async function inicializarSesion() {
  notificarCambioSesion();
  if (!leerEstado('token')) return;

  const version = leerEstado('versionSesion');
  // Silencioso a propósito: un token caducado al arrancar solo se descarta.
  const res = await peticionApi('/auth/me', { manejar401: false });
  if (version !== leerEstado('versionSesion')) return;

  if (res.status === 401) {
    cerrarSesionLocal();
    return;
  }

  if (res.ok && res.data && res.data.data) {
    escribirEstado('usuarioActual', res.data.data);
    notificarCambioSesion();
    actualizarCorazonesVisibles();
    await cargarFavoritos({ renderPanel: leerEstado('vistaFavoritos') });
  }
}

export { leerToken, guardarToken, cerrarSesionRemota, cerrarSesionLocal, inicializarSesion };
