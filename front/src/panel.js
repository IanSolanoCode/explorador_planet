// Panel lateral: nombre del país, estado de carga y listas de radio o TV.
// Reconstruye la lista en cada actualización, así que "Mis favoritos" vuelve
// al panel normal sin que este módulo dependa de favoritos.js.

import { leerEstado } from './estado.js';
import { getIso2, getName, normalizarCountry } from './paises.js';
import { crearLogoEmisora } from './utils.js';
import { marcarEmisoraActiva, reproducirEmisora } from './reproductor-radio.js';
import { marcarCanalActivo, reproducirCanal } from './reproductor-tv.js';
import { crearBotonFavorito } from './favoritos.js';
import { crearBotonBloquear } from './admin.js';
import { mostrarHoja } from './hoja.js';

// Esqueleto de carga (barras) mientras llegan los datos.
function mostrarEsqueleto(sidebar) {
  const lista = document.createElement('ul');
  lista.className = 'emisoras esqueleto';
  for (let i = 0; i < 4; i++) {
    const item = document.createElement('li');
    item.className = 'esqueleto-item';
    lista.appendChild(item);
  }
  sidebar.appendChild(lista);
}

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
    codigo.className = 'iso';
  } else {
    codigo.textContent = 'Este territorio no tiene código de país';
    codigo.className = 'error';
  }

  // Gestionar sección "Reproduciendo"
  if (leerEstado('modoActual') === 'radio' && datosRadio) {
    if (datosRadio.loading) {
      codigo.textContent = 'Cargando...';
      codigo.className = 'conectando';
      mostrarEsqueleto(sidebar);
    } else if (datosRadio.error) {
      codigo.textContent = `No se pudo cargar la radio, intenta de nuevo`;
      codigo.className = 'error';
    } else if (datosRadio.vacio) {
      codigo.textContent = 'Sin emisoras para este país';
      codigo.className = 'secundario';
    } else if (datosRadio.cancelled) {
      // Petición cancelada, no hacer nada, mantener estado actual
      return;
    } else if (!iso2) {
      codigo.textContent = 'Este territorio no tiene código de país';
      codigo.className = 'error';
    } else {
      // Mostrar lista de emisoras
      codigo.textContent = '';
      codigo.className = 'iso';
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

        // El botón de bloqueo existe siempre; el CSS lo muestra solo si el
        // <body> tiene la clase `es-admin`.
        const bloquear = crearBotonBloquear(item, li);
        if (bloquear) li.appendChild(bloquear);

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
      codigo.className = 'error';
    }
  }

  // Asegurar que el panel sea visible
  sidebar.classList.remove('hidden');
  mostrarHoja();
}

// Pinta el panel en modo TV con los mismos estados que radio.
function actualizarPanelTv(props, datos = null) {
  if (!props) return;

  const iso2 = getIso2(props);
  const codigo = document.getElementById('country-code');
  const countryName = document.getElementById('country-name');
  const sidebar = document.getElementById('country-info');

  mostrarHoja();

  // Quitar listas anteriores (radio o TV) para no mezclar modos.
  sidebar.querySelectorAll('.emisoras, .canales').forEach((lista) => lista.remove());

  countryName.textContent = getName(props);

  if (iso2) {
    codigo.textContent = `Código ISO-2: ${iso2}`;
    codigo.className = 'iso';
  } else {
    codigo.textContent = 'Este territorio no tiene código de país';
    codigo.className = 'error';
    return;
  }

  if (!datos || datos.cancelled) return;

  if (datos.loading) {
    codigo.textContent = 'Cargando...';
    codigo.className = 'conectando';
    mostrarEsqueleto(sidebar);
    return;
  }

  if (datos.error) {
    codigo.textContent = `No se pudo cargar la TV desde ${datos.url}`;
    codigo.className = 'error';
    return;
  }

  if (datos.vacio) {
    codigo.textContent = 'Sin canales para este país';
    codigo.className = 'secundario';
    return;
  }

  codigo.textContent = '';
  codigo.className = 'iso';

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

    // El botón de bloqueo existe siempre; el CSS lo muestra solo si el
    // <body> tiene la clase `es-admin`.
    const bloquear = crearBotonBloquear(item, li);
    if (bloquear) li.appendChild(bloquear);

    lista.appendChild(li);
  });

  sidebar.appendChild(lista);
  marcarCanalActivo();
}


export { actualizarPanel, actualizarPanelTv };
