// Hoja inferior (móvil) / panel lateral (escritorio): visibilidad, controles y
// margen inferior real. La hoja se abre con CUALQUIER contenido del panel
// (país, "Mis favoritos" o "Bloqueos") y se pliega —no se destruye—.

let iniciada = false;

function iniciarHoja() {
  if (iniciada) return;
  iniciada = true;

  const aside = document.getElementById('sidebar');
  if (!aside) return;

  // Asa para plegar/expandir (solo visible en móvil). Es un botón real para
  // teclado y lectores de pantalla.
  const asa = document.createElement('button');
  asa.type = 'button';
  asa.className = 'hoja-asa';
  asa.setAttribute('aria-expanded', 'false');
  asa.setAttribute('aria-label', 'Expandir panel');
  asa.addEventListener('click', () => {
    // El usuario manda: quita el pliegue automático y alterna el manual.
    aside.classList.remove('auto-plegada');
    const plegada = aside.classList.toggle('plegada');
    asa.setAttribute('aria-expanded', plegada ? 'false' : 'true');
    asa.setAttribute('aria-label', plegada ? 'Expandir panel' : 'Plegar panel');
  });

  // Botón de cerrar.
  const cerrar = document.createElement('button');
  cerrar.type = 'button';
  cerrar.className = 'hoja-cerrar';
  cerrar.setAttribute('aria-label', 'Cerrar panel');
  cerrar.textContent = '×';
  cerrar.addEventListener('click', ocultarHoja);

  aside.prepend(cerrar);
  aside.prepend(asa);

  // La hoja arranca cerrada; se abre al pintar contenido.
  aside.classList.add('hidden');

  iniciarMedicionAltura();
}

function mostrarHoja() {
  const aside = document.getElementById('sidebar');
  if (!aside) return;
  aside.classList.remove('hidden', 'plegada');

  const asa = aside.querySelector('.hoja-asa');
  if (asa) {
    asa.setAttribute('aria-expanded', 'true');
    asa.setAttribute('aria-label', 'Plegar panel');
  }
}

function ocultarHoja() {
  const aside = document.getElementById('sidebar');
  if (!aside) return;
  aside.classList.add('hidden');
}

// Mide con ResizeObserver la altura real del reproductor visible y de la barra
// superior, y las expone como variables CSS. Nunca observa la hoja (evitaría un
// bucle, porque el tamaño de la hoja depende de esas variables).
let medidorAltura = null;

function iniciarMedicionAltura() {
  if (medidorAltura) return;

  const radio = document.getElementById('radio-player');
  const tv = document.getElementById('tv-player');
  const barra = document.getElementById('toolbar');
  const aside = document.getElementById('sidebar');

  let frame = 0;

  const aplicar = () => {
    if (frame) cancelAnimationFrame(frame);
    frame = requestAnimationFrame(() => {
      frame = 0;

      const visible = [radio, tv].find((el) => el && !el.hidden);
      const alturaRepro = visible ? visible.offsetHeight : 0;
      const alturaBarra = barra ? barra.offsetHeight : 0;

      document.documentElement.style.setProperty('--altura-reproductor', `${alturaRepro}px`);
      document.documentElement.style.setProperty('--altura-barra', `${alturaBarra}px`);

      // Si el espacio útil para la hoja baja de ~120 px, se pliega sola.
      const disponible = window.innerHeight - alturaBarra - alturaRepro;
      if (aside) aside.classList.toggle('auto-plegada', disponible < 120);
    });
  };

  let observer = null;
  if (typeof ResizeObserver !== 'undefined') {
    observer = new ResizeObserver(aplicar);
    // Solo reproductores y barra superior; la hoja queda fuera a propósito.
    [radio, tv, barra].forEach((el) => {
      if (el) observer.observe(el);
    });
  }

  medidorAltura = () => {
    if (observer) observer.disconnect();
    medidorAltura = null;
  };

  aplicar();
}

export { iniciarHoja, mostrarHoja, ocultarHoja };
