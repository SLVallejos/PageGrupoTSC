import { qs, qsa } from '../utils.js';
import { requireAuth, apiFetch, apiUpload, logout } from '../modules/api-client.js';
import { showSection, setActiveSidebarLink, initPanelShell } from '../modules/panel-shell.js';

/**
 * Panel de administración: gestión de tickets (ver, adjudicar/liberar,
 * cambiar estado/prioridad, escalar de nivel, resolver, comentar, subir
 * adjuntos), de clientes y de agentes de soporte (alta, listado,
 * activar/desactivar, resetear contraseña, foto de perfil).
 */

const ESTADOS = {
  ABIERTO: 'Abierto',
  PENDIENTE_ASIGNACION: 'Pendiente de asignación',
  EN_PROCESO: 'En proceso',
  ESCALADO: 'Escalado',
  EN_ESPERA: 'En espera',
  RESUELTO: 'Resuelto',
  CERRADO: 'Cerrado',
  CANCELADO: 'Cancelado',
};
const PRIORIDADES = { BAJA: 'Baja', MEDIA: 'Media', ALTA: 'Alta', URGENTE: 'Urgente' };
const SLA_LABELS = { OK: 'SLA OK', PROXIMO: 'SLA próximo', VENCIDO: 'SLA vencido', CUMPLIDO: 'SLA cumplido', FUERA_PLAZO: 'Fuera de plazo' };
const EVENTO_LABELS = {
  CREADO: 'Ticket creado',
  ASIGNADO: 'Ticket asignado',
  LIBERADO: 'Ticket liberado',
  ESTADO: 'Cambio de estado',
  PRIORIDAD: 'Cambio de prioridad',
  ESCALADO: 'Escalado',
  COMENTARIO: 'Comentario',
  RESUELTO: 'Ticket resuelto',
  PAUSADO: 'Puesto en espera',
  REANUDADO: 'Reanudado',
  DEVUELTO: 'Devuelto al técnico original',
  CERRADO: 'Ticket cerrado',
  CANCELADO: 'Ticket cancelado',
};
const PAGE_SIZE = 10;
const ADJUNTOS_ACEPTADOS = 'image/jpeg,image/png,image/webp,image/gif,application/pdf';

/**
 * Política de contraseñas (mismas reglas que `Validator::password()` en
 * el backend) -- acá solo es feedback visual en vivo mientras se
 * escribe, la validación real es siempre del lado del servidor.
 */
const PASSWORD_REQS = [
  { label: 'Al menos 8 caracteres', test: (v) => v.length >= 8 },
  { label: 'Una letra mayúscula', test: (v) => /[A-Z]/.test(v) },
  { label: 'Un carácter especial', test: (v) => /[^A-Za-z0-9]/.test(v) },
];

function passwordHintsItemsHtml() {
  return PASSWORD_REQS.map((r, i) => `<li data-req="${i}">${escapeHtml(r.label)}</li>`).join('');
}

/** Actualiza qué requisitos aparecen cumplidos (✓) en el checklist de al lado de un campo de contraseña. */
function actualizarPasswordHints(hintsEl, value) {
  PASSWORD_REQS.forEach((r, i) => {
    hintsEl.querySelector(`[data-req="${i}"]`)?.classList.toggle('is-valida', r.test(value));
  });
}

/** Engancha el checklist en vivo a un form estático (alta de cliente/agente) -- los de "reset-manual" dinámicos usan delegación, ver initGestionSection()/initAgentesSection(). */
function initPasswordHints(form) {
  const input = qs('input[type="password"]', form);
  const hintsEl = qs('[data-role="password-hints"]', form);
  if (!input || !hintsEl) return;
  hintsEl.innerHTML = passwordHintsItemsHtml();
  input.addEventListener('input', () => actualizarPasswordHints(hintsEl, input.value));
}

let ticketsPage = 1;
let ticketsTotalPages = 1;
let nivelActual = null; // null = "Todos" (el arranque ahora es la sección Inicio, no Nivel 1)
let sinAsignarActual = false;
let qFilterActual = '';
let usuarioActual = null;
let estadisticasDesde = '';
let estadisticasHasta = '';

/** Escapa texto para insertarlo de forma segura dentro de HTML (evita XSS con datos de tickets/comentarios). */
function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

function formatFecha(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function mostrarAlerta(elId, mensaje, tipo = 'error') {
  const el = qs(`#${elId}`);
  if (!el) return;
  el.textContent = mensaje;
  el.className = `panel-alert is-visible${tipo === 'success' ? ' panel-alert--success' : ''}`;
  if (tipo === 'success') setTimeout(() => el.classList.remove('is-visible'), 4000);
}

/** Avatar de un agente: foto si tiene, si no un círculo con la inicial del nombre. Mismo helper para el roster de Agentes y para "Asignado a" en tarjetas de ticket. */
function avatarHtml(fotoUrl, nombre, tamano = 'sm') {
  const claseTamano = `avatar--${tamano}`;
  if (fotoUrl) {
    return `<img src="${fotoUrl}" alt="" class="avatar ${claseTamano}" />`;
  }
  const inicial = (nombre || '?').trim().charAt(0).toUpperCase() || '?';
  return `<span class="avatar-fallback ${claseTamano}">${escapeHtml(inicial)}</span>`;
}

/* ====================================
   TICKETS
==================================== */

/**
 * Los botones dependen del estado real del ticket -- ya no hay un
 * `<select>` libre de estado, cada transición es una acción con sus
 * propias reglas (ver TicketController::assertEditable() y los checks
 * de estado en asignar/liberar/pausar/reanudar/escalar/resolver/
 * cerrar).
 */
/**
 * Vista de solo lectura para ADMIN -- el administrador supervisa el
 * circuito completo pero nunca gestiona un ticket como si fuera técnico
 * (ver `TicketController`, donde asignar/liberar/pausar/reanudar/
 * escalar/resolver/cerrar/prioridad ahora son AGENTE-only). Nunca hay
 * botones de acción, cualquiera sea el estado.
 */
function ticketEstadoSupervisorHtml(t) {
  if (t.estado === 'CANCELADO') {
    return `
      <div class="solucion-box">
        <strong>Ticket cancelado</strong>
        <p>El motivo queda registrado en el Historial, más abajo.</p>
      </div>
    `;
  }

  if (t.estado === 'CERRADO' || t.estado === 'RESUELTO') {
    return `
      <div class="solucion-box">
        <strong>Solución propuesta</strong>
        <p>${escapeHtml(t.solucion)}</p>
        <span class="ticket-card__meta">Resuelto el ${formatFecha(t.fechaResuelto)}${t.estado === 'CERRADO' ? ` · Cerrado el ${formatFecha(t.fechaCerrado)}` : ''}</span>
      </div>
    `;
  }

  return `
    <div class="solucion-box">
      <strong>Vista de supervisión</strong>
      <p>Estado actual: ${ESTADOS[t.estado] || t.estado}. El administrador supervisa el circuito sin gestionar tickets directamente -- ver Historial para el detalle de la gestión.</p>
    </div>
  `;
}

function ticketControlesHtml(t) {
  if (usuarioActual.rol === 'ADMIN') {
    return ticketEstadoSupervisorHtml(t);
  }

  if (t.estado === 'CANCELADO') {
    return `
      <div class="solucion-box">
        <strong>Ticket cancelado</strong>
        <p>El motivo queda registrado en el Historial, más abajo.</p>
      </div>
    `;
  }

  if (t.estado === 'CERRADO') {
    return `
      <div class="solucion-box">
        <strong>Solución propuesta</strong>
        <p>${escapeHtml(t.solucion)}</p>
        <span class="ticket-card__meta">Resuelto el ${formatFecha(t.fechaResuelto)} · Cerrado el ${formatFecha(t.fechaCerrado)}</span>
      </div>
    `;
  }

  if (t.estado === 'RESUELTO') {
    return `
      <div class="solucion-box">
        <strong>Solución propuesta</strong>
        <p>${escapeHtml(t.solucion)}</p>
        <span class="ticket-card__meta">Resuelto el ${formatFecha(t.fechaResuelto)}</span>
      </div>
      <div class="ticket-card__controls">
        <button type="button" class="btn btn-primary btn--sm" data-action="cerrar-ticket">Cerrar ticket</button>
      </div>
    `;
  }

  const sinDueno = t.asignadoAId === null;
  const enProceso = t.estado === 'EN_PROCESO';
  const enEspera = t.estado === 'EN_ESPERA';
  const puedeTrabajarlo = enProceso || enEspera;

  return `
    <div class="ticket-card__controls">
      <div class="field">
        <label class="field__label field__label--form">Prioridad</label>
        <select class="field__input" data-action="prioridad">
          ${Object.entries(PRIORIDADES).map(([v, label]) => `<option value="${v}" ${v === t.prioridad ? 'selected' : ''}>${label}</option>`).join('')}
        </select>
      </div>
      ${
        sinDueno
          ? '<button type="button" class="btn btn-secondary btn--sm" data-action="adjudicar">Adjudicarme ticket</button>'
          : t.asignadoAId === usuarioActual.id
            ? '<button type="button" class="btn btn-secondary btn--sm" data-action="liberar">Liberar ticket</button>'
            : '<button type="button" class="btn btn-secondary btn--sm" data-action="adjudicar">Adjudicarme ticket</button>'
      }
      ${enProceso ? '<button type="button" class="btn btn-secondary btn--sm" data-action="pausar">Marcar en espera</button>' : ''}
      ${enEspera ? '<button type="button" class="btn btn-secondary btn--sm" data-action="reanudar">Reanudar</button>' : ''}
      ${
        puedeTrabajarlo && t.nivel < 3
          ? `<button type="button" class="btn btn-secondary btn--sm" data-action="escalar-toggle">Escalar a Nivel ${t.nivel + 1}</button>`
          : ''
      }
      ${puedeTrabajarlo ? '<button type="button" class="btn btn-secondary btn--sm" data-action="resolver-toggle">Proponer Solución</button>' : ''}
      <button type="button" class="btn btn-secondary btn--sm" data-action="cancelar-toggle">Cancelar ticket</button>
    </div>
    ${
      puedeTrabajarlo && t.nivel < 3
        ? `<div class="resolver-form" data-role="escalar-form" hidden>
             <input type="text" class="field__input" placeholder="Motivo del escalamiento…" required maxlength="500" data-role="escalar-motivo" />
             <button type="button" class="btn btn-primary btn--sm" data-action="escalar-confirmar">Confirmar escalamiento</button>
           </div>`
        : ''
    }
    ${
      puedeTrabajarlo
        ? `<div class="resolver-form" data-role="resolver-form" hidden>
             <textarea class="field__input" placeholder="Describí la solución aplicada…" required maxlength="4000"></textarea>
             <button type="button" class="btn btn-primary btn--sm" data-action="resolver-confirmar">Confirmar resolución</button>
           </div>`
        : ''
    }
    <div class="resolver-form" data-role="cancelar-form" hidden>
      <input type="text" class="field__input" placeholder="Motivo de la cancelación…" required maxlength="500" data-role="cancelar-motivo" />
      <button type="button" class="btn btn-primary btn--sm" data-action="cancelar-confirmar">Confirmar cancelación</button>
    </div>
  `;
}

function ticketCardHtml(t) {
  const estadoClase = `badge--estado-${t.estado.toLowerCase()}`;
  const prioridadClase = `badge--prioridad-${t.prioridad.toLowerCase()}`;
  const slaClase = `badge--sla-${t.slaEstado.toLowerCase()}`;
  const asignado = t.asignadoANombre
    ? `${avatarHtml(t.asignadoAFotoUrl, t.asignadoANombre, 'sm')} ${escapeHtml(t.asignadoANombre)}${t.asignadoATitulo ? ` · ${escapeHtml(t.asignadoATitulo)}` : ''}`
    : 'Sin asignar';
  // RESUELTO, CERRADO y CANCELADO bloquean comentarios/adjuntos por
  // igual (ver TicketController::assertEditable()) -- el nombre queda
  // "resuelto" por el estilo CSS ya existente (`ticket-card--resuelto`),
  // que también aplica visualmente a cerrado/cancelado. Un ADMIN nunca
  // comenta ni adjunta (supervisor de solo lectura, ver
  // ticketEstadoSupervisorHtml()), así que cae en la misma rama sea
  // cual sea el estado real del ticket.
  const resuelto = t.estado === 'RESUELTO' || t.estado === 'CERRADO' || t.estado === 'CANCELADO' || usuarioActual.rol === 'ADMIN';

  return `
    <article class="glass-card ticket-card${resuelto ? ' ticket-card--resuelto' : ''}" data-id="${t.id}" data-nivel="${t.nivel}">
      <div class="ticket-card__head" data-action="toggle">
        <span class="ticket-card__id">#${t.id}</span>
        <div style="flex:1; min-width:180px;">
          <div class="ticket-card__titulo">${escapeHtml(t.titulo)}</div>
          <div class="ticket-card__meta">
            Creado por ${escapeHtml(t.usuarioNombre)} (${escapeHtml(t.usuarioEmail)}) · ${formatFecha(t.fechaCreacion)} · Nivel ${t.nivel} · Asignado a: ${asignado}
          </div>
        </div>
        ${t.categoriaNombre ? `<span class="badge badge--categoria">${escapeHtml(t.categoriaNombre)}</span>` : ''}
        <span class="badge badge--estado ${estadoClase}">${ESTADOS[t.estado] || t.estado}</span>
        <span class="badge badge--prioridad ${prioridadClase}">${PRIORIDADES[t.prioridad] || t.prioridad}</span>
        <span class="badge ${slaClase}" title="Vence: ${formatFecha(t.slaVencimiento)}">${SLA_LABELS[t.slaEstado] || t.slaEstado}</span>
        <svg class="ticket-card__toggle" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>
      </div>
      <div class="ticket-card__body">
        <p class="ticket-card__descripcion">${escapeHtml(t.descripcion)}</p>

        ${ticketControlesHtml(t)}

        <div class="adjuntos-section">
          <strong class="adjuntos-section__title">Adjuntos</strong>
          <ul class="adjuntos-list" data-role="adjuntos"><li class="panel-status">Cargando…</li></ul>
          ${
            resuelto
              ? ''
              : `<form class="adjunto-form" data-action="subir-adjunto">
                   <input type="file" accept="${ADJUNTOS_ACEPTADOS}" required />
                   <button type="submit" class="btn btn-secondary btn--sm">Subir</button>
                 </form>`
          }
        </div>

        <div class="comment-thread" data-role="comments">
          <p class="panel-status">Cargando comentarios…</p>
        </div>
        ${
          resuelto
            ? ''
            : `<form class="comment-form" data-action="comentar">
                 <textarea class="field__input" placeholder="Escribir una respuesta…" required maxlength="4000"></textarea>
                 <button type="submit" class="btn btn-primary btn--sm" style="align-self:flex-end;">Comentar</button>
               </form>`
        }

        <div class="adjuntos-section">
          <strong class="adjuntos-section__title">Historial</strong>
          <div class="comment-thread" data-role="eventos">
            <p class="panel-status">Cargando historial…</p>
          </div>
        </div>
      </div>
    </article>
  `;
}

async function refrescarBadgesNiveles() {
  const res = await apiFetch('/api/tickets/resumen-nuevos');
  if (!res.ok) return;

  let total = 0;
  [1, 2, 3].forEach((nivel) => {
    const badge = qs(`#badge-nivel-${nivel}`);
    const cantidad = res.data[nivel] || 0;
    total += cantidad;
    badge.textContent = String(cantidad);
    badge.hidden = cantidad === 0;
  });

  // La campana del header suma los 3 niveles -- mismo dato, otra vista.
  const notifBadge = qs('#panel-notif-badge');
  notifBadge.textContent = String(total);
  notifBadge.hidden = total === 0;
}

/** Puebla el select de categoría del filtro de Tickets -- incluye inactivas (`?todas=1`) para poder filtrar tickets viejos igual. */
async function cargarCategoriasFiltro() {
  const res = await apiFetch('/api/categorias?todas=1');
  if (!res.ok) return;

  const select = qs('#filter-categoria');
  const actual = select.value;
  select.innerHTML =
    '<option value="">Todas</option>' +
    res.data.map((c) => `<option value="${c.id}">${escapeHtml(c.nombre)}${c.activo ? '' : ' (inactiva)'}</option>`).join('');
  select.value = actual;
}

async function cargarTickets() {
  const estado = qs('#filter-estado').value;
  const prioridad = qs('#filter-prioridad').value;
  const categoria = qs('#filter-categoria').value;
  const soloAsignados = qs('#filter-asignados').checked;

  const params = new URLSearchParams({ page: String(ticketsPage), pageSize: String(PAGE_SIZE) });
  if (nivelActual) params.set('nivel', String(nivelActual));
  if (estado) params.set('estado', estado);
  if (prioridad) params.set('prioridad', prioridad);
  if (categoria) params.set('categoriaId', categoria);
  if (soloAsignados) params.set('soloMios', '1');
  if (sinAsignarActual) params.set('sinAsignar', '1');
  if (qFilterActual) params.set('q', qFilterActual);

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
  } else {
    statusEl.style.display = 'none';
    listEl.innerHTML = res.data.map(ticketCardHtml).join('');
  }

  refrescarBadgesNiveles();
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

async function cargarAdjuntos(ticketId, container) {
  const res = await apiFetch(`/api/tickets/${ticketId}/adjuntos`);
  if (!res.ok) {
    container.innerHTML = '<li class="panel-status">No se pudieron cargar los adjuntos.</li>';
    return;
  }
  if (!res.data.length) {
    container.innerHTML = '<li class="panel-status">Todavía no hay adjuntos.</li>';
    return;
  }
  container.innerHTML = res.data
    .map(
      (a) => `
      <li class="adjunto-item">
        <a href="${a.urlDescarga}" target="_blank" rel="noopener">${escapeHtml(a.nombreOriginal)}</a>
        <span class="adjunto-item__meta">${escapeHtml(a.autorNombre)} · ${formatFecha(a.fechaCreacion)}</span>
      </li>
    `
    )
    .join('');
}

/** Texto de detalle de un evento -- ESCALADO arma su propio texto con nivel/motivo; ESTADO/PRIORIDAD traducen el código crudo que manda el backend con los mapas que ya existen acá. */
function detalleEventoTexto(e) {
  if (e.tipo === 'ESCALADO') {
    const motivo = e.motivo ? ` — Motivo: ${escapeHtml(e.motivo)}` : '';
    return `Nivel ${e.nivelAnterior} → Nivel ${e.nivelNuevo}${motivo}`;
  }
  if (e.tipo === 'ESTADO') {
    return `Nuevo estado: ${ESTADOS[e.detalle] || e.detalle}`;
  }
  if (e.tipo === 'PRIORIDAD') {
    return `Nueva prioridad: ${PRIORIDADES[e.detalle] || e.detalle}`;
  }
  if (e.tipo === 'CANCELADO') {
    return `Motivo: ${escapeHtml(e.motivo || '')}`;
  }
  return escapeHtml(e.detalle || '');
}

async function cargarEventos(ticketId, container) {
  const res = await apiFetch(`/api/tickets/${ticketId}/eventos`);
  if (!res.ok) {
    container.innerHTML = '<p class="panel-status">No se pudo cargar el historial.</p>';
    return;
  }
  if (!res.data.length) {
    container.innerHTML = '<p class="panel-status">Sin eventos todavía.</p>';
    return;
  }
  container.innerHTML = res.data
    .map(
      (e) => `
      <div class="comment-item">
        <div class="comment-item__meta"><span>${EVENTO_LABELS[e.tipo] || e.tipo} · ${escapeHtml(e.autorNombre)}</span><span>${formatFecha(e.fecha)}</span></div>
        <div class="comment-item__texto">${detalleEventoTexto(e)}</div>
      </div>
    `
    )
    .join('');
}

/**
 * Navegación del sidebar: un listener delegado que lee `data-section` (qué
 * mostrar) y, para los links de Tickets, `data-nivel`/`data-solo-mios`/
 * `data-sin-asignar` (qué filtro aplicar) -- reemplaza los tabs de nivel
 * de antes, que ahora viven acá como parte del grupo "Soporte".
 */
/** El link "Todos" es el único de Tickets sin filtro extra -- sirve de "vista por defecto" para navegación que no viene de un click de sidebar (tiles del dashboard, buscador, campana). */
function linkTodos() {
  return qs('.panel-sidebar__link[data-section="tickets"]:not([data-nivel]):not([data-solo-mios]):not([data-sin-asignar])');
}

function initSidebarNav() {
  qs('#panel-sidebar').addEventListener('click', (event) => {
    const link = event.target.closest('.panel-sidebar__link');
    if (!link) return;
    event.preventDefault();

    const section = link.dataset.section;
    showSection(section);
    setActiveSidebarLink(link);

    if (section === 'tickets') {
      nivelActual = link.dataset.nivel ? Number(link.dataset.nivel) : null;
      sinAsignarActual = link.dataset.sinAsignar === '1';
      qFilterActual = '';
      qs('#panel-search-input').value = '';
      qs('#filter-asignados').checked = link.dataset.soloMios === '1';
      ticketsPage = 1;
      cargarTickets();
    } else if (section === 'inicio') {
      cargarDashboard();
    } else if (section === 'estadisticas') {
      cargarEstadisticas();
    }
  });
}

/**
 * Ícono + color por tile -- mismos colores que ya usan los badges de
 * estado/prioridad/SLA en el resto del panel (panels.css) y los donuts de
 * Estadísticas, para que un tile y un badge se lean como la misma
 * categoría. Íconos en el mismo estilo lineal (Feather-like) que la
 * campana/chevron del header, sin librería.
 */
const DASHBOARD_STAT_META = {
  abiertos: {
    color: '#0284c7',
    bg: '#e0f2fe',
    icon: '<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>',
  },
  enProgreso: {
    color: '#b45309',
    bg: '#fef3c7',
    icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  },
  escalados: {
    color: '#c2410c',
    bg: '#ffedd5',
    icon: '<polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/>',
  },
  criticos: {
    color: '#b91c1c',
    bg: '#fee2e2',
    icon: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
  },
  resueltosHoy: {
    color: '#065f46',
    bg: '#d1fae5',
    icon: '<path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>',
  },
  misTickets: {
    color: '#7c3aed',
    bg: '#ede9fe',
    icon: '<path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>',
  },
  slaEnRiesgo: {
    color: '#b45309',
    bg: '#fef3c7',
    icon: '<polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
  },
  cancelados: {
    color: '#64748b',
    bg: '#f1f5f9',
    icon: '<circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>',
  },
};

/**
 * Tiles de la sección Inicio. Solo "En progreso" y "Mis tickets" son
 * clickeables: son los únicos que mapean 1:1 a un filtro que ya existe en
 * la sección Tickets (estado=EN_PROCESO / soloMios). Los demás
 * (abiertos/escalados/críticos/resueltos hoy) combinan condiciones que
 * hoy no tienen un filtro equivalente en la UI, así que quedan solo
 * informativos por ahora.
 */
function dashboardStatHtml(key, value, label, clickable) {
  const meta = DASHBOARD_STAT_META[key];
  return `
    <div class="glass-card dashboard-stat${clickable ? ' dashboard-stat--clickable' : ''}" data-stat="${key}" style="--stat-color:${meta.color}; --stat-bg:${meta.bg};">
      <div class="dashboard-stat__icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${meta.icon}</svg>
      </div>
      <div class="dashboard-stat__body">
        <div class="dashboard-stat__value">${value}</div>
        <div class="dashboard-stat__label">${label}</div>
      </div>
    </div>
  `;
}

/** Etiquetas chicas que explican por qué un ticket aparece en "Atención requerida" (SLA vencido, Sin asignar, etc). */
function motivoChipHtml(motivo) {
  return `<span class="motivo-chip">${escapeHtml(motivo)}</span>`;
}

function atencionRequeridaHtml(t) {
  const estadoClase = `badge--estado-${t.estado.toLowerCase()}`;
  const prioridadClase = `badge--prioridad-${t.prioridad.toLowerCase()}`;
  const slaClase = `badge--sla-${t.slaEstado.toLowerCase()}`;
  const asignado = t.asignadoANombre
    ? `${avatarHtml(t.asignadoAFotoUrl, t.asignadoANombre, 'sm')} ${escapeHtml(t.asignadoANombre)}`
    : 'Sin asignar';

  return `
    <div class="glass-card usuario-row" data-id="${t.id}">
      <div class="usuario-row__info">
        <div class="usuario-row__nombre">#${t.id} · ${escapeHtml(t.titulo)}</div>
        <div class="usuario-row__email">${escapeHtml(t.usuarioNombre)} · ${formatFecha(t.fechaCreacion)} · Asignado a: ${asignado}</div>
        <div class="dashboard-motivos">
          ${t.motivos.map(motivoChipHtml).join('')}
          <span class="badge badge--prioridad ${prioridadClase}">${PRIORIDADES[t.prioridad] || t.prioridad}</span>
          <span class="badge badge--estado ${estadoClase}">${ESTADOS[t.estado] || t.estado}</span>
          <span class="badge ${slaClase}" title="Vence: ${formatFecha(t.slaVencimiento)}">${SLA_LABELS[t.slaEstado] || t.slaEstado}</span>
        </div>
      </div>
      <div class="usuario-row__actions">
        <button type="button" class="btn btn-secondary btn--sm" data-action="ver-ticket" data-id="${t.id}">Ver ticket</button>
        ${t.asignadoAId === null && usuarioActual.rol !== 'ADMIN' ? `<button type="button" class="btn btn-secondary btn--sm" data-action="asignar-directo" data-id="${t.id}">Asignar</button>` : ''}
      </div>
    </div>
  `;
}

function actividadRecienteHtml(e) {
  const detalle = detalleEventoTexto(e);
  return `
    <div class="comment-item">
      <div class="comment-item__meta"><span>${EVENTO_LABELS[e.tipo] || e.tipo} · ${escapeHtml(e.autorNombre)}</span><span>${formatFecha(e.fecha)}</span></div>
      <div class="comment-item__texto">
        <a href="#" data-action="ver-ticket" data-id="${e.ticketId}">#${e.ticketId} · ${escapeHtml(e.ticketTitulo)}</a>${detalle ? ` — ${detalle}` : ''}
      </div>
    </div>
  `;
}

/**
 * Donut SVG a mano (sin librería): un `<circle>` con `fill="none"` por
 * segmento, cada uno dibujado como un tramo de `stroke-dasharray` sobre la
 * circunferencia completa, con `stroke-dashoffset` acumulado para que
 * empiecen donde termina el anterior. Rotado -90° para que el primer
 * segmento arranque arriba (12 en punto) en vez de a la derecha (3 en
 * punto, default de SVG). Con total 0 dibuja un anillo gris en vez de
 * dividir por cero.
 */
function donutChartSvg(titulo, segmentos) {
  const total = segmentos.reduce((suma, s) => suma + s.valor, 0);
  const size = 150;
  const cx = size / 2;
  const cy = size / 2;
  const r = 52;
  const strokeWidth = 18;
  const circunferencia = 2 * Math.PI * r;
  const visibles = segmentos.filter((s) => s.valor > 0);
  // Huequito prolijo entre segmentos (estilo Linear/Notion) -- con
  // stroke-linecap redondeado, un dasharray a lo justo se ve como un
  // anillo continuo sin cortes; restarle unos px de "hueco" a cada
  // segmento (sin tocar el acumulado, que sigue proporcional al valor
  // real) es lo que separa uno de otro visualmente.
  const hueco = visibles.length > 1 ? 3 : 0;

  let arcos;
  if (total === 0) {
    arcos = '';
  } else {
    let acumulado = 0;
    arcos = visibles
      .map((s) => {
        const largoReal = (s.valor / total) * circunferencia;
        const largoVisible = Math.max(largoReal - hueco, 1);
        const circulo = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${s.color}" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-dasharray="${largoVisible} ${circunferencia - largoVisible}" stroke-dashoffset="${-acumulado}"><title>${escapeHtml(s.label)}: ${s.valor}</title></circle>`;
        acumulado += largoReal;
        return circulo;
      })
      .join('');
  }

  const leyendaGrid = segmentos.length > 5 ? ' chart-legend--grid' : '';
  const leyenda = segmentos
    .map(
      (s) => `
      <li>
        <span class="chart-legend__dot" style="background-color:${s.color}"></span>${escapeHtml(s.label)}
        <span class="chart-legend__valor">${s.valor}</span>
      </li>`
    )
    .join('');

  return `
    <div class="glass-card chart-card">
      <h3 class="chart-card__title">${escapeHtml(titulo)}</h3>
      <svg viewBox="0 0 ${size} ${size}" width="160" height="160" role="img" aria-label="${escapeHtml(titulo)}">
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#f1f5f9" stroke-width="${strokeWidth}" />
        <g transform="rotate(-90 ${cx} ${cy})">${arcos}</g>
        <text x="${cx}" y="${total === 0 ? cy : cy - 7}" text-anchor="middle" dominant-baseline="middle" class="chart-donut__total">${total === 0 ? 'Sin datos' : total}</text>
        ${total === 0 ? '' : `<text x="${cx}" y="${cy + 13}" text-anchor="middle" dominant-baseline="middle" class="chart-donut__subtitle">tickets</text>`}
      </svg>
      <ul class="chart-legend${leyendaGrid}">${leyenda}</ul>
    </div>
  `;
}

/** Barras agrupadas (creados/resueltos) por día, SVG a mano -- alto proporcional al máximo de la serie, con piso de 2px para que un valor en 0 siga siendo visible como línea. */
function barChartSvg(titulo, dias) {
  const width = 320;
  const height = 168;
  const padding = 24;
  const baseline = height - padding - 8;
  const maxBarHeight = baseline - 10;
  const max = Math.max(1, ...dias.map((d) => Math.max(d.creados, d.resueltos)));
  const groupWidth = (width - padding * 2) / dias.length;
  const barWidth = Math.min(14, groupWidth / 3);
  // Con rangos largos (30+ días) una etiqueta por barra se pisa entre sí
  // -- se eligen hasta 7 índices parejos (primero y último siempre
  // incluidos) en vez de "cada N + el último a la fuerza", que en
  // rangos que no eran múltiplo exacto del paso dejaba dos etiquetas
  // pegadas justo al final.
  const cantidadEtiquetas = Math.min(7, dias.length);
  const indicesConEtiqueta = new Set();
  for (let k = 0; k < cantidadEtiquetas; k++) {
    indicesConEtiqueta.add(Math.round((k / Math.max(cantidadEtiquetas - 1, 1)) * (dias.length - 1)));
  }

  const barras = dias
    .map((d, i) => {
      const groupX = padding + i * groupWidth + groupWidth / 2;
      const alturaCreados = d.creados === 0 ? 2 : (d.creados / max) * maxBarHeight;
      const alturaResueltos = d.resueltos === 0 ? 2 : (d.resueltos / max) * maxBarHeight;
      const fechaDate = new Date(`${d.fecha}T00:00:00`);
      const fechaLabel = indicesConEtiqueta.has(i)
        ? fechaDate.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
        : '';
      const fechaCompleta = fechaDate.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' });
      return `
        <g>
          <title>${fechaCompleta} — Creados: ${d.creados}, Resueltos: ${d.resueltos}</title>
          <rect x="${groupX - barWidth - 2}" y="${baseline - alturaCreados}" width="${barWidth}" height="${alturaCreados}" fill="#0284c7" rx="2" />
          <rect x="${groupX + 2}" y="${baseline - alturaResueltos}" width="${barWidth}" height="${alturaResueltos}" fill="#065f46" rx="2" />
        </g>
        ${fechaLabel ? `<text x="${groupX}" y="${height - 8}" text-anchor="middle" class="chart-bar__label">${fechaLabel}</text>` : ''}
      `;
    })
    .join('');

  return `
    <div class="glass-card chart-card">
      <h3 class="chart-card__title">${escapeHtml(titulo)}</h3>
      <ul class="chart-legend chart-legend--inline">
        <li><span class="chart-legend__dot" style="background-color:#0284c7"></span>Creados</li>
        <li><span class="chart-legend__dot" style="background-color:#065f46"></span>Resueltos</li>
      </ul>
      <svg viewBox="0 0 ${width} ${height}" width="100%" height="168" role="img" aria-label="${escapeHtml(titulo)}">
        <line x1="${padding}" y1="${baseline}" x2="${width - padding}" y2="${baseline}" stroke="#e2e8f0" stroke-width="1" />
        ${barras}
      </svg>
    </div>
  `;
}

async function cargarDashboard() {
  const statsEl = qs('#dashboard-stats');
  const res = await apiFetch('/api/tickets/dashboard');
  if (!res.ok) {
    mostrarAlerta('dashboard-alert', res.message || 'No se pudieron cargar los indicadores.');
    return;
  }

  const d = res.data;
  // El admin es supervisor de solo lectura -- no tiene bandeja propia,
  // así que "Mis tickets" (siempre 0 para ese rol) no suma nada y se
  // omite en vez de mostrar un tile vacío.
  const esAdmin = usuarioActual.rol === 'ADMIN';
  const tiles = [
    dashboardStatHtml('abiertos', d.abiertos, 'Tickets abiertos', false),
    dashboardStatHtml('enProgreso', d.enProgreso, 'En progreso', true),
    dashboardStatHtml('escalados', d.escalados, 'Escalados', false),
    dashboardStatHtml('criticos', d.criticos, 'Críticos', false),
    dashboardStatHtml('resueltosHoy', d.resueltosHoy, 'Resueltos hoy', false),
  ];
  if (!esAdmin) {
    tiles.push(dashboardStatHtml('misTickets', d.misTickets, 'Mis tickets', true));
  }
  tiles.push(dashboardStatHtml('slaEnRiesgo', d.slaEnRiesgo, 'SLA en riesgo', false));
  tiles.push(dashboardStatHtml('cancelados', d.cancelados, 'Cancelados', false));
  statsEl.innerHTML = tiles.join('');

  qs('[data-stat="enProgreso"]').addEventListener('click', () => {
    irATickets({ link: linkTodos(), estado: 'EN_PROCESO' });
  });

  if (!esAdmin) {
    qs('[data-stat="misTickets"]').addEventListener('click', () => {
      irATickets({ link: qs('.panel-sidebar__link[data-solo-mios="1"]'), soloMios: true });
    });
  }

  const atencionEl = qs('#atencion-requerida');
  atencionEl.innerHTML = d.atencionRequerida.length
    ? d.atencionRequerida.map(atencionRequeridaHtml).join('')
    : '<p class="panel-status">Todo al día — no hay tickets que requieran atención inmediata.</p>';

  const actividadEl = qs('#actividad-reciente');
  actividadEl.innerHTML = d.actividadReciente.length
    ? d.actividadReciente.map(actividadRecienteHtml).join('')
    : '<p class="panel-status">Sin actividad reciente.</p>';
}

/** Sección Estadísticas -- mismo endpoint que el dashboard (ya trae porEstado/porPrioridad/tendencia), pero se pinta en su propia sección del sidebar, no mezclado con Inicio. */
/** Colores/íconos de los KPI de Estadísticas -- reusa los de DASHBOARD_STAT_META donde el significado coincide (tiempoRespuesta = mismo reloj que "En progreso"), agrega los que faltan. */
const KPI_META = {
  total: DASHBOARD_STAT_META.abiertos,
  resueltos: DASHBOARD_STAT_META.resueltosHoy,
  tasaResolucion: {
    color: '#7c3aed',
    bg: '#ede9fe',
    icon: '<line x1="19" y1="5" x2="5" y2="19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  },
  tiempoRespuesta: DASHBOARD_STAT_META.enProgreso,
  tiempoResolucion: {
    color: '#c2410c',
    bg: '#ffedd5',
    icon: '<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>',
  },
};

function kpiTileHtml(key, valor, etiqueta, variacion) {
  const meta = KPI_META[key];
  return `
    <div class="glass-card dashboard-stat" style="--stat-color:${meta.color}; --stat-bg:${meta.bg};">
      <div class="dashboard-stat__icon">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${meta.icon}</svg>
      </div>
      <div class="dashboard-stat__body">
        <div class="dashboard-stat__value">${valor}</div>
        <div class="dashboard-stat__label">${etiqueta}</div>
        ${variacion}
      </div>
    </div>
  `;
}

/** Minutos -> texto legible ("45 min" / "3.2 h" / "1.5 días"); null cuando no hay datos para promediar (ver TicketModel::resumenPeriodo). */
function formatDuracion(minutos) {
  if (minutos === null || minutos === undefined) return '—';
  if (minutos < 60) return `${Math.round(minutos)} min`;
  const horas = minutos / 60;
  if (horas < 24) return `${horas.toFixed(1)} h`;
  return `${(horas / 24).toFixed(1)} días`;
}

/** Flecha + % contra el período anterior -- texto neutro (sin verde/rojo de "bueno/malo", eso depende del KPI y no vale la pena adivinarlo). */
function variacionHtml(actual, anterior) {
  const a = actual ?? 0;
  const b = anterior ?? 0;
  if (b === 0) {
    return '<span class="kpi-variacion">Sin datos en el período anterior</span>';
  }
  const pct = ((a - b) / b) * 100;
  const flecha = pct >= 0 ? '▲' : '▼';
  return `<span class="kpi-variacion">${flecha} ${Math.abs(pct).toFixed(0)}% vs. período anterior</span>`;
}

function agenteRendimientoHtml(a) {
  const apellido = a.apellido ? ` ${escapeHtml(a.apellido)}` : '';
  const tasa = a.asignados > 0 ? Math.round((a.resueltos / a.asignados) * 100) : 0;

  return `
    <div class="glass-card usuario-row">
      ${avatarHtml(a.fotoUrl, a.nombre, 'lg')}
      <div class="usuario-row__info">
        <div class="usuario-row__nombre">${escapeHtml(a.nombre)}${apellido}</div>
        <div class="usuario-row__email">${a.asignados} asignados · ${a.resueltos} resueltos (${tasa}%) · ${formatDuracion(a.resolucionMinProm)} promedio de resolución</div>
      </div>
    </div>
  `;
}

async function cargarEstadisticas() {
  const params = new URLSearchParams({ desde: estadisticasDesde, hasta: estadisticasHasta });
  const res = await apiFetch(`/api/tickets/estadisticas?${params.toString()}`);
  if (!res.ok) {
    mostrarAlerta('estadisticas-alert', res.message || 'No se pudieron cargar las estadísticas.');
    return;
  }

  const d = res.data;
  const r = d.resumen;
  const ra = d.resumenAnterior;

  qs('#estadisticas-kpis').innerHTML = [
    kpiTileHtml('total', r.total, 'Tickets creados', variacionHtml(r.total, ra.total)),
    kpiTileHtml('resueltos', r.resueltos, 'Resueltos', variacionHtml(r.resueltos, ra.resueltos)),
    kpiTileHtml('tasaResolucion', `${r.tasaResolucion}%`, 'Tasa de resolución', variacionHtml(r.tasaResolucion, ra.tasaResolucion)),
    kpiTileHtml('tiempoRespuesta', formatDuracion(r.tiempoRespuestaMinProm), 'Tiempo de 1ª respuesta', variacionHtml(r.tiempoRespuestaMinProm, ra.tiempoRespuestaMinProm)),
    kpiTileHtml('tiempoResolucion', formatDuracion(r.tiempoResolucionMinProm), 'Tiempo de resolución', variacionHtml(r.tiempoResolucionMinProm, ra.tiempoResolucionMinProm)),
  ].join('');

  qs('#dashboard-charts').innerHTML = [
    donutChartSvg('Tickets por estado', [
      { label: 'Abierto', valor: d.porEstado.ABIERTO, color: '#4338ca' },
      { label: 'Pendiente asig.', valor: d.porEstado.PENDIENTE_ASIGNACION, color: '#7c3aed' },
      { label: 'En proceso', valor: d.porEstado.EN_PROCESO, color: '#b45309' },
      { label: 'Escalado', valor: d.porEstado.ESCALADO, color: '#c2410c' },
      { label: 'En espera', valor: d.porEstado.EN_ESPERA, color: '#0891b2' },
      { label: 'Resuelto', valor: d.porEstado.RESUELTO, color: '#065f46' },
      { label: 'Cerrado', valor: d.porEstado.CERRADO, color: '#475569' },
      { label: 'Cancelado', valor: d.porEstado.CANCELADO, color: '#9f1239' },
    ]),
    donutChartSvg('Tickets por prioridad', [
      { label: 'Baja', valor: d.porPrioridad.BAJA, color: '#64748b' },
      { label: 'Media', valor: d.porPrioridad.MEDIA, color: '#1d4ed8' },
      { label: 'Alta', valor: d.porPrioridad.ALTA, color: '#b45309' },
      { label: 'Urgente', valor: d.porPrioridad.URGENTE, color: '#b91c1c' },
    ]),
    barChartSvg(`Creados vs. resueltos (${d.desde} a ${d.hasta})`, d.tendencia),
  ].join('');

  const agentesEl = qs('#rendimiento-agentes');
  agentesEl.innerHTML = d.rendimientoAgentes.length
    ? d.rendimientoAgentes.map(agenteRendimientoHtml).join('')
    : '<p class="panel-status">Sin datos en este período.</p>';
}

/** 'YYYY-MM-DD' en horario local (no `toISOString()`, que es UTC y puede correr la fecha un día para el usuario). */
function fechaLocalISO(date) {
  const anio = date.getFullYear();
  const mes = String(date.getMonth() + 1).padStart(2, '0');
  const dia = String(date.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
}

function calcularRangoPreset(preset) {
  const hoy = new Date();
  const hasta = fechaLocalISO(hoy);

  if (preset === '7' || preset === '30') {
    const desdeDate = new Date(hoy);
    desdeDate.setDate(desdeDate.getDate() - (Number(preset) - 1));
    return { desde: fechaLocalISO(desdeDate), hasta };
  }
  if (preset === 'mes') {
    const desdeDate = new Date(hoy.getFullYear(), hoy.getMonth(), 1);
    return { desde: fechaLocalISO(desdeDate), hasta };
  }

  return null;
}

function initEstadisticasSection() {
  const presetsEl = qs('#estadisticas-presets');
  const desdeCampo = qs('#estadisticas-desde-campo');
  const hastaCampo = qs('#estadisticas-hasta-campo');
  const aplicarBtn = qs('#estadisticas-aplicar');
  const desdeInput = qs('#estadisticas-desde');
  const hastaInput = qs('#estadisticas-hasta');

  presetsEl.addEventListener('click', (event) => {
    const chip = event.target.closest('.chip');
    if (!chip) return;

    presetsEl.querySelectorAll('.chip').forEach((c) => c.classList.remove('is-active'));
    chip.classList.add('is-active');

    if (chip.dataset.preset === 'personalizado') {
      desdeCampo.hidden = false;
      hastaCampo.hidden = false;
      aplicarBtn.hidden = false;
      desdeInput.value = estadisticasDesde;
      hastaInput.value = estadisticasHasta;
      return;
    }

    desdeCampo.hidden = true;
    hastaCampo.hidden = true;
    aplicarBtn.hidden = true;

    const rango = calcularRangoPreset(chip.dataset.preset);
    estadisticasDesde = rango.desde;
    estadisticasHasta = rango.hasta;
    cargarEstadisticas();
  });

  aplicarBtn.addEventListener('click', () => {
    if (!desdeInput.value || !hastaInput.value) return;
    estadisticasDesde = desdeInput.value;
    estadisticasHasta = hastaInput.value;
    cargarEstadisticas();
  });
}

/** Delegación de eventos de "Atención requerida" y "Actividad reciente" -- ambos bloques se re-renderizan enteros en cada cargarDashboard(), así que los listeners van en el contenedor fijo. */
function initDashboardSection() {
  qs('#atencion-requerida').addEventListener('click', async (event) => {
    const verBtn = event.target.closest('[data-action="ver-ticket"]');
    if (verBtn) {
      event.preventDefault();
      await verTicket(verBtn.dataset.id);
      return;
    }

    const asignarBtn = event.target.closest('[data-action="asignar-directo"]');
    if (asignarBtn) {
      const res = await apiFetch(`/api/tickets/${asignarBtn.dataset.id}/asignar`, { method: 'PATCH' });
      if (!res.ok) return mostrarAlerta('dashboard-alert', res.message || 'No se pudo asignar el ticket.');
      cargarDashboard();
    }
  });

  qs('#actividad-reciente').addEventListener('click', async (event) => {
    const link = event.target.closest('[data-action="ver-ticket"]');
    if (!link) return;
    event.preventDefault();
    await verTicket(link.dataset.id);
  });
}

/** Buscador del header: Enter filtra la sección Tickets por título/#ID. */
function initSearch() {
  qs('#panel-search-input').addEventListener('keydown', (event) => {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    irATickets({ link: linkTodos(), q: event.target.value.trim() });
  });
}

/** Campana del header: mismo dato que los badges de nivel, sumados (tickets sin asignar); al clickear, filtra por "Sin asignar". */
function initNotifBell() {
  qs('#panel-notif-btn').addEventListener('click', () => {
    irATickets({ link: linkTodos(), sinAsignar: true });
  });
}

/**
 * Navegación programática a Tickets (tiles del dashboard, buscador,
 * campana -- todo lo que NO es un click directo en el sidebar). A
 * diferencia de `initSidebarNav`, siempre resetea los 5 controles de
 * filtro a un estado conocido antes de aplicar el que corresponda, para
 * que no queden mezclados con lo que haya dejado una vista anterior.
 */
async function irATickets({ link, estado = '', prioridad = '', soloMios = false, sinAsignar = false, q = '' }) {
  showSection('tickets');
  setActiveSidebarLink(link);
  nivelActual = null;
  sinAsignarActual = sinAsignar;
  qFilterActual = q;
  qs('#filter-estado').value = estado;
  qs('#filter-prioridad').value = prioridad;
  qs('#filter-categoria').value = '';
  qs('#filter-asignados').checked = soloMios;
  qs('#panel-search-input').value = q;
  ticketsPage = 1;
  await cargarTickets();
}

/** "Ver ticket" desde el dashboard: navega a Tickets filtrado por #id y deja la tarjeta ya expandida -- un clic para pasar de "detectar" a "resolver". */
async function verTicket(ticketId) {
  await irATickets({ link: linkTodos(), q: String(ticketId) });
  const card = qs(`.ticket-card[data-id="${ticketId}"]`);
  if (card && !card.classList.contains('is-open')) {
    qs('[data-action="toggle"]', card).click();
  }
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
  qs('#filter-categoria').addEventListener('change', () => {
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
      if (!wasOpen && !card.dataset.detalleCargado) {
        card.dataset.detalleCargado = '1';
        await Promise.all([
          cargarComentarios(ticketId, qs('[data-role="comments"]', card)),
          cargarAdjuntos(ticketId, qs('[data-role="adjuntos"]', card)),
          cargarEventos(ticketId, qs('[data-role="eventos"]', card)),
        ]);
      }
      return;
    }

    if (event.target.closest('[data-action="adjudicar"]')) {
      const res = await apiFetch(`/api/tickets/${ticketId}/asignar`, { method: 'PATCH' });
      if (!res.ok) return mostrarAlerta('tickets-alert', res.message || 'No se pudo adjudicar el ticket.');
      cargarTickets();
      return;
    }

    if (event.target.closest('[data-action="liberar"]')) {
      const res = await apiFetch(`/api/tickets/${ticketId}/liberar`, { method: 'PATCH' });
      if (!res.ok) return mostrarAlerta('tickets-alert', res.message || 'No se pudo liberar el ticket.');
      cargarTickets();
      return;
    }

    if (event.target.closest('[data-action="pausar"]')) {
      const res = await apiFetch(`/api/tickets/${ticketId}/pausar`, { method: 'PATCH' });
      if (!res.ok) return mostrarAlerta('tickets-alert', res.message || 'No se pudo poner en espera el ticket.');
      cargarTickets();
      return;
    }

    if (event.target.closest('[data-action="reanudar"]')) {
      const res = await apiFetch(`/api/tickets/${ticketId}/reanudar`, { method: 'PATCH' });
      if (!res.ok) return mostrarAlerta('tickets-alert', res.message || 'No se pudo reanudar el ticket.');
      cargarTickets();
      return;
    }

    if (event.target.closest('[data-action="cerrar-ticket"]')) {
      if (!confirm('¿Cerrar este ticket? Pasa a estado "Cerrado" de forma definitiva dentro del flujo (no se puede reabrir).')) {
        return;
      }
      const res = await apiFetch(`/api/tickets/${ticketId}/cerrar`, { method: 'PATCH' });
      if (!res.ok) return mostrarAlerta('tickets-alert', res.message || 'No se pudo cerrar el ticket.');
      mostrarAlerta('tickets-alert', 'Ticket cerrado.', 'success');
      cargarTickets();
      return;
    }

    if (event.target.closest('[data-action="cancelar-toggle"]')) {
      const form = qs('[data-role="cancelar-form"]', card);
      form.hidden = !form.hidden;
      return;
    }

    if (event.target.closest('[data-action="cancelar-confirmar"]')) {
      const form = qs('[data-role="cancelar-form"]', card);
      const motivo = qs('[data-role="cancelar-motivo"]', form).value.trim();
      if (!motivo) return;

      const res = await apiFetch(`/api/tickets/${ticketId}/cancelar`, { method: 'PATCH', body: { motivo } });
      if (!res.ok) return mostrarAlerta('tickets-alert', res.message || 'No se pudo cancelar el ticket.');
      mostrarAlerta('tickets-alert', 'Ticket cancelado.', 'success');
      cargarTickets();
      return;
    }

    if (event.target.closest('[data-action="escalar-toggle"]')) {
      const form = qs('[data-role="escalar-form"]', card);
      form.hidden = !form.hidden;
      return;
    }

    if (event.target.closest('[data-action="escalar-confirmar"]')) {
      const form = qs('[data-role="escalar-form"]', card);
      const motivo = qs('[data-role="escalar-motivo"]', form).value.trim();
      if (!motivo) return;

      const res = await apiFetch(`/api/tickets/${ticketId}/escalar`, { method: 'PATCH', body: { motivo } });
      if (!res.ok) return mostrarAlerta('tickets-alert', res.message || 'No se pudo escalar el ticket.');
      mostrarAlerta('tickets-alert', 'Ticket escalado.', 'success');
      cargarTickets();
      return;
    }

    if (event.target.closest('[data-action="resolver-toggle"]')) {
      const form = qs('[data-role="resolver-form"]', card);
      form.hidden = !form.hidden;
      return;
    }

    if (event.target.closest('[data-action="resolver-confirmar"]')) {
      const form = qs('[data-role="resolver-form"]', card);
      const textarea = qs('textarea', form);
      const solucion = textarea.value.trim();
      if (!solucion) return;

      const res = await apiFetch(`/api/tickets/${ticketId}/resolver`, { method: 'PATCH', body: { solucion } });
      if (!res.ok) return mostrarAlerta('tickets-alert', res.message || 'No se pudo resolver el ticket.');
      mostrarAlerta('tickets-alert', 'Ticket resuelto.', 'success');
      cargarTickets();
    }
  });

  listEl.addEventListener('change', async (event) => {
    const card = event.target.closest('.ticket-card');
    if (!card) return;
    const ticketId = card.dataset.id;

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
    const card = event.target.closest('.ticket-card');
    if (!card) return;
    const ticketId = card.dataset.id;

    if (event.target.matches('[data-action="comentar"]')) {
      event.preventDefault();
      const textarea = qs('textarea', event.target);
      const comentario = textarea.value.trim();
      if (!comentario) return;

      const res = await apiFetch(`/api/tickets/${ticketId}/comentarios`, { method: 'POST', body: { comentario } });
      if (!res.ok) return mostrarAlerta('tickets-alert', res.message || 'No se pudo enviar el comentario.');

      textarea.value = '';
      await cargarComentarios(ticketId, qs('[data-role="comments"]', card));
      return;
    }

    if (event.target.matches('[data-action="subir-adjunto"]')) {
      event.preventDefault();
      const input = qs('input[type="file"]', event.target);
      const archivo = input.files[0];
      if (!archivo) return;

      const formData = new FormData();
      formData.append('archivo', archivo);

      const res = await apiUpload(`/api/tickets/${ticketId}/adjuntos`, formData);
      if (!res.ok) return mostrarAlerta('tickets-alert', res.message || 'No se pudo subir el adjunto.');

      input.value = '';
      await cargarAdjuntos(ticketId, qs('[data-role="adjuntos"]', card));
    }
  });

  cargarTickets();
}

/* ====================================
   USUARIOS (clientes)
==================================== */

function usuarioRowHtml(u) {
  return `
    <div class="glass-card usuario-row ${u.activo ? '' : 'is-inactivo'}" data-id="${u.id}">
      <div class="usuario-row__info">
        <div class="usuario-row__nombre">${escapeHtml(u.nombre)}</div>
        <div class="usuario-row__email">${escapeHtml(u.email)} · ${u.activo ? 'Activo' : 'Inactivo'}</div>
      </div>
      <div class="usuario-row__actions">
        <button type="button" class="btn btn-secondary btn--sm" data-action="reset-manual-toggle">Cambiar contraseña</button>
        ${
          u.activo
            ? '<button type="button" class="btn btn-secondary btn--sm" data-action="desactivar">Dar de baja</button>'
            : '<button type="button" class="btn btn-secondary btn--sm" data-action="activar">Dar de alta</button>'
        }
      </div>
      <div class="reset-manual-form" data-role="reset-manual-form" hidden>
        <input type="password" class="field__input" placeholder="Nueva contraseña (mín. 8 caracteres)" minlength="8" />
        <ul class="password-hints" data-role="password-hints">${passwordHintsItemsHtml()}</ul>
        <button type="button" class="btn btn-primary btn--sm" data-action="reset-manual-confirmar">Confirmar</button>
      </div>
    </div>
  `;
}

/**
 * Parte una lista de clientes/técnicos en dos bloques con encabezado --
 * "{Entidad} activos" y "{Entidad} dados de baja" -- la baja es siempre
 * lógica (columna `activo`, ver `UsuarioTablaModel::setActivo()`), así
 * que el registro completo (y sus tickets históricos) sigue intacto,
 * solo cambia en qué bloque aparece.
 */
function gruposActivoBajaHtml(items, entidadPlural, rowFn) {
  const activos = items.filter((i) => i.activo);
  const bajas = items.filter((i) => !i.activo);
  const entidadMinuscula = entidadPlural.toLowerCase();

  const activosHtml = `
    <div class="usuarios-grupo">
      <h3 class="usuarios-grupo__titulo">${escapeHtml(entidadPlural)} activos</h3>
      ${activos.length ? activos.map(rowFn).join('') : `<p class="panel-status">Sin ${entidadMinuscula} activos.</p>`}
    </div>
  `;

  // <details>/<summary> nativo -- colapsado por defecto, así los dados
  // de baja no compiten visualmente con la lista de activos (que es la
  // que se usa día a día); el contador en el título permite ver de un
  // vistazo cuántos hay sin necesidad de abrirlo.
  const bajasHtml = `
    <details class="usuarios-grupo usuarios-grupo--baja">
      <summary class="usuarios-grupo__titulo">${escapeHtml(entidadPlural)} dados de baja (${bajas.length})</summary>
      <div class="usuarios-grupo__contenido">
        ${bajas.length ? bajas.map(rowFn).join('') : `<p class="panel-status">Sin ${entidadMinuscula} dados de baja.</p>`}
      </div>
    </details>
  `;

  return activosHtml + bajasHtml;
}

/**
 * @param {{apiPath:string, formId:string, listId:string, statusId:string,
 *   alertId:string, entidadLabel:string, entidadPlural:string, emptyLabel:string}} config
 */
function initGestionSection({ apiPath, formId, listId, statusId, alertId, entidadLabel, entidadPlural, emptyLabel }) {
  async function cargar() {
    const statusEl = qs(`#${statusId}`);
    const listEl = qs(`#${listId}`);
    statusEl.textContent = `Cargando ${entidadLabel}s…`;
    statusEl.style.display = 'block';

    const res = await apiFetch(`${apiPath}?page=1`);
    if (!res.ok) {
      statusEl.textContent = `No se pudieron cargar los ${entidadLabel}s.`;
      return;
    }
    if (!res.data.length) {
      statusEl.textContent = emptyLabel;
      listEl.innerHTML = '';
      return;
    }
    statusEl.style.display = 'none';
    listEl.innerHTML = gruposActivoBajaHtml(res.data, entidadPlural, usuarioRowHtml);
  }

  initPasswordHints(qs(`#${formId}`));

  qs(`#${formId}`).addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const body = {
      nombre: form.nombre.value.trim(),
      email: form.email.value.trim(),
      password: form.password.value,
    };
    const res = await apiFetch(apiPath, { method: 'POST', body });
    if (!res.ok) {
      mostrarAlerta(alertId, (res.errors && res.errors.join(' ')) || res.message || `No se pudo crear el ${entidadLabel}.`);
      return;
    }
    mostrarAlerta(alertId, `Se creó "${body.nombre}".`, 'success');
    form.reset();
    actualizarPasswordHints(qs('[data-role="password-hints"]', form), '');
    cargar();
  });

  qs(`#${listId}`).addEventListener('click', async (event) => {
    const row = event.target.closest('.usuario-row');
    if (!row) return;
    const id = row.dataset.id;

    if (event.target.closest('[data-action="activar"]')) {
      const res = await apiFetch(`${apiPath}/${id}/estado`, { method: 'PATCH', body: { activo: true } });
      if (!res.ok) return mostrarAlerta(alertId, res.message || `No se pudo activar el ${entidadLabel}.`);
      cargar();
      return;
    }

    if (event.target.closest('[data-action="desactivar"]')) {
      const nombre = qs('.usuario-row__nombre', row)?.textContent.trim() || `este ${entidadLabel}`;
      if (!confirm(`¿Dar de baja a "${nombre}"? No podrá iniciar sesión ni crear tickets nuevos. Conserva su historial y podés reactivarlo cuando quieras.`)) {
        return;
      }
      const res = await apiFetch(`${apiPath}/${id}/estado`, { method: 'PATCH', body: { activo: false } });
      if (!res.ok) return mostrarAlerta(alertId, res.message || `No se pudo desactivar el ${entidadLabel}.`);
      cargar();
      return;
    }

    if (event.target.closest('[data-action="reset-manual-toggle"]')) {
      const form = qs('[data-role="reset-manual-form"]', row);
      form.hidden = !form.hidden;
      return;
    }

    if (event.target.closest('[data-action="reset-manual-confirmar"]')) {
      const form = qs('[data-role="reset-manual-form"]', row);
      const input = qs('input', form);
      const password = input.value;
      if (!password) return;

      const res = await apiFetch(`${apiPath}/${id}/reset-password`, { method: 'PATCH', body: { password } });
      if (!res.ok) return mostrarAlerta(alertId, (res.errors && res.errors.join(' ')) || res.message || 'No se pudo asignar la contraseña.');
      input.value = '';
      form.hidden = true;
      mostrarAlerta(alertId, 'Contraseña asignada correctamente.', 'success');
    }
  });

  // Delegado -- los forms de "reset-manual" son dinámicos (uno por fila,
  // se re-renderizan enteros en cada `cargar()`), así que el checklist
  // se engancha acá en el contenedor fijo, no por fila.
  qs(`#${listId}`).addEventListener('input', (event) => {
    if (!event.target.matches('[data-role="reset-manual-form"] input[type="password"]')) return;
    const hintsEl = qs('[data-role="password-hints"]', event.target.closest('[data-role="reset-manual-form"]'));
    actualizarPasswordHints(hintsEl, event.target.value);
  });

  cargar();
}

/* ====================================
   AGENTES DE SOPORTE (usuarios_administradores)
   Ya no divergen tan poco de "usuarios" como para reusar
   `initGestionSection()` -- tienen apellido/título/nivel/foto, alta con
   más campos y una acción nueva (subir/cambiar foto), así que van en
   funciones propias en vez de forzar la abstracción genérica.
==================================== */

function agenteRowHtml(a) {
  const nivelBadge = a.nivel ? `<span class="badge badge--nivel">Nivel ${a.nivel}</span>` : '';
  const apellido = a.apellido ? ` ${escapeHtml(a.apellido)}` : '';

  return `
    <div class="glass-card usuario-row ${a.activo ? '' : 'is-inactivo'}" data-id="${a.id}">
      ${avatarHtml(a.fotoUrl, a.nombre, 'lg')}
      <div class="usuario-row__info">
        <div class="usuario-row__nombre">${escapeHtml(a.nombre)}${apellido} ${nivelBadge}</div>
        ${a.titulo ? `<div class="usuario-row__email">${escapeHtml(a.titulo)}</div>` : ''}
        <div class="usuario-row__email">${escapeHtml(a.email)} · ${a.activo ? 'Activo' : 'Inactivo'}</div>
      </div>
      <div class="usuario-row__actions">
        <button type="button" class="btn btn-secondary btn--sm" data-action="foto-toggle">Cambiar foto</button>
        <button type="button" class="btn btn-secondary btn--sm" data-action="reset-manual-toggle">Cambiar contraseña</button>
        ${
          a.activo
            ? '<button type="button" class="btn btn-secondary btn--sm" data-action="desactivar">Dar de baja</button>'
            : '<button type="button" class="btn btn-secondary btn--sm" data-action="activar">Dar de alta</button>'
        }
      </div>
      <div class="reset-manual-form" data-role="foto-form" hidden>
        <input type="file" accept="image/jpeg,image/png,image/webp" />
        <button type="button" class="btn btn-primary btn--sm" data-action="foto-confirmar">Subir</button>
      </div>
      <div class="reset-manual-form" data-role="reset-manual-form" hidden>
        <input type="password" class="field__input" placeholder="Nueva contraseña (mín. 8 caracteres)" minlength="8" />
        <ul class="password-hints" data-role="password-hints">${passwordHintsItemsHtml()}</ul>
        <button type="button" class="btn btn-primary btn--sm" data-action="reset-manual-confirmar">Confirmar</button>
      </div>
    </div>
  `;
}

function initAgentesSection() {
  const apiPath = '/api/administradores';

  async function cargar() {
    const statusEl = qs('#administradores-status');
    const listEl = qs('#administradores-list');
    statusEl.textContent = 'Cargando técnicos…';
    statusEl.style.display = 'block';

    const res = await apiFetch(`${apiPath}?page=1`);
    if (!res.ok) {
      statusEl.textContent = 'No se pudieron cargar los técnicos.';
      return;
    }
    if (!res.data.length) {
      statusEl.textContent = 'Todavía no hay técnicos.';
      listEl.innerHTML = '';
      return;
    }
    statusEl.style.display = 'none';
    listEl.innerHTML = gruposActivoBajaHtml(res.data, 'Técnicos', agenteRowHtml);
  }

  initPasswordHints(qs('#crear-administrador-form'));

  qs('#crear-administrador-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const body = {
      nombre: form.nombre.value.trim(),
      apellido: form.apellido.value.trim(),
      titulo: form.titulo.value.trim(),
      nivel: form.nivel.value,
      email: form.email.value.trim(),
      password: form.password.value,
    };
    const res = await apiFetch(apiPath, { method: 'POST', body });
    if (!res.ok) {
      mostrarAlerta('administradores-alert', (res.errors && res.errors.join(' ')) || res.message || 'No se pudo crear el técnico.');
      return;
    }
    mostrarAlerta('administradores-alert', `Se creó "${body.nombre} ${body.apellido}".`, 'success');
    form.reset();
    actualizarPasswordHints(qs('[data-role="password-hints"]', form), '');
    cargar();
  });

  qs('#administradores-list').addEventListener('click', async (event) => {
    const row = event.target.closest('.usuario-row');
    if (!row) return;
    const id = row.dataset.id;

    if (event.target.closest('[data-action="activar"]')) {
      const res = await apiFetch(`${apiPath}/${id}/estado`, { method: 'PATCH', body: { activo: true } });
      if (!res.ok) return mostrarAlerta('administradores-alert', res.message || 'No se pudo activar el técnico.');
      cargar();
      return;
    }

    if (event.target.closest('[data-action="desactivar"]')) {
      const nombre = qs('.usuario-row__nombre', row)?.textContent.trim() || 'este técnico';
      if (!confirm(`¿Dar de baja a "${nombre}"? No podrá iniciar sesión ni se le asignarán nuevos tickets. Conserva su historial y podés reactivarlo cuando quieras.`)) {
        return;
      }
      const res = await apiFetch(`${apiPath}/${id}/estado`, { method: 'PATCH', body: { activo: false } });
      if (!res.ok) return mostrarAlerta('administradores-alert', res.message || 'No se pudo desactivar el técnico.');
      cargar();
      return;
    }

    if (event.target.closest('[data-action="reset-manual-toggle"]')) {
      const form = qs('[data-role="reset-manual-form"]', row);
      form.hidden = !form.hidden;
      return;
    }

    if (event.target.closest('[data-action="reset-manual-confirmar"]')) {
      const form = qs('[data-role="reset-manual-form"]', row);
      const input = qs('input', form);
      const password = input.value;
      if (!password) return;

      const res = await apiFetch(`${apiPath}/${id}/reset-password`, { method: 'PATCH', body: { password } });
      if (!res.ok) return mostrarAlerta('administradores-alert', (res.errors && res.errors.join(' ')) || res.message || 'No se pudo asignar la contraseña.');
      input.value = '';
      form.hidden = true;
      mostrarAlerta('administradores-alert', 'Contraseña asignada correctamente.', 'success');
      return;
    }

    if (event.target.closest('[data-action="foto-toggle"]')) {
      const form = qs('[data-role="foto-form"]', row);
      form.hidden = !form.hidden;
      return;
    }

    if (event.target.closest('[data-action="foto-confirmar"]')) {
      const form = qs('[data-role="foto-form"]', row);
      const input = qs('input[type="file"]', form);
      const archivo = input.files[0];
      if (!archivo) return;

      const formData = new FormData();
      formData.append('foto', archivo);

      const res = await apiUpload(`${apiPath}/${id}/foto`, formData);
      if (!res.ok) return mostrarAlerta('administradores-alert', res.message || 'No se pudo subir la foto.');
      input.value = '';
      form.hidden = true;
      mostrarAlerta('administradores-alert', 'Foto actualizada.', 'success');
      cargar();
    }
  });

  qs('#administradores-list').addEventListener('input', (event) => {
    if (!event.target.matches('[data-role="reset-manual-form"] input[type="password"]')) return;
    const hintsEl = qs('[data-role="password-hints"]', event.target.closest('[data-role="reset-manual-form"]'));
    actualizarPasswordHints(hintsEl, event.target.value);
  });

  cargar();
}

/* ====================================
   CATEGORÍAS
   Reusa las clases visuales de .usuario-row (nombre + estado + acciones)
   -- una categoría es "más chica" que un usuario (sin email, sin
   contraseña), así que no vale la pena forzarla dentro de
   `initGestionSection` (pensada para entidades con email/password).
==================================== */

function categoriaRowHtml(c) {
  return `
    <div class="glass-card usuario-row ${c.activo ? '' : 'is-inactivo'}" data-id="${c.id}">
      <div class="usuario-row__info">
        <div class="usuario-row__nombre">${escapeHtml(c.nombre)}</div>
        <div class="usuario-row__email">${c.activo ? 'Activa' : 'Inactiva'}</div>
      </div>
      <div class="usuario-row__actions">
        ${
          c.activo
            ? '<button type="button" class="btn btn-secondary btn--sm" data-action="desactivar">Desactivar</button>'
            : '<button type="button" class="btn btn-secondary btn--sm" data-action="activar">Activar</button>'
        }
      </div>
    </div>
  `;
}

function initCategoriasSection() {
  async function cargar() {
    const statusEl = qs('#categorias-status');
    const listEl = qs('#categorias-list');
    statusEl.textContent = 'Cargando categorías…';
    statusEl.style.display = 'block';

    const res = await apiFetch('/api/categorias?todas=1');
    if (!res.ok) {
      statusEl.textContent = 'No se pudieron cargar las categorías.';
      return;
    }
    if (!res.data.length) {
      statusEl.textContent = 'Todavía no hay categorías.';
      listEl.innerHTML = '';
      return;
    }
    statusEl.style.display = 'none';
    listEl.innerHTML = res.data.map(categoriaRowHtml).join('');
  }

  qs('#crear-categoria-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const nombre = form.nombre.value.trim();

    const res = await apiFetch('/api/categorias', { method: 'POST', body: { nombre } });
    if (!res.ok) {
      mostrarAlerta('categorias-alert', (res.errors && res.errors.join(' ')) || res.message || 'No se pudo crear la categoría.');
      return;
    }
    mostrarAlerta('categorias-alert', `Se creó "${nombre}".`, 'success');
    form.reset();
    cargar();
    cargarCategoriasFiltro();
  });

  qs('#categorias-list').addEventListener('click', async (event) => {
    const row = event.target.closest('.usuario-row');
    if (!row) return;
    const id = row.dataset.id;

    if (event.target.closest('[data-action="activar"]')) {
      const res = await apiFetch(`/api/categorias/${id}/estado`, { method: 'PATCH', body: { activo: true } });
      if (!res.ok) return mostrarAlerta('categorias-alert', res.message || 'No se pudo activar la categoría.');
      cargar();
      cargarCategoriasFiltro();
      return;
    }

    if (event.target.closest('[data-action="desactivar"]')) {
      const res = await apiFetch(`/api/categorias/${id}/estado`, { method: 'PATCH', body: { activo: false } });
      if (!res.ok) return mostrarAlerta('categorias-alert', res.message || 'No se pudo desactivar la categoría.');
      cargar();
      cargarCategoriasFiltro();
      return;
    }
  });

  cargar();
}

/**
 * Un AGENTE no tiene acceso a Estadísticas/Clientes/Técnicos/
 * Categorías (ADMIN-only en el backend, ver `TicketController` y
 * `GestionUsuariosController`) ni a los tabs Nivel 1/2/3 (el backend ya
 * le fuerza su propio nivel en cualquier listado -- ver
 * `assertNivelPermitido()` -- así que navegarlos no tiene sentido). Se
 * oculta la navegación entera; la protección real está en el backend,
 * esto es solo para no mostrar una puerta que de todos modos da 403.
 *
 * Un ADMIN, al revés, es puramente supervisor -- no tiene bandeja
 * propia de tickets (ver `ticketControlesHtml()`, que para ADMIN nunca
 * ofrece adjudicarse/liberar), así que "Mis tickets" y "Sin asignar"
 * no aplican y se ocultan solo para ese rol (queda "Todos" + los tabs
 * de nivel, de solo lectura).
 */
function aplicarVisibilidadPorRol() {
  if (usuarioActual.rol === 'AGENTE') {
    const ocultarGrupoDe = (selector) => {
      const link = qs(selector);
      const grupo = link && link.closest('.panel-sidebar__group');
      if (grupo) grupo.hidden = true;
    };

    ocultarGrupoDe('.panel-sidebar__link[data-section="estadisticas"]');
    ocultarGrupoDe('.panel-sidebar__link[data-section="usuarios"]');
    ocultarGrupoDe('.panel-sidebar__link[data-nivel="1"]');

    const todos = linkTodos();
    if (todos) todos.textContent = 'Tickets de mi nivel';
    return;
  }

  if (usuarioActual.rol === 'ADMIN') {
    const misTickets = qs('.panel-sidebar__link[data-solo-mios="1"]');
    if (misTickets) misTickets.hidden = true;
    const sinAsignar = qs('.panel-sidebar__link[data-sin-asignar="1"]');
    if (sinAsignar) sinAsignar.hidden = true;
  }
}

/* ====================================
   MI PERFIL
   Autoedición de nombre/apellido/foto -- para ADMIN y AGENTE por igual
   (a diferencia del resto de "Administración", esto no se oculta con
   aplicarVisibilidadPorRol(): cualquiera puede editar su propio perfil).
==================================== */

function actualizarMiPerfilAvatar() {
  qs('#mi-perfil-avatar').innerHTML = avatarHtml(usuarioActual.fotoUrl, usuarioActual.nombre, 'lg');
}

function initMiPerfilSection() {
  qs('#mi-perfil-nombre').value = usuarioActual.nombre || '';
  qs('#mi-perfil-apellido').value = usuarioActual.apellido || '';
  actualizarMiPerfilAvatar();

  qs('#mi-perfil-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const form = event.target;
    const body = { nombre: form.nombre.value.trim(), apellido: form.apellido.value.trim() };

    const res = await apiFetch('/api/administradores/me', { method: 'PATCH', body });
    if (!res.ok) {
      mostrarAlerta('mi-perfil-alert', (res.errors && res.errors.join(' ')) || res.message || 'No se pudieron guardar los cambios.');
      return;
    }
    usuarioActual.nombre = res.data.nombre;
    usuarioActual.apellido = res.data.apellido;
    qs('#panel-user-name').textContent = usuarioActual.nombre;
    mostrarAlerta('mi-perfil-alert', 'Perfil actualizado.', 'success');
  });

  qs('#mi-perfil-foto-confirmar').addEventListener('click', async () => {
    const input = qs('#mi-perfil-foto-input');
    const archivo = input.files[0];
    if (!archivo) return;

    const formData = new FormData();
    formData.append('foto', archivo);

    const res = await apiUpload(`/api/administradores/${usuarioActual.id}/foto`, formData);
    if (!res.ok) return mostrarAlerta('mi-perfil-alert', res.message || 'No se pudo subir la foto.');

    usuarioActual.fotoUrl = res.data.fotoUrl;
    input.value = '';
    actualizarMiPerfilAvatar();
    mostrarAlerta('mi-perfil-alert', 'Foto actualizada.', 'success');
  });
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
  qs('#panel-mi-perfil-link').addEventListener('click', (event) => {
    event.preventDefault();
    qs('#panel-user-menu').hidden = true;
    showSection('mi-perfil');
    setActiveSidebarLink(null);
  });
}

/**
 * El logo del header linkea al sitio público (`index.html`) -- a un admin
 * no se le cierra la sesión por inactividad (a diferencia del cliente, ver
 * `initInactivityLogout` en api-client.js), pero si sale del service desk
 * hacia el sitio público sí se le cierra: al volver más tarde tiene que
 * loguearse de nuevo, no queda una sesión de panel abierta de fondo.
 */
function initBrandLink() {
  const link = qs('.brand');
  link.addEventListener('click', async (event) => {
    event.preventDefault();
    const destino = link.href;
    await logout();
    window.location.href = destino;
  });
}

usuarioActual = await requireAuth(['ADMIN', 'AGENTE']);
if (usuarioActual) {
  initPanelShell();
  initHeader();
  initBrandLink();
  aplicarVisibilidadPorRol();
  initSidebarNav();
  initSearch();
  initNotifBell();
  initDashboardSection();
  showSection('inicio');
  cargarDashboard();
  cargarCategoriasFiltro();
  initTicketsSection();
  initMiPerfilSection();

  // Estadísticas globales, gestión de clientes/agentes y categorías son
  // ADMIN-only (ya bloqueado en el backend -- acá directamente no se
  // inicializan para no pedirle datos a endpoints que le van a dar 403).
  if (usuarioActual.rol === 'ADMIN') {
    initEstadisticasSection();
    const rangoInicial = calcularRangoPreset('30');
    estadisticasDesde = rangoInicial.desde;
    estadisticasHasta = rangoInicial.hasta;
    cargarEstadisticas();
    initCategoriasSection();
    initGestionSection({
      apiPath: '/api/usuarios',
      formId: 'crear-usuario-form',
      listId: 'usuarios-list',
      statusId: 'usuarios-status',
      alertId: 'usuarios-alert',
      entidadLabel: 'cliente',
      entidadPlural: 'Clientes',
      emptyLabel: 'Todavía no hay clientes.',
    });
    initAgentesSection();
  }
}
