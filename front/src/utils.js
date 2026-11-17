// Utilidades compartidas sin estado compartido ni efectos secundarios al
// importarse: todo se ejecuta cuando algún módulo llama a estas funciones.

// Base de las rutas de la API. El front nunca llama a fuentes externas.
export const API_BASE = import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api';

// Volumen recordado entre visitas: 0–1, con 0.7 por defecto.
export const VOLUMEN_CLAVE = 'explorador-planet:volumen';
export const VOLUMEN_POR_DEFECTO = 0.7;

// Lee el volumen guardado validando que sea un número entre 0 y 1.
export function cargarVolumen() {
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

export function guardarVolumen(valor) {
  try {
    localStorage.setItem(VOLUMEN_CLAVE, String(valor));
  } catch {
    // Si no se puede persistir, el volumen sigue funcionando en esta sesión.
  }
}

// Logo de emisora: <img loading="lazy"> solo para http(s); el resto es un emoji.
// Si la imagen falla, se reemplaza por el emoji indicado (📻 radio, 📺 TV).
export function crearLogoEmisora(urlLogo, clase, emoji = '📻') {
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
