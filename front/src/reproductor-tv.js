// Reproductor de TV fijo.
// Mantiene su propio <video>, carga hls.js bajo demanda y conserva sus
// referencias al DOM. Detiene la radio mediante el registro compartido.

import { escribirEstado, leerEstado } from './estado.js';
import { guardarVolumen } from './utils.js';
import { detenerRegistrado, registrarDetenedor } from './registro.js';
import { ajustarVolumenAudio } from './reproductor-radio.js';

// TV: estado independiente del reproductor de radio.
let videoActual = null;
let hlsActual = null;
let canalActual = null; // { nombre, url } del canal en reproducción
let reproductorTvEls = null;
let intentoTv = 0; // invalida arranques asíncronos antiguos (import de hls.js)
let HlsClase = null; // módulo hls.js cargado bajo demanda

function setEstadoTv(estado) {
  if (!reproductorTvEls) return;
  const textos = {
    conectando: 'Conectando...',
    reproduciendo: 'Reproduciendo',
    error: 'Este canal no responde o no permite reproducirse desde el navegador',
  };
  reproductorTvEls.estado.textContent = textos[estado] || '';
  reproductorTvEls.contenedor.dataset.estado = estado;
}

function actualizarBotonPausaTv() {
  if (!reproductorTvEls) return;
  const pausado = !videoActual || videoActual.paused;
  reproductorTvEls.btnPausa.textContent = pausado ? '▶' : '⏸';
  reproductorTvEls.btnPausa.setAttribute('aria-label', pausado ? 'Reanudar' : 'Pausar');
}

function actualizarBotonSilencioTv() {
  if (!reproductorTvEls) return;
  const mudo = !!(videoActual && videoActual.muted);
  reproductorTvEls.btnMute.textContent = mudo ? '🔇' : '🔊';
  reproductorTvEls.btnMute.setAttribute('aria-label', mudo ? 'Activar sonido' : 'Silenciar');
  reproductorTvEls.btnMute.setAttribute('aria-pressed', mudo ? 'true' : 'false');
}

// Marca en la lista el canal que está sonando (por URL del stream).
function marcarCanalActivo() {
  document.querySelectorAll('.canales .canal').forEach((li) => {
    const activo = !!(canalActual && li.dataset.url === canalActual.url);
    li.classList.toggle('activa', activo);
    const boton = li.querySelector('.canal-boton');
    if (boton) boton.setAttribute('aria-current', activo ? 'true' : 'false');
  });
}

function alternarPausaTv() {
  if (!videoActual || !canalActual) return;
  if (videoActual.paused) {
    setEstadoTv('conectando');
    intentarReproducirVideo(videoActual);
  } else {
    videoActual.pause();
  }
  actualizarBotonPausaTv();
}

function alternarSilencioTv() {
  if (!videoActual) return;
  videoActual.muted = !videoActual.muted;
  actualizarBotonSilencioTv();
}

function alternarPantallaCompleta() {
  if (!reproductorTvEls) return;
  const contenedor = reproductorTvEls.contenedor;

  // Se alterna sobre el contenedor para que los controles sigan visibles.
  if (document.fullscreenElement === contenedor) {
    if (typeof document.exitFullscreen === 'function') {
      document.exitFullscreen();
    }
    return;
  }

  if (typeof contenedor.requestFullscreen !== 'function') return;
  contenedor.requestFullscreen().catch(() => {
    // Si el navegador rechaza la petición, no se cambia el estado.
  });
}

// Carga hls.js bajo demanda: no pesa en la carga inicial de la página.
async function cargarHls() {
  if (!HlsClase) {
    const modulo = await import('hls.js');
    HlsClase = modulo.default || modulo;
  }
  return HlsClase;
}

// Construye una sola vez el reproductor de TV.
function crearReproductorTv() {
  if (reproductorTvEls) return;

  const contenedor = document.createElement('section');
  contenedor.id = 'tv-player';
  contenedor.className = 'reproductor reproductor--tv';
  contenedor.hidden = true; // Oculto hasta que haya un canal.
  contenedor.setAttribute('aria-label', 'Reproductor de TV');

  const pantalla = document.createElement('div');
  pantalla.className = 'tv-pantalla';

  const info = document.createElement('div');
  info.className = 'reproductor-info';

  const nombre = document.createElement('span');
  nombre.className = 'reproductor-nombre';

  const estado = document.createElement('span');
  estado.className = 'reproductor-estado';
  estado.setAttribute('aria-live', 'polite');

  const controles = document.createElement('div');
  controles.className = 'reproductor-controles';

  const btnPausa = document.createElement('button');
  btnPausa.type = 'button';
  btnPausa.className = 'btn-control';
  btnPausa.setAttribute('aria-label', 'Pausar');
  btnPausa.textContent = '⏸';
  btnPausa.addEventListener('click', alternarPausaTv);

  const btnMute = document.createElement('button');
  btnMute.type = 'button';
  btnMute.className = 'btn-control';
  btnMute.setAttribute('aria-label', 'Silenciar');
  btnMute.setAttribute('aria-pressed', 'false');
  btnMute.textContent = '🔊';
  btnMute.addEventListener('click', alternarSilencioTv);

  const volumen = document.createElement('input');
  volumen.type = 'range';
  volumen.className = 'volumen';
  volumen.min = '0';
  volumen.max = '1';
  volumen.step = '0.01';
  volumen.value = String(leerEstado('volumenRecordado'));
  volumen.setAttribute('aria-label', 'Volumen');
  volumen.addEventListener('input', () => {
    escribirEstado('volumenRecordado', Number(volumen.value));
    if (videoActual) videoActual.volume = leerEstado('volumenRecordado');
    ajustarVolumenAudio(leerEstado('volumenRecordado'));
    guardarVolumen(leerEstado('volumenRecordado'));
  });

  const btnPantalla = document.createElement('button');
  btnPantalla.type = 'button';
  btnPantalla.className = 'btn-control';
  btnPantalla.setAttribute('aria-label', 'Pantalla completa');
  btnPantalla.textContent = '⛶';
  btnPantalla.addEventListener('click', alternarPantallaCompleta);

  const btnDetener = document.createElement('button');
  btnDetener.type = 'button';
  btnDetener.className = 'btn-control';
  btnDetener.setAttribute('aria-label', 'Detener');
  btnDetener.textContent = '⏹';
  btnDetener.addEventListener('click', detenerTv);

  info.appendChild(nombre);
  info.appendChild(estado);
  controles.appendChild(btnPausa);
  controles.appendChild(btnMute);
  controles.appendChild(volumen);
  controles.appendChild(btnPantalla);
  controles.appendChild(btnDetener);
  contenedor.appendChild(pantalla);
  contenedor.appendChild(info);
  contenedor.appendChild(controles);
  document.body.appendChild(contenedor);

  // Refleja el estado real de pantalla completa en el aria-label.
  document.addEventListener('fullscreenchange', () => {
    const activa = document.fullscreenElement === contenedor;
    btnPantalla.setAttribute(
      'aria-label',
      activa ? 'Salir de pantalla completa' : 'Pantalla completa'
    );
  });

  reproductorTvEls = {
    contenedor,
    pantalla,
    nombre,
    estado,
    btnPausa,
    btnMute,
    volumen,
    btnPantalla,
    btnDetener,
  };
  // La radio se detiene mediante este registro, sin importar su módulo.
  registrarDetenedor('tv', detenerTv);
}

// Libera hls.js y el <video> actual sin tocar la visibilidad del reproductor.
function limpiarReproductorTv() {
  if (hlsActual) {
    // destroy() detiene descargas y elimina los listeners internos.
    hlsActual.destroy();
    hlsActual = null;
  }

  if (videoActual) {
    const video = videoActual;
    videoActual = null;
    video.pause();
    video.removeAttribute('src');
    video.load();
    if (video.parentNode) video.parentNode.removeChild(video);
  }

  canalActual = null;
  marcarCanalActivo();
}

function detenerTv() {
  intentoTv += 1; // Invalida cualquier arranque asíncrono pendiente.

  // No dejar el navegador en pantalla completa sobre un reproductor oculto.
  if (
    reproductorTvEls &&
    document.fullscreenElement === reproductorTvEls.contenedor &&
    typeof document.exitFullscreen === 'function'
  ) {
    document.exitFullscreen();
  }

  limpiarReproductorTv();

  if (reproductorTvEls) {
    reproductorTvEls.contenedor.hidden = true;
    setEstadoTv('inactivo');
  }
}

function intentarReproducirVideo(video) {
  const intento = video.play();
  if (intento !== undefined) {
    intento.catch((e) => {
      if (video !== videoActual) return;
      // AbortError: pausa o cambio de canal mientras cargaba.
      if (e && e.name === 'AbortError') return;
      setEstadoTv('error');
      actualizarBotonPausaTv();
    });
  }
}

/**
 * Reproduce un canal de TV.
 * Orden: hls.js si está soportado; si no, HLS nativo; si no, error claro.
 * @param {string} streamUrl - URL del stream
 * @param {string} nombre - Nombre del canal
 */
async function reproducirCanal(streamUrl, nombre) {
  crearReproductorTv();
  detenerRegistrado('radio'); // Solo un reproductor activo a la vez.

  limpiarReproductorTv();
  const intento = ++intentoTv;

  canalActual = { nombre, url: streamUrl };
  reproductorTvEls.contenedor.hidden = false;
  reproductorTvEls.nombre.textContent = nombre;
  setEstadoTv('conectando');
  marcarCanalActivo();

  const video = document.createElement('video');
  video.className = 'tv-video';
  video.playsInline = true;
  video.volume = leerEstado('volumenRecordado');
  video.muted = false;
  reproductorTvEls.pantalla.appendChild(video);
  videoActual = video;

  // Solo actualizar la UI si este video sigue siendo el actual.
  video.addEventListener('playing', () => {
    if (video !== videoActual) return;
    setEstadoTv('reproduciendo');
    actualizarBotonPausaTv();
  });

  video.addEventListener('waiting', () => {
    if (video !== videoActual) return;
    if (!video.paused) setEstadoTv('conectando');
  });

  video.addEventListener('error', () => {
    if (video !== videoActual) return;
    setEstadoTv('error');
    actualizarBotonPausaTv();
  });

  video.addEventListener('play', actualizarBotonPausaTv);
  video.addEventListener('pause', actualizarBotonPausaTv);

  actualizarBotonSilencioTv();
  actualizarBotonPausaTv();

  let Hls = null;
  try {
    Hls = await cargarHls();
  } catch (e) {
    console.error('No se pudo cargar hls.js:', e);
  }

  // Mientras se cargaba el módulo pudo cambiar el canal, detenerse o cambiarse de pestaña.
  if (intento !== intentoTv) return;

  if (Hls && Hls.isSupported()) {
    const hls = new Hls();
    hlsActual = hls;

    hls.on(Hls.Events.ERROR, (evento, datos) => {
      if (hls !== hlsActual) return;
      if (!datos || !datos.fatal) return; // Los no fatales se recuperan solos.

      // Error irrecuperable (red/media): estado claro y liberar la instancia.
      setEstadoTv('error');
      actualizarBotonPausaTv();
      hls.destroy();
      if (hlsActual === hls) hlsActual = null;
    });

    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      if (hls !== hlsActual) return;
      intentarReproducirVideo(video);
    });

    hls.loadSource(streamUrl);
    hls.attachMedia(video);
    return;
  }

  if (video.canPlayType('application/vnd.apple.mpegurl')) {
    video.src = streamUrl;
    intentarReproducirVideo(video);
    return;
  }

  setEstadoTv('error');
}



// URL del canal que está en reproducción ahora ('' si no hay ninguno).
// Permite a la administración comprobar que el contenido a bloquear es
// justo el que suena antes de detenerlo.
function urlTvSonando() {
  return canalActual ? canalActual.url : '';
}

// Se registra dentro de crearReproductorTv(), que llama init().
export { crearReproductorTv, reproducirCanal, detenerTv, marcarCanalActivo, urlTvSonando };
