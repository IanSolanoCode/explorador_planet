import Globe from 'globe.gl';

// Se usará cuando conectemos la pestaña Radio
const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api';

// Países sin código válido en ISO_A2 ni en WB_A2
const ISO2_EXCEPTIONS = { Norway: 'NO' };

// Colores de país casi transparentes para dejar ver la textura de la Tierra.
const COLOR_PAIS_BASE = 'rgba(120, 170, 255, 0.10)';
const COLOR_PAIS_HOVER = 'rgba(255, 215, 0, 0.18)';
const COLOR_PAIS_SELECCIONADO = 'rgba(255, 215, 0, 0.35)';

let globe = null;
let selectedFeature = null;
let hoveredFeature = null;
let modoActual = 'radio'; // 'radio' o 'tv'
let controladorAbort = null;
let audioActual = null;
let emisoraActual = null; // { nombre, url, logo } que suena ahora
let reproductorEls = null; // referencias al mini reproductor fijo
let timerRotacion = null;

// TV: estado independiente del reproductor de radio.
let controladorTv = null;
let videoActual = null;
let hlsActual = null;
let canalActual = null; // { nombre, url } del canal en reproducción
let reproductorTvEls = null;
let intentoTv = 0; // invalida arranques asíncronos antiguos (import de hls.js)
let HlsClase = null; // módulo hls.js cargado bajo demanda

// Volumen recordado entre visitas: 0–1, con 0.7 por defecto.
const VOLUMEN_CLAVE = 'explorador-planet:volumen';
const VOLUMEN_POR_DEFECTO = 0.7;
let volumenRecordado = cargarVolumen();

// --- Lógica de códigos ISO-2 (sin campos _EH) ---

function esCodigoValido(c) {
  return typeof c === 'string' && c.length === 2 && c !== '-99';
}

function getIso2(props) {
  if (esCodigoValido(props.ISO_A2)) return props.ISO_A2;
  if (esCodigoValido(props.WB_A2)) return props.WB_A2;
  return ISO2_EXCEPTIONS[props.ADMIN] || '';
}

function getName(props) {
  return props.ADMIN || 'País desconocido';
}

// --- Estilos del globe.gl ---

function aplicarEstilos() {
  globe
    .polygonCapColor((f) => {
      if (f === selectedFeature) return COLOR_PAIS_SELECCIONADO;
      if (f === hoveredFeature) return COLOR_PAIS_HOVER;
      return COLOR_PAIS_BASE;
    })
    .polygonAltitude((f) => {
      if (f === selectedFeature) return 0.03;
      if (f === hoveredFeature) return 0.02;
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
  if (modoActual === 'radio' && datosRadio) {
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
        lista.appendChild(li);
      });
      
      // Se conserva el <p id="country-code"> y la lista va debajo: así las
      // siguientes actualizaciones del panel siguen encontrando el código.
      sidebar.appendChild(lista);
      marcarEmisoraActiva();
    }
  } else if (modoActual === 'radio' && !datosRadio) {
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
    
    // Normalizar estaciones al formato esperado
    const emisoras = estaciones.map(st => ({
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

// --- Mini reproductor de radio fijo ---

// Lee el volumen guardado validando que sea un número entre 0 y 1.
function cargarVolumen() {
  try {
    const guardado = localStorage.getItem(VOLUMEN_CLAVE);
    if (guardado === null || guardado.trim() === '') return VOLUMEN_POR_DEFECTO;
    const valor = Number(guardado);
    return Number.isFinite(valor) && valor >= 0 && valor <= 1
      ? valor
      : VOLUMEN_POR_DEFECTO;
  } catch {
    // localStorage puede fallar (modo privado o permisos): usar el valor por defecto.
    return VOLUMEN_POR_DEFECTO;
  }
}

function guardarVolumen(valor) {
  try {
    localStorage.setItem(VOLUMEN_CLAVE, String(valor));
  } catch {
    // Si no se puede persistir, el volumen sigue funcionando en esta sesión.
  }
}

// Logo de emisora: <img loading="lazy"> solo para http(s); el resto es un emoji.
// Si la imagen falla, se reemplaza por el emoji indicado (📻 radio, 📺 TV).
function crearLogoEmisora(urlLogo, clase, emoji = '📻') {
  if (typeof urlLogo === 'string' && /^https?:\/\//i.test(urlLogo)) {
    const img = document.createElement('img');
    img.className = clase;
    img.loading = 'lazy';
    img.alt = ''; // Decorativo: el nombre de la emisora ya está al lado.
    img.addEventListener('error', () => {
      const respaldo = document.createElement('span');
      respaldo.className = clase;
      respaldo.textContent = emoji;
      img.replaceWith(respaldo);
    });
    // El src solo se asigna tras validar el esquema http(s).
    img.src = urlLogo;
    return img;
  }
  const respaldo = document.createElement('span');
  respaldo.className = clase;
  respaldo.textContent = emoji;
  return respaldo;
}

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
  btnPausa.className = 'btn-control';
  btnPausa.setAttribute('aria-label', 'Pausar');
  btnPausa.textContent = '⏸';
  btnPausa.addEventListener('click', alternarPausa);

  const btnMute = document.createElement('button');
  btnMute.type = 'button';
  btnMute.className = 'btn-control';
  btnMute.setAttribute('aria-label', 'Silenciar');
  btnMute.setAttribute('aria-pressed', 'false');
  btnMute.textContent = '🔊';
  btnMute.addEventListener('click', alternarSilencio);

  const volumen = document.createElement('input');
  volumen.type = 'range';
  volumen.className = 'volumen';
  volumen.min = '0';
  volumen.max = '1';
  volumen.step = '0.01';
  volumen.value = String(volumenRecordado);
  volumen.setAttribute('aria-label', 'Volumen');
  volumen.addEventListener('input', () => {
    volumenRecordado = Number(volumen.value);
    if (audioActual) audioActual.volume = volumenRecordado;
    guardarVolumen(volumenRecordado);
  });

  const btnDetener = document.createElement('button');
  btnDetener.type = 'button';
  btnDetener.className = 'btn-control';
  btnDetener.setAttribute('aria-label', 'Detener');
  btnDetener.textContent = '⏹';
  btnDetener.addEventListener('click', detenerAudio);

  info.appendChild(nombre);
  info.appendChild(estado);
  controles.appendChild(btnPausa);
  controles.appendChild(btnMute);
  controles.appendChild(volumen);
  controles.appendChild(btnDetener);
  contenedor.appendChild(logo);
  contenedor.appendChild(info);
  contenedor.appendChild(controles);
  document.body.appendChild(contenedor);

  reproductorEls = { contenedor, logo, nombre, estado, btnPausa, btnMute, volumen, btnDetener };
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
  reproductorEls.btnMute.textContent = mudo ? '🔇' : '🔊';
  reproductorEls.btnMute.setAttribute('aria-label', mudo ? 'Activar sonido' : 'Silenciar');
  reproductorEls.btnMute.setAttribute('aria-pressed', mudo ? 'true' : 'false');
}

// Marca en la lista la emisora que está sonando (por URL del stream).
// Se limita a la lista de radio: la de TV reutiliza clases de tarjeta.
function marcarEmisoraActiva() {
  document.querySelectorAll('.emisoras:not(.canales) .emisora').forEach((li) => {
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
  detenerTv(); // Solo puede sonar radio o TV, no ambas.

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
  actualizarLogoReproductor(logo);
  setEstadoReproductor('conectando');
  marcarEmisoraActiva();

  const audio = document.createElement('audio');
  audio.style.display = 'none';
  audio.volume = volumenRecordado;
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

/**
 * Detiene la reproducción, libera el stream y oculta el mini reproductor.
 */
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
    lista.appendChild(li);
  });

  sidebar.appendChild(lista);
  marcarCanalActivo();
}

// --- Reproductor de TV fijo ---

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
  volumen.value = String(volumenRecordado);
  volumen.setAttribute('aria-label', 'Volumen');
  volumen.addEventListener('input', () => {
    volumenRecordado = Number(volumen.value);
    if (videoActual) videoActual.volume = volumenRecordado;
    if (audioActual) audioActual.volume = volumenRecordado;
    guardarVolumen(volumenRecordado);
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
  detenerAudio(); // Solo un reproductor activo a la vez.

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
  video.volume = volumenRecordado;
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

// --- Eventos del toolbar ---

function setupToolbar() {
  const botones = document.querySelectorAll('.tab-btn');
  
  botones.forEach((btn) => {
    btn.addEventListener('click', () => {
      // Quitar clase active de todos
      botones.forEach((b) => b.classList.remove('active'));
      // Añadir clase active al clicado
      btn.classList.add('active');
      
      const tab = btn.dataset.tab;
      console.log('Modo cambiado a:', tab);
      modoActual = tab;
      
      if (tab === 'tv') {
        // Detener lo que suene y cancelar la carga de radio en curso.
        detenerAudio();
        detenerTv();
        if (controladorAbort) controladorAbort.abort();

        const feature = selectedFeature;
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
              if (modoActual !== 'tv' || selectedFeature !== feature) return;
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
        if (selectedFeature) {
          const feature = selectedFeature;
          const iso2 = getIso2(feature.properties);
          if (iso2) {
            cargarRadio(iso2).then(datos => {
              if (modoActual !== 'radio' || selectedFeature !== feature) return;
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
  selectedFeature = feature;
  aplicarEstilos();

  // Vuelo suave de la cámara hacia el país seleccionado (~1 s).
  const centro = calcularCentro(feature);
  globe.pointOfView({ lat: centro.lat, lng: centro.lng, altitude: 1.6 }, 1000);

  const iso2 = getIso2(feature.properties);

  // La pestaña activa decide qué módulo cargar; ya no se fuerza radio.
  if (modoActual === 'tv') {
    if (iso2) {
      actualizarPanelTv(feature.properties, { loading: true });
      cargarTv(iso2).then((datos) => {
        // Descartar respuestas si cambió la pestaña o el país seleccionado.
        if (modoActual !== 'tv' || selectedFeature !== feature) return;
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
      if (modoActual !== 'radio' || selectedFeature !== feature) return;
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

  globe = Globe()(document.getElementById('globe'))
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
      hoveredFeature = f;
      aplicarEstilos();
    });

  aplicarEstilos();
  configurarControles();
  globe.renderer().setPixelRatio(Math.min(window.devicePixelRatio, 2));
}

// Controles de cámara: inercia, zoom limitado y rotación que se pausa al interactuar
function configurarControles() {
  const c = globe.controls();
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
  await initGlobe();
  crearReproductor();
  crearReproductorTv();
  setupToolbar();
  
  // Verificar que la variable de entorno esté configurada
  if (!import.meta.env.VITE_API_URL) {
    console.warn('VITE_API_URL no está configurada. Usando URL por defecto.');
    console.log('Para configurar: VITE_API_URL=http://127.0.0.1:8000/api');
  }
}

init().catch((err) => {
  console.error('Error inicializando la aplicación:', err);
});