import { qs } from '../utils.js';

/**
 * Validación + envío del formulario de contacto, reemplaza ContactForm.jsx
 * (antes react-hook-form). Las reglas son las mismas que tenía el formulario
 * React; el endpoint viene del atributo `data-endpoint` del <form> (lo
 * inyecta pages/home.js desde data/contact.js), no está hardcodeado acá.
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const validators = {
  nombre: (value) => (value.trim() ? null : 'Ingresá tu nombre completo.'),
  email: (value) => {
    if (!value.trim()) return 'Ingresá tu correo electrónico.';
    return EMAIL_PATTERN.test(value) ? null : 'Ingresá un correo electrónico válido.';
  },
  telefono: (value) => {
    if (!value.trim()) return null;
    const digits = value.replace(/\D/g, '');
    return digits.length >= 8 && digits.length <= 15
      ? null
      : 'Ingresá un teléfono válido. Ejemplo: 3511234567 o +54 351 1234567.';
  },
  mensaje: (value) => (value.trim() ? null : 'Contanos brevemente qué necesitás.'),
};

export function initContactForm(formEl) {
  if (!formEl) return;

  const endpoint = formEl.dataset.endpoint;
  const submitBtn = qs('button[type="submit"]', formEl);
  const submitLabel = submitBtn?.querySelector('[data-submit-label]');
  const statusEl = qs('[data-form-status]', formEl);

  const fields = Object.keys(validators)
    .map((name) => formEl.elements.namedItem(name))
    .filter(Boolean);

  function showFieldError(field, message) {
    const errorEl = qs(`#error-${field.name}`, formEl);
    field.setAttribute('aria-invalid', message ? 'true' : 'false');
    if (errorEl) errorEl.textContent = message || '';
    return !message;
  }

  function validateField(field) {
    return showFieldError(field, validators[field.name](field.value));
  }

  function validateAll() {
    return fields.reduce((valid, field) => validateField(field) && valid, true);
  }

  function setStatus(type, message) {
    if (!statusEl) return;
    statusEl.textContent = message;
    statusEl.className = message ? `status-message status-message--${type}` : '';
    statusEl.hidden = !message;
  }

  function setSubmitting(isSubmitting) {
    if (!submitBtn) return;
    submitBtn.disabled = isSubmitting;
    if (submitLabel) submitLabel.textContent = isSubmitting ? 'Enviando...' : 'Enviar Consulta';
  }

  fields.forEach((field) => {
    field.addEventListener('blur', () => validateField(field));
  });

  formEl.addEventListener('submit', async (event) => {
    event.preventDefault();
    setStatus(null, '');

    if (!validateAll()) return;

    setSubmitting(true);
    try {
      const formData = new FormData(formEl);
      formData.append('_subject', 'Nueva consulta desde Grupo TSC');

      const response = await fetch(endpoint, {
        method: 'POST',
        body: formData,
        headers: { Accept: 'application/json' },
      });

      if (response.ok) {
        setStatus('success', 'Consulta enviada correctamente. Te responderemos a la brevedad.');
        formEl.reset();
      } else {
        setStatus('error', 'No pudimos enviar tu consulta. Intentá nuevamente o escribinos por WhatsApp.');
      }
    } catch {
      setStatus('error', 'Ocurrió un error de conexión. Intentá nuevamente o escribinos por WhatsApp.');
    } finally {
      setSubmitting(false);
    }
  });
}
