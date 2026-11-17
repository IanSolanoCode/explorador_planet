import Globe from 'globe.gl';

import { leerEstado, escribirEstado, mapaFavoritos } from './src/estado.js';
import { configurarManejador401, mostrarAviso, peticionApi } from './src/api.js';
import {
  crearReproductor,
  detenerAudio,
  marcarEmisoraActiva,
  reproducirEmisora,
} from './src/reproductor-radio.js';
import {
  crearReproductorTv,
  detenerTv,
  marcarCanalActivo,
  reproducirCanal,
} from './src/reproductor-tv.js';
import {
  API_BASE,
  cargarVolumen,
  crearLogoEmisora,
} from './src/utils.js';
import {
  getIso2,
  getName,
  normalizarCountry,
  paisSeleccionadoIso2,
} from './src/paises.js';

// Colores de país casi transparentes para dejar ver la textura de la Tierra.
const COLOR_PAIS_BASE = 'rgba(120, 170, 255, 0.10)';
const COLOR_PAIS_HOVER = 'rgba(255, 215, 0, 0.18)';
const COLOR_PAIS_SELECCIONADO = 'rgba(255, 215, 0, 0.35)';

let controladorAbort = null;
let timerRotacion = null;

// Carga de TV: controlador de la petición en curso.
let controladorTv = null;

// --- Sesión y favoritos ---
// El token solo se guarda en localStorage (con try/catch) y se envía como Bearer.
const TOKEN_CLAVE = 'explorador-planet:token';
let controladorFavoritos = null;
let modalAuthEls = null;
let modoAuth = 'login';
let ultimoFocoModal = null;
// Asocia cada corazón con su item para poder actualizarlo sin re-renderizar listas.
const itemsBotonFavorito = new WeakMap();

// --- Estilos del globe.gl ---

function aplicarEstilos() {
  leerEstado('globe')
    .polygonCapColor((f) => {
      if (f === leerEstado('selectedFeature')) return COLOR_PAIS_SELECCIONADO;
      if (f === leerEstado('hoveredFeature')) return COLOR_PAIS_HOVER;
      return COLOR_PAIS_BASE;
    })
    .polygonAltitude((f) => {
      if (f === leerEstado('selectedFeature')) return 0.03;
      if (f === leerEstado('hoveredFeature')) return 0.02;
      return 0.005;
    });
}

// --- Actualización del panel lateral ---

function actualizarPanel(props, datosRadio = null) {
  const iso2 = getIso2(props);
  const codigo = document.getElementById('country-code');
  const countryName = document.getElementById('country-name');
  const sidebar = document.getElementById('country-info');

  // Quitar listas anteriores (radio o TV) para no mezclar modos.
  const listasAnteriores = sidebar.querySelectorAll('.emisoras, .canales');
  listasAnteriores.forEach((lista) => lista.remove());

  // Actualizar nombre del país
  countryName.textContent = getName(props);

  // Mostrar código ISO o mensaje si no tiene código
  if (iso2) {
    codigo.textContent = `Código ISO-2: ${iso2}`;
    codigo.style.color = '#e0e0e0';
  } else {
    codigo.textContent = 'Este territorio no tiene código de país';
    codigo.style.color = '#ff9999';
  }

  // Gestionar sección "Reproduciendo"
  if (leerEstado('modoActual') === 'radio' && datosRadio) {
    if (datosRadio.loading) {
      codigo.textContent = 'Cargando...';
      codigo.style.color = '#ffd700';
    } else if (datosRadio.error) {
      codigo.textContent = `No se pudo cargar la radio, intenta de nuevo`;
      codigo.style.color = '#ff9999';
    } else if (datosRadio.vacio) {
      codigo.textContent = 'Sin emisoras para este país';
      codigo.style.color = '#aaa';
    } else if (datosRadio.cancelled) {
      // Petición cancelada, no hacer nada, mantener estado actual
      return;
    } else if (!iso2) {
      codigo.textContent = 'Este territorio no tiene código de país';
      codigo.style.color = '#ff9999';
    } else {
      // Mostrar lista de emisoras
      codigo.textContent = '';
      codigo.style.color = '#e0e0e0';
      // Construir lista con createElement (no innerHTML con datos API)
      const lista = document.createElement('ul');
      lista.className = 'emisoras';
      
      datosRadio.emisoras.forEach((est) => {
        const li = document.createElement('li');
        li.className = 'emisora';
        li.dataset.url = est.streamUrl || est.url;
        
        // Nombre recortado antes del primer " - "
        const nombreOriginal = est.nombre;
        const nombreCorto = nombreOriginal.split(' - ')[0];
        const url = est.streamUrl || est.url;

        // Datos exactos que necesita POST /favorites. El país se toma del
        // item y, si no es válido, del país que se está viendo.
        const item = {
          type: 'radio',
          itemId: est.id,
          name: nombreCorto,
          country: normalizarCountry(est.country, iso2),
          streamUrl: url,
          logo: est.logo || '',
        };
        
        // Botón real: accesible por teclado y con foco visible.
        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = 'emisora-boton';
        boton.setAttribute('aria-label', `Reproducir ${nombreCorto}`);

        // Logo real si viene de http(s); si no o si falla, 📻.
        boton.appendChild(crearLogoEmisora(est.logo, 'emisora-logo'));

        const spanNombre = document.createElement('span');
        spanNombre.className = 'emisora-nombre';
        spanNombre.textContent = nombreCorto;
        spanNombre.title = nombreOriginal;
        boton.appendChild(spanNombre);
        
        boton.addEventListener('click', () => {
          if (url) reproducirEmisora(url, nombreCorto, est.logo);
        });

        li.appendChild(boton);

        // El corazón solo se añade si la API dio un id real para el item.
        const corazon = crearBotonFavorito(item);
        if (corazon) li.appendChild(corazon);

        lista.appendChild(li);
      });
      
      // Se conserva el <p id="country-code"> y la lista va debajo: así las
      // siguientes actualizaciones del panel siguen encontrando el código.
      sidebar.appendChild(lista);
      marcarEmisoraActiva();
    }
  } else if (leerEstado('modoActual') === 'radio' && !datosRadio) {
    // No hay datos todavía o país sin código
    if (!iso2) {
      codigo.textContent = 'Este territorio no tiene código de país';
      codigo.style.color = '#ff9999';
    }
  }

  // Asegurar que el panel sea visible
  sidebar.classList.remove('hidden');
}

// --- Lógica de Radio ---

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

// --- Pestaña TV ---

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

// Pinta el panel en modo TV con los mismos estados que radio.
function actualizarPanelTv(props, datos = null) {
  if (!props) return;

  const iso2 = getIso2(props);
  const codigo = document.getElementById('country-code');
  const countryName = document.getElementById('country-name');
  const sidebar = document.getElementById('country-info');

  // Quitar listas anteriores (radio o TV) para no mezclar modos.
  sidebar.querySelectorAll('.emisoras, .canales').forEach((lista) => lista.remove());

  countryName.textContent = getName(props);

  if (iso2) {
    codigo.textContent = `Código ISO-2: ${iso2}`;
    codigo.style.color = '#e0e0e0';
  } else {
    codigo.textContent = 'Este territorio no tiene código de país';
    codigo.style.color = '#ff9999';
    return;
  }

  if (!datos || datos.cancelled) return;

  if (datos.loading) {
    codigo.textContent = 'Cargando...';
    codigo.style.color = '#ffd700';
    return;
  }

  if (datos.error) {
    codigo.textContent = `No se pudo cargar la TV desde ${datos.url}`;
    codigo.style.color = '#ff9999';
    return;
  }

  if (datos.vacio) {
    codigo.textContent = 'Sin canales para este país';
    codigo.style.color = '#aaa';
    return;
  }

  codigo.textContent = '';
  codigo.style.color = '#e0e0e0';

  // Tarjetas construidas solo con createElement/textContent (datos de la API).
  const lista = document.createElement('ul');
  lista.className = 'emisoras canales';

  datos.canales.forEach((canal) => {
    const li = document.createElement('li');
    li.className = 'emisora canal';
    li.dataset.url = canal.streamUrl;

    // Datos exactos para crear el favorito; el país ya viene normalizado
    // desde cargarTv (item primero, país seleccionado como respaldo).
    const item = {
      type: 'tv',
      itemId: canal.id,
      name: canal.nombre,
      country: normalizarCountry(canal.country, iso2),
      streamUrl: canal.streamUrl,
      logo: canal.logo || '',
    };

    const boton = document.createElement('button');
    boton.type = 'button';
    boton.className = 'emisora-boton canal-boton';
    boton.setAttribute('aria-label', `Reproducir ${canal.nombre}`);

    // Logo real si es http(s); si falta o falla, 📺.
    boton.appendChild(crearLogoEmisora(canal.logo, 'emisora-logo canal-logo', '📺'));

    const info = document.createElement('span');
    info.className = 'canal-info';

    const spanNombre = document.createElement('span');
    spanNombre.className = 'emisora-nombre canal-nombre';
    spanNombre.textContent = canal.nombre;
    info.appendChild(spanNombre);

    if (canal.categoria) {
      const spanCategoria = document.createElement('span');
      spanCategoria.className = 'canal-categoria';
      spanCategoria.textContent = canal.categoria;
      info.appendChild(spanCategoria);
    }

    boton.appendChild(info);

    if (!canal.secure) {
      const aviso = document.createElement('span');
      aviso.className = 'canal-aviso';
      aviso.textContent = 'Enlace no seguro';
      boton.appendChild(aviso);
    }

    boton.addEventListener('click', () => {
      reproducirCanal(canal.streamUrl, canal.nombre);
    });

    li.appendChild(boton);

    // El corazón solo se añade si la API dio un id real para el canal.
    const corazon = crearBotonFavorito(item);
    if (corazon) li.appendChild(corazon);

    lista.appendChild(li);
  });

  sidebar.appendChild(lista);
  marcarCanalActivo();
}

// --- Cuentas y favoritos ---

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

function claveFavorito(tipo, itemId) {
  return `${tipo}:${itemId != null ? String(itemId) : ''}`;
}

function actualizarBotonCuenta() {
  const boton = document.getElementById('btn-cuenta');
  const menu = document.getElementById('menu-cuenta');
  if (!boton) return;

  if (leerEstado('usuarioActual')) {
    const nombre = leerEstado('usuarioActual').name || 'Mi cuenta';
    boton.textContent = nombre;
    boton.setAttribute('aria-label', `Cuenta de ${nombre}`);
  } else {
    boton.textContent = 'Entrar';
    boton.setAttribute('aria-label', 'Entrar');
    if (menu) menu.hidden = true;
  }

  if (menu) {
    boton.setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
  }
}

function setupCuenta() {
  const boton = document.getElementById('btn-cuenta');
  const menu = document.getElementById('menu-cuenta');
  const botonSalir = document.getElementById('btn-salir');
  const contenedor = document.getElementById('cuenta');

  if (boton) {
    boton.addEventListener('click', (evento) => {
      evento.stopPropagation();
      if (!leerEstado('usuarioActual')) {
        abrirModalAuth('login');
        return;
      }
      if (!menu) return;
      menu.hidden = !menu.hidden;
      boton.setAttribute('aria-expanded', menu.hidden ? 'false' : 'true');
    });
  }

  if (botonSalir) {
    botonSalir.addEventListener('click', (evento) => {
      evento.stopPropagation();
      cerrarSesionRemota();
    });
  }

  if (contenedor) {
    document.addEventListener('click', (evento) => {
      if (!menu || menu.hidden) return;
      if (!contenedor.contains(evento.target)) {
        menu.hidden = true;
        if (boton) boton.setAttribute('aria-expanded', 'false');
      }
    });
  }

  actualizarBotonCuenta();
}

function marcarVistaFavoritos(activa) {
  escribirEstado('vistaFavoritos', !!activa);
  const boton = document.getElementById('btn-favoritos');
  if (!boton) return;
  boton.classList.toggle('activo', leerEstado('vistaFavoritos'));
  boton.setAttribute('aria-pressed', leerEstado('vistaFavoritos') ? 'true' : 'false');
}

function setupFavoritos() {
  const boton = document.getElementById('btn-favoritos');
  if (boton) boton.addEventListener('click', mostrarFavoritos);
  marcarVistaFavoritos(false);
}

// Invalida respuestas de favoritos en curso. Se usa al cerrar sesión para que
// una petición lenta no vuelva a pintar corazones de una sesión ya cerrada.
function invalidarPeticionesFavoritos() {
  escribirEstado('versionSesion', leerEstado('versionSesion') + 1);
  escribirEstado('peticionFavoritosActual', leerEstado('peticionFavoritosActual') + 1);
  if (controladorFavoritos) {
    controladorFavoritos.abort();
    controladorFavoritos = null;
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

  actualizarBotonCuenta();
  actualizarCorazonesVisibles();
  if (leerEstado('vistaFavoritos')) renderFavoritosPanel({ sinSesion: true });
  if (aviso) mostrarAviso(aviso);
}

async function inicializarSesion() {
  actualizarBotonCuenta();
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
    actualizarBotonCuenta();
    actualizarCorazonesVisibles();
    await cargarFavoritos({ renderPanel: leerEstado('vistaFavoritos') });
  }
}

// --- Modal de autenticación ---

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
    if (!auth || !auth.leerEstado('token') || !auth.user) {
      mostrarMensajeAuth('La respuesta del servidor no es válida. Inténtalo de nuevo.');
      return;
    }

    guardarToken(auth.leerEstado('token'));
    escribirEstado('usuarioActual', auth.user);
    escribirEstado('versionSesion', leerEstado('versionSesion') + 1);
    escribirEstado('peticionFavoritosActual', leerEstado('peticionFavoritosActual') + 1);
    actualizarBotonCuenta();
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

// --- Favoritos ---

function convertirFavoritoAItem(favorito) {
  if (!favorito) return null;
  if (favorito.type !== 'tv' && favorito.type !== 'radio') return null;
  if (favorito.itemId == null) return null;

  return {
    type: favorito.type,
    itemId: String(favorito.itemId),
    name: favorito.name || 'Sin nombre',
    country: normalizarCountry(favorito.country, paisSeleccionadoIso2()),
    streamUrl: favorito.streamUrl || '',
    logo: favorito.logo || '',
  };
}

async function cargarFavoritos({ renderPanel = false } = {}) {
  if (!leerEstado('usuarioActual') || !leerEstado('token')) {
    if (renderPanel || leerEstado('vistaFavoritos')) renderFavoritosPanel({ sinSesion: true });
    return;
  }

  if (controladorFavoritos) controladorFavoritos.abort();
  controladorFavoritos = new AbortController();
  const controlador = controladorFavoritos;
  const version = leerEstado('versionSesion');
  const peticion = leerEstado('peticionFavoritosActual') + 1;
  escribirEstado('peticionFavoritosActual', peticion);

  let res;
  try {
    res = await peticionApi('/favorites', { signal: controlador.signal });
  } finally {
    if (controladorFavoritos === controlador) controladorFavoritos = null;
  }

  // Una respuesta vieja o de otra sesión no debe tocar el estado actual.
  if (res.abortado || peticion !== leerEstado('peticionFavoritosActual') || version !== leerEstado('versionSesion') || !leerEstado('usuarioActual')) {
    return;
  }

  if (!res.ok) {
    if (renderPanel || leerEstado('vistaFavoritos')) renderFavoritosPanel({ error: true });
    return;
  }

  const lista = res.data && Array.isArray(res.data.data) ? res.data.data : [];
  mapaFavoritos().clear();
  lista.forEach((favorito) => {
    if (!favorito || (favorito.type !== 'tv' && favorito.type !== 'radio')) return;
    if (favorito.id == null || favorito.itemId == null) return;
    mapaFavoritos().set(claveFavorito(favorito.type, String(favorito.itemId)), favorito);
  });

  actualizarCorazonesVisibles();
  if (renderPanel || leerEstado('vistaFavoritos')) {
    renderFavoritosPanel({ lista: Array.from(mapaFavoritos().values()) });
  }
}

function actualizarBotonFavorito(boton, item) {
  if (!boton || !item || item.itemId == null) return;

  const activo = Boolean(
    leerEstado('usuarioActual') && mapaFavoritos().has(claveFavorito(item.type, String(item.itemId)))
  );
  const nombre = item.name || 'este contenido';
  boton.textContent = activo ? '♥' : '♡';
  boton.classList.toggle('activo', activo);
  boton.setAttribute('aria-pressed', activo ? 'true' : 'false');
  boton.setAttribute('aria-label', activo ? `Quitar ${nombre} de favoritos` : `Añadir ${nombre} a favoritos`);
  boton.title = activo ? 'Quitar de favoritos' : 'Añadir a favoritos';
}

function crearBotonFavorito(item) {
  if (!item || item.itemId == null || item.itemId === '') return null;

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'btn-favorito';
  itemsBotonFavorito.set(boton, item);

  boton.addEventListener('click', (evento) => {
    evento.preventDefault();
    evento.stopPropagation();
    alternarFavorito(item, boton);
  });

  actualizarBotonFavorito(boton, item);
  return boton;
}

function actualizarCorazonesVisibles() {
  document.querySelectorAll('.btn-favorito').forEach((boton) => {
    const item = itemsBotonFavorito.get(boton);
    if (item) actualizarBotonFavorito(boton, item);
  });
}

async function alternarFavorito(item, boton) {
  if (!leerEstado('usuarioActual')) {
    abrirModalAuth('login');
    return;
  }

  if (!item || item.itemId == null || !boton || boton.disabled) return;

  const tipo = item.type === 'tv' || item.type === 'radio' ? item.type : '';
  const nombre = typeof item.name === 'string' ? item.name.trim() : '';
  const itemId = String(item.itemId).trim();
  const country = normalizarCountry(item.country, paisSeleccionadoIso2());
  const streamUrl = typeof item.streamUrl === 'string' ? item.streamUrl : '';

  if (!tipo || !itemId || !nombre || !country || !/^https?:\/\//i.test(streamUrl)) {
    mostrarAviso('No se puede guardar este contenido como favorito.');
    return;
  }

  const clave = claveFavorito(tipo, itemId);
  const favorito = mapaFavoritos().get(clave);
  const version = leerEstado('versionSesion');

  boton.disabled = true;
  try {
    if (favorito) {
      const res = await peticionApi(`/favorites/${encodeURIComponent(favorito.id)}`, {
        method: 'DELETE',
      });

      if (version !== leerEstado('versionSesion') || !leerEstado('usuarioActual')) return;

      if (res.ok || res.status === 404) {
        mapaFavoritos().delete(clave);
        actualizarBotonFavorito(boton, item);
        if (res.status === 404) mostrarAviso('El favorito ya no existía.');
      } else if (res.red) {
        mostrarAviso('No se pudo conectar con el servidor. Inténtalo de nuevo.');
      } else {
        mostrarAviso((res.data && res.data.message) || 'No se pudo quitar el favorito.');
      }
      return;
    }

    const body = {
      type: tipo,
      itemId,
      name: nombre,
      country,
      streamUrl,
      logo: typeof item.logo === 'string' && /^https?:\/\//i.test(item.logo) ? item.logo : null,
    };

    const res = await peticionApi('/favorites', {
      method: 'POST',
      body: JSON.stringify(body),
    });

    if (version !== leerEstado('versionSesion') || !leerEstado('usuarioActual')) return;

    if (res.ok) {
      const creado = res.data && res.data.data;
      if (creado && creado.id != null) {
        mapaFavoritos().set(clave, creado);
        actualizarBotonFavorito(boton, item);
      } else {
        mostrarAviso('No se pudo confirmar el favorito.');
      }
    } else if (res.red) {
      mostrarAviso('No se pudo conectar con el servidor. Inténtalo de nuevo.');
    } else if (res.status === 422) {
      const errors = (res.data && res.data.errors) || {};
      const mensaje =
        (errors.itemId && errors.itemId[0]) ||
        (errors.favorite && errors.favorite[0]) ||
        (res.data && res.data.message) ||
        'No se pudo añadir el favorito.';
      mostrarAviso(mensaje);
    } else {
      mostrarAviso((res.data && res.data.message) || 'No se pudo añadir el favorito.');
    }
  } finally {
    boton.disabled = false;
    // Si la sesión cambió, cerrarSesionLocal ya actualizó todos los corazones.
    if (version === leerEstado('versionSesion')) actualizarBotonFavorito(boton, item);
  }
}

function crearTarjetaFavorito(item) {
  const li = document.createElement('li');
  li.className = 'emisora favorito-item';
  li.dataset.url = item.streamUrl;

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'emisora-boton';
  boton.setAttribute('aria-label', `Reproducir ${item.name}`);

  if (!item.streamUrl) {
    boton.disabled = true;
    boton.title = 'Este favorito no tiene una URL de reproducción';
  }

  const emoji = item.type === 'tv' ? '📺' : '📻';
  boton.appendChild(crearLogoEmisora(item.logo, 'emisora-logo', emoji));

  const info = document.createElement('span');
  info.className = 'favorito-info';

  const nombre = document.createElement('span');
  nombre.className = 'emisora-nombre';
  nombre.textContent = item.name;
  nombre.title = item.name;
  info.appendChild(nombre);

  const tipo = document.createElement('span');
  tipo.className = 'favorito-tipo';
  const etiquetaTipo = item.type === 'tv' ? 'TV' : 'Radio';
  tipo.textContent = item.country ? `${etiquetaTipo} · ${item.country}` : etiquetaTipo;
  info.appendChild(tipo);

  boton.appendChild(info);

  boton.addEventListener('click', () => {
    if (!item.streamUrl) return;
    if (item.type === 'tv') {
      reproducirCanal(item.streamUrl, item.name);
    } else {
      reproducirEmisora(item.streamUrl, item.name, item.logo);
    }
  });

  li.appendChild(boton);

  const corazon = crearBotonFavorito(item);
  if (corazon) li.appendChild(corazon);

  return li;
}

function renderFavoritosPanel(estado = {}) {
  const sidebar = document.getElementById('country-info');
  const countryName = document.getElementById('country-name');
  const codigo = document.getElementById('country-code');
  if (!sidebar || !countryName || !codigo) return;

  sidebar.classList.remove('hidden');
  sidebar.querySelectorAll('.emisoras, .canales').forEach((lista) => lista.remove());
  countryName.textContent = 'Mis favoritos';

  if (estado.sinSesion) {
    codigo.textContent = 'Inicia sesión para ver tus favoritos.';
    codigo.style.color = '#aaa';
    return;
  }

  if (estado.cargando) {
    codigo.textContent = 'Cargando favoritos...';
    codigo.style.color = '#ffd700';
    return;
  }

  if (estado.error) {
    codigo.textContent = 'No se pudieron cargar tus favoritos. Inténtalo de nuevo.';
    codigo.style.color = '#ff9999';
    return;
  }

  const fuente = Array.isArray(estado.lista) ? estado.lista : Array.from(mapaFavoritos().values());
  const items = fuente.map(convertirFavoritoAItem).filter(Boolean);

  if (!items.length) {
    codigo.textContent = 'Todavía no tienes favoritos.';
    codigo.style.color = '#aaa';
    return;
  }

  codigo.textContent = `${items.length} favorito${items.length === 1 ? '' : 's'}`;
  codigo.style.color = '#e0e0e0';

  const lista = document.createElement('ul');
  lista.className = 'emisoras favoritos';
  items.forEach((item) => lista.appendChild(crearTarjetaFavorito(item)));
  sidebar.appendChild(lista);
}

function mostrarFavoritos() {
  marcarVistaFavoritos(true);

  if (!leerEstado('usuarioActual')) {
    renderFavoritosPanel({ sinSesion: true });
    abrirModalAuth('login');
    return;
  }

  const cargados = Array.from(mapaFavoritos().values());
  renderFavoritosPanel(cargados.length ? { lista: cargados } : { cargando: true });
  cargarFavoritos({ renderPanel: true });
}

function setupCuentaYFavoritos() {
  setupCuenta();
  setupFavoritos();
}

// --- Eventos del toolbar ---

function setupToolbar() {
  // Solo las pestañas reales; la cuenta y "Mis favoritos" usan otras acciones.
  const botones = document.querySelectorAll('.tab-btn[data-tab]');
  
  botones.forEach((btn) => {
    btn.addEventListener('click', () => {
      // Quitar clase active de todos
      botones.forEach((b) => b.classList.remove('active'));
      // Añadir clase active al clicado
      btn.classList.add('active');
      
      const tab = btn.dataset.tab;
      console.log('Modo cambiado a:', tab);
      escribirEstado('modoActual', tab);
      marcarVistaFavoritos(false);
      
      if (tab === 'tv') {
        // Detener lo que suene y cancelar la carga de radio en curso.
        detenerAudio();
        detenerTv();
        if (controladorAbort) controladorAbort.abort();

        const feature = leerEstado('selectedFeature');
        if (!feature) {
          const codigo = document.getElementById('country-code');
          codigo.textContent = 'Selecciona un país para ver canales de TV';
          codigo.style.color = '#aaa';
        } else {
          const iso2 = getIso2(feature.properties);
          if (iso2) {
            actualizarPanelTv(feature.properties, { loading: true });
            cargarTv(iso2).then((datos) => {
              // Descartar respuestas si el usuario cambió de pestaña o de país.
              if (leerEstado('modoActual') !== 'tv' || leerEstado('selectedFeature') !== feature) return;
              actualizarPanelTv(feature.properties, datos);
            });
          } else {
            actualizarPanelTv(feature.properties, null);
          }
        }
      } else if (tab === 'radio') {
        // Al volver a radio, cortar la TV y su carga pendiente.
        detenerTv();
        if (controladorTv) controladorTv.abort();

        // Si hay un país seleccionado, recargar radio de ese país
        if (leerEstado('selectedFeature')) {
          const feature = leerEstado('selectedFeature');
          const iso2 = getIso2(feature.properties);
          if (iso2) {
            cargarRadio(iso2).then(datos => {
              if (leerEstado('modoActual') !== 'radio' || leerEstado('selectedFeature') !== feature) return;
              actualizarPanel(feature.properties, datos);
            });
          } else {
            actualizarPanel(feature.properties, { sinCodigo: true });
          }
        } else {
          // Si no hay país seleccionado, limpiar panel
          actualizarPanel({});
        }
      }
    });
  });
}

// --- Manejo de clic en país ---

// Centro aproximado del país: promedio de sus coordenadas, ajustando el
// antimeridiano (±360) para no cruzar el globo en países como Rusia o Fiyi.
function calcularCentro(feature) {
  const puntos = [];
  const recolectar = (arr) => {
    if (typeof arr[0] === 'number') {
      puntos.push(arr);
    } else {
      arr.forEach(recolectar);
    }
  };
  const geo = feature.geometry;
  if (geo && geo.coordinates) recolectar(geo.coordinates);
  if (!puntos.length) return { lat: 0, lng: 0 };

  const refLng = puntos[0][0];
  let sumLat = 0;
  let sumLng = 0;
  puntos.forEach(([lng, lat]) => {
    let l = lng;
    while (l - refLng > 180) l -= 360;
    while (l - refLng < -180) l += 360;
    sumLat += lat;
    sumLng += l;
  });
  return { lat: sumLat / puntos.length, lng: sumLng / puntos.length };
}

function handleCountryClick(feature) {
  escribirEstado('selectedFeature', feature);
  marcarVistaFavoritos(false);
  aplicarEstilos();

  // Vuelo suave de la cámara hacia el país seleccionado (~1 s).
  const centro = calcularCentro(feature);
  leerEstado('globe').pointOfView({ lat: centro.lat, lng: centro.lng, altitude: 1.6 }, 1000);

  const iso2 = getIso2(feature.properties);

  // La pestaña activa decide qué módulo cargar; ya no se fuerza radio.
  if (leerEstado('modoActual') === 'tv') {
    if (iso2) {
      actualizarPanelTv(feature.properties, { loading: true });
      cargarTv(iso2).then((datos) => {
        // Descartar respuestas si cambió la pestaña o el país seleccionado.
        if (leerEstado('modoActual') !== 'tv' || leerEstado('selectedFeature') !== feature) return;
        actualizarPanelTv(feature.properties, datos);
      });
    } else {
      // País sin código: mostrar mensaje y no llamar a API
      actualizarPanelTv(feature.properties, null);
    }
    return;
  }

  if (iso2) {
    // Cargar radio para este país
    cargarRadio(iso2).then(datos => {
      if (leerEstado('modoActual') !== 'radio' || leerEstado('selectedFeature') !== feature) return;
      actualizarPanel(feature.properties, datos);
    });
  } else {
    // País sin código: mostrar mensaje y no llamar a API
    actualizarPanel(feature.properties, { sinCodigo: true });
  }
}

// --- Inicialización del globe ---

async function initGlobe() {
  const res = await fetch('/countries/ne_110m_admin_0_countries.geojson');
  if (!res.ok) throw new Error(`No se pudo cargar el mapa (HTTP ${res.status})`);
  const { features } = await res.json();

  const globe = Globe()(document.getElementById('globe'))
    .backgroundColor('#0a0a0f')
    .globeImageUrl('/textures/earth-blue-marble.jpg')
    .bumpImageUrl('/textures/earth-topology.png')
    .backgroundImageUrl('/textures/night-sky.png')
    .showAtmosphere(true)
    .atmosphereColor('lightskyblue')
    .atmosphereAltitude(0.1)
    .polygonsData(features)
    .polygonSideColor(() => 'rgba(0, 0, 0, 0)')
    .polygonStrokeColor(() => 'rgba(160, 190, 255, 0.25)')
    .polygonsTransitionDuration(300)
    .polygonLabel((f) => {
      const iso2 = getIso2(f.properties);
      const nombre = getName(f.properties);
      return iso2 ? `<b>${nombre}</b> (${iso2})` : `<b>${nombre}</b>`;
    })
    .onPolygonClick((f) => handleCountryClick(f))
    .onPolygonHover((f) => {
      escribirEstado('hoveredFeature', f);
      aplicarEstilos();
    });

  escribirEstado('globe', globe);
  aplicarEstilos();
  configurarControles();
  leerEstado('globe').renderer().setPixelRatio(Math.min(window.devicePixelRatio, 2));
}

// Controles de cámara: inercia, zoom limitado y rotación que se pausa al interactuar
function configurarControles() {
  const c = leerEstado('globe').controls();
  c.enableDamping = true;
  c.dampingFactor = 0.08;
  c.minDistance = 150;
  c.maxDistance = 500;
  c.autoRotate = true;
  c.autoRotateSpeed = 0.3;

  c.addEventListener('start', () => {
    c.autoRotate = false;
    if (timerRotacion) {
      clearTimeout(timerRotacion);
      timerRotacion = null;
    }
  });

  c.addEventListener('end', () => {
    if (timerRotacion) clearTimeout(timerRotacion);
    timerRotacion = setTimeout(() => {
      c.autoRotate = true;
      timerRotacion = null;
    }, 3000);
  });
}

// --- Inicialización de la aplicación ---

async function init() {
  // El token y el volumen se leen al arrancar; los módulos no tocan
  // localStorage al importarse.
  escribirEstado('token', leerToken());
  escribirEstado('volumenRecordado', cargarVolumen());
  // El 401 se maneja aquí, fuera de api.js, para no crear un ciclo con auth.
  configurarManejador401(({ aviso }) => cerrarSesionLocal({ aviso }));

  await initGlobe();
  crearReproductor();
  crearReproductorTv();
  setupToolbar();
  setupCuentaYFavoritos();

  // La validación de sesión y la carga de favoritos no bloquean el globo.
  inicializarSesion().catch((err) => {
    console.error('Error comprobando la sesión:', err);
  });
  
  // Verificar que la variable de entorno esté configurada
  if (!import.meta.env.VITE_API_URL) {
    console.warn('VITE_API_URL no está configurada. Usando URL por defecto.');
    console.log('Para configurar: VITE_API_URL=http://127.0.0.1:8000/api');
  }
}

init().catch((err) => {
  console.error('Error inicializando la aplicación:', err);
});