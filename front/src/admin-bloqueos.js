// Panel "Bloqueos" del administrador: listado, estados y desbloqueo.
// Separado de `admin.js` para no superar el tamaño razonable por archivo.
// Sin dependencias circulares: este módulo no importa `admin.js`.

import { leerEstado } from './estado.js';
import { mostrarAviso, peticionApi } from './api.js';
import { marcarVistaFavoritos } from './favoritos.js';

let controladorBloqueos = null;
let generacionBloqueos = 0;

// Copia local de la comprobación de rol (admin.js no puede importarse aquí
// sin crear un ciclo). La fuente sigue siendo el usuario autenticado.
function esAdmin() {
  const usuario = leerEstado('usuarioActual');
  return !!(usuario && usuario.role === 'admin');
}

// El panel de bloqueos es el único que pone `country-name` a "Bloqueos";
// sirve para saber si una respuesta atrasada aún puede tocar el panel.
function panelBloqueosVisible() {
  const nombre = document.getElementById('country-name');
  return !!nombre && nombre.textContent === 'Bloqueos';
}

function formatearFecha(valor) {
  if (!valor) return '';
  const fecha = new Date(valor);
  if (Number.isNaN(fecha.getTime())) return '';
  try {
    return fecha.toLocaleString('es-ES', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    // Navegadores sin locale: fecha ISO recortada como respaldo legible.
    return fecha.toISOString().slice(0, 16).replace('T', ' ');
  }
}

function crearFilaBloqueo(bloqueo) {
  const itemId = bloqueo.itemId != null ? String(bloqueo.itemId) : '';

  const li = document.createElement('li');
  li.className = 'emisora bloqueo-item';

  const info = document.createElement('div');
  info.className = 'bloqueo-info';

  const titulo = document.createElement('span');
  titulo.className = 'bloqueo-titulo';
  titulo.textContent = `${bloqueo.type === 'tv' ? 'TV' : 'Radio'} · ${itemId}`;
  info.appendChild(titulo);

  const motivo = document.createElement('span');
  motivo.className = 'bloqueo-motivo';
  motivo.textContent = bloqueo.reason || 'Sin motivo';
  info.appendChild(motivo);

  const fecha = document.createElement('span');
  fecha.className = 'bloqueo-fecha';
  fecha.textContent = formatearFecha(bloqueo.createdAt);
  info.appendChild(fecha);

  li.appendChild(info);

  const boton = document.createElement('button');
  boton.type = 'button';
  boton.className = 'btn-desbloquear';
  boton.textContent = 'Desbloquear';
  boton.setAttribute('aria-label', `Desbloquear ${itemId || 'contenido'}`);
  boton.addEventListener('click', () => desbloquear(bloqueo, li, boton));
  li.appendChild(boton);

  return li;
}

function actualizarContadorBloqueos() {
  if (!panelBloqueosVisible()) return;
  const sidebar = document.getElementById('country-info');
  const codigo = document.getElementById('country-code');
  if (!sidebar || !codigo) return;

  const restantes = sidebar.querySelectorAll('.bloqueos .bloqueo-item').length;
  if (!restantes) {
    codigo.textContent = 'No hay contenido bloqueado.';
    codigo.style.color = '#aaa';
    return;
  }
  codigo.textContent = `${restantes} bloqueo${restantes === 1 ? '' : 's'}`;
  codigo.style.color = '#e0e0e0';
}

function renderBloqueosPanel(estado = {}) {
  const sidebar = document.getElementById('country-info');
  const countryName = document.getElementById('country-name');
  const codigo = document.getElementById('country-code');
  if (!sidebar || !countryName || !codigo) return;

  sidebar.classList.remove('hidden');
  // La lista lleva la clase `emisoras` para que panel.js y favoritos.js la
  // limpien al pintar otra vista.
  sidebar.querySelectorAll('.emisoras, .canales').forEach((lista) => lista.remove());
  countryName.textContent = 'Bloqueos';

  if (estado.sinPermiso) {
    codigo.textContent = 'No tienes permisos de administrador';
    codigo.style.color = '#ff9999';
    return;
  }

  if (estado.cargando) {
    codigo.textContent = 'Cargando bloqueos...';
    codigo.style.color = '#ffd700';
    return;
  }

  if (estado.error) {
    codigo.textContent = 'No se pudieron cargar los bloqueos. Inténtalo de nuevo.';
    codigo.style.color = '#ff9999';
    return;
  }

  const lista = Array.isArray(estado.lista) ? estado.lista : [];
  if (!lista.length) {
    codigo.textContent = 'No hay contenido bloqueado.';
    codigo.style.color = '#aaa';
    return;
  }

  codigo.textContent = `${lista.length} bloqueo${lista.length === 1 ? '' : 's'}`;
  codigo.style.color = '#e0e0e0';

  const ul = document.createElement('ul');
  ul.className = 'emisoras bloqueos';
  lista.forEach((bloqueo) => ul.appendChild(crearFilaBloqueo(bloqueo)));
  sidebar.appendChild(ul);
}

function mostrarBloqueos() {
  if (!esAdmin()) return;

  // El panel de bloqueos ocupa el mismo hueco que "Mis favoritos".
  marcarVistaFavoritos(false);

  const boton = document.getElementById('btn-admin');
  if (boton) {
    boton.classList.add('activo');
    boton.setAttribute('aria-pressed', 'true');
  }

  renderBloqueosPanel({ cargando: true });
  cargarBloqueos();
}

async function cargarBloqueos() {
  if (!esAdmin()) {
    renderBloqueosPanel({ sinPermiso: true });
    return;
  }

  if (controladorBloqueos) controladorBloqueos.abort();
  controladorBloqueos = new AbortController();
  const controlador = controladorBloqueos;
  const generacion = ++generacionBloqueos;

  let res;
  try {
    res = await peticionApi('/admin/blocked', { signal: controlador.signal });
  } finally {
    if (controladorBloqueos === controlador) controladorBloqueos = null;
  }

  // Respuesta atrasada o de una vista que ya no está activa: se ignora.
  if (res.abortado || generacion !== generacionBloqueos || !panelBloqueosVisible()) return;

  if (res.status === 401) return; // La sesión ya se cerró y el aviso se mostró.

  // 403 solo informa; no cierra sesión ni retira el botón Admin.
  if (res.status === 403) {
    renderBloqueosPanel({ sinPermiso: true });
    return;
  }

  if (res.red || !res.ok) {
    renderBloqueosPanel({ error: true });
    return;
  }

  const lista = res.data && Array.isArray(res.data.data) ? res.data.data : [];
  renderBloqueosPanel({ lista });
}

async function desbloquear(bloqueo, fila, boton) {
  if (!esAdmin() || !bloqueo || bloqueo.id == null) return;
  if (boton && boton.disabled) return;

  const tipo = bloqueo.type === 'tv' ? 'el canal' : 'la emisora';
  const confirmado = window.confirm(`¿Desbloquear ${tipo} "${bloqueo.itemId}"?`);
  if (!confirmado) return;

  const generacion = generacionBloqueos;
  if (boton) {
    boton.disabled = true;
    boton.textContent = 'Desbloqueando...';
  }

  try {
    const res = await peticionApi(`/admin/blocked/${encodeURIComponent(bloqueo.id)}`, {
      method: 'DELETE',
    });

    if (res.status === 401) return; // api.js ya cerró la sesión y avisó.

    // Si la lista se volvió a pintar o se cambió de vista, se ignora.
    if (generacion !== generacionBloqueos || !panelBloqueosVisible()) return;

    if (res.ok || res.status === 404) {
      if (fila && fila.isConnected) fila.remove();
      actualizarContadorBloqueos();
      if (res.status === 404) mostrarAviso('El bloqueo ya no existía.');
      return;
    }

    // 403 solo informa; la sesión no se toca.
    if (res.status === 403) {
      mostrarAviso('No tienes permisos de administrador');
      return;
    }

    if (res.red) {
      mostrarAviso('No se pudo conectar con el servidor. Inténtalo de nuevo.');
      return;
    }

    mostrarAviso((res.data && res.data.message) || 'No se pudo desbloquear.');
  } finally {
    if (boton && boton.isConnected) {
      boton.disabled = false;
      boton.textContent = 'Desbloquear';
    }
  }
}

export { mostrarBloqueos, panelBloqueosVisible, renderBloqueosPanel };
