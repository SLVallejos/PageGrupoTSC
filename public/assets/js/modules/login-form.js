import { qs } from '../utils.js';
import { apiFetch, getSesionActual } from './api-client.js';

/**
 * Login del Portal de Clientes. Valida en el cliente (blur + submit, mismo
 * patrón que contact-form.js) y llama POST /api/auth/login. La sesión
 * queda en una cookie httpOnly del backend, así que no hay nada que
 * guardar acá; el redirect por rol usa lo que devuelve el login.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validators = {
  email: (value) => {
    const trimmed = value.trim();
    if (!trimmed) return 'Ingresá tu email.';
    return EMAIL_PATTERN.test(trimmed) ? null : 'Ingresá un email válido.';
  },
  pass: (value) => {
    if (!value) return 'Ingresá tu contraseña.';
    return value.length >= 6 ? null : 'La contraseña debe tener al menos 6 caracteres.';
  },
};

function redirigirSegunRol(usuario) {
  window.location.href = usuario.rol === 'ADMIN' ? 'panel-admin.html' : 'panel-cliente.html';
}

export async function initLoginForm() {
  const form = qs('#login-form');
  const notice = qs('#login-notice');
  if (!form || !notice) return;

  // Si ya hay una sesión activa, no tiene sentido mostrar el login de nuevo.
  const sesion = await getSesionActual();
  if (sesion) {
    redirigirSegunRol(sesion);
    return;
  }

  // `initInactivityLogout()` (api-client.js) y el link "ir al inicio" del
  // panel admin redirigen acá con este query param para explicar por qué
  // se cerró la sesión, en vez de dejar un login en blanco sin contexto.
  if (new URLSearchParams(window.location.search).get('motivo') === 'inactividad') {
    showNotice('Tu sesión se cerró por inactividad. Iniciá sesión de nuevo.');
  }

  const fields = Object.keys(validators)
    .map((name) => form.elements.namedItem(name))
    .filter(Boolean);
  const submitBtn = qs('button[type="submit"]', form);
  const submitLabel = qs('[data-submit-label]', submitBtn);

  /** Marca (o limpia) el error de un campo: aria-invalid, borde y texto de ayuda. */
  function showFieldError(field, message) {
    const group = field.closest('.field-group');
    const errorEl = qs(`#error-login-${field.name}`, form);
    field.setAttribute('aria-invalid', message ? 'true' : 'false');
    group?.classList.toggle('field-group--invalid', Boolean(message));
    if (errorEl) errorEl.textContent = message || '';
    return !message;
  }

  function validateField(field) {
    return showFieldError(field, validators[field.name](field.value));
  }

  function validateAll() {
    return fields.reduce((valid, field) => validateField(field) && valid, true);
  }

  function showNotice(mensaje) {
    notice.textContent = mensaje;
    notice.className = 'login-notice login-notice--error is-visible';
  }

  function hideNotice() {
    notice.classList.remove('is-visible');
  }

  fields.forEach((field) => {
    field.addEventListener('blur', () => validateField(field));
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    hideNotice();
    if (!validateAll()) return;

    const email = form.elements.namedItem('email').value.trim();
    const password = form.elements.namedItem('pass').value;

    submitBtn.disabled = true;
    const textoOriginal = submitLabel.textContent;
    submitLabel.textContent = 'Ingresando…';

    try {
      // redirectOn401: false -- un 401 acá es "credenciales incorrectas",
      // no una sesión vencida (todavía no hay ninguna sesión iniciada).
      const res = await apiFetch('/api/auth/login', { method: 'POST', body: { email, password }, redirectOn401: false });

      if (!res.ok) {
        showNotice(res.message || 'No pudimos iniciar sesión.');
        return;
      }

      redirigirSegunRol(res.data.usuario);
    } catch {
      showNotice('No pudimos conectar con el servidor. Verificá tu conexión e intentá de nuevo.');
    } finally {
      submitBtn.disabled = false;
      submitLabel.textContent = textoOriginal;
    }
  });
}
