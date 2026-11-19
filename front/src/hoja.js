// Hoja inferior (móvil) / panel lateral (escritorio): visibilidad y controles.
// La hoja se abre con CUALQUIER contenido del panel (país, "Mis favoritos" o
// "Bloqueos") y se pliega —no se destruye— para conservar lo que muestra.

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

export { iniciarHoja, mostrarHoja, ocultarHoja };
