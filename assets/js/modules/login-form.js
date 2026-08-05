import { qs } from '../utils.js';

/**
 * El Portal de Clientes todavía no existe: el formulario sólo revela un
 * aviso de "muy pronto", igual que el <script> inline de login.astro.
 * Se preserva tal cual, no es una regresión de funcionalidad.
 */
export function initLoginForm() {
  const form = qs('#login-form');
  const notice = qs('#login-notice');
  if (!form || !notice) return;

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    form.classList.add('is-hidden');
    notice.classList.add('is-visible');
  });
}
