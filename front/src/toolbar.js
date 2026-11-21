// Barra de pestañas Radio/TV: cambia de modo, corta el reproductor anterior
// y vuelve a cargar el país seleccionado.

import { escribirEstado, leerEstado } from './estado.js';
import { getIso2 } from './paises.js';
import { detenerAudio } from './reproductor-radio.js';
import { detenerTv } from './reproductor-tv.js';
import { cancelarCargaRadio, cargarRadio } from './radio.js';
import { cancelarCargaTv, cargarTv } from './tv.js';
import { actualizarPanel, actualizarPanelTv } from './panel.js';
import { marcarVistaFavoritos } from './favoritos.js';

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
      escribirEstado('modoActual', tab);
      marcarVistaFavoritos(false);
      
      if (tab === 'tv') {
        // Detener lo que suene y cancelar la carga de radio en curso.
        detenerAudio();
        detenerTv();
        cancelarCargaRadio();

        const feature = leerEstado('selectedFeature');
        if (!feature) {
          const codigo = document.getElementById('country-code');
          codigo.textContent = 'Selecciona un país para ver canales de TV';
          codigo.className = 'secundario';
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
        cancelarCargaTv();

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

export { setupToolbar };
