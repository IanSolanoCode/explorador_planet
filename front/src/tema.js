// Tema claro/oscuro.
// - Sin elección guardada: sigue prefers-color-scheme y reacciona a sus cambios.
// - Con elección: la usa y la guarda en localStorage (dentro de try/catch).
// El <head> de index.html fija el data-theme antes de pintar (evita parpadeo).

const CLAVE = 'explorador-planet:tema';
const metaTheme = () => document.querySelector('meta[name="theme-color"]');

function aplicar(tema) {
  document.documentElement.dataset.theme = tema;

  const meta = metaTheme();
  if (meta) meta.content = tema === 'dark' ? '#14151C' : '#F4F4EF';

  const boton = document.getElementById('btn-tema');
  if (boton) boton.setAttribute('aria-label', tema === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro');
}

function temaGuardado() {
  try {
    return localStorage.getItem(CLAVE);
  } catch {
    return null;
  }
}

function setupTema() {
  const mq = window.matchMedia('(prefers-color-scheme: light)');
  const guardado = temaGuardado();

  if (guardado === 'light' || guardado === 'dark') {
    aplicar(guardado);
  } else {
    aplicar(mq.matches ? 'light' : 'dark');
    // Solo se sigue la preferencia del sistema mientras no haya elección.
    mq.addEventListener('change', (e) => {
      if (!temaGuardado()) aplicar(e.matches ? 'light' : 'dark');
    });
  }

  const boton = document.getElementById('btn-tema');
  if (boton) {
    boton.addEventListener('click', () => {
      const actual = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
      try {
        localStorage.setItem(CLAVE, actual);
      } catch {
        // Sin almacenamiento: el cambio vale solo para esta sesión.
      }
      aplicar(actual);
    });
  }
}

export { setupTema };
