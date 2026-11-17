// Registro de callbacks entre módulos para romper dependencias circulares.
// - radio y TV se detienen mutuamente sin importarse entre sí.
// - auth notifica cambios de sesión; cuenta y favoritos se suscriben.
// Todo se registra desde funciones que llama init(), nunca al importar.

const detenedores = new Map();
const oyentesSesion = new Set();

export function registrarDetenedor(tipo, fn) {
  detenedores.set(tipo, fn);
}

export function detenerRegistrado(tipo) {
  const fn = detenedores.get(tipo);
  if (fn) fn();
}

export function alCambiarSesion(fn) {
  oyentesSesion.add(fn);
}

export function notificarCambioSesion(detalle = {}) {
  oyentesSesion.forEach((fn) => fn(detalle));
}
