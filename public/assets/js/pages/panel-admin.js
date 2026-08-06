import { qs } from '../utils.js';
import { requireAuth, apiFetch, logout } from '../modules/api-client.js';

/**
 * Panel de administración: gestión de tickets (ver, tomar/liberar, cambiar
 * estado/prioridad, comentar) y de clientes (alta, listado, activar/
 * desactivar, resetear contraseña). Los ADMIN son usuarios reales de
 * FreeScout y se gestionan desde su propia UI, no acá.
 */

const ESTADOS = { ABIERTO: 'Abierto', EN_CURSO: 'En curso', RESUELTO: 'Resuelto', CERRADO: 'Cerrado' };
const PRIORIDADES = { BAJA: 'Baja', MEDIA: 'Media', ALTA: 'Alta', URGENTE: 'Urgente' };
const PAGE_SIZE = 10;

let ticketsPage = 1;
let ticketsTotalPages = 1;
let usuarioActual = null;

/** Escapa texto para insertarlo de forma segura dentro de HTML (evita XSS con datos de tickets/comentarios). */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function formatFecha(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function mostrarAlerta(elId, mensaje, tipo = 'error') {
  const el = qs(`#${elId}`);
  if (!el) return;
  el.textContent = mensaje;
  el.className = `panel-alert is-visible${tipo === 'success' ? ' panel-alert--success' : ''}`;
  if (tipo === 'success') setTimeout(() => el.classList.remove('is-visible'), 4000);
}

/* ====================================
   TICKETS
==================================== */

function ticketCardHtml(t) {
  const estadoClase = `badge--estado-${t.estado.toLowerCase()}`;
  const prioridadClase = `badge--prioridad-${t.prioridad.toLowerCase()}`;
  const asignado = t.asignadoANombre ? escapeHtml(t.asignadoANombre) : 'Sin asignar';

  return `
    <article class="glass-card ticket-card" data-id="${t.id}">
      <div class="ticket-card__head" data-action="toggle">
        <span class="ticket-card__id">#${t.id}</span>
        <div style="flex:1; min-width:180px;">
          <div class="ticket-card__titulo">${escapeHtml(t.titulo)}</div>
          <div class="ticket-card__meta">
            Creado por ${escapeHtml(t.usuarioNombre)} (${escapeHtml(t.usuarioEmail)}) · ${formatFecha(t.fechaCreacion)} · Asignado a: ${asignado}
          </div>
        </div>
        <span class="badge badge--estado ${estadoClase}">${ESTADOS[t.estado] || t.estado}</span>
        <span class="badge badge--prioridad ${prioridadClase}">${PRIORIDADES[t.prioridad] || t.prioridad}</span>
        <svg class="ticket-card__toggle" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </div>
      <div class="ticket-card__body">
        <p class="ticket-card__descripcion">${escapeHtml(t.descripcion)}</p>

        <div class="ticket-card__controls">
          <div class="field">
            <label class="field__label field__label--form">Estado</label>
            <select class="field__input" data-action="estado">
              ${Object.entries(ESTADOS).map(([v, label]) => `<option value="${v}" ${v === t.estado ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
          </div>
          <div class="field">
            <label class="field__label field__label--form">Prioridad</label>
            <select class="field__input" data-action="prioridad">
              ${Object.entries(PRIORIDADES).map(([v, label]) => `<option value="${v}" ${v === t.prioridad ? 'selected' : ''}>${label}</option>`).join('')}
            </select>
          </div>
          ${
            t.asignadoAId === usuarioActual.id
              ? '<button type="button" class="btn btn-secondary btn--sm" data-action="liberar">Liberar ticket</button>'
              : '<button type="button" class="btn btn-secondary btn--sm" data-action="tomar">Tomar ticket</button>'
          }
        </div>

        <div class="comment-thread" data-role="comments">
          <p class="panel-status">Cargando comentarios…</p>
        </div>
        <form class="comment-form" data-action="comentar">
          <textarea class="field__input" placeholder="Escribir una respuesta…" required maxlength="4000"></textarea>
          <button type="submit" class="btn btn-primary btn--sm" style="align-self:flex-end;">Comentar</button>
        </form>
      </div>
    </article>
  `;
}

async function cargarTickets() {
  const estado = qs('#filter-estado').value;
  const prioridad = qs('#filter-prioridad').value;
  const soloAsignados = qs('#filter-asignados').checked;

  const params = new URLSearchParams({ page: String(ticketsPage), pageSize: String(PAGE_SIZE) });
  if (estado) params.set('estado', estado);
  if (prioridad) params.set('prioridad', prioridad);
  if (soloAsignados) params.set('asignadoAId', String(usuarioActual.id));

  const statusEl = qs('#tickets-status');
  const listEl = qs('#tickets-list');
  statusEl.textContent = 'Cargando tickets…';
  statusEl.style.display = 'block';
  listEl.innerHTML = '';

  const res = await apiFetch(`/api/tickets?${params.toString()}`);
  if (!res.ok) {
    mostrarAlerta('tickets-alert', res.message || 'No se pudieron cargar los tickets.');
    statusEl.textContent = 'No se pudieron cargar los tickets.';
    return;
  }

  ticketsTotalPages = res.pagination?.totalPages || 1;
  qs('#tickets-page-info').textContent = `Página ${ticketsPage} de ${ticketsTotalPages}`;
  qs('#tickets-prev').disabled = ticketsPage <= 1;
  qs('#tickets-next').disabled = ticketsPage >= ticketsTotalPages;

  if (!res.data.length) {
    statusEl.textContent = 'No hay tickets que coincidan con estos filtros.';
    return;
  }

  statusEl.style.display = 'none';
  listEl.innerHTML = res.data.map(ticketCardHtml).join('');
}

async function cargarComentarios(ticketId, container) {
  const res = await apiFetch(`/api/tickets/${ticketId}/comentarios`);
  if (!res.ok) {
    container.innerHTML = '<p class="panel-status">No se pudieron cargar los comentarios.</p>';
    return;
  }
  if (!res.data.length) {
    container.innerHTML = '<p class="panel-status">Todavía no hay comentarios.</p>';
    return;
  }
  container.innerHTML = res.data
    .map(
      (c) => `
      <div class="comment-item">
        <div class="comment-item__meta"><span>${escapeHtml(c.usuarioNombre)}</span><span>${formatFecha(c.fechaCreacion)}</span></div>
        <div class="comment-item__texto">${escapeHtml(c.comentario)}</div>
      </div>
    `
    )
    .join('');
}

function initTicketsSection() {
  qs('#filter-estado').addEventListener('change', () => {
    ticketsPage = 1;
    cargarTickets();
  });
  qs('#filter-prioridad').addEventListener('change', () => {
    ticketsPage = 1;
    cargarTickets();
  });
  qs('#filter-asignados').addEventListener('change', () => {
    ticketsPage = 1;
    cargarTickets();
  });
  qs('#tickets-prev').addEventListener('click', () => {
    if (ticketsPage > 1) {
      ticketsPage -= 1;
      cargarTickets();
    }
  });
  qs('#tickets-next').addEventListener('click', () => {
    if (ticketsPage < ticketsTotalPages) {
      ticketsPage += 1;
      cargarTickets();
    }
  });

  // Delegación de eventos: la lista se re-renderiza entera en cada carga,
  // así que los listeners van en el contenedor fijo, no en cada tarjeta.
  const listEl = qs('#tickets-list');

  listEl.addEventListener('click', async (event) => {
    const card = event.target.closest('.ticket-card');
    if (!card) return;
    const ticketId = card.dataset.id;

    if (event.target.closest('[data-action="toggle"]')) {
      const wasOpen = card.classList.contains('is-open');
      card.classList.toggle('is-open', !wasOpen);
      if (!wasOpen && !card.dataset.comentariosCargados) {
        card.dataset.comentariosCargados = '1';
        await cargarComentarios(ticketId, qs('[data-role="comments"]', card));
      }
      return;
    }

    if (event.target.closest('[data-action="tomar"]')) {
      const res = await apiFetch(`/api/tickets/${ticketId}/asignar`, { method: 'PATCH' });
      if (!res.ok) return mostrarAlerta('tickets-alert', res.message || 'No se pudo tomar el ticket.');
      cargarTickets();
      return;
    }

    if (event.target.closest('[data-action="liberar"]')) {
      const res = await apiFetch(`/api/tickets/${ticketId}/liberar`, { method: 'PATCH' });
      if (!res.ok) return mostrarAlerta('tickets-alert', res.message || 'No se pudo liberar el ticket.');
      cargarTickets();
    }
  });

  listEl.addEventListener('change', async (event) => {
    const card = event.target.closest('.ticket-card');
    if (!card) return;
    const ticketId = card.dataset.id;

    if (event.target.matches('[data-action="estado"]')) {
      const nuevoEstado = event.target.value;
      const res = await apiFetch(`/api/tickets/${ticketId}/estado`, { method: 'PATCH', body: { estado: nuevoEstado } });
      if (!res.ok) {
        mostrarAlerta('tickets-alert', res.message || 'No se pudo actualizar el estado.');
      } else {
        const badge = qs('.badge--estado', card);
        badge.className = `badge badge--estado badge--estado-${nuevoEstado.toLowerCase()}`;
        badge.textContent = ESTADOS[nuevoEstado] || nuevoEstado;
        mostrarAlerta('tickets-alert', 'Estado actualizado.', 'success');
      }
    }

    if (event.target.matches('[data-action="prioridad"]')) {
      const nuevaPrioridad = event.target.value;
      const res = await apiFetch(`/api/tickets/${ticketId}/prioridad`, { method: 'PATCH', body: { prioridad: nuevaPrioridad } });
      if (!res.ok) {
        mostrarAlerta('tickets-alert', res.message || 'No se pudo actualizar la prioridad.');
      } else {
        const badge = qs('.badge--prioridad', card);
        badge.className = `badge badge--prioridad badge--prioridad-${nuevaPrioridad.toLowerCase()}`;
        badge.textContent = PRIORIDADES[nuevaPrioridad] || nuevaPrioridad;
        mostrarAlerta('tickets-alert', 'Prioridad actualizada.', 'success');
      }
    }
  });

  listEl.addEventListener('submit', async (event) => {
    if (!event.target.matches('[data-action="comentar"]')) return;
    event.preventDefault();
    const card = event.target.closest('.ticket-card');
    const ticketId = card.dataset.id;
    const textarea = qs('textarea', event.target);
    const comentario = textarea.value.trim();
    if (!comentario) return;

    const res = await apiFetch(`/api/tickets/${ticketId}/comentarios`, { method: 'POST', body: { comentario } });
    if (!res.ok) return mostrarAlerta('tickets-alert', res.message || 'No se pudo enviar el comentario.');

    textarea.value = '';
    await cargarComentarios(ticketId, qs('[data-role="comments"]', card));
  });

  cargarTickets();
}

/* ====================================
   USUARIOS (clientes propios -- los ADMIN se gestionan desde FreeScout)
==================================== */

function usuarioRowHtml(u) {
  return `
    <div class="glass-card usuario-row ${u.activo ? '' : 'is-inactivo'}" data-id="${u.id}">
      <div class="usuario-row__info">
        <div class="usuario-row__nombre">${escapeHtml(u.nombre)}</div>
        <div class="usuario-row__email">${escapeHtml(u.email)} · ${u.activo ? 'Activo' : 'Inactivo'}</div>
      </div>
      <div class="usuario-row__actions">
        <button type="button" class="btn btn-secondary btn--sm" data-action="reset">Resetear contraseña</button>
        ${
          u.activo
            ? '<button type="button" class="btn btn-secondary btn--sm" data-action="desactivar">Dar de baja</button>'
            : '<button type="button" class="btn btn-secondary btn--sm" data-action="activar">Dar de alta</button>'
        }
      </div>
    </div>
  `;
}

async function cargarUsuarios() {
  const statusEl = qs('#usuarios-status');
  const listEl = qs('#usuarios-list');
  statusEl.textContent = 'Cargando usuarios…';
  statusEl.style.display = 'block';

  const res = await apiFetch('/api/usuarios?page=1');
  if (!res.ok) {
    statusEl.textContent = 'No se pudieron cargar los usuarios.';
    return;
  }
  if (!res.data.length) {
    statusEl.textContent = 'Todavía no hay clientes.';
    listEl.innerHTML = '';
    return;
  }
  statusEl.style.display = 'none';
  listEl.innerHTML = res.data.map(usuarioRowHtml).join('');
}

function initUsuariosSection() {
  qs('#crear-usuario-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const body = {
      nombre: form.nombre.value.trim(),
      email: form.email.value.trim(),
      password: form.password.value,
    };
    const res = await apiFetch('/api/usuarios', { method: 'POST', body });
    if (!res.ok) {
      mostrarAlerta('usuarios-alert', (res.errors && res.errors.join(' ')) || res.message || 'No se pudo crear el cliente.');
      return;
    }
    mostrarAlerta('usuarios-alert', `Cliente "${body.nombre}" creado.`, 'success');
    form.reset();
    cargarUsuarios();
  });

  qs('#usuarios-list').addEventListener('click', async (event) => {
    const row = event.target.closest('.usuario-row');
    if (!row) return;
    const id = row.dataset.id;

    if (event.target.closest('[data-action="activar"]')) {
      const res = await apiFetch(`/api/usuarios/${id}/estado`, { method: 'PATCH', body: { activo: true } });
      if (!res.ok) return mostrarAlerta('usuarios-alert', res.message || 'No se pudo activar el cliente.');
      cargarUsuarios();
      return;
    }

    if (event.target.closest('[data-action="desactivar"]')) {
      const res = await apiFetch(`/api/usuarios/${id}/estado`, { method: 'PATCH', body: { activo: false } });
      if (!res.ok) return mostrarAlerta('usuarios-alert', res.message || 'No se pudo desactivar el cliente.');
      cargarUsuarios();
      return;
    }

    if (event.target.closest('[data-action="reset"]')) {
      const res = await apiFetch(`/api/usuarios/${id}/reset-password`, { method: 'PATCH' });
      if (!res.ok) return mostrarAlerta('usuarios-alert', res.message || 'No se pudo resetear la contraseña.');
      mostrarAlerta('usuarios-alert', `Contraseña temporal generada: ${res.data.passwordTemporal}`, 'success');
    }
  });

  cargarUsuarios();
}

/* ====================================
   INIT
==================================== */

function initHeader() {
  qs('#panel-user-name').textContent = usuarioActual.nombre;
  qs('#logout-btn').addEventListener('click', async () => {
    await logout();
    window.location.href = 'login.html';
  });
}

usuarioActual = await requireAuth(['ADMIN']);
if (usuarioActual) {
  initHeader();
  initTicketsSection();
  initUsuariosSection();
}
