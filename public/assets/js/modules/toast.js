/**
 * Notificaciones toast: reemplazan las alertas inline por avisos
 * flotantes no bloqueantes (ver `mostrarAlerta()` en panel-admin.js/
 * panel-cliente.js, que ahora delega acá). Sin dependencias, mismo
 * patrón de módulo ES que `panel-shell.js`/`api-client.js`.
 */

let contenedor = null;

/** Contenedor fijo, creado una sola vez y reusado -- `aria-live` para que un lector de pantalla anuncie cada toast nuevo sin robar el foco. */
function getContenedor() {
  if (contenedor && document.body.contains(contenedor)) return contenedor;

  contenedor = document.createElement('div');
  contenedor.id = 'toast-container';
  contenedor.className = 'toast-container';
  contenedor.setAttribute('role', 'status');
  contenedor.setAttribute('aria-live', 'polite');
  document.body.appendChild(contenedor);

  return contenedor;
}

/**
 * Muestra un toast. `tipo` 'success' o 'error' (mismo contrato que ya
 * usaba `mostrarAlerta()`). Se cierra solo (4s éxito / 6s error -- el
 * error queda más tiempo porque suele haber más para leer) o al
 * clickear la "×".
 */
export function showToast(mensaje, tipo = 'error') {
  const esExito = tipo === 'success';
  const toast = document.createElement('div');
  toast.className = `toast toast--${esExito ? 'success' : 'error'}`;

  const texto = document.createElement('span');
  texto.className = 'toast__texto';
  texto.textContent = mensaje;
  toast.appendChild(texto);

  const cerrarBtn = document.createElement('button');
  cerrarBtn.type = 'button';
  cerrarBtn.className = 'toast__cerrar';
  cerrarBtn.setAttribute('aria-label', 'Cerrar notificación');
  cerrarBtn.textContent = '×';
  toast.appendChild(cerrarBtn);

  const cont = getContenedor();
  cont.appendChild(toast);

  let cerrado = false;
  const cerrar = () => {
    if (cerrado) return;
    cerrado = true;
    clearTimeout(timer);
    toast.classList.add('is-saliendo');
    toast.addEventListener('animationend', () => toast.remove(), { once: true });
  };

  cerrarBtn.addEventListener('click', cerrar);
  const timer = setTimeout(cerrar, esExito ? 4000 : 6000);
}
