// Administración: botón "Admin", botón "Bloquear" de cada tarjeta y
// formulario de bloqueo. El panel de bloqueos vive en `admin-bloqueos.js`.
// Sin efectos secundarios al importar: todo se ejecuta desde setupAdmin() o
// desde funciones que llama panel.js. La visibilidad del botón "Admin" y de
// los botones "Bloquear" se controla con la clase `es-admin` en <body>, de
// modo que las tarjetas ya dibujadas se actualizan solas al cambiar la sesión.

import { leerEstado, mapaFavoritos } from './estado.js';
import { peticionApi } from './api.js';
import { alCambiarSesion, detenerRegistrado } from './registro.js';
import { urlRadioSonando } from './reproductor-radio.js';
import { urlTvSonando } from './reproductor-tv.js';
import {
  mostrarBloqueos,
  panelBloqueosVisible,
  renderBloqueosPanel,
} from './admin-bloqueos.js';

const MAX_MOTIVO = 255;

// La única fuente de verdad del rol es el usuario autenticado que llega de
// /auth/me o del login. Nunca se lee un rol guardado en localStorage.
function esAdmin() {
  const usuario = leerEstado('usuarioActual');
  return !!(usuario && usuario.role === 'admin');
}

// Misma clave que usa favoritos.js: `${type}:${itemId}`.
function claveFavorito(tipo, itemId) {
  return `${tipo}:${itemId != null ? String(itemId) : ''}`;
}

// ---------------------------------------------------------------------------
// Botón "Admin" y visibilidad por sesión
// ---------------------------------------------------------------------------

function crearBotonAdmin() {
  if (document.getElementById('btn-admin')) return;
  const toolbar = document.getElementById('toolbar');
  if (!toolbar) return;

  const boton = document.createElement('button');
  boton.id = 'btn-admin';
  boton.type = 'button';
  boton.className = 'tab-btn accion-btn btn-admin';
  boton.textContent = 'Admin';
  boton.setAttribute('aria-pressed', 'false');
  boton.addEventListener('click', () => {
    if (!esAdmin()) return;
    mostrarBloqueos();
  });

  // Se inserta antes del menú de cuenta para no alterar los ids existentes.
  const cuenta = document.getElementById('cuenta');
  if (cuenta && cuenta.parentNode === toolbar) {
    toolbar.insertBefore(boton, cuenta);
  } else {
    toolbar.appendChild(boton);
  }
}

function desactivarBotonAdmin() {
  const boton = document.getElementById('btn-admin');
  if (!boton) return;
  boton.classList.remove('activo');
  boton.setAttribute('aria-pressed', 'false');
}

// Se ejecuta en cada cambio de sesión: ajusta la clase global y limpia el
// estado de administración cuando el usuario deja de ser administrador.
function manejarCambioSesionAdmin() {
  const admin = esAdmin();
  document.body.classList.toggle('es-admin', admin);

  if (admin) {
    // El botón solo existe mientras haya un administrador autenticado.
    crearBotonAdmin();
    return;
  }

  // Retirar el botón Admin al cerrar sesión o cambiar de usuario.
  const boton = document.getElementById('btn-admin');
  if (boton) boton.remove();

  // Cerrar el formulario sin devolver el foco: la tarjeta que lo abrió puede
  // estar a punto de desaparecer al cerrar sesión.
  if (modalBloqueoEls && !modalBloqueoEls.fondo.hidden) {
    ocultarModalBloqueo();
  }

  // No dejar datos de administración a la vista de un usuario sin permisos.
  if (panelBloqueosVisible()) {
    renderBloqueosPanel({ sinPermiso: true });
  }
}

// ---------------------------------------------------------------------------
// Botón "Bloquear" de cada tarjeta
// ---------------------------------------------------------------------------

// Crea el botón de la tarjeta. Siempre se crea para que la clase `es-admin`
// del <body> lo muestre u oculte por CSS, sin reconstruir la lista.
function crearBotonBloquear(item, tarjeta) {
  if (!item || item.itemId == null || item.itemId === '') return null;

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'btn-bloquear';
  boton.textContent = 'Bloquear';
  const nombre = typeof item.name === 'string' && item.name ? item.name : 'este contenido';
  boton.setAttribute('aria-label', `Bloquear ${nombre}`);
  boton.title = 'Bloquear contenido';

  boton.addEventListener('click', (evento) => {
    // Igual que el corazón: no debe activar la reproducción de la tarjeta.
    evento.preventDefault();
    evento.stopPropagation();
    abrirModalBloqueo(item, tarjeta, boton);
  });

  return boton;
}

// ---------------------------------------------------------------------------
// Modal del formulario de bloqueo
// ---------------------------------------------------------------------------

let modalBloqueoEls = null;
let itemBloqueando = null;
let tarjetaBloqueando = null;
let ultimoFocoBloqueo = null;

function crearModalBloqueo() {
  if (modalBloqueoEls) return modalBloqueoEls;

  const fondo = document.createElement('div');
  fondo.className = 'modal-bloqueo';
  fondo.hidden = true;

  const dialogo = document.createElement('div');
  dialogo.className = 'modal-bloqueo__dialog';
  dialogo.setAttribute('role', 'dialog');
  dialogo.setAttribute('aria-modal', 'true');
  dialogo.setAttribute('aria-labelledby', 'bloqueo-titulo');
  dialogo.setAttribute('aria-describedby', 'bloqueo-detalle');

  const cerrar = document.createElement('button');
  cerrar.type = 'button';
  cerrar.className = 'modal-bloqueo__cerrar';
  cerrar.setAttribute('aria-label', 'Cerrar');
  cerrar.textContent = '×';
  cerrar.addEventListener('click', cerrarModalBloqueo);

  const titulo = document.createElement('h2');
  titulo.id = 'bloqueo-titulo';
  titulo.className = 'modal-bloqueo__titulo';
  titulo.textContent = 'Bloquear contenido';

  const detalle = document.createElement('p');
  detalle.id = 'bloqueo-detalle';
  detalle.className = 'modal-bloqueo__detalle';

  const form = document.createElement('form');
  form.className = 'bloqueo-form';
  form.noValidate = true;

  const label = document.createElement('label');
  label.htmlFor = 'bloqueo-motivo';
  label.className = 'bloqueo-label';
  label.textContent = 'Motivo';

  const input = document.createElement('textarea');
  input.id = 'bloqueo-motivo';
  input.name = 'reason';
  input.rows = 3;
  input.maxLength = MAX_MOTIVO;
  input.required = true;
  input.setAttribute('aria-describedby', 'bloqueo-error');
  // Con el teclado abierto, centra el campo para no perderlo bajo él.
  input.addEventListener('focus', () => input.scrollIntoView({ block: 'center' }));

  const error = document.createElement('p');
  error.id = 'bloqueo-error';
  error.className = 'bloqueo-error';
  error.setAttribute('aria-live', 'polite');

  const acciones = document.createElement('div');
  acciones.className = 'bloqueo-acciones';

  const cancelar = document.createElement('button');
  cancelar.type = 'button';
  cancelar.className = 'bloqueo-cancelar';
  cancelar.textContent = 'Cancelar';
  cancelar.addEventListener('click', cerrarModalBloqueo);

  const confirmar = document.createElement('button');
  confirmar.type = 'submit';
  confirmar.className = 'bloqueo-confirmar';
  confirmar.textContent = 'Bloquear';

  acciones.appendChild(cancelar);
  acciones.appendChild(confirmar);
  form.appendChild(label);
  form.appendChild(input);
  form.appendChild(error);
  form.appendChild(acciones);
  dialogo.appendChild(cerrar);
  dialogo.appendChild(titulo);
  dialogo.appendChild(detalle);
  dialogo.appendChild(form);
  fondo.appendChild(dialogo);
  document.body.appendChild(fondo);

  fondo.addEventListener('click', (evento) => {
    if (evento.target === fondo) cerrarModalBloqueo();
  });
  form.addEventListener('submit', enviarBloqueo);
  document.addEventListener('keydown', manejarTeclaBloqueo);

  modalBloqueoEls = { fondo, dialogo, detalle, input, error, confirmar };
  return modalBloqueoEls;
}

function limpiarFormularioBloqueo() {
  if (!modalBloqueoEls) return;
  modalBloqueoEls.input.value = '';
  modalBloqueoEls.error.textContent = '';
  modalBloqueoEls.input.removeAttribute('aria-invalid');
  modalBloqueoEls.confirmar.disabled = false;
  modalBloqueoEls.confirmar.removeAttribute('aria-busy');
  modalBloqueoEls.confirmar.textContent = 'Bloquear';
}

// Oculta el modal sin tocar el foco (se usa al cerrar sesión).
function ocultarModalBloqueo() {
  if (!modalBloqueoEls) return;
  modalBloqueoEls.fondo.hidden = true;
  limpiarFormularioBloqueo();
  itemBloqueando = null;
  tarjetaBloqueando = null;
  ultimoFocoBloqueo = null;
}

function cerrarModalBloqueo() {
  if (!modalBloqueoEls || modalBloqueoEls.fondo.hidden) return;

  modalBloqueoEls.fondo.hidden = true;
  limpiarFormularioBloqueo();
  itemBloqueando = null;
  tarjetaBloqueando = null;

  // El foco vuelve al botón que abrió el formulario, si sigue en el documento.
  if (ultimoFocoBloqueo && document.contains(ultimoFocoBloqueo)) {
    ultimoFocoBloqueo.focus();
  }
  ultimoFocoBloqueo = null;
}

// Un solo modal a la vez: si el de autenticación está abierto, no se abre este.
function modalAuthAbierto() {
  const modal = document.querySelector('.modal-auth');
  return !!modal && !modal.hidden;
}

function abrirModalBloqueo(item, tarjeta, boton) {
  if (!item || item.itemId == null || item.itemId === '') return;
  if (!esAdmin() || modalAuthAbierto()) return;

  crearModalBloqueo();
  if (modalBloqueoEls.fondo.hidden) {
    ultimoFocoBloqueo =
      document.activeElement instanceof HTMLElement ? document.activeElement : boton;
  }

  itemBloqueando = item;
  tarjetaBloqueando = tarjeta || null;

  // El detalle guarda el nombre y el tipo para no olvidar qué se bloquea.
  const tipo = item.type === 'tv' ? 'TV' : 'Radio';
  const nombre = typeof item.name === 'string' && item.name ? item.name : 'este contenido';
  modalBloqueoEls.detalle.textContent = `${nombre} · ${tipo}`;
  limpiarFormularioBloqueo();

  modalBloqueoEls.fondo.hidden = false;
  modalBloqueoEls.input.focus();
}

function manejarTeclaBloqueo(evento) {
  if (!modalBloqueoEls || modalBloqueoEls.fondo.hidden) return;

  if (evento.key === 'Escape') {
    evento.preventDefault();
    cerrarModalBloqueo();
    return;
  }

  if (evento.key !== 'Tab') return;

  const enfocables = Array.from(
    modalBloqueoEls.dialogo.querySelectorAll(
      'button:not([disabled]), textarea:not([disabled]), input:not([disabled])'
    )
  ).filter((elemento) => elemento.offsetParent !== null);
  if (!enfocables.length) return;

  const primero = enfocables[0];
  const ultimo = enfocables[enfocables.length - 1];
  if (evento.shiftKey && document.activeElement === primero) {
    evento.preventDefault();
    ultimo.focus();
  } else if (!evento.shiftKey && document.activeElement === ultimo) {
    evento.preventDefault();
    primero.focus();
  }
}

function mostrarErrorBloqueo(texto) {
  if (!modalBloqueoEls) return;
  modalBloqueoEls.error.textContent = texto;
  modalBloqueoEls.input.setAttribute('aria-invalid', 'true');
  modalBloqueoEls.input.focus();
}

// Detiene el reproductor solo si lo que suena es exactamente esta tarjeta.
// Los reproductores solo conocen la URL en curso, así que se confirma que la
// URL actual sea la de la tarjeta antes de cortar (no se corta otro contenido).
function detenerSiSuena(item) {
  const url = item.type === 'tv' ? urlTvSonando() : urlRadioSonando();
  if (url && item.streamUrl && url === item.streamUrl) {
    detenerRegistrado(item.type);
  }
}

async function enviarBloqueo(evento) {
  evento.preventDefault();
  if (!modalBloqueoEls || modalBloqueoEls.fondo.hidden) return;
  if (modalBloqueoEls.confirmar.disabled) return;

  const item = itemBloqueando;
  const tarjeta = tarjetaBloqueando;
  if (!item || item.itemId == null) return;

  const motivo = modalBloqueoEls.input.value.trim();
  modalBloqueoEls.error.textContent = '';
  modalBloqueoEls.input.removeAttribute('aria-invalid');

  if (!motivo) {
    modalBloqueoEls.error.textContent = 'El motivo del bloqueo es obligatorio.';
    modalBloqueoEls.input.setAttribute('aria-invalid', 'true');
    modalBloqueoEls.input.focus();
    return;
  }

  const confirmar = modalBloqueoEls.confirmar;
  confirmar.disabled = true;
  confirmar.setAttribute('aria-busy', 'true');
  confirmar.textContent = 'Bloqueando...';

  try {
    const res = await peticionApi('/admin/blocked', {
      method: 'POST',
      body: JSON.stringify({
        type: item.type,
        itemId: String(item.itemId),
        reason: motivo,
      }),
    });

    // 401: api.js ya cerró la sesión local y mostró el aviso.
    if (res.status === 401) {
      cerrarModalBloqueo();
      return;
    }

    if (res.red) {
      mostrarErrorBloqueo('No se pudo conectar con el servidor. Inténtalo de nuevo.');
      return;
    }

    // 403 no cierra la sesión ni retira el botón Admin: solo se informa.
    if (res.status === 403) {
      mostrarErrorBloqueo('No tienes permisos de administrador');
      return;
    }

    if (res.status === 422) {
      const errores = (res.data && res.data.errors) || {};
      const mensaje =
        (errores.reason && errores.reason[0]) ||
        (errores.itemId && errores.itemId[0]) ||
        (errores.type && errores.type[0]) ||
        (res.data && res.data.message) ||
        'No se pudo crear el bloqueo.';
      mostrarErrorBloqueo(mensaje);
      return;
    }

    if (!res.ok) {
      mostrarErrorBloqueo((res.data && res.data.message) || 'No se pudo crear el bloqueo.');
      return;
    }

    // Éxito (201): cortar reproducción, actualizar favoritos y quitar la tarjeta.
    detenerSiSuena(item);
    mapaFavoritos().delete(claveFavorito(item.type, item.itemId));
    if (tarjeta && tarjeta.isConnected) tarjeta.remove();
    cerrarModalBloqueo();
  } finally {
    confirmar.disabled = false;
    confirmar.removeAttribute('aria-busy');
    confirmar.textContent = 'Bloquear';
  }
}

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

function setupAdmin() {
  // La clase del <body> se actualiza en cada cambio de sesión; las tarjetas
  // ya dibujadas muestran u ocultan su botón sin re-renderizarse y el botón
  // Admin se crea o se retira según el rol.
  alCambiarSesion(manejarCambioSesionAdmin);
  manejarCambioSesionAdmin();

  // Al cambiar de vista, el botón "Admin" deja de estar activo.
  const botonFavoritos = document.getElementById('btn-favoritos');
  if (botonFavoritos) botonFavoritos.addEventListener('click', desactivarBotonAdmin);
  document.querySelectorAll('.tab-btn[data-tab]').forEach((btn) => {
    btn.addEventListener('click', desactivarBotonAdmin);
  });
}

export { crearBotonBloquear, setupAdmin };
