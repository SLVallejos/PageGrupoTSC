import { qs } from '../utils.js';

/**
 * Validación del formulario de login/creación de tickets. El Portal de
 * Clientes todavía no tiene backend: una vez que los datos pasan la
 * validación, sólo se revela un aviso de "muy pronto" (mismo comportamiento
 * que el <script> inline de login.astro original). Cuando exista el
 * backend real, el bloque marcado con TODO es el único punto a reemplazar
 * por el POST/fetch de autenticación — la validación ya queda lista.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validators = {
  user: (value) => {
    const trimmed = value.trim();
    if (!trimmed) return 'Ingresá tu usuario o email.';
    if (trimmed.includes('@')) {
      return EMAIL_PATTERN.test(trimmed) ? null : 'Ingresá un email válido.';
    }
    return trimmed.length >= 3 ? null : 'El usuario debe tener al menos 3 caracteres.';
  },
  pass: (value) => {
    if (!value) return 'Ingresá tu contraseña.';
    return value.length >= 6 ? null : 'La contraseña debe tener al menos 6 caracteres.';
  },
};

export function initLoginForm() {
  const form = qs('#login-form');
  const notice = qs('#login-notice');
  if (!form || !notice) return;

  const fields = Object.keys(validators)
    .map((name) => form.elements.namedItem(name))
    .filter(Boolean);

  /** Marca (o limpia) el error de un campo: aria-invalid, borde y texto de ayuda. */
  function showFieldError(field, message) {
    const group = field.closest('.field-group');
    const errorEl = qs(`#error-login-${field.name}`, form);
    field.setAttribute('aria-invalid', message ? 'true' : 'false');
    group?.classList.toggle('field-group--invalid', Boolean(message));
    if (errorEl) errorEl.textContent = message || '';
    return !message;
  }

  /** Valida un único campo contra su regla y refleja el resultado en el DOM. */
  function validateField(field) {
    return showFieldError(field, validators[field.name](field.value));
  }

  /** Valida todos los campos; retorna true sólo si todos pasan. */
  function validateAll() {
    return fields.reduce((valid, field) => validateField(field) && valid, true);
  }

  fields.forEach((field) => {
    field.addEventListener('blur', () => validateField(field));
  });

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!validateAll()) return;

    // TODO: reemplazar por el POST/fetch de autenticación real cuando el
    // Portal de Clientes tenga backend. Por ahora sólo mostramos el aviso.
    form.classList.add('is-hidden');
    notice.classList.add('is-visible');
  });
}
