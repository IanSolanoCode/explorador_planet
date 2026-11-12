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
let reproduciendoNombre = null;
let timerRotacion = null;

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
  const reproduciendoDiv = document.querySelector('.reproduciendo');

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
      lista.style.margin = '8px 0';
      lista.style.padding = '0 8px';
      lista.style.maxHeight = '180px';
      lista.style.overflowY = 'auto';
      lista.style.fontSize = '0.75rem';
      
      datosRadio.emisoras.forEach(est => {
        const li = document.createElement('li');
        li.style.margin = '4px 0';
        li.style.padding = '4px 8px';
        li.style.background = 'rgba(255,255,255,0.05)';
        li.style.borderRadius = '4px';
        li.style.cursor = 'pointer';
        
        // Nombre recortado antes del primer " - "
        const nombreOriginal = est.nombre;
        const nombreCorto = nombreOriginal.split(' - ')[0];
        
        // Elemento con nombre
        const spanNombre = document.createElement('span');
        spanNombre.style.display = 'inline-block';
        spanNombre.style.maxWidth = '60ch';
        spanNombre.textContent = nombreCorto;
        spanNombre.title = nombreOriginal;
        
        // Elemento de logo - usamos un emoji simple en lugar de SVG data URI
        const spanLogo = document.createElement('span');
        spanLogo.style.display = 'inline-block';
        spanLogo.style.width = '16px';
        spanLogo.style.height = '16px';
        spanLogo.style.marginLeft = '8px';
        spanLogo.style.borderRadius = '50%';
        spanLogo.style.fontSize = '0.875rem';
        spanLogo.style.color = '#ffd700';
        spanLogo.textContent = '📻'; // Emoji de radio
        
        // Texto descriptivo
        const spanTextos = document.createElement('span');
        spanTextos.style.display = 'inline-block';
        spanTextos.style.verticalAlign = 'middle';
        spanTextos.style.fontSize = '0.75rem';
        spanTextos.textContent = nombreCorto;
        
        li.appendChild(spanLogo);
        li.appendChild(spanTextos);
        
        // Evento clic para reproducir esta emisora
        li.addEventListener('click', (e) => {
          e.stopPropagation();
          // Reproducir la emisora seleccionada
          const url = est.streamUrl || est.url;
          if (url) {
            // Cancelar audio anterior si existe
            if (audioActual) {
              detenerAudio();
            }
            reproducirEmisora(url, nombreCorto);
          }
        });
        
        lista.appendChild(li);
      });
      
      // Reemplazar el contenido del código con la lista
      const codigoParent = codigo.parentElement;
      if (codigoParent && codigoParent.tagName === 'UL') {
        // Ya tiene lista, hacer nada
      } else {
        codigoParent.replaceChild(lista, codigo);
      }
      
      // Mostrar sección "Reproduciendo" si hay un audio reproduciéndose
      if (reproduciendoNombre) {
        if (!reproduciendoDiv.classList.contains('activo')) {
          reproducingDiv.classList.add('activo');
        }
        const reproducingNombreEl = reproducingDiv.querySelector('.nombre');
        if (reproduciendoNombreEl) {
          reproducingNombreEl.textContent = reproduciendoNombre;
        }
      }
    }
  } else if (modoActual === 'radio' && !datosRadio) {
    // No hay datos todavía o país sin código
    if (!iso2) {
      codigo.textContent = 'Este territorio no tiene código de país';
      codigo.style.color = '#ff9999';
    }
  } else {
    // Modo TV: mostrar "Próximamente"
    if (modoActual === 'tv') {
      codigo.textContent = 'Próximamente';
      codigo.style.color = '#aaa';
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

/**
 * Reproduce una emisora de radio en el <audio> del panel.
 * @param {string} streamUrl - URL del stream de audio
 * @param {string} nombre - Nombre de la emisora (mostrado recortado)
 */
function reproducirEmisora(streamUrl, nombre) {
  // Si ya hay una reproduciendo, detenerla primero
  if (audioActual) {
    detenerAudio();
  }
  
  reproduciendoNombre = nombre;
  
  const audio = document.createElement('audio');
  audio.src = streamUrl;
  audio.controls = true;
  audio.style.display = 'none';
  
  // Manejar error de reproducción
  audio.onerror = (e) => {
    // Mostrar mensaje "Esta emisora no responde"
    const codigo = document.getElementById('country-code');
    codigo.textContent = 'Esta emisora no responde';
    codigo.style.color = '#ff9999';
    // Quitar el audio de la DOM para liberar recursos
    if (audio.parentNode) {
      audio.parentNode.removeChild(audio);
    }
    audioActual = null;
    reproduciendoNombre = null;
  };
  
  // Cuando el audio empieza a reproducirse, actualizar la UI
  audio.onplay = () => {
    // Actualizar la sección "Reproduciendo" en el panel
    const sidebar = document.getElementById('country-info');
    let reproduciendoDiv = sidebar.querySelector('.reproduciendo');
    
    if (!reproduciendoDiv) {
      reproduciendoDiv = document.createElement('div');
      reproducingDiv.className = 'reproduciendo activo';
      reproducingDiv.innerHTML = `<span class="nombre"></span><button class="btn-detener">Detener</button>`;
      sidebar.insertBefore(reproduciendoDiv, sidebar.firstChild);
    }
    
    const nombreEl = reproducingDiv.querySelector('.nombre');
    if (nombreEl) {
      nombreEl.textContent = nombre;
    }
    
    const btnDetener = reproducingDiv.querySelector('.btn-detener');
    if (btnDetener) {
      btnDetener.onclick = detenerAudio;
    }
  };
  
  // Empezar a reproducir (intento automático)
  const playPromise = audio.play();
  
  if (playPromise !== undefined) {
    playPromise.then(() => {
      audioActual = audio;
      // Asegurar que la sección "Reproduciendo" sea visible
      const sidebar = document.getElementById('country-info');
      let reproducingDiv = sidebar.querySelector('.reproduciendo');
      if (!reproduciendoDiv) {
        reproducingDiv = document.createElement('div');
        reproducingDiv.className = 'reproduciendo activo';
        reproducingDiv.innerHTML = `<span class="nombre"></span><button class="btn-detener">Detener</button>`;
        sidebar.insertBefore(reproduciendoDiv, sidebar.firstChild);
      }
    }).catch((e) => {
      console.error('Error al intentar reproducir audio automáticamente:', e);
      // El usuario tendría que hacer clic en play
      audioActual = audio;
    });
  }
  
  // Guardar referencia al audio
  audioActual = audio;
  
  // Agregar al DOM (será removido al detener)
  const sidebar = document.getElementById('country-info');
  sidebar.appendChild(audio);
}

/**
 * Detiene la reproducción de audio actual.
 */
function detenerAudio() {
  if (audioActual && audioActual.pause) {
    audioActual.pause();
    audioActual.load(); // Liberar recursos del navegador
    const parent = audioActual.parentNode;
    if (parent) {
      parent.removeChild(audioActual);
    }
  }
  
  audioActual = null;
  reproduciendoNombre = null;
  
  // Ocultar sección "Reproduciendo"
  const reproduciendoDiv = document.querySelector('.reproduciendo');
  if (reproduciendoDiv) {
    reproducingDiv.remove();
  }
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
        // Mostrar "Próximamente" y detener audio
        actualizarPanel(selectedFeature?.properties, { tv: true });
        detenerAudio();
        // Limpiar el contenido de emisoras si había
        const codigo = document.getElementById('country-code');
        codigo.textContent = 'Próximamente';
        codigo.style.color = '#aaa';
      } else if (tab === 'radio') {
        // Si hay un país seleccionado, recargar radio de ese país
        if (selectedFeature) {
          const iso2 = getIso2(selectedFeature.properties);
          if (iso2) {
            cargarRadio(iso2).then(datos => {
              actualizarPanel(selectedFeature.properties, datos);
            });
          } else {
            actualizarPanel(selectedFeature.properties, { sinCodigo: true });
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
  modoActual = 'radio'; // Siempre empezar en radio al hacer clic en un país
  
  if (iso2) {
    // Cargar radio para este país
    cargarRadio(iso2).then(datos => {
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