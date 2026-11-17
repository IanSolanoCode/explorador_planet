// Modal de inicio de sesión y registro.
// Importa auth solo para guardar el token y favoritos para refrescar corazones.

import { escribirEstado, leerEstado } from './estado.js';
import { peticionApi } from './api.js';
import { guardarToken } from './auth.js';
import { actualizarCorazonesVisibles, cargarFavoritos } from './favoritos.js';
import { notificarCambioSesion } from './registro.js';

let modalAuthEls = null;
let modoAuth = 'login';
let ultimoFocoModal = null;

function crearCampoAuth({ id, nombre, etiqueta, tipo = 'text', autocomplete }) {
  const contenedor = document.createElement('div');
  contenedor.className = 'auth-campo';

  const label = document.createElement('label');
  label.htmlFor = id;
  label.textContent = etiqueta;

  const input = document.createElement('input');
  input.id = id;
  input.name = nombre;
  input.type = tipo;
  input.autocomplete = autocomplete;
  input.setAttribute('aria-describedby', `${id}-error`);

  const error = document.createElement('p');
  error.id = `${id}-error`;
  error.className = 'auth-error';
  error.setAttribute('aria-live', 'polite');

  contenedor.appendChild(label);
  contenedor.appendChild(input);
  contenedor.appendChild(error);

  return { contenedor, input, error };
}

function crearModalAuth() {
  if (modalAuthEls) return modalAuthEls;

  const fondo = document.createElement('div');
  fondo.className = 'modal-auth';
  fondo.hidden = true;

  const dialogo = document.createElement('div');
  dialogo.className = 'modal-auth__dialog';
  dialogo.setAttribute('role', 'dialog');
  dialogo.setAttribute('aria-modal', 'true');
  dialogo.setAttribute('aria-labelledby', 'auth-titulo');

  const cerrar = document.createElement('button');
  cerrar.type = 'button';
  cerrar.className = 'modal-auth__cerrar';
  cerrar.setAttribute('aria-label', 'Cerrar');
  cerrar.textContent = '×';
  cerrar.addEventListener('click', cerrarModalAuth);

  const titulo = document.createElement('h2');
  titulo.id = 'auth-titulo';
  titulo.className = 'modal-auth__titulo';
  titulo.textContent = 'Iniciar sesión';

  const tabs = document.createElement('div');
  tabs.className = 'auth-tabs';

  const tabLogin = document.createElement('button');
  tabLogin.type = 'button';
  tabLogin.className = 'auth-tab activo';
  tabLogin.textContent = 'Iniciar sesión';
  tabLogin.setAttribute('aria-pressed', 'true');
  tabLogin.addEventListener('click', () => aplicarModoAuth('login'));

  const tabRegistro = document.createElement('button');
  tabRegistro.type = 'button';
  tabRegistro.className = 'auth-tab';
  tabRegistro.textContent = 'Crear cuenta';
  tabRegistro.setAttribute('aria-pressed', 'false');
  tabRegistro.addEventListener('click', () => aplicarModoAuth('registro'));

  tabs.appendChild(tabLogin);
  tabs.appendChild(tabRegistro);

  const form = document.createElement('form');
  form.className = 'auth-form';
  form.noValidate = true;

  const nombre = crearCampoAuth({
    id: 'auth-nombre',
    nombre: 'name',
    etiqueta: 'Nombre',
    autocomplete: 'name',
  });
  const email = crearCampoAuth({
    id: 'auth-email',
    nombre: 'email',
    etiqueta: 'Correo',
    tipo: 'email',
    autocomplete: 'email',
  });
  const password = crearCampoAuth({
    id: 'auth-password',
    nombre: 'password',
    etiqueta: 'Contraseña',
    tipo: 'password',
    autocomplete: 'current-password',
  });
  const confirmacion = crearCampoAuth({
    id: 'auth-password-confirmation',
    nombre: 'password_confirmation',
    etiqueta: 'Confirmar contraseña',
    tipo: 'password',
    autocomplete: 'new-password',
  });

  nombre.contenedor.hidden = true;
  confirmacion.contenedor.hidden = true;

  const mensaje = document.createElement('p');
  mensaje.className = 'auth-mensaje';
  mensaje.setAttribute('role', 'alert');
  mensaje.setAttribute('aria-live', 'assertive');
  mensaje.hidden = true;

  const acciones = document.createElement('div');
  acciones.className = 'auth-acciones';

  const submit = document.createElement('button');
  submit.type = 'submit';
  submit.className = 'auth-submit';
  submit.textContent = 'Entrar';

  acciones.appendChild(submit);

  form.appendChild(nombre.contenedor);
  form.appendChild(email.contenedor);
  form.appendChild(password.contenedor);
  form.appendChild(confirmacion.contenedor);
  form.appendChild(mensaje);
  form.appendChild(acciones);

  form.addEventListener('submit', enviarFormularioAuth);

  dialogo.appendChild(cerrar);
  dialogo.appendChild(titulo);
  dialogo.appendChild(tabs);
  dialogo.appendChild(form);
  fondo.appendChild(dialogo);
  document.body.appendChild(fondo);

  fondo.addEventListener('click', (evento) => {
    if (evento.target === fondo) cerrarModalAuth();
  });

  document.addEventListener('keydown', manejarTeclaModal);

  modalAuthEls = {
    fondo,
    dialogo,
    titulo,
    tabs: { login: tabLogin, registro: tabRegistro },
    form,
    campos: { nombre, email, password, confirmacion },
    mensaje,
    submit,
  };

  return modalAuthEls;
}

function limpiarErroresAuth() {
  if (!modalAuthEls) return;
  Object.values(modalAuthEls.campos).forEach((campo) => {
    campo.error.textContent = '';
    campo.input.removeAttribute('aria-invalid');
  });
  modalAuthEls.mensaje.textContent = '';
  modalAuthEls.mensaje.hidden = true;
}

function mostrarMensajeAuth(texto) {
  if (!modalAuthEls) return;
  modalAuthEls.mensaje.textContent = texto || '';
  modalAuthEls.mensaje.hidden = !texto;
}

function mostrarErroresAuth(errors) {
  if (!modalAuthEls) return null;

  const mapa = {
    name: modalAuthEls.campos.nombre,
    email: modalAuthEls.campos.email,
    password: modalAuthEls.campos.password,
    password_confirmation: modalAuthEls.campos.confirmacion,
  };

  let primerCampo = null;
  Object.entries(mapa).forEach(([nombre, campo]) => {
    const lista = errors && Array.isArray(errors[nombre]) ? errors[nombre] : [];
    const texto = lista.length ? lista.map(String).join(' ') : '';
    campo.error.textContent = texto;
    if (texto) {
      campo.input.setAttribute('aria-invalid', 'true');
      if (!primerCampo) primerCampo = campo.input;
    } else {
      campo.input.removeAttribute('aria-invalid');
    }
  });

  const otros = errors && typeof errors === 'object' ? Object.keys(errors) : [];
  const desconocido = otros.find((nombre) => !Object.prototype.hasOwnProperty.call(mapa, nombre));
  if (desconocido) {
    const lista = Array.isArray(errors[desconocido]) ? errors[desconocido] : [];
    if (lista.length) mostrarMensajeAuth(String(lista[0]));
  }

  return primerCampo;
}

function aplicarModoAuth(modo) {
  if (!modalAuthEls) return;

  modoAuth = modo === 'registro' ? 'registro' : 'login';
  const esRegistro = modoAuth === 'registro';
  const { campos, tabs, titulo, submit } = modalAuthEls;

  campos.nombre.contenedor.hidden = !esRegistro;
  campos.confirmacion.contenedor.hidden = !esRegistro;
  campos.password.input.autocomplete = esRegistro ? 'new-password' : 'current-password';

  tabs.login.classList.toggle('activo', !esRegistro);
  tabs.registro.classList.toggle('activo', esRegistro);
  tabs.login.setAttribute('aria-pressed', esRegistro ? 'false' : 'true');
  tabs.registro.setAttribute('aria-pressed', esRegistro ? 'true' : 'false');

  titulo.textContent = esRegistro ? 'Crear cuenta' : 'Iniciar sesión';
  submit.textContent = esRegistro ? 'Crear cuenta' : 'Entrar';

  limpiarErroresAuth();
  campos.password.input.value = '';
  campos.confirmacion.input.value = '';

  const primerCampo = esRegistro ? campos.nombre.input : campos.email.input;
  primerCampo.focus();
}

function abrirModalAuth(modo = 'login') {
  crearModalAuth();
  if (modalAuthEls.fondo.hidden) {
    ultimoFocoModal = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  }
  modalAuthEls.fondo.hidden = false;
  aplicarModoAuth(modo);
}

function cerrarModalAuth() {
  if (!modalAuthEls || modalAuthEls.fondo.hidden) return;

  modalAuthEls.fondo.hidden = true;
  limpiarErroresAuth();
  modalAuthEls.campos.password.input.value = '';
  modalAuthEls.campos.confirmacion.input.value = '';

  if (ultimoFocoModal && document.contains(ultimoFocoModal)) {
    ultimoFocoModal.focus();
  }
  ultimoFocoModal = null;
}

function obtenerEnfocablesModal() {
  if (!modalAuthEls) return [];
  const selector = 'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex]:not([tabindex="-1"])';
  return Array.from(modalAuthEls.dialogo.querySelectorAll(selector))
    .filter((elemento) => elemento.offsetParent !== null);
}

function manejarTeclaModal(evento) {
  if (!modalAuthEls || modalAuthEls.fondo.hidden) return;

  if (evento.key === 'Escape') {
    evento.preventDefault();
    cerrarModalAuth();
    return;
  }

  if (evento.key !== 'Tab') return;

  const enfocables = obtenerEnfocablesModal();
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

async function enviarFormularioAuth(evento) {
  evento.preventDefault();
  if (!modalAuthEls) return;

  const { campos, submit } = modalAuthEls;
  if (submit.disabled) return;

  limpiarErroresAuth();
  submit.disabled = true;
  submit.setAttribute('aria-busy', 'true');
  submit.textContent = 'Enviando...';

  const datos = {
    email: campos.email.input.value.trim(),
    password: campos.password.input.value,
  };
  if (modoAuth === 'registro') {
    datos.name = campos.nombre.input.value.trim();
    datos.password_confirmation = campos.confirmacion.input.value;
  }

  try {
    const res = await peticionApi(
      modoAuth === 'registro' ? '/auth/register' : '/auth/login',
      {
        method: 'POST',
        body: JSON.stringify(datos),
        usarToken: false,
        manejar401: false,
      }
    );

    if (res.red) {
      mostrarMensajeAuth('No se pudo conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.');
      return;
    }

    if (res.status === 429) {
      mostrarMensajeAuth('Demasiados intentos, espera un minuto');
      return;
    }

    if (res.status === 422) {
      const primerCampo = mostrarErroresAuth(res.data ? res.data.errors : null);
      if (primerCampo) {
        primerCampo.focus();
      } else {
        mostrarMensajeAuth((res.data && res.data.message) || 'Revisa los datos e inténtalo de nuevo.');
      }
      return;
    }

    if (!res.ok) {
      mostrarMensajeAuth((res.data && res.data.message) || 'No se pudo completar la solicitud. Inténtalo de nuevo.');
      return;
    }

    const auth = res.data && res.data.data;
    if (!auth || !auth.token || !auth.user) {
      mostrarMensajeAuth('La respuesta del servidor no es válida. Inténtalo de nuevo.');
      return;
    }

    guardarToken(auth.token);
    escribirEstado('usuarioActual', auth.user);
    escribirEstado('versionSesion', leerEstado('versionSesion') + 1);
    escribirEstado('peticionFavoritosActual', leerEstado('peticionFavoritosActual') + 1);
    notificarCambioSesion();
    actualizarCorazonesVisibles();
    cerrarModalAuth();

    // La carga de favoritos no bloquea el cierre del modal.
    cargarFavoritos({ renderPanel: leerEstado('vistaFavoritos') });
  } finally {
    // Nunca conservar contraseñas en el DOM tras un intento.
    campos.password.input.value = '';
    campos.confirmacion.input.value = '';
    submit.disabled = false;
    submit.removeAttribute('aria-busy');
    submit.textContent = modoAuth === 'registro' ? 'Crear cuenta' : 'Entrar';
  }
}

export { abrirModalAuth };
