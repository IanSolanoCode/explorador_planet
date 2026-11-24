// Mini reproductor de radio fijo.
// Mantiene su propio <audio> y sus referencias al DOM. Detiene la TV a través
// del registro compartido para no importar el módulo de TV.

import { escribirEstado, leerEstado } from './estado.js';
import { crearLogoEmisora, guardarVolumen } from './utils.js';
import { detenerRegistrado, registrarDetenedor } from './registro.js';
import {
  crearBotonCerrar,
  crearBotonMinimizar,
  aplicarMinimizado,
  alternarMinimizado,
  crearIconoAltavoz,
} from './reproductor-ui.js';

let audioActual = null;
let emisoraActual = null; // { nombre, url, logo } que suena ahora
let reproductorEls = null; // referencias al mini reproductor fijo

// Construye una sola vez el reproductor fijo y guarda sus referencias.
function crearReproductor() {
  if (reproductorEls) return;

  const contenedor = document.createElement('section');
  contenedor.id = 'radio-player';
  contenedor.className = 'reproductor';
  contenedor.hidden = true; // Oculto hasta que haya una emisora.
  contenedor.setAttribute('aria-label', 'Reproductor de radio');

  const logo = crearLogoEmisora('', 'reproductor-logo');

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
  btnPausa.className = 'btn-control reproductor-pausa';
  btnPausa.setAttribute('aria-label', 'Pausar');
  btnPausa.textContent = '⏸';
  btnPausa.addEventListener('click', alternarPausa);

  const btnMute = document.createElement('button');
  btnMute.type = 'button';
  btnMute.className = 'btn-control reproductor-mute';
  btnMute.setAttribute('aria-label', 'Silenciar');
  btnMute.setAttribute('aria-pressed', 'false');
  btnMute.appendChild(crearIconoAltavoz(false));
  btnMute.addEventListener('click', alternarSilencio);

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
    if (audioActual) audioActual.volume = leerEstado('volumenRecordado');
    guardarVolumen(leerEstado('volumenRecordado'));
  });

  const btnDetener = document.createElement('button');
  btnDetener.type = 'button';
  btnDetener.className = 'btn-control btn-detener reproductor-detener';
  btnDetener.setAttribute('aria-label', 'Detener');
  btnDetener.textContent = '⏹';
  btnDetener.addEventListener('click', detenerAudio);

  // Minimizar y cerrar: se crean aquí para compartir el estado minimizado.
  const btnMinimizar = crearBotonMinimizar(() => alternarMinimizado(contenedor, btnMinimizar));
  const btnCerrar = crearBotonCerrar(detenerAudio);

  info.appendChild(nombre);
  info.appendChild(estado);
  controles.appendChild(btnPausa);
  controles.appendChild(btnMute);
  controles.appendChild(volumen);
  controles.appendChild(btnDetener);
  controles.appendChild(btnMinimizar);
  contenedor.appendChild(logo);
  contenedor.appendChild(info);
  contenedor.appendChild(controles);
  contenedor.appendChild(btnCerrar);
  document.body.appendChild(contenedor);

  reproductorEls = { contenedor, logo, nombre, estado, btnPausa, btnMute, volumen, btnDetener, btnMinimizar, btnCerrar };
  // La TV se detiene mediante este registro, sin importar su módulo.
  registrarDetenedor('radio', detenerAudio);

  aplicarMinimizado(contenedor, btnMinimizar);
}

function setEstadoReproductor(estado) {
  if (!reproductorEls) return;
  const textos = {
    conectando: 'Conectando...',
    reproduciendo: 'Reproduciendo',
    error: 'Esta emisora no responde',
  };
  reproductorEls.estado.textContent = textos[estado] || '';
  reproductorEls.contenedor.dataset.estado = estado;
}

function actualizarLogoReproductor(urlLogo) {
  if (!reproductorEls) return;
  const nuevo = crearLogoEmisora(urlLogo, 'reproductor-logo');
  // Se busca en el DOM porque el logo anterior pudo ser reemplazado por el
  // emoji tras un error de carga (y ya no estaría enlazado a reproductorEls).
  const anterior = reproductorEls.contenedor.querySelector('.reproductor-logo');
  if (anterior) {
    anterior.replaceWith(nuevo);
  } else {
    reproductorEls.contenedor.prepend(nuevo);
  }
  reproductorEls.logo = nuevo;
}

function actualizarBotonPausa() {
  if (!reproductorEls) return;
  const pausado = !audioActual || audioActual.paused;
  reproductorEls.btnPausa.textContent = pausado ? '▶' : '⏸';
  reproductorEls.btnPausa.setAttribute('aria-label', pausado ? 'Reanudar' : 'Pausar');
}

function actualizarBotonSilencio() {
  if (!reproductorEls) return;
  const mudo = !!(audioActual && audioActual.muted);
  reproductorEls.btnMute.textContent = '';
  reproductorEls.btnMute.appendChild(crearIconoAltavoz(mudo));
  reproductorEls.btnMute.setAttribute('aria-label', mudo ? 'Activar sonido' : 'Silenciar');
  reproductorEls.btnMute.setAttribute('aria-pressed', mudo ? 'true' : 'false');
}

// Marca en la lista la emisora que está sonando (por URL del stream).
// Se limita a la lista de radio: la de TV reutiliza clases de tarjeta.
function marcarEmisoraActiva() {
  document.querySelectorAll('.emisoras:not(.canales):not(.favoritos) .emisora').forEach((li) => {
    const activa = !!(emisoraActual && li.dataset.url === emisoraActual.url);
    li.classList.toggle('activa', activa);
    const boton = li.querySelector('.emisora-boton');
    if (boton) boton.setAttribute('aria-current', activa ? 'true' : 'false');
  });
}

function alternarPausa() {
  if (!audioActual) return;
  if (audioActual.paused) {
    setEstadoReproductor('conectando');
    const intento = audioActual.play();
    if (intento !== undefined) {
      intento.catch((e) => {
        // AbortError: la reproducción se canceló (cambio de emisora o load()).
        if (e && e.name === 'AbortError') return;
        setEstadoReproductor('error');
        actualizarBotonPausa();
      });
    }
  } else {
    audioActual.pause();
  }
  actualizarBotonPausa();
}

function alternarSilencio() {
  if (!audioActual) return;
  audioActual.muted = !audioActual.muted;
  actualizarBotonSilencio();
}

/**
 * Reproduce una emisora en el <audio> del mini reproductor.
 * @param {string} streamUrl - URL del stream de audio
 * @param {string} nombre - Nombre de la emisora (recortado)
 * @param {string} logo - URL del logo (puede venir vacía)
 */
function reproducirEmisora(streamUrl, nombre, logo) {
  crearReproductor();
  detenerRegistrado('tv'); // Solo puede sonar radio o TV, no ambas.

  // Cortar el audio anterior sin ocultar el reproductor.
  if (audioActual) {
    const anterior = audioActual;
    audioActual = null;
    anterior.pause();
    anterior.removeAttribute('src');
    anterior.load();
    if (anterior.parentNode) anterior.parentNode.removeChild(anterior);
  }

  emisoraActual = { nombre, url: streamUrl, logo: logo || '' };

  reproductorEls.contenedor.hidden = false;
  reproductorEls.nombre.textContent = nombre;
  // Hereda la preferencia minimizada compartida (no se resetea al cambiar).
  aplicarMinimizado(reproductorEls.contenedor, reproductorEls.btnMinimizar);
  actualizarLogoReproductor(logo);
  setEstadoReproductor('conectando');
  marcarEmisoraActiva();

  const audio = document.createElement('audio');
  audio.style.display = 'none';
  audio.volume = leerEstado('volumenRecordado');
  audio.muted = false;

  // Solo actualizar la UI si este audio sigue siendo el actual.
  audio.addEventListener('playing', () => {
    if (audio !== audioActual) return;
    setEstadoReproductor('reproduciendo');
    actualizarBotonPausa();
  });

  audio.addEventListener('waiting', () => {
    if (audio !== audioActual) return;
    // Un corte durante la reproducción se muestra como "Conectando...".
    if (!audio.paused) setEstadoReproductor('conectando');
  });

  audio.addEventListener('error', () => {
    if (audio !== audioActual) return;
    setEstadoReproductor('error');
    actualizarBotonPausa();
  });

  audio.addEventListener('play', actualizarBotonPausa);
  audio.addEventListener('pause', actualizarBotonPausa);

  audio.src = streamUrl;
  document.body.appendChild(audio);
  audioActual = audio;

  actualizarBotonSilencio();
  actualizarBotonPausa();

  const intento = audio.play();
  if (intento !== undefined) {
    intento
      .then(() => {
        if (audio !== audioActual) return;
        actualizarBotonPausa();
      })
      .catch((e) => {
        if (audio !== audioActual) return;
        // AbortError: se canceló por cambiar de emisora o por load().
        if (e && e.name === 'AbortError') return;
        setEstadoReproductor('error');
        actualizarBotonPausa();
      });
  }
}

// URL de la emisora que está en reproducción ahora ('' si no hay ninguna).
// Permite a la administración comprobar que el contenido a bloquear es
// justo el que suena antes de detenerlo.
function urlRadioSonando() {
  return emisoraActual ? emisoraActual.url : '';
}

/**
 * Detiene la reproducción, libera el stream y oculta el mini reproductor.
 */
// El control de volumen de TV comparte el mismo volumen con la radio.
function ajustarVolumenAudio(valor) {
  if (audioActual) audioActual.volume = valor;
}

function detenerAudio() {
  if (audioActual) {
    const audio = audioActual;
    audioActual = null;
    audio.pause();
    audio.removeAttribute('src');
    audio.load(); // Liberar recursos del navegador
    if (audio.parentNode) audio.parentNode.removeChild(audio);
  }

  emisoraActual = null;
  marcarEmisoraActiva();

  if (reproductorEls) {
    reproductorEls.contenedor.hidden = true;
    setEstadoReproductor('inactivo');
    // Limpia la clase minimizado (la X ya reseteó la preferencia).
    aplicarMinimizado(reproductorEls.contenedor, reproductorEls.btnMinimizar);
  }
}



// Se registra dentro de crearReproductor(), que llama init().
export {
  crearReproductor,
  reproducirEmisora,
  detenerAudio,
  marcarEmisoraActiva,
  ajustarVolumenAudio,
  urlRadioSonando,
};
