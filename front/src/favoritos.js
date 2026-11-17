// Favoritos: corazones, lista del panel y peticiones a la API.
// No importa panel.js ni modal-auth.js: el panel reconstruye la lista al
// cambiar de modo y el modal se inyecta con configurarAperturaAuth().

import { escribirEstado, leerEstado, mapaFavoritos } from './estado.js';
import { normalizarCountry, paisSeleccionadoIso2 } from './paises.js';
import { crearLogoEmisora } from './utils.js';
import { mostrarAviso, peticionApi } from './api.js';
import { reproducirEmisora } from './reproductor-radio.js';
import { reproducirCanal } from './reproductor-tv.js';

let controladorFavoritos = null;
// Asocia cada corazón con su item para poder actualizarlo sin re-renderizar listas.
const itemsBotonFavorito = new WeakMap();

// Clave estable `${type}:${itemId}` usada en el Map de favoritos.
function claveFavorito(tipo, itemId) {
  return `${tipo}:${itemId != null ? String(itemId) : ''}`;
}

// La apertura del modal se configura desde init() (main.js).
let abrirModal = null;

export function configurarAperturaAuth(fn) {
  abrirModal = fn;
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
    abrirModal('login');
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
    abrirModal('login');
    return;
  }

  const cargados = Array.from(mapaFavoritos().values());
  renderFavoritosPanel(cargados.length ? { lista: cargados } : { cargando: true });
  cargarFavoritos({ renderPanel: true });
}


export {
  actualizarCorazonesVisibles,
  cargarFavoritos,
  crearBotonFavorito,
  invalidarPeticionesFavoritos,
  marcarVistaFavoritos,
  renderFavoritosPanel,
  setupFavoritos,
};
