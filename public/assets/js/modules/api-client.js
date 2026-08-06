/**
 * Cliente de la API propia (public/index.php + app/) y manejo de la sesión
 * para los paneles de ADMIN y CLIENTE. Sitio y API están en el mismo
 * origen (mismo `php -S` sirviendo public/), así que no hace falta CORS ni
 * guardar ningún token: la sesión vive en una cookie httpOnly que el
 * navegador manda solo.
 */

/**
 * fetch con la cookie de sesión incluida y el envoltorio de respuesta
 * ({ success, data|message }) ya parseado. En un 401 redirige al login
 * (sesión vencida) salvo que se pida lo contrario con `redirectOn401:
 * false` (el login mismo devuelve 401 con "credenciales incorrectas", que
 * es un error de validación normal, no una sesión vencida).
 * @param {string} path - ej. "/api/auth/login"
 * @param {{ method?: string, body?: object, redirectOn401?: boolean }} [opts]
 */
export async function apiFetch(path, { method = 'GET', body, redirectOn401 = true } = {}) {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  });

  if (res.status === 401 && redirectOn401) {
    window.location.href = 'login.html';
    throw new Error('Sesión vencida o inválida.');
  }

  const json = await res.json().catch(() => ({}));
  return { status: res.status, ok: res.ok, ...json };
}

/**
 * Consulta la sesión activa contra el backend (no hay nada guardado en el
 * cliente para chequear localmente).
 * @returns {Promise<{id:number, nombre:string, email:string, rol:string}|null>}
 */
export async function getSesionActual() {
  // redirectOn401: false -- no tener sesión es el estado normal acá (recién
  // llegamos a chequear si existe), no una sesión que se venció en medio del uso.
  const res = await apiFetch('/api/auth/me', { redirectOn401: false });
  return res.ok ? res.data.usuario : null;
}

/**
 * Guarda de entrada de cada panel: exige sesión válida y, si se pasan
 * roles permitidos, que el usuario tenga uno de esos roles. Redirige a
 * login.html (sin sesión) o al panel que le corresponde (rol equivocado)
 * en vez de dejarlo ver una pantalla que no es para él.
 * @param {Array<'ADMIN'|'CLIENTE'>} [rolesPermitidos]
 */
export async function requireAuth(rolesPermitidos) {
  const usuario = await getSesionActual();

  if (!usuario) {
    window.location.href = 'login.html';
    return null;
  }

  if (rolesPermitidos && !rolesPermitidos.includes(usuario.rol)) {
    window.location.href = usuario.rol === 'ADMIN' ? 'panel-admin.html' : 'panel-cliente.html';
    return null;
  }

  return usuario;
}

/** Cierra la sesión actual en el backend. */
export async function logout() {
  await apiFetch('/api/auth/logout', { method: 'POST' });
}
