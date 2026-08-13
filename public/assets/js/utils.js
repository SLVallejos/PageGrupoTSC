export function qs(selector, scope = document) {
  return scope.querySelector(selector);
}

export function qsa(selector, scope = document) {
  return Array.from(scope.querySelectorAll(selector));
}

export function debounce(fn, wait = 150) {
  let timeoutId;
  return (...args) => {
    clearTimeout(timeoutId);
    timeoutId = setTimeout(() => fn(...args), wait);
  };
}

export function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export function prefersReducedMotion() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/**
 * Deshabilita `button` y le pone "Guardando…" mientras `fn` está en
 * vuelo, para evitar doble-submit en formularios async (el CSS de
 * `.btn-primary:disabled` ya existe, solo faltaba dispararlo desde acá).
 */
export async function withButtonLoading(button, fn) {
  if (!button) return fn();
  const textoOriginal = button.textContent;
  button.disabled = true;
  button.textContent = 'Guardando…';
  try {
    return await fn();
  } finally {
    button.disabled = false;
    button.textContent = textoOriginal;
  }
}
